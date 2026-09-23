const SOUNDVERSE_BASE_URL = 'https://apiv2.soundverse.ai';

function getKey(): string {
  const key = process.env.SOUNDVERSE_API_KEY?.trim();
  if (!key) throw new Error('SOUNDVERSE_API_KEY_NOT_CONFIGURED');
  return key;
}

function authHeaders(extra: Record<string, string> = {}) {
  return {
    Authorization: `Bearer ${getKey()}`,
    ...extra,
  };
}

async function assertOk(response: Response, label: string) {
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`${label}_${response.status}:${body}`);
  }
}

export async function soundverseUploadAudio(
  audio: Buffer,
  filename = 'voice.m4a',
  contentType = 'audio/mp4'
): Promise<{ fileId: string }> {
  const form = new FormData();
  const bytes = new Uint8Array(
    audio.buffer,
    audio.byteOffset,
    audio.byteLength
  );
  form.append('file', new Blob([Buffer.from(bytes)], { type: contentType }), filename);

  const response = await fetch(`${SOUNDVERSE_BASE_URL}/v1/files`, {
    method: 'POST',
    headers: authHeaders(),
    body: form,
  });

  await assertOk(response, 'SOUNDVERSE_FILE_UPLOAD');
  const data = await response.json();
  const fileId = String(data.file_id ?? data.id ?? data.fileId ?? '');

  if (!fileId) {
    throw new Error(`SOUNDVERSE_FILE_ID_MISSING:${JSON.stringify(data)}`);
  }
  return { fileId };
}

export async function soundverseCreateVoiceClone(params: {
  referenceFileId: string;
  name: string;
  idempotencyKey: string;
}) {
  const response = await fetch(
    `${SOUNDVERSE_BASE_URL}/v1/voice-clones`,
    {
      method: 'POST',
      headers: authHeaders({
        'Content-Type': 'application/json',
        'Idempotency-Key': params.idempotencyKey,
      }),
      body: JSON.stringify({
        reference_file_id: params.referenceFileId,
        name: params.name,
        description: `Voice personale MELODICA IA: ${params.name}`,
        version: 'v7',
        license: 'royalty_free',
        consent: true,
        rights_attestation:
          'La persona che ha fornito la registrazione ha dato il consenso all utilizzo della propria voce per generazione musicale tramite MELODICA IA.',
      }),
    }
  );

  await assertOk(response, 'SOUNDVERSE_VOICE_CLONE');
  return await response.json();
}

export async function soundverseGetGeneration(taskId: string) {
  const response = await fetch(`${SOUNDVERSE_BASE_URL}/v1/generations/${encodeURIComponent(taskId)}`, { headers: authHeaders() });
  await assertOk(response, 'SOUNDVERSE_GENERATION_STATUS');
  return await response.json();
}

export async function soundverseGenerateSong(params: {
  lyrics: string;
  style: string;
  vocalId?: string | null;
  idempotencyKey: string;
}) {
  const response = await fetch(`${SOUNDVERSE_BASE_URL}/v7/generate/song`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json', 'Idempotency-Key': params.idempotencyKey }),
    body: JSON.stringify({ prompt: params.style, lyrics: params.lyrics, ...(params.vocalId ? { vocal_id: params.vocalId } : {}) }),
  });
  await assertOk(response, 'SOUNDVERSE_SONG_GENERATION');
  return await response.json();
}


export async function soundverseDownloadFile(fileId: string): Promise<Buffer> {
  const response = await fetch(
    `${SOUNDVERSE_BASE_URL}/v1/files/${encodeURIComponent(fileId)}/download`,
    { headers: authHeaders() }
  );
  await assertOk(response, 'SOUNDVERSE_FILE_DOWNLOAD');

  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const data: any = await response.json();
    const url = String(data.url ?? data.download_url ?? data.downloadUrl ?? '');
    if (!url) throw new Error(`SOUNDVERSE_DOWNLOAD_URL_MISSING:${JSON.stringify(data)}`);

    const audio = await fetch(url);
    if (!audio.ok) throw new Error(`SOUNDVERSE_AUDIO_DOWNLOAD_${audio.status}`);
    return Buffer.from(await audio.arrayBuffer());
  }

  return Buffer.from(await response.arrayBuffer());
}

export async function soundverseRevokeVoiceConsent(consentId: string): Promise<void> {
  const response = await fetch(
    `${SOUNDVERSE_BASE_URL}/v1/voice-clone-consents/${encodeURIComponent(consentId)}/revoke`,
    {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
    }
  );
  await assertOk(response, 'SOUNDVERSE_VOICE_CONSENT_REVOKE');
}

export function soundverseConfigured(): boolean {
  return Boolean(process.env.SOUNDVERSE_API_KEY?.trim());
}