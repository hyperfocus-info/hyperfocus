/** Copies each chunk immediately into owned storage. Known-size objects allocate once.
 * Self-contained so the generated early-download bootstrap uses this same implementation. */
export async function readDeliveryStream(options: {
  reader: Pick<ReadableStreamDefaultReader<Uint8Array>, 'read' | 'cancel' | 'releaseLock'>;
  maxBytes: number; expectedBytes?: number; idleTimeoutMs?: number; onProgress?: (received: number) => void;
}) {
  const { reader, maxBytes, expectedBytes, idleTimeoutMs } = options;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 0 || expectedBytes !== undefined && (!Number.isSafeInteger(expectedBytes) || expectedBytes < 0 || expectedBytes > maxBytes)) throw Error('Invalid delivery byte limit');
    if (idleTimeoutMs !== undefined && (!Number.isFinite(idleTimeoutMs) || idleTimeoutMs <= 0)) throw Error('Invalid delivery idle timeout');
    let bytes = new Uint8Array(expectedBytes ?? Math.min(maxBytes, 65536)), received = 0;
    for (;;) {
      const next = reader.read();
      const part = await (idleTimeoutMs === undefined ? next : Promise.race([next, new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(Error('Delivery download stalled; retry loading')), idleTimeoutMs);
      })]));
      clearTimeout(timer);timer = undefined;
      if (part.done) break;
      if (!part.value.byteLength) throw Error('Empty delivery chunk');
      const end = received + part.value.byteLength;
      if (end > (expectedBytes ?? maxBytes)) throw Error('Download exceeds declared size');
      if (end > bytes.length) {
        const grown = new Uint8Array(Math.min(maxBytes, Math.max(end, bytes.length * 2)));
        grown.set(bytes.subarray(0, received));bytes = grown;
      }
      bytes.set(part.value, received);received = end;options.onProgress?.(received);
    }
    if (expectedBytes !== undefined && received !== expectedBytes) throw Error('Download ended before declared size');
    return received === bytes.length ? bytes : bytes.subarray(0, received);
  } catch (cause) { await reader.cancel().catch(() => undefined);throw cause; }
  finally { clearTimeout(timer);reader.releaseLock(); }
}
