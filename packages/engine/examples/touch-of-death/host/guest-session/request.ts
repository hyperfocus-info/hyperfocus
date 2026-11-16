import { isRecord } from '@hyperfocus/utilities/records';

const rejectedRequests = new WeakSet<Error>();
export function guestRejected(message: string, status: number, code?: string) {
  const error = Object.assign(new Error(message), { status, code });
  rejectedRequests.add(error);
  return error;
}
export function isGuestRejected(error: unknown): error is ReturnType<typeof guestRejected> {
  return error instanceof Error && rejectedRequests.has(error);
}
export async function readGuestRequest(request:Request,origin:URL):Promise<Record<string,unknown>> {
        if (request.method !== 'POST') throw guestRejected('Use POST.', 405);
        if (new URL(request.url).origin !== origin.origin || request.headers.get('origin') !== origin.origin
          || request.headers.has('host') && request.headers.get('host') !== origin.host
          || request.headers.has('sec-fetch-site') && request.headers.get('sec-fetch-site') !== 'same-origin') throw guestRejected('Same-origin request required.', 403);
        if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type') ?? '')) throw guestRejected('JSON required.', 415);
        if (Number(request.headers.get('content-length') ?? 0) > 512) throw guestRejected('Request too large.', 413);
        const reader = request.body?.getReader();let body = '', size = 0;
        if (reader) {
          const chunks: Uint8Array[] = [], deadline = Date.now() + 2000;
          while (true) {
            let timer: ReturnType<typeof setTimeout> | undefined;
            const value = await Promise.race([reader.read(), new Promise<never>((_, reject) => { timer = setTimeout(() => { reject(guestRejected('Request timed out.', 408));void reader.cancel().catch(() => {}); }, Math.max(0, deadline - Date.now())); })]).finally(() => clearTimeout(timer));
            if (value.done) break;size += value.value.byteLength;if (size > 512) { await reader.cancel();throw guestRejected('Request too large.', 413); }chunks.push(value.value);
          }
          body = Buffer.concat(chunks).toString('utf8');
        }
        let value: unknown;try { value = JSON.parse(body); } catch { throw guestRejected('Invalid session request.', 400); }
        if (!isRecord(value)) throw guestRejected('Invalid request.',400);
        return value;
}
