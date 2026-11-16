/** transact must serialize the entire read/mutate/write and resolve only after durable commit. */
export type PolicyBackend = {
  read(identity: string): Promise<unknown>;
  transact(identity: string, mutate: (raw: unknown) => string): Promise<string>;
};

export function createIndexedPolicyBackend(options: { factory?: IDBFactory } = {}): PolicyBackend {
  const open = () => new Promise<IDBDatabase>((resolve, reject) => {
    const factory = options.factory ?? globalThis.indexedDB;
    if (!factory) { reject(Error('Atomic policy storage is unavailable.')); return; }
    const request = factory.open('hyperfocus-combat-policies', 1);
    let settled = false;
    const timeout = setTimeout(() => { settled = true; reject(Error('Policy database open timed out.')); }, 10000);
    request.onupgradeneeded = () => request.result.createObjectStore('policies');
    request.onsuccess = () => {
      clearTimeout(timeout);
      if (settled) { request.result.close(); return; }
      settled = true; resolve(request.result);
    };
    request.onerror = () => { clearTimeout(timeout); settled = true; reject(request.error ?? Error('Policy database could not open.')); };
    request.onblocked = () => { clearTimeout(timeout); settled = true; reject(Error('Policy database upgrade is blocked by another tab.')); };
  });
  async function transaction(identity: string, mutate?: (raw: unknown) => string) {
    const database = await open();
    try {
      return await new Promise<unknown>((resolve, reject) => {
        const transaction = mutate
          ? database.transaction('policies', 'readwrite', { durability: 'strict' })
          : database.transaction('policies', 'readonly');
        const store = transaction.objectStore('policies');
        let result: unknown, failure: unknown;
        const request = store.get(identity);
        request.onsuccess = () => {
          try {
            result = request.result ?? null;
            if (mutate) { result = mutate(result); store.put(result, identity); }
          } catch (error) { failure = error; transaction.abort(); }
        };
        transaction.oncomplete = () => resolve(result);
        transaction.onabort = () => reject(failure ?? transaction.error ?? Error('Policy transaction aborted.'));
      });
    } finally { database.close(); }
  }
  return {
    read: identity => transaction(identity),
    async transact(identity, mutate) {
      const result = await transaction(identity, mutate);
      if (typeof result !== 'string') throw Error('Policy transaction returned an invalid record.');
      return result;
    },
  };
}
