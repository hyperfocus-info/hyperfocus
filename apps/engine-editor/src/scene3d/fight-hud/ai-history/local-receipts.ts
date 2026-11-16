import { validAiReceipt, type AiIngestionReceipt } from '@hyperfocus/touch-of-death/telemetry/ingestion';

/** The development host may publish review receipts. Offline/public games retain manual import. */
export async function applyLocalAiReceipts(options: { href: string; fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>; ingest: (receipts: readonly AiIngestionReceipt[]) => Promise<number> }) {
  try {
    const url = new URL(options.href);
    if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) return 0;
    const response = await options.fetch(new URL('/tod-ai-ingestion-receipts', url.origin), { credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(3000) });
    if (!response.ok || Number(response.headers.get('content-length') ?? 0) > 65536) return 0;
    const text = await response.text();if (new TextEncoder().encode(text).byteLength > 65536) return 0;
    const value: unknown = JSON.parse(text);
    const receipts = value && typeof value === 'object' && 'receipts' in value ? value.receipts : undefined;
    if (!Array.isArray(receipts) || receipts.length > 64 || !receipts.every(validAiReceipt)) return 0;
    return options.ingest(receipts);
  } catch { return 0; }
}
