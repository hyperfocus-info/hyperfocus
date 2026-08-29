import { describe, expect, it } from "bun:test";

const functionBody = (source: string, signature: string) => {
  const signatureIndex = source.indexOf(signature);
  expect(signatureIndex).toBeGreaterThanOrEqual(0);
  const openBrace = source.indexOf("{", signatureIndex);
  expect(openBrace).toBeGreaterThan(signatureIndex);
  let depth = 0;
  for (let index = openBrace; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(openBrace + 1, index);
  }
  throw new Error(`Unterminated function: ${signature}`);
};

describe("Backend log contract", () => {
  it("keeps realtime logging bounded, lock-free, and allocation-free", async () => {
    const header = await Bun.file(new URL("./backend-log.h", import.meta.url)).text();
    const source = await Bun.file(new URL("./backend-log.cpp", import.meta.url)).text();
    const enqueue = functionBody(source, "bool enqueue(std::string_view scope");
    const realtimeApi = functionBody(source, "bool tryEnqueueBackendLog(std::string_view scope");

    expect(header).toContain("tryEnqueueBackendLog(std::string_view scope,");
    expect(header).toContain("std::string_view message) noexcept");
    expect(source).toContain("LockFreeQueue<BackendLogRecord, kBackendLogQueueCapacity>");
    expect(source).toContain("constexpr std::size_t kBackendLogQueueCapacity = 1024U");
    expect(source).toContain("std::array<char, kMaxBackendLogMessageBytes>");
    expect(source).toContain("std::atomic<std::uint64_t>::is_always_lock_free");
    expect(enqueue).toContain("queue_.push(record)");
    expect(enqueue).toContain("droppedCount_.fetch_add");
    for (const forbidden of [
      "lock_guard",
      "FileOutputStream",
      "InterProcessLock",
      "createDirectory",
      "std::string",
      "juce::String",
      "sleep_for",
    ]) {
      expect(enqueue).not.toContain(forbidden);
      expect(realtimeApi).not.toContain(forbidden);
    }
  });

  it("moves file work, bounded process locking, rotation, and shutdown to writer", async () => {
    const source = await Bun.file(new URL("./backend-log.cpp", import.meta.url)).text();
    const append = functionBody(source, "void appendBackendLog(std::string_view scope");
    const start = functionBody(source, "void start()");
    const shutdown = functionBody(source, "void shutdown() noexcept");
    const flush = functionBody(source, "bool flushBatch()");

    expect(source).toContain("writer_ = std::thread");
    expect(start.indexOf("started_.load")).toBeLessThan(start.indexOf("lock_guard"));
    expect(append).toContain("startBackendLog()");
    expect(append).toContain("tryEnqueueBackendLog(scope, message)");
    expect(flush).toContain("ScopedBackendLogProcessLock processGuard(logFile)");
    expect(flush).toContain("rotateBackendLogIfNeeded(logFile)");
    expect(flush).toContain("juce::FileOutputStream output(logFile)");
    expect(source).toContain("kProcessLockTimeoutMilliseconds = 25");
    expect(source).toContain("kMaxBackendLogBytes = 8LL * 1024LL * 1024LL");
    expect(source).toContain("droppedSinceLastWrite");
    expect(shutdown).toContain("accepting_.store(false");
    expect(shutdown).toContain("stopRequested_.store(true");
    expect(shutdown).toContain("writer_.join()");
  });
});
