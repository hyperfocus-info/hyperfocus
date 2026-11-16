/** Browsers expose core count, not CPU utilization. Only a loopback host can supply this reading. */
export function watchLocalCpu(options: { active: () => boolean; update: (text: string) => void }) {
  let disposed = false, timer: ReturnType<typeof setTimeout> | undefined, controller: AbortController | undefined;
  const available = location.protocol === 'http:' && location.hostname === '127.0.0.1';
  async function poll() {
    if (disposed) return;
    if (options.active()) {
      if (!available) options.update('CPU · unavailable in this browser');
      else try {
        controller = new AbortController();const timeout = setTimeout(() => controller?.abort(), 1500);
        try {
          const response = await fetch('/tod-cpu-usage', { cache: 'no-store', signal: controller.signal });
          if (!response.ok) throw Error('Unavailable');
          const value = await response.json();
          if (!disposed) options.update(typeof value.percent === 'number' && value.percent >= 0 && value.percent <= 100 ? `CPU · ${value.percent}% busy, all apps` : 'CPU · sampling…');
        } finally { clearTimeout(timeout); }
      } catch { if (!disposed) options.update('CPU · host reading unavailable'); }
    }
    if (!disposed) timer = setTimeout(poll, 1000);
  }
  void poll();
  return () => { disposed = true;clearTimeout(timer);controller?.abort(); };
}
