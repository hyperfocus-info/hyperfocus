/** SQLite-backed assets retain byte-range seeking without exposing source files. */
export function mediaResponse(options: { request: Request; bytes: Uint8Array; type: string }) {
  const { bytes, request } = options;
  const headers = new Headers({ "Content-Type": options.type, "Accept-Ranges": "bytes", "Cache-Control": "private,max-age=60", "X-Content-Type-Options": "nosniff" });
  let start = 0, end = bytes.byteLength - 1, status = 200;
  const range = request.headers.get("range");
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2])) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${bytes.byteLength}` } });
    start = match[1] ? Number(match[1]) : Math.max(0, bytes.byteLength - Number(match[2]));
    end = match[1] && match[2] ? Math.min(Number(match[2]), end) : end;
    if (start > end || start >= bytes.byteLength) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${bytes.byteLength}` } });
    headers.set("Content-Range", `bytes ${start}-${end}/${bytes.byteLength}`); status = 206;
  }
  headers.set("Content-Length", String(Math.max(0, end - start + 1)));
  return new Response(request.method === "HEAD" ? null : bytes.slice(start, end + 1), { status, headers });
}
