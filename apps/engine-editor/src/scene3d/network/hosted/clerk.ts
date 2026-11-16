import { requireRecord } from '@hyperfocus/utilities/records';

/** Preserve the SDK receiver and validate the session afresh after account changes. */
export function readClerkBrowser(value: unknown) {
  const browser = requireRecord(value, { message: 'Sign-in is unavailable.' });
  const load = browser.load, redirect = browser.redirectToSignIn;
  if (typeof load !== 'function' || typeof redirect !== 'function') throw new Error('Sign-in is unavailable.');
  return {
    async load(options: { ui: { ClerkUI: unknown } }) { await load.call(browser, options); },
    get session() {
      const session = browser.session;
      if (session === undefined || session === null) return session;
      const record = requireRecord(session, { message: 'Sign-in session is invalid.' }), getToken = record.getToken;
      if (typeof getToken !== 'function') throw new Error('Sign-in session is invalid.');
      return { async getToken() {
        const token: unknown = await getToken.call(record);
        if (token !== null && typeof token !== 'string') throw new Error('Sign-in token is invalid.');
        return token;
      } };
    },
    async redirectToSignIn(options: { signInFallbackRedirectUrl: string; signUpFallbackRedirectUrl: string }) { await redirect.call(browser, options); },
  };
}
type ClerkBrowser = ReturnType<typeof readClerkBrowser>;
let loaded: { key: string; promise: Promise<ClerkBrowser> } | undefined;

/** The hosted account SDK is loaded only after the player chooses online play. */
function loadClerk(key: string): Promise<ClerkBrowser> {
  if (loaded) {
    if (loaded.key !== key) return Promise.reject(new Error('The account provider changed. Reload the game.'));
    return loaded.promise;
  }
  const promise = (async () => {
    const domain = atob(key.split('_')[2] ?? '');
    if (!/^[a-z0-9.-]+\$$/.test(domain) || !domain.includes('.')) throw new Error('Invalid account provider.');
    const base = `https://${domain.slice(0, -1)}/npm/`;
    async function script(path: string, publishableKey?: string) {
      await new Promise<void>((resolve, reject) => {
        const element = document.createElement('script');element.src = base + path;element.async = true;element.crossOrigin = 'anonymous';
        if (publishableKey) element.setAttribute('data-clerk-publishable-key', publishableKey);
        const timer = setTimeout(() => { element.remove();reject(new Error('Sign-in took too long to load. Try again.')); }, 15000);
        element.onload = () => { clearTimeout(timer);resolve(); };
        element.onerror = () => { clearTimeout(timer);element.remove();reject(new Error('Cannot load sign-in. Check your connection and retry.')); };
        document.head.append(element);
      });
    }
    await script('@clerk/ui@1/dist/ui.browser.js');
    await script('@clerk/clerk-js@6/dist/clerk.browser.js', key);
    const value: unknown = Reflect.get(window, 'Clerk');
    const clerk = readClerkBrowser(value);
    await clerk.load({ ui: { ClerkUI: Reflect.get(window, '__internal_ClerkUICtor') } });
    return clerk;
  })();
  loaded = { key, promise };void promise.catch(() => { loaded = undefined; });return promise;
}

export async function getClerkSessionToken(options: { publishableKey: string; signal?: AbortSignal; interactive?: boolean }): Promise<string> {
  options.signal?.throwIfAborted();
  const clerk = await loadClerk(options.publishableKey);options.signal?.throwIfAborted();
  const token = await clerk.session?.getToken();options.signal?.throwIfAborted();
  if (token) return token;
  if (options.interactive === false) throw new Error('Sign in again before sharing more training.');
  await clerk.redirectToSignIn({ signInFallbackRedirectUrl: window.location.href, signUpFallbackRedirectUrl: window.location.href });
  throw new Error('Complete sign-in, then choose Play online.');
}
