import { readFile, realpath } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { gzipSync } from 'node:zlib';
import { hashHyperfocusAsset } from '../../src/project/index.ts';

export type WebDeliveryInventory = { version: 1; runtimeEntry: string; files: Array<{ path: string; size: number; sha256: string; mimeType: string }> };

export async function readWebDeliveryInventory(directory: string): Promise<WebDeliveryInventory> {
  const value: unknown = JSON.parse(await readFile(join(directory, 'build.json'), 'utf8'));
  if (!record(value) || value.version !== 1 || typeof value.runtimeEntry !== 'string' || !Array.isArray(value.files) || value.files.length > 6000) throw Error('Invalid web build inventory.');
  const files = value.files.map(file => {
    if (!record(file) || typeof file.path !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(file.path) || file.path.split('/').some(part => !part || part === '.' || part === '..')
      || typeof file.size !== 'number' || !Number.isSafeInteger(file.size) || file.size < 0 || file.size > 536870912
      || typeof file.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(file.sha256) || typeof file.mimeType !== 'string' || !/^[a-zA-Z0-9+./-]+$/.test(file.mimeType)) throw Error('Invalid web build file.');
    return { path: file.path, size: file.size, sha256: file.sha256, mimeType: file.mimeType };
  });
  if (new Set(files.map(file => file.path)).size !== files.length || !files.some(file => file.path === value.runtimeEntry) || !files.some(file => file.path === 'index.html')) throw Error('Incomplete web build inventory.');
  return { version: 1, runtimeEntry: value.runtimeEntry, files };
}

export async function verifyWebDeliveryDirectory(directory: string) {
  const root = await realpath(directory), inventory = await readWebDeliveryInventory(root);
  for (const file of inventory.files) {
    const path = await realpath(join(root, file.path));if (!path.startsWith(root + sep)) throw Error('Web output escapes the delivery directory.');
    const bytes = new Uint8Array(await readFile(path));
    if (bytes.length !== file.size || await hashHyperfocusAsset(bytes) !== file.sha256) throw Error(`Changed web output: ${file.path}`);
  }
  return inventory;
}

/** Serve only inventoried release files. Public immutable objects support CORS and byte ranges. */
export async function createWebDeliveryHandler(options: { directory: string; prefix?: string }) {
  const directory = await realpath(options.directory), inventory = await readWebDeliveryInventory(directory);
  const prefix = options.prefix ?? '/';
  if (!prefix.startsWith('/') || !prefix.endsWith('/')) throw Error('Delivery prefix must start and end with /.');
  const files = new Map(inventory.files.map(file => [prefix + file.path, file]));
  const gzip = new Map<string, Uint8Array<ArrayBuffer>>();
  for (const file of inventory.files) {
    const path = await realpath(join(directory, file.path));if (!path.startsWith(directory + sep)) throw Error('Web output escapes the delivery directory.');
  }
  return { inventory, async respond(request: Request) {
    const pathname = new URL(request.url).pathname;
    const entry = files.get(pathname === prefix ? `${prefix}index.html` : pathname);if (!entry) return;
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS', 'Access-Control-Allow-Headers': 'Range', 'Access-Control-Max-Age': '86400' } });
    if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD, OPTIONS' } });
    const file = Bun.file(join(directory, entry.path));if (file.size !== entry.size) return new Response('Deployment file changed', { status: 503 });
    const headers = new Headers({ 'Content-Type': entry.mimeType, 'Accept-Ranges': 'bytes', 'ETag': `"${entry.sha256}"`,
      'Cache-Control': entry.path === 'index.html' || entry.path === 'delivery.json' ? 'no-cache' : 'public, max-age=31536000, immutable',
      'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Length, Content-Range, ETag', 'X-Content-Type-Options': 'nosniff' });
    const range = request.headers.get('Range');
    const useRange = range && (!request.headers.has('If-Range') || request.headers.get('If-Range') === headers.get('ETag'));
    const compressible = /^(text\/|application\/json)/.test(entry.mimeType) && entry.size < 8388608;
    const compress = compressible && !useRange && acceptsGzip(request.headers.get('Accept-Encoding') ?? '');
    if (compressible) headers.set('Vary', 'Accept-Encoding');
    if (compress) { headers.set('Content-Encoding', 'gzip');headers.set('ETag', `"${entry.sha256}-gzip"`); }
    if ((request.headers.get('If-None-Match') ?? '').split(',').some(tag => tag.trim().replace(/^W\//, '') === headers.get('ETag') || tag.trim() === '*')) return new Response(null, { status: 304, headers });
    if (useRange) {
      const parsed = readByteRange(range, entry.size);
      if (!parsed) { headers.set('Content-Range', `bytes */${entry.size}`);return new Response(null, { status: 416, headers }); }
      headers.set('Content-Range', `bytes ${parsed.start}-${parsed.end}/${entry.size}`);headers.set('Content-Length', String(parsed.end - parsed.start + 1));
      return new Response(request.method === 'HEAD' ? null : file.slice(parsed.start, parsed.end + 1), { status: 206, headers });
    }
    if (compress) {
      let bytes = gzip.get(entry.path);
      if (!bytes) { bytes = new Uint8Array(gzipSync(await file.arrayBuffer()));gzip.set(entry.path, bytes); }
      headers.set('Content-Encoding', 'gzip');headers.set('Vary', 'Accept-Encoding');headers.set('Content-Length', String(bytes.length));
      return new Response(request.method === 'HEAD' ? null : bytes, { headers });
    }
    headers.set('Content-Length', String(entry.size));return new Response(request.method === 'HEAD' ? null : file, { headers });
  } };
}

export function readByteRange(value: string, size: number) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || !match[1] && !match[2] || size <= 0) return;
  const first = Number(match[1] || 0), last = Number(match[2] || 0);
  if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last) || !match[1] && last === 0) return;
  const start = match[1] ? first : Math.max(0, size - last), end = match[1] && match[2] ? Math.min(last, size - 1) : size - 1;
  if (start > end || start >= size) return;
  return { start, end };
}
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function acceptsGzip(value: string) {
  const entries = value.split(',').map(entry => entry.trim().toLowerCase().split(';').map(part => part.trim()));
  const entry = entries.find(entry => entry[0] === 'gzip') ?? entries.find(entry => entry[0] === '*');
  if (!entry) return false;
  const quality = entry.find(part => part.startsWith('q='));
  return quality === undefined || Number(quality.slice(2)) > 0 && Number(quality.slice(2)) <= 1;
}
