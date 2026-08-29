import { readBoundedStreamBytes } from "@hyperfocus/pad-pilot/bounded-stream";

type BoundedFetchOptions = Omit<RequestInit, "redirect" | "signal"> & {
  readonly maxBytes: number;
  readonly maxRedirects?: number;
  readonly signal?: AbortSignal;
  readonly timeoutMs: number;
};

const redirectStatuses = new Set([301, 302, 303, 307, 308]);
const sensitiveHeaders = new Set(["authorization", "cookie", "proxy-authorization"]);

function positiveBound(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive safe integer.`);
  }
  return value;
}

function requestUrl(value: string | URL) {
  const url = new URL(value);
  if (!new Set(["http:", "https:"]).has(url.protocol) || url.username || url.password) {
    throw new Error("Network endpoint must be an HTTP(S) URL without embedded credentials.");
  }
  return url;
}

function redirectedHeaders(headers: Headers, from: URL, to: URL) {
  const next = new Headers(headers);
  if (from.origin !== to.origin) {
    for (const header of sensitiveHeaders) {
      next.delete(header);
    }
  }
  return next;
}

export async function readBoundedStream(
  stream: ReadableStream<Uint8Array> | null,
  maxBytes: number,
  label = "Response body",
) {
  return readBoundedStreamBytes(stream, { label, maxBytes });
}

export async function boundedFetchBytes(input: string | URL, options: BoundedFetchOptions) {
  const maxBytes = positiveBound(options.maxBytes, "maxBytes");
  const timeoutMs = positiveBound(options.timeoutMs, "timeoutMs");
  const maxRedirects = options.maxRedirects ?? 0;
  if (!Number.isSafeInteger(maxRedirects) || maxRedirects < 0 || maxRedirects > 10) {
    throw new Error("maxRedirects must be an integer from 0 through 10.");
  }

  let url = requestUrl(input);
  let method = options.method?.toUpperCase() ?? "GET";
  let body = options.body;
  let headers = new Headers(options.headers);
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) {
    abortFromCaller();
  } else {
    options.signal?.addEventListener("abort", abortFromCaller, { once: true });
  }
  const timeout = setTimeout(() => {
    controller.abort(new DOMException(`Network request exceeded its ${timeoutMs}ms deadline.`, "TimeoutError"));
  }, timeoutMs);
  const {
    maxBytes: _maxBytes,
    maxRedirects: _maxRedirects,
    signal: _signal,
    timeoutMs: _timeoutMs,
    ...requestOptions
  } = options;

  try {
    for (let redirectCount = 0; ; redirectCount += 1) {
      const response = await fetch(url, {
        ...requestOptions,
        body,
        headers,
        method,
        redirect: "manual",
        signal: controller.signal,
      });
      if (redirectStatuses.has(response.status)) {
        if (redirectCount >= maxRedirects) {
          await response.body?.cancel();
          throw new Error(`Network request exceeded ${maxRedirects} redirect${maxRedirects === 1 ? "" : "s"}.`);
        }
        const location = response.headers.get("location");
        if (!location) {
          await response.body?.cancel();
          throw new Error("Network redirect omitted its Location header.");
        }
        const nextUrl = requestUrl(new URL(location, url));
        if (url.protocol === "https:" && nextUrl.protocol !== "https:") {
          await response.body?.cancel();
          throw new Error("Network redirect attempted to downgrade HTTPS to HTTP.");
        }
        headers = redirectedHeaders(headers, url, nextUrl);
        if (response.status === 303 || ((response.status === 301 || response.status === 302) && method === "POST")) {
          method = "GET";
          body = undefined;
          headers.delete("content-length");
          headers.delete("content-type");
        }
        await response.body?.cancel();
        url = nextUrl;
        continue;
      }

      const contentLength = response.headers.get("content-length");
      if (contentLength) {
        const declaredBytes = Number(contentLength);
        if (!Number.isSafeInteger(declaredBytes) || declaredBytes < 0 || declaredBytes > maxBytes) {
          await response.body?.cancel();
          throw new Error(`Response body exceeded ${maxBytes} bytes.`);
        }
      }
      const bytes = await readBoundedStream(response.body, maxBytes);
      return {
        bytes,
        headers: response.headers,
        ok: response.ok,
        status: response.status,
        url: response.url || url.href,
      };
    }
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abortFromCaller);
  }
}

export function decodeUtf8(bytes: Uint8Array) {
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}
