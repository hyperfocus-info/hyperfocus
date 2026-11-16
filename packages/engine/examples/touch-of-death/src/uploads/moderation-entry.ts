import { createModerationPanel } from './moderation-panel.ts';
import { readModerationResponse } from './moderation-protocol.ts';

/** Host operations credentials remain in this page's closure, never storage or URLs. */
export function mountModerationEntry(options: { host: HTMLElement; fetch?: typeof fetch }) {
  const page = document.createElement('main');page.className = 'hf-moderation';
  page.innerHTML = `<h1>Picture moderation</h1><p>Review uploaded pictures and reports for this host. Decisions are recorded under your host-issued reviewer identity.</p><form data-moderation-login><label>Moderator access token<input type="password" data-moderation-token required autocomplete="off" spellcheck="false"></label><button type="submit" data-moderation-connect>Connect</button></form><button type="button" data-moderation-disconnect hidden>Disconnect</button><p data-moderation-auth-status role="status" aria-live="polite"></p><div data-moderation-workspace></div>`;
  const style = document.createElement('style');style.textContent = `
    body{margin:0;background:#101c28;color:#f3f6f8;font:15px/1.5 system-ui,sans-serif}.hf-moderation{max-width:1000px;margin:auto;padding:24px;box-sizing:border-box}.hf-moderation h1{font-size:28px;margin:0 0 8px}.hf-moderation h2{font-size:20px}.hf-moderation label{display:block;margin:12px 0}.hf-moderation input,.hf-moderation select,.hf-moderation textarea{display:block;box-sizing:border-box;width:100%;background:#172a39;color:#f3f6f8;border:1px solid #71889a;border-radius:4px;padding:10px;font:inherit}.hf-moderation button{min-height:44px;padding:10px 16px;margin:4px 8px 4px 0;border:1px solid #71889a;border-radius:4px;background:#263f52;color:#f3f6f8;font:inherit;cursor:pointer}.hf-moderation button:hover{background:#345872}.hf-moderation button:focus-visible,.hf-moderation input:focus-visible,.hf-moderation select:focus-visible,.hf-moderation textarea:focus-visible{outline:3px solid #ffba66;outline-offset:2px}.hf-moderation button:disabled{opacity:.5;cursor:default}.hf-moderation [hidden]{display:none!important}.hf-moderation canvas{max-width:128px;max-height:128px;border:1px solid #71889a}.hf-moderation ul{padding:0;list-style:none}.hf-moderation li{padding:8px 0;border-bottom:1px solid #526676;overflow-wrap:anywhere}.hf-moderation p{overflow-wrap:anywhere}.hf-moderation [role=alert]{color:#ffb4a8}@media(max-width:600px){.hf-moderation{padding:16px}.hf-moderation h1{font-size:24px}.hf-moderation button{max-width:100%}}
  `;page.append(style);options.host.append(page);
  const form = page.querySelector<HTMLFormElement>('[data-moderation-login]')!, field = page.querySelector<HTMLInputElement>('[data-moderation-token]')!;
  const disconnect = page.querySelector<HTMLButtonElement>('[data-moderation-disconnect]')!, status = page.querySelector<HTMLElement>('[data-moderation-auth-status]')!;
  let token = '', generation = 0, panel: ReturnType<typeof createModerationPanel> | undefined;
  const requests = new Set<AbortController>();
  function stop() { generation++;token = '';field.value = '';for (const controller of requests) controller.abort();requests.clear();panel?.dispose();panel = undefined;form.hidden = false;disconnect.hidden = true;status.textContent = 'Disconnected. The token has been cleared.'; }
  const submit = (event: SubmitEvent) => {
    event.preventDefault();const entered = field.value.trim();stop();if (!entered) { status.textContent = 'Enter your host-issued moderator token.';return; }
    token = entered;field.value = '';form.hidden = true;disconnect.hidden = false;status.textContent = 'Verifying moderator access…';
    const attempt = generation;let verificationError = '';
    panel = createModerationPanel({ host: page.querySelector<HTMLElement>('[data-moderation-workspace]')!, async request(command) {
      if (!token || attempt !== generation) throw new Error('Reconnect to continue.');
      const controller = new AbortController();requests.add(controller);const timer = setTimeout(() => controller.abort(), 10000);
      try {
        const response = await (options.fetch ?? fetch)('/moderation/api', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(command), signal: controller.signal, credentials: 'omit', cache: 'no-store' });
        if (attempt !== generation) throw new Error('The moderation session ended.');
        if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? 'Moderator access was denied. Disconnect and enter a valid host-issued token.' : 'The host could not complete this action. Retry with the same request.');
        const result = readModerationResponse(await response.json());if (attempt !== generation) throw new Error('The moderation session ended.');verificationError = result.error;return result;
      } catch (cause) { verificationError = cause instanceof Error ? cause.message : 'Moderator access could not be verified.';throw cause;
      } finally { clearTimeout(timer);requests.delete(controller); }
    } });
    void panel.loadOwners().then(verified => {
      if (attempt !== generation) return;
      if (verified) status.textContent = 'Moderator access verified. The picture owner queue is loaded.';
      else { stop();status.textContent = verificationError || 'Moderator access could not be verified. Check your host-issued token and connection, then reconnect.';field.focus(); }
    });
  };
  form.addEventListener('submit', submit);
  disconnect.addEventListener('click', () => { stop();field.focus(); });
  return { dispose() { stop();page.remove(); } };
}

if (typeof document !== 'undefined' && document.querySelector('[data-moderation-root]')) mountModerationEntry({ host: document.querySelector<HTMLElement>('[data-moderation-root]')! });
