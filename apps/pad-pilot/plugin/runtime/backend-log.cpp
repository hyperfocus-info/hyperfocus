#include "runtime/backend-log.h"

#include <algorithm>
#include <array>
#include <atomic>
#include <chrono>
#include <cstdint>
#include <functional>
#include <mutex>
#include <string>
#include <thread>
#include <type_traits>

#include "runtime/lock-free-queue.h"

namespace {
constexpr std::int64_t kMaxBackendLogBytes = 8LL * 1024LL * 1024LL;
constexpr std::size_t kBackendLogQueueCapacity = 1024U;
constexpr std::size_t kBackendLogBatchSize = 256U;
constexpr std::size_t kMaxBackendLogScopeBytes = 64U;
constexpr std::size_t kMaxBackendLogMessageBytes = 1024U;
constexpr int kWriterPollMilliseconds = 10;
constexpr int kProcessLockTimeoutMilliseconds = 25;
constexpr std::size_t kShutdownWriteAttempts = 4U;

struct BackendLogRecord {
  std::uint64_t sequence {};
  std::uint64_t threadToken {};
  std::uint16_t scopeLength {};
  std::uint16_t messageLength {};
  std::array<char, kMaxBackendLogScopeBytes> scope {};
  std::array<char, kMaxBackendLogMessageBytes> message {};
};

static_assert(std::is_trivially_copyable_v<BackendLogRecord>);
static_assert(std::atomic<std::uint32_t>::is_always_lock_free);
static_assert(std::atomic<std::uint64_t>::is_always_lock_free);

template <std::size_t Capacity>
std::uint16_t copySanitized(std::array<char, Capacity>& destination,
                            std::string_view source) noexcept {
  const auto copiedBytes = std::min(source.size(), Capacity);
  for (std::size_t index = 0; index < copiedBytes; ++index) {
    const auto character = source[index];
    destination[index] = character == '\r' || character == '\n' ? ' ' : character;
  }
  return static_cast<std::uint16_t>(copiedBytes);
}

bool rotateBackendLogIfNeeded(const juce::File& logFile) {
  if (!logFile.existsAsFile() || logFile.getSize() < kMaxBackendLogBytes) {
    return true;
  }

  const auto backup = logFile.getSiblingFile("padpilot-backend.1.log");
  if (backup.existsAsFile() && !backup.deleteFile()) {
    return false;
  }
  return logFile.moveFileTo(backup);
}

class ScopedBackendLogProcessLock {
 public:
  explicit ScopedBackendLogProcessLock(const juce::File& logFile)
      : lock_("padpilot-backend-log-" +
              juce::String::toHexString(logFile.getFullPathName().toLowerCase().hashCode64())),
        locked_(lock_.enter(kProcessLockTimeoutMilliseconds)) {}

  ~ScopedBackendLogProcessLock() {
    if (locked_) {
      lock_.exit();
    }
  }

  [[nodiscard]] bool isLocked() const noexcept {
    return locked_;
  }

 private:
  juce::InterProcessLock lock_;
  bool locked_ {};
};

class BackendLogRuntime {
 public:
  ~BackendLogRuntime() {
    shutdown();
  }

  void start() {
    if (started_.load(std::memory_order_acquire)) {
      return;
    }

    std::lock_guard<std::mutex> guard(lifecycleMutex_);
    if (started_.load(std::memory_order_relaxed)) {
      return;
    }

    stopRequested_.store(false, std::memory_order_release);
    writer_ = std::thread([this] { writerLoop(); });
    accepting_.store(true, std::memory_order_release);
    started_.store(true, std::memory_order_release);
  }

  [[nodiscard]] bool enqueue(std::string_view scope, std::string_view message) noexcept {
    if (!accepting_.load(std::memory_order_acquire)) {
      droppedCount_.fetch_add(1, std::memory_order_relaxed);
      return false;
    }

    activeProducers_.fetch_add(1, std::memory_order_acquire);
    if (!accepting_.load(std::memory_order_acquire)) {
      activeProducers_.fetch_sub(1, std::memory_order_release);
      droppedCount_.fetch_add(1, std::memory_order_relaxed);
      return false;
    }

    BackendLogRecord record;
    record.sequence = nextSequence_.fetch_add(1, std::memory_order_relaxed);
    record.threadToken = std::hash<std::thread::id> {}(std::this_thread::get_id());
    record.scopeLength = copySanitized(record.scope, scope);
    record.messageLength = copySanitized(record.message, message);
    pendingRecords_.fetch_add(1, std::memory_order_release);
    const auto queued = queue_.push(record);
    if (!queued) {
      pendingRecords_.fetch_sub(1, std::memory_order_release);
      droppedCount_.fetch_add(1, std::memory_order_relaxed);
    }
    activeProducers_.fetch_sub(1, std::memory_order_release);
    return queued;
  }

  [[nodiscard]] std::uint64_t droppedCount() const noexcept {
    return droppedCount_.load(std::memory_order_relaxed);
  }

  void shutdown() noexcept {
    std::lock_guard<std::mutex> guard(lifecycleMutex_);
    accepting_.store(false, std::memory_order_release);
    if (!writer_.joinable()) {
      while (activeProducers_.load(std::memory_order_acquire) != 0U) {
        std::this_thread::yield();
      }
      discardPendingRecords();
      started_.store(false, std::memory_order_release);
      return;
    }

    stopRequested_.store(true, std::memory_order_release);
    writer_.join();
    started_.store(false, std::memory_order_release);
  }

 private:
  [[nodiscard]] bool hasPendingOutput() const noexcept {
    return pendingRecords_.load(std::memory_order_acquire) != 0U ||
           droppedCount_.load(std::memory_order_acquire) != reportedDroppedCount_;
  }

  bool writeLine(juce::FileOutputStream& output, const BackendLogRecord& record) {
    auto line = juce::Time::getCurrentTime().toString(true, true, true, true);
    line << " [" << juce::String(record.threadToken) << "]"
         << " [#" << juce::String(record.sequence) << "] ["
         << juce::String::fromUTF8(record.scope.data(), static_cast<int>(record.scopeLength))
         << "] "
         << juce::String::fromUTF8(record.message.data(), static_cast<int>(record.messageLength))
         << "\n";
    const auto utf8 = line.toRawUTF8();
    return output.write(utf8, line.getNumBytesAsUTF8());
  }

  bool writeDroppedLine(juce::FileOutputStream& output, std::uint64_t droppedTotal) {
    const auto droppedSinceLastWrite = droppedTotal - reportedDroppedCount_;
    auto line = juce::Time::getCurrentTime().toString(true, true, true, true);
    line << " [backend-log] dropped " << juce::String(droppedSinceLastWrite)
         << " messages; total=" << juce::String(droppedTotal) << "\n";
    const auto utf8 = line.toRawUTF8();
    if (!output.write(utf8, line.getNumBytesAsUTF8())) {
      return false;
    }
    reportedDroppedCount_ = droppedTotal;
    return true;
  }

  bool flushBatch() {
    if (!hasPendingOutput()) {
      return true;
    }

    const auto logFile = padpilot::getBackendLogFile();
    if (!logFile.getParentDirectory().createDirectory().wasOk()) {
      return false;
    }

    ScopedBackendLogProcessLock processGuard(logFile);
    if (!processGuard.isLocked() || !rotateBackendLogIfNeeded(logFile)) {
      return false;
    }

    juce::FileOutputStream output(logFile);
    if (!output.openedOk() || !output.setPosition(logFile.getSize())) {
      return false;
    }

    const auto droppedTotal = droppedCount_.load(std::memory_order_acquire);
    if (droppedTotal != reportedDroppedCount_ && !writeDroppedLine(output, droppedTotal)) {
      return false;
    }

    BackendLogRecord record;
    for (std::size_t count = 0; count < kBackendLogBatchSize && queue_.pop(record); ++count) {
      pendingRecords_.fetch_sub(1, std::memory_order_release);
      if (!writeLine(output, record)) {
        droppedCount_.fetch_add(1, std::memory_order_relaxed);
      }
    }
    output.flush();
    return true;
  }

  void discardPendingRecords() noexcept {
    BackendLogRecord record;
    std::uint64_t discarded = 0;
    while (queue_.pop(record)) {
      ++discarded;
    }
    pendingRecords_.store(0, std::memory_order_release);
    if (discarded != 0U) {
      droppedCount_.fetch_add(discarded, std::memory_order_relaxed);
    }
  }

  void writerLoop() {
    std::size_t failedShutdownWrites = 0;
    for (;;) {
      const auto hadPendingOutput = hasPendingOutput();
      const auto wrote = !hadPendingOutput || flushBatch();

      const auto stopping = stopRequested_.load(std::memory_order_acquire);
      const auto producersDone = activeProducers_.load(std::memory_order_acquire) == 0U;
      if (stopping && producersDone && !hasPendingOutput()) {
        return;
      }
      if (stopping && producersDone && hadPendingOutput && !wrote &&
          ++failedShutdownWrites >= kShutdownWriteAttempts) {
        discardPendingRecords();
        return;
      }
      if (wrote) {
        failedShutdownWrites = 0;
      }
      std::this_thread::sleep_for(std::chrono::milliseconds(kWriterPollMilliseconds));
    }
  }

  padpilot::LockFreeQueue<BackendLogRecord, kBackendLogQueueCapacity> queue_;
  std::mutex lifecycleMutex_;
  std::thread writer_;
  std::atomic<bool> started_ {false};
  std::atomic<bool> accepting_ {true};
  std::atomic<bool> stopRequested_ {false};
  std::atomic<std::uint32_t> activeProducers_ {0};
  std::atomic<std::uint32_t> pendingRecords_ {0};
  std::atomic<std::uint64_t> nextSequence_ {1};
  std::atomic<std::uint64_t> droppedCount_ {0};
  std::uint64_t reportedDroppedCount_ {};
};

BackendLogRuntime backendLogRuntime;
}  // namespace

namespace padpilot {

juce::File getBackendLogFile() {
  const auto logDirectory = juce::File::getSpecialLocation(juce::File::userApplicationDataDirectory)
                                .getChildFile("PadPilot")
                                .getChildFile("logs");
  return logDirectory.getChildFile("padpilot-backend.log");
}

void startBackendLog() {
  backendLogRuntime.start();
}

bool tryEnqueueBackendLog(std::string_view scope, std::string_view message) noexcept {
  return backendLogRuntime.enqueue(scope, message);
}

void appendBackendLog(std::string_view scope, std::string_view message) {
  startBackendLog();
  static_cast<void>(tryEnqueueBackendLog(scope, message));
}

std::uint64_t getDroppedBackendLogCount() noexcept {
  return backendLogRuntime.droppedCount();
}

void shutdownBackendLog() noexcept {
  backendLogRuntime.shutdown();
}

}  // namespace padpilot
