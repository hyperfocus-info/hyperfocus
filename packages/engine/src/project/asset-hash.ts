export async function hashHyperfocusAsset(bytes: Uint8Array) {
  if (!(bytes instanceof Uint8Array)) throw new Error('portable asset bytes must be Uint8Array');
  const owned = new Uint8Array(bytes);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', owned.buffer));
  return [...digest].map(value => value.toString(16).padStart(2, '0')).join('');
}
