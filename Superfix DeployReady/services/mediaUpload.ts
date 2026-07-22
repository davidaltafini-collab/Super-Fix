import { API_URL } from '../config/api';

export async function uploadSignedMedia(
  file: File,
  kind: 'image' | 'video',
  options: { onboardingToken?: string } = {},
): Promise<string | null> {
  const maxBytes = kind === 'video' ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
  const allowed = kind === 'video'
    ? ['video/mp4', 'video/quicktime', 'video/webm']
    : ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
  if (file.size > maxBytes || !allowed.includes(file.type.toLowerCase())) return null;
  const token = localStorage.getItem('superfix_token');
  const signed = await fetch(`${API_URL}/media/sign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ kind, onboardingToken: options.onboardingToken }),
  });
  if (!signed.ok) return null;
  const config = await signed.json();
  const data = new FormData();
  data.append('file', file);
  Object.entries(config.params || {}).forEach(([key, value]) => data.append(key, String(value)));
  data.append('api_key', String(config.apiKey));
  data.append('signature', String(config.signature));
  const uploaded = await fetch(`https://api.cloudinary.com/v1_1/${config.cloudName}/${config.resourceType}/upload`, { method: 'POST', body: data });
  const payload = await uploaded.json().catch(() => ({}));
  const secureUrl = typeof payload.secure_url === 'string' ? payload.secure_url : '';
  return uploaded.ok && secureUrl.startsWith(`https://res.cloudinary.com/${config.cloudName}/`) ? secureUrl : null;
}
