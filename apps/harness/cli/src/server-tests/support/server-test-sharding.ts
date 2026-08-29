import { test as bunTest } from "bun:test";

export type ServerTestShardOptions = {
  shardIndex?: number;
  shardCount?: number;
};

export type ServerTestRegistrar = (
  name: string,
  testFn: () => void | Promise<unknown>,
  timeout?: number
) => ReturnType<typeof bunTest> | undefined;

export function createServerTestRegistrar(options: ServerTestShardOptions = {}) {
  const shardCount = Math.max(1, Math.floor(options.shardCount ?? 1));
  const shardIndex = Math.min(shardCount - 1, Math.max(0, Math.floor(options.shardIndex ?? 0)));
  let testIndex = 0;
  const register: ServerTestRegistrar = (name, testFn, timeout) => {
    const currentIndex = testIndex;
    testIndex += 1;
    if (currentIndex % shardCount !== shardIndex) {
      return;
    }
    return bunTest(name, testFn, timeout);
  };
  return register;
}
