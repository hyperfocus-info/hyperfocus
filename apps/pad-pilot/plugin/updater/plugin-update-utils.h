#pragma once

#include <optional>
#include <stop_token>

#include <juce_core/juce_core.h>

namespace padpilot::updater {

struct StageLock {
  StageLock() = default;
  StageLock(const StageLock&) = delete;
  StageLock& operator=(const StageLock&) = delete;
  StageLock(StageLock&& other) noexcept;
  StageLock& operator=(StageLock&& other) noexcept;
  ~StageLock();

  bool isValid() const;

 private:
  friend std::optional<StageLock> tryAcquireStageLock(const juce::String& installPath, juce::String& errorMessage);
  explicit StageLock(void* handle);

  void* handle_ {nullptr};
};

struct RuntimeInfo {
  juce::String arch;
  bool canApplyUpdates {false};
  juce::String currentVersion;
  juce::String defaultInstallPath;
  juce::String hostMode;
  juce::String installPath;
  juce::String platform;
};

struct StageResult {
  juce::String logPath;
  juce::String message;
  juce::String statePath;
  juce::String stagedBundlePath;
  juce::String targetVersion;
};

RuntimeInfo buildRuntimeInfo(bool standaloneBuild);
int compareSemanticVersions(const juce::String& left, const juce::String& right);
juce::String computeFileSha256(const juce::File& file);
juce::String currentBundlePath();
juce::String defaultInstalledBundlePath();
bool isVersionInRange(const juce::String& version, const juce::String& minVersion, const juce::String& maxVersion);
juce::File locateUpdaterBinary(bool standaloneBuild);
std::optional<StageLock> tryAcquireStageLock(const juce::String& installPath, juce::String& errorMessage);
bool verifyManifestSignature(const juce::String& manifestText, juce::String& errorMessage);
std::optional<StageResult> stagePluginUpdate(const juce::String& inputJson,
                                             bool standaloneBuild,
                                             juce::String& errorMessage,
                                             std::stop_token stopToken = {});
bool restartAndApplyStagedUpdate(bool standaloneBuild, const juce::String& statePath, juce::String& errorMessage);

}  // namespace padpilot::updater
