import { GlobalRegistrator } from '@happy-dom/global-registrator';

/** DOM tests share a process with native HTTP and socket integration tests. */
export function registerTestDom() {
  if (GlobalRegistrator.isRegistered) return;
  const transport = ['WebSocket', 'fetch', 'Request', 'Response', 'Headers', 'AbortController', 'AbortSignal'];
  const descriptors = transport.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
  GlobalRegistrator.register();
  for (const [name, descriptor] of descriptors) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
  }
}
