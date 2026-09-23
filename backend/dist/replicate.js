import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { request as httpsRequest } from 'node:https';
import { request as httpRequest } from 'node:http';
const API_BASE = 'https://api.replicate.com/v1';
const DEFAULT_TIMEOUT = Number(process.env.MELODICA_REPLICATE_TIMEOUT ?? 1200);
const POLL_INTERVAL = Number(process.env.MELODICA_REPLICATE_POLL_INTERVAL ?? 3000);
export const REPLICATE_MUSIC_MODEL = 'minimax/music-2.6';
export const REPLICATE_VOICE_MODEL = 'deepsbhat1984/music_voice_clone_pro';
function token() {
    const value = String(process.env.REPLICATE_API_TOKEN ?? '').trim();
    if (!value)
        throw new Error('REPLICATE_API_TOKEN_NOT_CONFIGURED');
    return value;
}
export function replicateConfigured() {
    return Boolean(String(process.env.REPLICATE_API_TOKEN ?? '').trim());
}
function headers(extra = {}) {
    return {
        authorization: `Bearer ${token()}`,
        accept: 'application/json',
        'user-agent': 'MELODICA-ENGINE/1.5',
        ...extra
    };
}
async function readResponse(res) {
    const chunks = [];
    for await (const chunk of res)
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return Buffer.concat(chunks);
}
async function requestBuffer(method, url, body, extraHeaders = {}, redirects = 0) {
    const target = new URL(url);
    const requestFn = target.protocol === 'http:' ? httpRequest : httpsRequest;
    return await new Promise((resolve, reject) => {
        const req = requestFn({
            protocol: target.protocol,
            hostname: target.hostname,
            port: target.port || undefined,
            path: `${target.pathname}${target.search}`,
            method,
            headers: { ...extraHeaders }
        }, async (res) => {
            const status = Number(res.statusCode ?? 0);
            const location = typeof res.headers.location === 'string' ? res.headers.location : '';
            if (status >= 300 && status < 400 && location && redirects < 5) {
                res.resume();
                try {
                    const next = new URL(location, target).toString();
                    resolve(await requestBuffer(method, next, body, extraHeaders, redirects + 1));
                }
                catch (err) {
                    reject(err);
                }
                return;
            }
            resolve({ status, headers: res.headers, body: await readResponse(res) });
        });
        req.on('error', reject);
        const timeout = setTimeout(() => req.destroy(new Error(`HTTP_TIMEOUT:${url}`)), DEFAULT_TIMEOUT * 1000);
        req.on('close', () => clearTimeout(timeout));
        if (body)
            req.write(body);
        req.end();
    });
}
async function requestJson(method, path, payload, extraHeaders = {}) {
    const body = payload === undefined ? undefined : Buffer.from(JSON.stringify(payload), 'utf8');
    const response = await requestBuffer(method, path.startsWith('http') ? path : `${API_BASE}${path}`, body, headers({ ...(body ? { 'content-type': 'application/json' } : {}), ...extraHeaders }));
    const text = response.body.toString('utf8');
    let data = {};
    if (text) {
        try {
            data = JSON.parse(text);
        }
        catch {
            data = { raw: text };
        }
    }
    if (response.status < 200 || response.status >= 300) {
        throw new Error(`REPLICATE_HTTP_${response.status}:${text.slice(0, 600)}`);
    }
    return data;
}
function outputUrl(output) {
    if (typeof output === 'string' && /^https?:\/\//i.test(output))
        return output;
    if (Array.isArray(output)) {
        for (const item of output) {
            const found = outputUrl(item);
            if (found)
                return found;
        }
    }
    if (output && typeof output === 'object') {
        const value = output.url ?? output.output_url;
        if (typeof value === 'string' && /^https?:\/\//i.test(value))
            return value;
    }
    return undefined;
}
async function pollPrediction(id, timeoutSec = DEFAULT_TIMEOUT) {
    const deadline = Date.now() + timeoutSec * 1000;
    let latest = null;
    while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, POLL_INTERVAL));
        latest = await requestJson('GET', `/predictions/${encodeURIComponent(id)}`);
        const status = String(latest.status ?? '').toLowerCase();
        if (['succeeded', 'failed', 'canceled'].includes(status))
            return latest;
    }
    throw new Error(`REPLICATE_PREDICTION_TIMEOUT:${id}`);
}
async function createPrediction(path, input, timeoutSec = DEFAULT_TIMEOUT) {
    const created = await requestJson('POST', path, { input }, { prefer: 'wait=60' });
    const status = String(created.status ?? '').toLowerCase();
    if (['succeeded', 'failed', 'canceled'].includes(status))
        return created;
    const id = String(created.id ?? '');
    if (!id)
        throw new Error(`REPLICATE_PREDICTION_ID_MISSING:${JSON.stringify(created).slice(0, 500)}`);
    return await pollPrediction(id, timeoutSec);
}
async function getModel(model) {
    return await requestJson('GET', `/models/${model}`);
}
async function createPredictionForLatestVersion(model, input, timeoutSec = DEFAULT_TIMEOUT) {
    const info = await getModel(model);
    const version = String(info?.latest_version?.id ?? '').trim();
    if (!version)
        throw new Error(`REPLICATE_LATEST_VERSION_MISSING:${model}`);
    // /v1/predictions expects { version, input } at the top level.
    const created = await requestJson('POST', '/predictions', { version, input }, { prefer: 'wait=60' });
    const status = String(created.status ?? '').toLowerCase();
    const result = ['succeeded', 'failed', 'canceled'].includes(status)
        ? created
        : await pollPrediction(String(created.id ?? ''), timeoutSec);
    if (!String(created.id ?? '') && !['succeeded', 'failed', 'canceled'].includes(status))
        throw new Error(`REPLICATE_PREDICTION_ID_MISSING:${JSON.stringify(created).slice(0, 500)}`);
    return { result, version };
}
async function uploadFile(filePath, metadata = {}, timeoutSec = DEFAULT_TIMEOUT) {
    const file = await readFile(filePath);
    const filename = basename(filePath).slice(0, 255);
    const boundary = `----MELODICA${randomUUID().replace(/-/g, '')}`;
    const meta = Buffer.from(JSON.stringify(metadata), 'utf8');
    const disposition = `form-data; name="content"; filename="${filename.replace(/"/g, '')}"`;
    const pieces = [];
    pieces.push(Buffer.from(`--${boundary}\r\nContent-Disposition: ${disposition}\r\nContent-Type: application/octet-stream\r\n\r\n`));
    pieces.push(file);
    pieces.push(Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="metadata"\r\nContent-Type: application/json\r\n\r\n`));
    pieces.push(meta);
    pieces.push(Buffer.from(`\r\n--${boundary}--\r\n`));
    const body = Buffer.concat(pieces);
    const response = await requestBuffer('POST', `${API_BASE}/files`, body, headers({
        'content-type': `multipart/form-data; boundary=${boundary}`,
        'content-length': String(body.length)
    }));
    const text = response.body.toString('utf8');
    let data = {};
    if (text) {
        try {
            data = JSON.parse(text);
        }
        catch {
            data = { raw: text };
        }
    }
    if (response.status < 200 || response.status >= 300)
        throw new Error(`REPLICATE_FILES_HTTP_${response.status}:${text.slice(0, 600)}`);
    const id = String(data.id ?? '');
    const url = String(data?.urls?.get ?? '');
    if (!id || !url)
        throw new Error(`REPLICATE_FILE_RESPONSE_INVALID:${text.slice(0, 600)}`);
    return { id, url };
}
async function deleteFile(id) {
    try {
        await requestJson('DELETE', `/files/${encodeURIComponent(id)}`);
    }
    catch { /* best effort cleanup */ }
}
async function downloadTo(url, filePath) {
    const response = await requestBuffer('GET', url, undefined, { 'user-agent': 'MELODICA-ENGINE/1.5' });
    if (response.status < 200 || response.status >= 300)
        throw new Error(`REPLICATE_DOWNLOAD_HTTP_${response.status}`);
    await (await import('node:fs/promises')).writeFile(filePath, response.body);
    return filePath;
}
export async function generateAiSong(params) {
    const lyrics = String(params.lyrics ?? '').trim();
    const prompt = String(params.prompt ?? '').trim();
    const input = {
        lyrics: lyrics || undefined,
        prompt,
        bitrate: 256000,
        sample_rate: 44100,
        audio_format: 'mp3',
        is_instrumental: false,
        lyrics_optimizer: !lyrics
    };
    const result = await createPrediction(`/models/${REPLICATE_MUSIC_MODEL}/predictions`, input);
    if (String(result.status ?? '') !== 'succeeded')
        throw new Error(`REPLICATE_MUSIC_${String(result.status ?? 'FAILED').toUpperCase()}`);
    const url = outputUrl(result.output);
    if (!url)
        throw new Error('REPLICATE_MUSIC_OUTPUT_MISSING');
    await downloadTo(url, params.outputPath);
    return { predictionId: String(result.id ?? ''), outputUrl: url, model: REPLICATE_MUSIC_MODEL };
}
export async function cloneVoice(params) {
    const uploaded = [];
    try {
        const source = await uploadFile(params.sourceAudioPath, { type: 'melodica_singing_source' });
        const reference = await uploadFile(params.referenceAudioPath, { type: 'melodica_voice_reference' });
        uploaded.push(source.id, reference.id);
        const input = {
            source_url: source.url,
            target_url: reference.url,
            diffusion_steps: 100,
            grit_restore: 0.0,
            reverb_amount: 0.1,
            return_vocal_only: false
        };
        const { result, version } = await createPredictionForLatestVersion(REPLICATE_VOICE_MODEL, input);
        if (String(result.status ?? '') !== 'succeeded')
            throw new Error(`REPLICATE_VOICE_${String(result.status ?? 'FAILED').toUpperCase()}`);
        const url = outputUrl(result.output);
        if (!url)
            throw new Error('REPLICATE_VOICE_OUTPUT_MISSING');
        await downloadTo(url, params.outputPath);
        return { predictionId: String(result.id ?? ''), outputUrl: url, model: REPLICATE_VOICE_MODEL, version };
    }
    finally {
        await Promise.all(uploaded.map(deleteFile));
    }
}
