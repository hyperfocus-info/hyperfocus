import { open, rename, rm } from 'node:fs/promises';

/** Build-only download. A signed URL never enters the final runtime image. */
export async function fetchArchive(source: { url: string; bytes: number; sha256: string }, output: string, request: (url: string, options: RequestInit) => Promise<Response> = fetch) {
  if (new URL(source.url).protocol !== 'https:' || !Number.isSafeInteger(source.bytes) || source.bytes <= 0 || source.bytes > 536870912 || !/^[a-f0-9]{64}$/.test(source.sha256)) throw Error('Invalid archive descriptor.');
  const response = await request(source.url, { redirect: 'error', signal: AbortSignal.timeout(300_000) }).catch(() => { throw Error('Archive download failed; signed URL suppressed.'); });
  if (!response.ok || !response.body) throw Error(`Archive download returned HTTP ${response.status}.`);
  const temporary = `${output}.download`, file = await open(temporary, 'wx'), hash = new Bun.CryptoHasher('sha256');
  let bytes = 0;
  try {
    for await (const chunk of response.body) {
      bytes += chunk.length;
      if (bytes > source.bytes) throw Error('Archive exceeds declared size.');
      hash.update(chunk);await file.writeFile(chunk);
    }
    if (bytes !== source.bytes || hash.digest('hex') !== source.sha256) throw Error('Archive checksum or size mismatch.');
    await file.close();await rename(temporary, output);
  } catch {
    await file.close().catch(() => undefined);await rm(temporary, { force: true });
    throw Error('Archive verification failed; no unverified archive published.');
  }
}

if (import.meta.main) {
  const source = await Bun.file(process.argv[2]!).json();
  await fetchArchive(source, process.argv[3]!);
  console.log(`Verified asset archive: ${source.bytes} bytes, SHA-256 ${source.sha256}`);
}
