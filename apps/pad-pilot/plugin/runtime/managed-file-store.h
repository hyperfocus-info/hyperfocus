#pragma once

#include <cstdint>
#include <optional>
#include <string>

#include <juce_core/juce_core.h>

#include "runtime/managed-file-limits.h"

namespace padpilot {

struct ManagedFileRecord {
  std::string category;
  std::uint64_t byteSize {0};
  std::string contentId;
  std::string managedPath;
  std::string mimeType;
  std::string sourceName;
};

class ManagedFileStore {
 public:
  static constexpr std::uint64_t kDefaultMaxImportBytes = kMaximumManagedFileBytes;

  explicit ManagedFileStore(std::string rootPath = {});

  std::optional<ManagedFileRecord> importSampleBytes(const void* data,
                                                     std::size_t size,
                                                     const std::string& sourceName,
                                                     const std::string& mimeType,
                                                     std::uint64_t maxBytes,
                                                     std::string& errorMessage) const;
  std::optional<ManagedFileRecord> importSampleFile(const juce::File& source,
                                                    std::uint64_t maxBytes,
                                                    std::string& errorMessage) const;
  std::optional<ManagedFileRecord> importImpulseResponseBytes(const void* data,
                                                              std::size_t size,
                                                              const std::string& sourceName,
                                                              const std::string& mimeType,
                                                              std::uint64_t maxBytes,
                                                              std::string& errorMessage) const;
  std::optional<ManagedFileRecord> importImpulseResponseFile(const juce::File& source,
                                                             std::uint64_t maxBytes,
                                                             std::string& errorMessage) const;
  bool loadManagedFileBytes(const std::string& managedPath,
                            std::string* bytes,
                            std::string& errorMessage) const;
  bool healManagedFile(const std::string& managedPath,
                       const std::string& payload,
                       std::string& errorMessage) const;
  std::string resolveManagedSamplePath(const std::string& contentId,
                                       const std::string& sourceName) const;
  std::string resolveManagedImpulseResponsePath(const std::string& contentId,
                                                const std::string& sourceName) const;
  bool isManagedImpulseResponse(const std::string& managedPath,
                                const std::string& contentId,
                                const std::string& sourceName) const;
  static bool isSupportedSampleName(const std::string& sourceName);
  static bool isValidContentId(const std::string& contentId);

 private:
  std::optional<ManagedFileRecord> importBytes(const std::string& category,
                                               const void* data,
                                               std::size_t size,
                                               const std::string& sourceName,
                                               const std::string& mimeType,
                                               std::uint64_t maxBytes,
                                               std::string& errorMessage) const;
  std::optional<ManagedFileRecord> importFile(const std::string& category,
                                              const juce::File& source,
                                              std::uint64_t maxBytes,
                                              std::string& errorMessage) const;
  juce::File sampleRoot() const;
  juce::File impulseResponseRoot() const;
  bool isManagedPath(const juce::File& file) const;
  std::string buildManagedPath(const std::string& category,
                               const std::string& contentId,
                               const std::string& sourceName) const;

  juce::File root_;
  bool storageRootReady_ {false};
};

}  // namespace padpilot
