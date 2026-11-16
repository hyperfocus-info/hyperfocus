import { Readable } from "node:stream";
import { constants, createGzip } from "node:zlib";

function acceptsGzip(value: string | null) {
  const preferences = new Map<string, number>();
  for (const item of (value ?? "").split(",")) {
    const [encoding, ...parameters] = item.trim().toLowerCase().split(";");
    if (!encoding) continue;
    const quality = parameters.find(parameter => parameter.trim().startsWith("q="));
    const q = quality === undefined ? 1 : Number(quality.trim().slice(2));
    preferences.set(encoding, Number.isFinite(q) && q >= 0 && q <= 1 ? q : 0);
  }
  return (preferences.get("gzip") ?? preferences.get("*") ?? 0) > 0;
}

/** Flush each SSE frame; compression must not wait for the stream to end. */
export function createSwarmEventResponse(request: Request, body: ReadableStream<Uint8Array>) {
  const headers = new Headers({ "content-type": "text/event-stream", "cache-control": "no-store", vary: "Accept-Encoding" });
  if (!acceptsGzip(request.headers.get("accept-encoding"))) return new Response(body, { headers });
  const reader = body.getReader();
  const source = Readable.from((async function* () {
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) return;
        yield next.value;
      }
    } finally { reader.releaseLock(); }
  })(), { objectMode: false });
  const gzip = createGzip({ level: constants.Z_BEST_SPEED, flush: constants.Z_SYNC_FLUSH });
  const abort = () => gzip.destroy();
  request.signal.addEventListener("abort", abort, { once: true });
  source.on("error", error => gzip.destroy(error));
  gzip.once("close", () => {
    request.signal.removeEventListener("abort", abort);
    source.destroy();
    void reader.cancel().catch(() => {});
  });
  source.pipe(gzip);
  if (request.signal.aborted) abort();
  headers.set("content-encoding", "gzip");
  const chunks = gzip[Symbol.asyncIterator]();
  const compressed = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await chunks.next();
        if (next.done) controller.close();
        else if (next.value instanceof Uint8Array) controller.enqueue(next.value);
        else throw Error("Compression produced an invalid byte chunk.");
      } catch (error) { controller.error(error); }
    },
    cancel() { gzip.destroy(); },
  });
  return new Response(compressed, { headers });
}
