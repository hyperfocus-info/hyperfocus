import { isRecord } from '@hyperfocus/utilities/records';
import { readResponse, type HostedDemo, type HostedFetch } from './discovery.ts';

export type RecoveryFile = { version: 1; origin: string; key: string };
export function createRecoveryFile(origin: string): RecoveryFile {
  const key = Array.from(crypto.getRandomValues(new Uint8Array(32)), value => value.toString(16).padStart(2, '0')).join('');
  return { version: 1, origin: new URL(origin).origin, key };
}
export function readRecoveryFile(options: { text: string; origin: string }): RecoveryFile {
  if (new TextEncoder().encode(options.text).length > 2048) throw new Error('Recovery file is too large.');
  let value: unknown;try { value = JSON.parse(options.text); } catch { throw new Error('Choose a Touch of Death recovery key file.'); }
  if (!isRecord(value) || Object.keys(value).some(key => !['version', 'origin', 'key'].includes(key))) throw new Error('Invalid recovery key file.');
  const record = value;
  if (record.version !== 1 || typeof record.origin !== 'string' || record.origin !== new URL(options.origin).origin || typeof record.key !== 'string' || !/^[a-f0-9]{64}$/.test(record.key)) throw new Error('This recovery file is invalid or belongs to another game host.');
  return { version: 1, origin: record.origin, key: record.key };
}
export async function requestRecovery(options: { host: HostedDemo; operation: 'prepare' | 'confirm' | 'restore'; key: string; signal?: AbortSignal; fetch?: HostedFetch }) {
  if (!options.host.recoveryPath) throw new Error('This host does not support recovery keys.');
  const signal = AbortSignal.any([AbortSignal.timeout(5000), ...(options.signal ? [options.signal] : [])]);
  signal.throwIfAborted();
  const response = await (options.fetch ?? fetch)(options.host.recoveryPath, { method: 'POST', credentials: 'same-origin', redirect: 'error', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ operation: options.operation, key: options.key }), signal });
  let value: unknown;
  try { value = await readResponse(response, signal); }
  catch { signal.throwIfAborted();throw new Error('The host returned an invalid recovery response. Keep your key file and retry.'); }
  signal.throwIfAborted();
  if (!response.ok) {
    const code = value && typeof value === 'object' ? Reflect.get(value, 'code') : undefined;
    if (response.status === 429) throw new Error('Too many recovery requests. Wait a minute, then retry.');
    if (code === 'guest-recovery-invalid') throw new Error('This key is not active. Choose your latest activated recovery file.');
    if (code === 'guest-recovery-pending-expired') throw new Error('Key setup expired. Save and activate a new key. Your previous active key still works.');
    if (code === 'guest-identity-unavailable') throw new Error('Guest access expired. Restore with an existing key before saving a replacement.');
    throw new Error('Recovery could not finish. Keep your key file and retry.');
  }
  if (!value || typeof value !== 'object' || Reflect.get(value, 'ok') !== true || Object.keys(value).some(key => key !== 'ok')) throw new Error('The host returned an invalid recovery response. Keep your key file and retry.');
}

export function downloadRecoveryFile(file: RecoveryFile) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }));
  const anchor = document.createElement('a');anchor.href = url;anchor.download = 'touch-of-death-recovery.json';
  document.body.append(anchor);anchor.click();anchor.remove();setTimeout(() => URL.revokeObjectURL(url), 1000);
}
