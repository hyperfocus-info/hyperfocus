import { cpus } from 'node:os';

export function createLocalCpuUsage(options: { port: number; publicBinding?: boolean; read?: typeof cpus; now?: () => number }) {
  const read = options.read ?? cpus, now = options.now ?? Date.now;
  const sample = () => read().reduce((sum, cpu) => ({ idle: sum.idle + cpu.times.idle, total: sum.total + Object.values(cpu.times).reduce((a,b) => a+b,0) }), { idle: 0, total: 0 });
  let previous = sample(), at = now(), usage: number | null = null;
  const origin = `http://127.0.0.1:${options.port}`;
  return (request: Request) => {
    const url = new URL(request.url);if (url.pathname !== '/tod-cpu-usage') return;
    const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
    if (options.publicBinding || url.search) return new Response('Not found', { status: 404, headers });
    if (url.origin !== origin || request.headers.has('host') && request.headers.get('host') !== url.host || request.headers.has('origin') && request.headers.get('origin') !== origin || request.headers.has('sec-fetch-site') && request.headers.get('sec-fetch-site') !== 'same-origin') return new Response('Forbidden', { status: 403, headers });
    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers });
    const time = now();
    if (time - at >= 1000) { const current = sample(), total = current.total - previous.total;usage = total > 0 && time - at <= 5000 ? Math.round(Math.max(0, Math.min(1, 1 - (current.idle - previous.idle) / total)) * 100) : null;previous = current;at = time; }
    return Response.json({ percent: usage, sampledAt: at, scope: 'system' }, { headers });
  };
}
