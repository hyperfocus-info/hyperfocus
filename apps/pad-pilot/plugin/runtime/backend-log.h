#pragma once

#include <cstdint>
#include <string_view>

#include <juce_core/juce_core.h>

namespace padpilot {

juce::File getBackendLogFile();

// Starts the file-writer thread. Call only from a non-realtime lifecycle path.
void startBackendLog();

// Fixed-buffer, lock-free enqueue for realtime and other latency-sensitive paths.
// Returns false when the bounded queue is full or shutdown has begun.
[[nodiscard]] bool tryEnqueueBackendLog(std::string_view scope,
                                        std::string_view message) noexcept;

// Compatibility API for non-realtime callers. Lazily starts the writer.
void appendBackendLog(std::string_view scope, std::string_view message);

[[nodiscard]] std::uint64_t getDroppedBackendLogCount() noexcept;
void shutdownBackendLog() noexcept;

}  // namespace padpilot
