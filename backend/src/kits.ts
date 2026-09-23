const KITS_BASE_URL = 'https://arpeggi.io/api/kits/v1';

function kitsHeaders() {
  const key = process.env.KITS_API_KEY;
  if (!key) throw new Error('KITS_API_KEY_NOT_CONFIGURED');
  return { Authorization: `Bearer ${key}` };
}

export async function kitsCreateVoiceConversion(
  voiceModelId: number,
  audio: Buffer,
  filename = 'input.wav'
) {
  const form = new FormData();
  form.append('voiceModelId', String(voiceModelId));
  form.append(
    'soundFile',
    new Blob([new Uint8Array(audio.buffer as ArrayBuffer, audio.byteOffset, audio.byteLength)], { type: 'audio/wav' }),
    filename
  );

  const response = await fetch(`${KITS_BASE_URL}/voice-conversions`, {
    method: 'POST',
    headers: kitsHeaders(),
    body: form
  });

  if (!response.ok) {
    throw new Error(`KITS_CREATE_${response.status}:${await response.text()}`);
  }

  return await response.json();
}

export async function kitsGetVoiceConversion(jobId: number) {
  const response = await fetch(`${KITS_BASE_URL}/voice-conversions/${jobId}`, {
    headers: kitsHeaders()
  });

  if (!response.ok) {
    throw new Error(`KITS_STATUS_${response.status}:${await response.text()}`);
  }

  return await response.json();
}

export function kitsConfigured() {
  return Boolean(process.env.KITS_API_KEY);
}
