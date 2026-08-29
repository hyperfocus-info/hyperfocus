import type { Clerk } from "@clerk/clerk-js";
import { expect, it } from "bun:test";
import { createClerkLoader } from "./clerk";

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

it("deduplicates callers until the matching Clerk instance finishes loading", async () => {
  const loaded = createDeferred<void>();
  const instance = {
    load: () => loaded.promise,
  } as unknown as Clerk;
  let createCount = 0;
  const loadClerk = createClerkLoader(() => {
    createCount += 1;
    return instance;
  });

  const first = loadClerk("pk_test_same");
  const second = loadClerk("pk_test_same");
  let firstSettled = false;
  first.then(() => {
    firstSettled = true;
  });
  await Promise.resolve();

  expect(createCount).toBe(1);
  expect(firstSettled).toBe(false);
  loaded.resolve();
  expect(await first).toBe(instance);
  expect(await second).toBe(instance);
});

it("keeps overlapping publishable-key loads bound to their own instances", async () => {
  const firstLoaded = createDeferred<void>();
  const secondLoaded = createDeferred<void>();
  const firstInstance = { load: () => firstLoaded.promise } as unknown as Clerk;
  const secondInstance = { load: () => secondLoaded.promise } as unknown as Clerk;
  const loadClerk = createClerkLoader((publishableKey) =>
    publishableKey === "pk_test_first" ? firstInstance : secondInstance,
  );

  const first = loadClerk("pk_test_first");
  const second = loadClerk("pk_test_second");
  firstLoaded.resolve();
  expect(await first).toBe(firstInstance);
  secondLoaded.resolve();
  expect(await second).toBe(secondInstance);
});

it("retries a key after its active load rejects", async () => {
  const firstLoaded = createDeferred<void>();
  const secondLoaded = createDeferred<void>();
  const instances = [
    { load: () => firstLoaded.promise } as unknown as Clerk,
    { load: () => secondLoaded.promise } as unknown as Clerk,
  ];
  let createCount = 0;
  const loadClerk = createClerkLoader(() => instances[createCount++]!);

  const first = loadClerk("pk_test_retry");
  firstLoaded.reject(new Error("offline"));
  await expect(first).rejects.toThrow("offline");

  const retry = loadClerk("pk_test_retry");
  secondLoaded.resolve();
  expect(await retry).toBe(instances[1]);
  expect(createCount).toBe(2);
});
