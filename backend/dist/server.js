import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { Pool } from 'pg';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CREDIT_COSTS, reserveCredits, settleCredits } from './credits.js';
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
app.use('/assets', express.static(assetsDir, { maxAge: '1h' }));
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
app.get('/health', (_req, res) => res.json({ ok: true, service: 'melodica-api', version: '1.2.0' }));
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
app.get('/v1/me', auth, (req, res) => res.json({ userId: req.userId }));
app.get('/v1/credits', auth, async (req, res) => { if (!pool)
    return res.status(503).json({ error: 'DATABASE_NOT_CONFIGURED' }); const r = await pool.query('SELECT balance,reserved FROM credit_accounts WHERE user_id=$1', [req.userId]); res.json(r.rows[0] ?? { balance: 0, reserved: 0 }); });
app.get('/v1/credits/catalog', (_req, res) => res.json(CREDIT_COSTS));
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
async function runJob(jobId) { if (!pool)
    return; const r = await pool.query('SELECT * FROM jobs WHERE id=$1', [jobId]); if (!r.rowCount)
    return; const j = r.rows[0]; try {
    await pool.query("UPDATE jobs SET status='RUNNING',updated_at=now() WHERE id=$1", [jobId]);
    await new Promise(x => setTimeout(x, 350));
    if (j.mode.toLowerCase().includes('video')) {
        await settleCredits(pool, j.user_id, j.reserved_credits, j.reserved_credits, jobId);
        await pool.query("UPDATE jobs SET status='FAILED',error='VIDEO_PROVIDER_NOT_CONFIGURED',updated_at=now() WHERE id=$1", [jobId]);
        return;
    }
    const filename = `${jobId}.wav`;
    await writeFile(path.join(assetsDir, filename), makeWav(8));
    const base = process.env.PUBLIC_BASE_URL ?? `http://localhost:${process.env.PORT ?? 8080}`;
    await settleCredits(pool, j.user_id, j.reserved_credits, j.reserved_credits, jobId);
    await pool.query("UPDATE jobs SET status='SUCCEEDED',asset_url=$2,settled_credits=$3,updated_at=now() WHERE id=$1", [jobId, `${base}/assets/${filename}`, j.reserved_credits]);
}
catch (e) {
    await pool.query("UPDATE jobs SET status='FAILED',error=$2,updated_at=now() WHERE id=$1", [jobId, String(e?.message ?? 'GENERATION_FAILED').slice(0, 500)]).catch(() => { });
    await settleCredits(pool, j.user_id, j.reserved_credits, 0, jobId).catch(() => { });
} }
app.post('/v1/generations', auth, async (req, res) => { const p = generationSchema.safeParse(req.body); if (!p.success)
    return res.status(400).json({ error: 'INVALID_REQUEST', details: p.error.flatten() }); if (!pool)
    return res.status(503).json({ error: 'DATABASE_NOT_CONFIGURED' }); const cost = CREDIT_COSTS[p.data.mode]; if (!cost)
    return res.status(400).json({ error: 'UNKNOWN_GENERATION_MODE' }); try {
    await reserveCredits(pool, req.userId, cost, p.data.idempotencyKey);
    const job = await pool.query(`INSERT INTO jobs(user_id,project_id,mode,prompt,status,reserved_credits,idempotency_key) VALUES($1,$2,$3,$4,'QUEUED',$5,$6) ON CONFLICT(user_id,idempotency_key) DO UPDATE SET updated_at=now() RETURNING id,status,reserved_credits`, [req.userId, p.data.projectId, p.data.mode, p.data.prompt, cost, p.data.idempotencyKey]);
    res.status(202).json({ id: job.rows[0].id, status: job.rows[0].status, progress: 0, reservedCredits: job.rows[0].reserved_credits });
    setImmediate(() => runJob(job.rows[0].id));
}
catch (e) {
    if (e?.message === 'INSUFFICIENT_CREDITS')
        return res.status(402).json({ error: 'INSUFFICIENT_CREDITS' });
    res.status(409).json({ error: 'CREDIT_RESERVATION_FAILED' });
} });
app.get('/v1/generations/:id', auth, async (req, res) => { if (!pool)
    return res.status(503).json({ error: 'DATABASE_NOT_CONFIGURED' }); const r = await pool.query(`SELECT id,status,asset_url AS "assetUrl",error,CASE status WHEN 'QUEUED' THEN 5 WHEN 'RUNNING' THEN 65 WHEN 'SUCCEEDED' THEN 100 WHEN 'FAILED' THEN 100 ELSE 0 END AS progress FROM jobs WHERE id=$1 AND user_id=$2`, [req.params.id, req.userId]); if (!r.rowCount)
    return res.status(404).json({ error: 'JOB_NOT_FOUND' }); res.json(r.rows[0]); });
app.post('/v1/generations/:id/cancel', auth, async (req, res) => { if (!pool)
    return res.status(503).json({ error: 'DATABASE_NOT_CONFIGURED' }); const r = await pool.query(`UPDATE jobs SET status='CANCELED',updated_at=now() WHERE id=$1 AND user_id=$2 AND status IN ('QUEUED','RUNNING') RETURNING id,status,reserved_credits`, [req.params.id, req.userId]); if (!r.rowCount)
    return res.status(404).json({ error: 'JOB_NOT_FOUND_OR_NOT_CANCELABLE' }); await settleCredits(pool, req.userId, r.rows[0].reserved_credits, 0, `cancel-${r.rows[0].id}`); res.status(202).json({ status: 'CANCELED', id: r.rows[0].id }); });
const port = Number(process.env.PORT ?? 8080);
app.listen(port, () => console.log(`MELODICA API listening on :${port}`));
