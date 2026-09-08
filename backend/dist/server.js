import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { Pool } from 'pg';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { CREDIT_COSTS, grantVerifiedPurchase, reserveCreditsTx, settleCreditsTx } from './credits.js';
const app = express();
const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined }) : null;
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',').map(s => s.trim()) ?? false }));
app.use(express.json({ limit: '256kb' }));
const secret = process.env.JWT_SECRET;
if (!secret || secret.length < 32)
    throw new Error('JWT_SECRET must be configured with at least 32 characters');
const jwtSecret = secret;
const assetsDir = path.resolve(process.env.ASSETS_DIR ?? './assets');
await mkdir(assetsDir, { recursive: true });
const providerGateway = process.env.PROVIDER_GATEWAY_URL?.replace(/\/$/, '');
const providerKey = process.env.PROVIDER_GATEWAY_API_KEY;
function sign(userId) { return jwt.sign({ sub: userId }, jwtSecret, { algorithm: 'HS256', expiresIn: '30d' }); }
function auth(req, res, next) { const h = req.header('authorization'); if (!h?.startsWith('Bearer '))
    return res.status(401).json({ error: 'UNAUTHORIZED' }); try {
    const p = jwt.verify(h.slice(7), jwtSecret, { algorithms: ['HS256'] });
    if (typeof p.sub !== 'string')
        throw new Error();
    req.userId = p.sub;
    next();
}
catch {
    return res.status(401).json({ error: 'INVALID_TOKEN' });
} }
function hashPassword(password) { const salt = randomBytes(16).toString('hex'); return `scrypt:${salt}:${scryptSync(password, salt, 64).toString('hex')}`; }
function verifyPassword(password, stored) { const [kind, salt, hash] = stored.split(':'); if (kind !== 'scrypt' || !salt || !hash)
    return false; const a = Buffer.from(hash, 'hex'); const b = scryptSync(password, salt, 64); return a.length === b.length && timingSafeEqual(a, b); }
const credentials = z.object({ email: z.string().email().max(254), password: z.string().min(8).max(128) });
app.get('/health', (_req, res) => res.json({ ok: true, service: 'melodica-api', version: '1.4.0' }));
app.post('/v1/auth/register', async (req, res) => { const p = credentials.safeParse(req.body); if (!p.success)
    return res.status(400).json({ error: 'INVALID_REQUEST' }); if (!pool)
    return res.status(503).json({ error: 'DATABASE_NOT_CONFIGURED' }); try {
    const r = await pool.query('INSERT INTO users(email,password_hash) VALUES($1,$2) RETURNING id,email', [p.data.email.toLowerCase(), hashPassword(p.data.password)]);
    const id = r.rows[0].id;
    await pool.query('INSERT INTO credit_accounts(user_id,balance) VALUES($1,$2) ON CONFLICT DO NOTHING', [id, Number(process.env.NEW_USER_CREDITS ?? 500)]);
    return res.status(201).json({ token: sign(id), user: { id, email: r.rows[0].email } });
}
catch (e) {
    if (e.code === '23505')
        return res.status(409).json({ error: 'EMAIL_ALREADY_EXISTS' });
    return res.status(500).json({ error: 'REGISTER_FAILED' });
} });
app.post('/v1/auth/login', async (req, res) => { const p = credentials.safeParse(req.body); if (!p.success)
    return res.status(400).json({ error: 'INVALID_REQUEST' }); if (!pool)
    return res.status(503).json({ error: 'DATABASE_NOT_CONFIGURED' }); const r = await pool.query('SELECT id,email,password_hash FROM users WHERE email=$1', [p.data.email.toLowerCase()]); if (!r.rowCount || !verifyPassword(p.data.password, r.rows[0].password_hash))
    return res.status(401).json({ error: 'INVALID_CREDENTIALS' }); return res.json({ token: sign(r.rows[0].id), user: { id: r.rows[0].id, email: r.rows[0].email } }); });
app.get('/v1/me', auth, async (req, res) => { if (!pool)
    return res.status(503).json({ error: 'DATABASE_NOT_CONFIGURED' }); const r = await pool.query('SELECT id,email,created_at FROM users WHERE id=$1', [req.userId]); if (!r.rowCount)
    return res.status(404).json({ error: 'USER_NOT_FOUND' }); res.json({ user: r.rows[0] }); });
app.delete('/v1/account', auth, async (req, res) => { if (!pool)
    return res.status(503).json({ error: 'DATABASE_NOT_CONFIGURED' }); await pool.query('DELETE FROM users WHERE id=$1', [req.userId]); res.status(204).end(); });
app.get('/v1/credits', auth, async (req, res) => { if (!pool)
    return res.status(503).json({ error: 'DATABASE_NOT_CONFIGURED' }); const r = await pool.query('SELECT balance,reserved FROM credit_accounts WHERE user_id=$1', [req.userId]); res.json(r.rows[0] ?? { balance: 0, reserved: 0 }); });
app.get('/v1/credits/catalog', (_req, res) => res.json(CREDIT_COSTS));
const purchaseSchema = z.object({ productId: z.enum(['credits_500', 'credits_1500', 'credits_5000']), purchaseToken: z.string().min(16).max(4096) });
app.post('/v1/billing/verify', auth, async (req, res) => {
    const p = purchaseSchema.safeParse(req.body);
    if (!p.success)
        return res.status(400).json({ error: 'INVALID_PURCHASE_REQUEST' });
    if (!pool)
        return res.status(503).json({ error: 'DATABASE_NOT_CONFIGURED' });
    const verifier = process.env.GOOGLE_PLAY_VERIFIER_URL;
    if (!verifier)
        return res.status(503).json({ error: 'PLAY_VERIFIER_NOT_CONFIGURED' });
    try {
        const response = await fetch(verifier, { method: 'POST', headers: { 'content-type': 'application/json', ...(process.env.GOOGLE_PLAY_VERIFIER_API_KEY ? { 'authorization': `Bearer ${process.env.GOOGLE_PLAY_VERIFIER_API_KEY}` } : {}) }, body: JSON.stringify({ productId: p.data.productId, purchaseToken: p.data.purchaseToken }) });
        if (!response.ok)
            return res.status(502).json({ error: 'PLAY_VERIFIER_UNAVAILABLE' });
        const verified = await response.json();
        if (verified.verified !== true || verified.productId !== p.data.productId)
            return res.status(402).json({ error: 'PURCHASE_NOT_VERIFIED' });
        const result = await grantVerifiedPurchase(pool, req.userId, p.data.productId, p.data.purchaseToken);
        return res.json({ verified: true, ...result });
    }
    catch {
        return res.status(502).json({ error: 'PURCHASE_VERIFICATION_FAILED' });
    }
});
const projectSchema = z.object({ title: z.string().trim().min(1).max(120), style: z.string().trim().max(80).default('Pop') });
app.get('/v1/projects', auth, async (req, res) => { if (!pool)
    return res.status(503).json({ error: 'DATABASE_NOT_CONFIGURED' }); const r = await pool.query('SELECT id,title,style,created_at,updated_at FROM projects WHERE user_id=$1 ORDER BY updated_at DESC', [req.userId]); res.json(r.rows); });
app.post('/v1/projects', auth, async (req, res) => { const p = projectSchema.safeParse(req.body); if (!p.success)
    return res.status(400).json({ error: 'INVALID_REQUEST' }); if (!pool)
    return res.status(503).json({ error: 'DATABASE_NOT_CONFIGURED' }); const r = await pool.query('INSERT INTO projects(user_id,title,style) VALUES($1,$2,$3) RETURNING *', [req.userId, p.data.title, p.data.style]); res.status(201).json(r.rows[0]); });
app.delete('/v1/projects/:id', auth, async (req, res) => { if (!pool)
    return res.status(503).json({ error: 'DATABASE_NOT_CONFIGURED' }); const r = await pool.query('DELETE FROM projects WHERE id=$1 AND user_id=$2', [req.params.id, req.userId]); if (!r.rowCount)
    return res.status(404).json({ error: 'PROJECT_NOT_FOUND' }); res.status(204).end(); });
const generationSchema = z.object({ projectId: z.string().uuid(), mode: z.string().min(1).max(40), prompt: z.string().max(4000), idempotencyKey: z.string().min(8).max(128) });
function makeWav(seconds = 8) { const rate = 44100, channels = 1, bits = 16, samples = rate * seconds; const data = Buffer.alloc(samples * 2); const notes = [261.63, 329.63, 392, 523.25, 392, 329.63, 293.66, 349.23]; for (let i = 0; i < samples; i++) {
    const t = i / rate;
    const n = notes[Math.floor(t * 2) % notes.length];
    const env = Math.min(1, t * 10) * Math.min(1, (seconds - t) * 10);
    const v = Math.sin(2 * Math.PI * n * t) * 0.22 * env;
    data.writeInt16LE(Math.max(-1, Math.min(1, v)) * 32767, i * 2);
} const h = Buffer.alloc(44); h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(channels, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(bits, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40); return Buffer.concat([h, data]); }
async function finalizeJob(pool, jobId, outcome, errorMessage) {
    const c = await pool.connect();
    try {
        await c.query('BEGIN');
        const r = await c.query('SELECT * FROM jobs WHERE id=$1 FOR UPDATE', [jobId]);
        if (!r.rowCount) {
            await c.query('ROLLBACK');
            return false;
        }
        const j = r.rows[0];
        if (j.status !== 'RUNNING') {
            await c.query('ROLLBACK');
            return false;
        }
        if (outcome === 'SUCCEEDED') {
            await settleCreditsTx(c, j.user_id, j.reserved_credits, j.reserved_credits, jobId);
            await c.query("UPDATE jobs SET status='SUCCEEDED',settled_credits=$2,completed_at=now(),updated_at=now() WHERE id=$1", [jobId, j.reserved_credits]);
        }
        else {
            await settleCreditsTx(c, j.user_id, j.reserved_credits, 0, `fail-${jobId}`);
            await c.query("UPDATE jobs SET status='FAILED',error=$2,completed_at=now(),updated_at=now() WHERE id=$1", [jobId, String(errorMessage ?? 'GENERATION_FAILED').slice(0, 500)]);
        }
        await c.query('COMMIT');
        return true;
    }
    catch (e) {
        await c.query('ROLLBACK');
        throw e;
    }
    finally {
        c.release();
    }
}
async function runJob(jobId) {
    if (!pool)
        return;
    const claim = await pool.query("UPDATE jobs SET status='RUNNING',updated_at=now() WHERE id=$1 AND status='QUEUED' RETURNING *", [jobId]);
    if (!claim.rowCount)
        return;
    const j = claim.rows[0];
    try {
        let assetPath;
        if (process.env.STABILITY_API_KEY) {
            const form = new FormData();
            form.append('prompt', j.prompt);
            form.append('model', 'stable-audio-3');
            form.append('duration', '30');
            form.append('output_format', 'wav');
            const start = await fetch('https://api.stability.ai/v2beta/audio/stable-audio/text-to-audio', { method: 'POST', headers: { 'Authorization': `Bearer ${process.env.STABILITY_API_KEY}` }, body: form });
            if (!start.ok)
                throw new Error(`STABILITY_HTTP_${start.status}`);
            const started = await start.json();
            if (!started.id)
                throw new Error('STABILITY_RESPONSE_MISSING_ID');
            let audio;
            for (let i = 0; i < 150; i++) {
                await new Promise(r => setTimeout(r, 2000));
                const result = await fetch(`https://api.stability.ai/v2beta/audio/results/${started.id}`, { headers: { 'Authorization': `Bearer ${process.env.STABILITY_API_KEY}`, 'Accept': 'audio/*' } });
                if (result.status === 202)
                    continue;
                if (!result.ok)
                    throw new Error(`STABILITY_RESULT_HTTP_${result.status}`);
                audio = result;
                break;
            }
            if (!audio)
                throw new Error('STABILITY_TIMEOUT');
            const filename = `${jobId}.wav`;
            await writeFile(path.join(assetsDir, filename), Buffer.from(await audio.arrayBuffer()));
            assetPath = filename;
        }
        else if (providerGateway) {
            const resp = await fetch(`${providerGateway}/v1/generations`, { method: 'POST', headers: { 'content-type': 'application/json', ...(providerKey ? { 'authorization': `Bearer ${providerKey}` } : {}) }, body: JSON.stringify({ mode: j.mode, prompt: j.prompt, jobId: j.id }) });
            if (!resp.ok)
                throw new Error(`PROVIDER_HTTP_${resp.status}`);
            const data = await resp.json();
            if (data.assetPath)
                assetPath = String(data.assetPath);
            else if (data.assetUrl)
                assetPath = String(data.assetUrl);
            else
                throw new Error('PROVIDER_RESPONSE_MISSING_ASSET');
        }
        else if (process.env.ALLOW_LOCAL_DEMO === 'true' && !j.mode.toLowerCase().includes('video')) {
            const filename = `${jobId}.wav`;
            await writeFile(path.join(assetsDir, filename), makeWav(8));
            assetPath = filename;
        }
        else
            throw new Error('AI_PROVIDER_NOT_CONFIGURED');
        const base = process.env.PUBLIC_BASE_URL ?? `http://localhost:${process.env.PORT ?? 8080}`;
        const assetUrl = assetPath.startsWith('http') ? assetPath : `${base}/v1/assets/${jobId}`;
        const saved = await pool.query("UPDATE jobs SET asset_url=$2,updated_at=now() WHERE id=$1 AND status='RUNNING' RETURNING id", [jobId, assetUrl]);
        if (!saved.rowCount)
            return;
        await finalizeJob(pool, jobId, 'SUCCEEDED');
    }
    catch (e) {
        try {
            await finalizeJob(pool, jobId, 'FAILED', e?.message ?? 'GENERATION_FAILED');
        }
        catch { /* preserve job state for operational retry */ }
    }
}
app.post('/v1/generations', auth, async (req, res) => { const p = generationSchema.safeParse(req.body); if (!p.success)
    return res.status(400).json({ error: 'INVALID_REQUEST', details: p.error.flatten() }); if (!pool)
    return res.status(503).json({ error: 'DATABASE_NOT_CONFIGURED' }); const cost = CREDIT_COSTS[p.data.mode]; if (!cost)
    return res.status(400).json({ error: 'UNKNOWN_GENERATION_MODE' }); try {
    const c = await pool.connect();
    let jobRow;
    try {
        await c.query('BEGIN');
        const project = await c.query('SELECT id FROM projects WHERE id=$1 AND user_id=$2 FOR SHARE', [p.data.projectId, req.userId]);
        if (!project.rowCount) {
            await c.query('ROLLBACK');
            return res.status(404).json({ error: 'PROJECT_NOT_FOUND' });
        }
        const prior = await c.query('SELECT id,status,reserved_credits FROM jobs WHERE user_id=$1 AND idempotency_key=$2 FOR SHARE', [req.userId, p.data.idempotencyKey]);
        if (prior.rowCount) {
            await c.query('COMMIT');
            const existing = prior.rows[0];
            return res.status(200).json({ id: existing.id, status: existing.status, progress: ['SUCCEEDED', 'FAILED', 'CANCELED'].includes(existing.status) ? 100 : 5, reservedCredits: existing.reserved_credits });
        }
        await reserveCreditsTx(c, req.userId, cost, p.data.idempotencyKey);
        const job = await c.query(`INSERT INTO jobs(user_id,project_id,mode,prompt,status,reserved_credits,idempotency_key) VALUES($1,$2,$3,$4,'QUEUED',$5,$6) RETURNING id,status,reserved_credits`, [req.userId, p.data.projectId, p.data.mode, p.data.prompt, cost, p.data.idempotencyKey]);
        jobRow = job.rows[0];
        await c.query('COMMIT');
    }
    catch (e) {
        try {
            await c.query('ROLLBACK');
        }
        catch { }
        ;
        throw e;
    }
    finally {
        c.release();
    }
    res.status(202).json({ id: jobRow.id, status: jobRow.status, progress: 0, reservedCredits: jobRow.reserved_credits });
    setImmediate(() => runJob(jobRow.id));
}
catch (e) {
    if (e?.message === 'INSUFFICIENT_CREDITS')
        return res.status(402).json({ error: 'INSUFFICIENT_CREDITS' });
    res.status(409).json({ error: 'GENERATION_CREATE_FAILED' });
} });
app.get('/v1/generations/:id', auth, async (req, res) => { if (!pool)
    return res.status(503).json({ error: 'DATABASE_NOT_CONFIGURED' }); const r = await pool.query(`SELECT id,status,asset_url AS "assetUrl",error,CASE status WHEN 'QUEUED' THEN 5 WHEN 'RUNNING' THEN 65 WHEN 'SUCCEEDED' THEN 100 WHEN 'FAILED' THEN 100 ELSE 0 END AS progress FROM jobs WHERE id=$1 AND user_id=$2`, [req.params.id, req.userId]); if (!r.rowCount)
    return res.status(404).json({ error: 'JOB_NOT_FOUND' }); res.json(r.rows[0]); });
app.get('/v1/assets/:jobId', auth, async (req, res) => {
    if (!pool)
        return res.status(503).json({ error: 'DATABASE_NOT_CONFIGURED' });
    const r = await pool.query('SELECT asset_url FROM jobs WHERE id=$1 AND user_id=$2 AND status=\'SUCCEEDED\'', [req.params.jobId, req.userId]);
    if (!r.rowCount)
        return res.status(404).json({ error: 'ASSET_NOT_FOUND' });
    const raw = String(r.rows[0].asset_url ?? '');
    if (/^https:\/\//i.test(raw))
        return res.redirect(302, raw);
    const filename = path.basename(raw);
    const file = path.join(assetsDir, filename);
    if (!existsSync(file) || filename !== raw)
        return res.status(404).json({ error: 'ASSET_FILE_NOT_FOUND' });
    res.sendFile(file);
});
app.post('/v1/generations/:id/cancel', auth, async (req, res) => { if (!pool)
    return res.status(503).json({ error: 'DATABASE_NOT_CONFIGURED' }); const c = await pool.connect(); try {
    await c.query('BEGIN');
    const r = await c.query(`SELECT id,status,reserved_credits FROM jobs WHERE id=$1 AND user_id=$2 FOR UPDATE`, [req.params.id, req.userId]);
    if (!r.rowCount || !['QUEUED', 'RUNNING'].includes(r.rows[0].status)) {
        await c.query('ROLLBACK');
        return res.status(404).json({ error: 'JOB_NOT_FOUND_OR_NOT_CANCELABLE' });
    }
    await settleCreditsTx(c, req.userId, r.rows[0].reserved_credits, 0, `cancel-${r.rows[0].id}`);
    await c.query(`UPDATE jobs SET status='CANCELED',updated_at=now(),completed_at=now() WHERE id=$1`, [r.rows[0].id]);
    await c.query('COMMIT');
    return res.status(202).json({ status: 'CANCELED', id: r.rows[0].id });
}
catch (e) {
    await c.query('ROLLBACK');
    return res.status(409).json({ error: 'CANCEL_FAILED' });
}
finally {
    c.release();
} });
const port = Number(process.env.PORT ?? 8080);
app.listen(port, () => console.log(`MELODICA API listening on :${port}`));
