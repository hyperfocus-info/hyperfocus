import { readStandaloneStreamedAudio, type EditorProject } from '@hyperfocus/engine/project';
import { readByteRange } from '@hyperfocus/engine/tooling/build-project';

/** Serve only exported music, from the same verified bytes already loaded by the relay. */
export function createDemoAudio(options: { html: string; project: EditorProject; assets: readonly { id: string; mimeType: string; bytes: Uint8Array }[] }) {
  const payload = /<script\b[^>]*\bid="hyperfocus-project-pair"[^>]*>([\s\S]*?)<\/script>/.exec(options.html)?.[1];
  const pair: unknown = payload ? JSON.parse(payload) : undefined;
  const sources = readStandaloneStreamedAudio({ project: options.project, value: pair && typeof pair === 'object' ? Reflect.get(pair, 'streamedAudio') : undefined });
  const assets = new Map<string, Uint8Array<ArrayBuffer>>();
  for (const source of sources) {
    const asset = options.assets.find(asset => asset.id === source.assetId);
    if (!asset || asset.mimeType !== 'audio/mpeg' || asset.bytes.length !== source.size
      || new Bun.CryptoHasher('sha256').update(asset.bytes).digest('hex') !== source.sha256) throw Error(`Missing or changed hosted music: ${source.assetId}`);
    const bytes = asset.bytes;
    assets.set(`/${source.url}`, bytes.buffer instanceof ArrayBuffer ? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength) : Uint8Array.from(bytes));
  }
  return {
    paths: new Set(assets.keys()),
    respond(request: Request) {
      const bytes = assets.get(new URL(request.url).pathname);
      if (!bytes) return;
      if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405 });
      const range = request.headers.get('Range'), slice = range ? readByteRange(range, bytes.length) : undefined;
      if (range && !slice) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${bytes.length}`, 'Accept-Ranges': 'bytes' } });
      const body = slice ? bytes.subarray(slice.start, slice.end + 1) : bytes;
      return new Response(request.method === 'HEAD' ? null : body, { status: slice ? 206 : 200, headers: {
        'Content-Type': 'audio/mpeg', 'Content-Length': String(body.length), 'Accept-Ranges': 'bytes',
        ...(slice ? { 'Content-Range': `bytes ${slice.start}-${slice.end}/${bytes.length}` } : {}),
        'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff',
      } });
    },
  };
}
