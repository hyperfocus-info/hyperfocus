#include "updater/plugin-update-utils.h"
#include "updater/plugin-update-security.h"
#include "updater/windows-command-line.h"

#include <windows.h>

#include <algorithm>
#include <array>
#include <atomic>
#include <chrono>
#include <optional>
#include <thread>
#include <vector>

#include <juce_events/juce_events.h>

namespace padpilot::updater {
namespace {

constexpr int kDownloadReadTimeoutMs = 15 * 1000;
constexpr auto kDownloadTotalTimeout = std::chrono::minutes(15);
constexpr auto kDownloadCancellationPollInterval = std::chrono::milliseconds(25);

juce::String archString() {
#if JUCE_64BIT
  return "x64";
#else
  return "x86";
#endif
}

bool ensureDirectory(const juce::File& directory, juce::String& errorMessage) {
  if (directory.isDirectory() || directory.createDirectory()) {
    return true;
  }
  errorMessage = "Unable to create directory: " + directory.getFullPathName();
  return false;
}

bool launchDetached(const juce::StringArray& arguments, juce::String& errorMessage) {
  if (arguments.isEmpty()) {
    errorMessage = "Updater launch was missing an executable path.";
    return false;
  }
  juce::String commandLine;
  for (const auto& argument : arguments) {
    if (commandLine.isNotEmpty()) {
      commandLine += " ";
    }
    commandLine += quoteWindowsArgument(argument);
  }
  STARTUPINFOW startupInfo {};
  startupInfo.cb = sizeof(startupInfo);
  PROCESS_INFORMATION processInfo {};
  std::wstring mutableCommand(commandLine.toWideCharPointer());
  const auto launched = CreateProcessW(arguments[0].toWideCharPointer(),
                                       mutableCommand.data(),
                                       nullptr,
                                       nullptr,
                                       FALSE,
                                       CREATE_NO_WINDOW | DETACHED_PROCESS,
                                       nullptr,
                                       nullptr,
                                       &startupInfo,
                                       &processInfo);
  if (!launched) {
    errorMessage = "PadPilot could not launch the updater helper process.";
    return false;
  }
  CloseHandle(processInfo.hProcess);
  CloseHandle(processInfo.hThread);
  return true;
}

bool downloadUrlToFile(const juce::String& urlText,
                       const juce::File& destination,
                       juce::int64 maximumBytes,
                       std::stop_token stopToken,
                       juce::String& errorMessage) {
  if (!security::isHttpsUrl(urlText)) {
    errorMessage = "PadPilot updates require a well-formed HTTPS download URL.";
    return false;
  }
  const juce::URL url(urlText);
  juce::WebInputStream input(url, false);
  input.withConnectionTimeout(kDownloadReadTimeoutMs)
       .withNumRedirectsToFollow(0);

  std::atomic_bool totalDeadlineExpired {false};
  std::jthread deadlineMonitor([&input, &totalDeadlineExpired, stopToken](std::stop_token monitorStopToken) {
    const auto deadline = std::chrono::steady_clock::now() + kDownloadTotalTimeout;
    while (!monitorStopToken.stop_requested()) {
      if (stopToken.stop_requested()) {
        input.cancel();
        return;
      }
      if (std::chrono::steady_clock::now() >= deadline) {
        totalDeadlineExpired.store(true, std::memory_order_release);
        input.cancel();
        return;
      }
      std::this_thread::sleep_for(kDownloadCancellationPollInterval);
    }
  });

  if (!input.connect(nullptr) || input.isError()) {
    errorMessage = totalDeadlineExpired.load(std::memory_order_acquire)
        ? "PadPilot update download exceeded its total time limit."
        : stopToken.stop_requested()
            ? "PadPilot update staging was cancelled."
            : "Unable to download PadPilot update data over HTTPS within the read time limit.";
    return false;
  }
  const auto statusCode = input.getStatusCode();
  if (statusCode < 200 || statusCode >= 300) {
    errorMessage = "PadPilot update download returned HTTP status " + juce::String(statusCode) + ".";
    return false;
  }
  if (!ensureDirectory(destination.getParentDirectory(), errorMessage)) {
    return false;
  }
  juce::TemporaryFile temporary(destination);
  auto output = temporary.getFile().createOutputStream();
  if (output == nullptr || !output->openedOk()) {
    errorMessage = "Unable to create a temporary update download file.";
    return false;
  }
  std::array<char, 64 * 1024> buffer {};
  juce::int64 downloaded = 0;
  while (!input.isExhausted()) {
    if (stopToken.stop_requested()) {
      errorMessage = "PadPilot update staging was cancelled.";
      return false;
    }
    const auto read = input.read(buffer.data(), static_cast<int>(buffer.size()));
    if (read < 0 || (read == 0 && !input.isExhausted())) {
      errorMessage = totalDeadlineExpired.load(std::memory_order_acquire)
          ? "PadPilot update download exceeded its total time limit."
          : stopToken.stop_requested()
              ? "PadPilot update staging was cancelled."
              : "PadPilot update download stopped making progress before the read deadline.";
      return false;
    }
    if (read == 0) {
      break;
    }
    downloaded += read;
    if (downloaded > maximumBytes || !output->write(buffer.data(), static_cast<size_t>(read))) {
      errorMessage = downloaded > maximumBytes
          ? "PadPilot update download exceeded its permitted size."
          : "PadPilot could not write the downloaded update data.";
      return false;
    }
  }
  output->flush();
  output.reset();
  if (!temporary.overwriteTargetFileWithTemporary()) {
    errorMessage = "PadPilot could not commit the verified-size update download.";
    return false;
  }
  return true;
}

juce::String moduleBinaryPath() {
  std::array<wchar_t, 32768> buffer {};
  HMODULE module = nullptr;
  if (!GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,
                          reinterpret_cast<LPCWSTR>(&moduleBinaryPath),
                          &module)) {
    return {};
  }
  const auto length = GetModuleFileNameW(module, buffer.data(), static_cast<DWORD>(buffer.size()));
  return length == 0 || length >= buffer.size() ? juce::String() : juce::String(buffer.data(), length);
}

juce::String processBinaryPath() {
  return juce::File::getSpecialLocation(juce::File::currentApplicationFile).getFullPathName();
}

bool removeStaleActiveState(const juce::File& activeStateFile,
                            const juce::File& installBundle,
                            juce::String& errorMessage) {
  if (!activeStateFile.existsAsFile()) {
    return true;
  }
  const auto activeStateText = security::readBoundedTextFile(
      activeStateFile,
      security::kActiveStateMarkerLimit,
      "Active updater state marker",
      errorMessage);
  if (!activeStateText.has_value()) {
    const auto readError = errorMessage;
    if (activeStateFile.deleteFile()) {
      errorMessage = {};
      return true;
    }
    errorMessage = "PadPilot could not clear a corrupt updater state marker: " + readError;
    return false;
  }
  const auto activeState = juce::File(activeStateText->trim());
  if (!activeState.existsAsFile()) {
    if (!activeStateFile.deleteFile()) {
      errorMessage = "PadPilot could not clear stale updater state.";
      return false;
    }
    return true;
  }
  const auto stateText = security::readBoundedTextFile(
      activeState, security::kStateFileLimit, "Updater state file", errorMessage);
  if (!stateText.has_value()) {
    return false;
  }
  const auto stateVar = juce::JSON::parse(*stateText);
  const auto* state = stateVar.getDynamicObject();
  const auto targetVersion = state == nullptr ? juce::String() : state->getProperty("targetVersion").toString();
  const auto stateInstall = state == nullptr ? juce::File() : juce::File(state->getProperty("installBundlePath").toString());
  const auto journalFile = installBundle.getSiblingFile(security::kProtectedJournalName);
  auto journalVar = juce::var();
  if (journalFile.existsAsFile()) {
    const auto journalText = security::readBoundedTextFile(
        journalFile, security::kJournalFileLimit, "Updater journal file", errorMessage);
    if (!journalText.has_value()) {
      return false;
    }
    journalVar = juce::JSON::parse(*journalText);
  }
  const auto* journal = journalVar.getDynamicObject();
  const auto phase = journal == nullptr ? juce::String() : journal->getProperty("phase").toString();
  const auto journalTarget = journal == nullptr ? juce::String() : journal->getProperty("targetVersion").toString();
  const auto terminal = phase == "complete" || phase == "rolled_back" || phase == "rejected";
  if (!terminal || journalTarget != targetVersion
      || !security::samePath(stateInstall, installBundle)
      || !security::validateStatePath(activeState, installBundle, targetVersion, errorMessage)) {
    errorMessage = "Another PadPilot update is already staged or applying for this installation.";
    return false;
  }
  const auto stateRemoved = activeState.deleteFile();
  const auto markerRemoved = activeStateFile.deleteFile();
  if (!stateRemoved || !markerRemoved) {
    errorMessage = "PadPilot could not retire terminal updater state.";
    return false;
  }
  return true;
}

}  // namespace

StageLock::StageLock(void* handle)
    : handle_(handle) {}

StageLock::StageLock(StageLock&& other) noexcept
    : handle_(other.handle_) {
  other.handle_ = nullptr;
}

StageLock& StageLock::operator=(StageLock&& other) noexcept {
  if (this == &other) {
    return *this;
  }
  if (handle_ != nullptr) {
    ReleaseMutex(static_cast<HANDLE>(handle_));
    CloseHandle(static_cast<HANDLE>(handle_));
  }
  handle_ = other.handle_;
  other.handle_ = nullptr;
  return *this;
}

StageLock::~StageLock() {
  if (handle_ != nullptr) {
    ReleaseMutex(static_cast<HANDLE>(handle_));
    CloseHandle(static_cast<HANDLE>(handle_));
  }
}

bool StageLock::isValid() const {
  return handle_ != nullptr;
}

int compareSemanticVersions(const juce::String& left, const juce::String& right) {
  return security::compareStrictSemanticVersions(left, right);
}

juce::String computeFileSha256(const juce::File& file) {
  juce::String errorMessage;
  return security::computeFileSha256(file, INT64_MAX, errorMessage);
}

juce::String currentBundlePath() {
  auto currentPath = juce::File(moduleBinaryPath());
  if (!currentPath.exists()) {
    currentPath = juce::File(processBinaryPath());
  }
  auto cursor = currentPath;
  while (cursor.exists()) {
    if (cursor.getFileName() == security::kBundleName) {
      return cursor.getFullPathName();
    }
    const auto parent = cursor.getParentDirectory();
    if (parent == cursor) {
      break;
    }
    cursor = parent;
  }
  return {};
}

juce::String defaultInstalledBundlePath() {
  return "C:\\Program Files\\Common Files\\VST3\\PadPilot.vst3";
}

bool isVersionInRange(const juce::String& version,
                      const juce::String& minVersion,
                      const juce::String& maxVersion) {
  if (!security::isStrictSemanticVersion(version)
      || (minVersion.isNotEmpty() && !security::isStrictSemanticVersion(minVersion))
      || (maxVersion.isNotEmpty() && !security::isStrictSemanticVersion(maxVersion))) {
    return false;
  }
  return (minVersion.isEmpty() || compareSemanticVersions(version, minVersion) >= 0)
      && (maxVersion.isEmpty() || compareSemanticVersions(version, maxVersion) <= 0);
}

RuntimeInfo buildRuntimeInfo(bool standaloneBuild) {
  RuntimeInfo info;
  info.arch = archString();
  info.canApplyUpdates = true;
#ifdef JucePlugin_VersionString
  info.currentVersion = JucePlugin_VersionString;
#else
  info.currentVersion = "0.0.0-test";
#endif
  info.defaultInstallPath = defaultInstalledBundlePath();
  info.hostMode = standaloneBuild ? "standalone" : "plugin";
  info.installPath = currentBundlePath();
  info.platform = "windows";
  return info;
}

juce::File locateUpdaterBinary(bool standaloneBuild) {
  if (standaloneBuild) {
    const auto sibling = juce::File::getSpecialLocation(juce::File::currentApplicationFile)
                             .getSiblingFile("padpilot-updater.exe");
    if (sibling.existsAsFile()) {
      return sibling;
    }
  }
  const auto bundle = juce::File(currentBundlePath());
  if (bundle.isDirectory()) {
    const auto updater = bundle.getChildFile("Contents")
                             .getChildFile("Resources")
                             .getChildFile("updater")
                             .getChildFile("padpilot-updater.exe");
    if (updater.existsAsFile()) {
      return updater;
    }
  }
  return {};
}

std::optional<StageLock> tryAcquireStageLock(const juce::String& installPath,
                                             juce::String& errorMessage) {
  const auto lockName = security::lockNameFor(juce::File(installPath));
  const auto handle = CreateMutexW(nullptr, TRUE, lockName.toWideCharPointer());
  if (handle == nullptr) {
    errorMessage = "PadPilot could not create the per-install updater mutex.";
    return std::nullopt;
  }
  if (GetLastError() == ERROR_ALREADY_EXISTS) {
    CloseHandle(handle);
    errorMessage = "Another PadPilot instance is staging or applying an update for this installation.";
    return std::nullopt;
  }
  return StageLock(handle);
}

bool verifyManifestSignature(const juce::String& manifestText, juce::String& errorMessage) {
  return security::verifyManifestSignature(manifestText, errorMessage);
}

std::optional<StageResult> stagePluginUpdate(const juce::String& inputJson,
                                             bool standaloneBuild,
                                             juce::String& errorMessage,
                                             std::stop_token stopToken) {
  if (stopToken.stop_requested()) {
    errorMessage = "PadPilot update staging was cancelled.";
    return std::nullopt;
  }
  const auto inputVar = juce::JSON::parse(inputJson);
  const auto* input = inputVar.getDynamicObject();
  if (input == nullptr) {
    errorMessage = "Updater input payload was invalid.";
    return std::nullopt;
  }

  const auto targetVersion = input->getProperty("targetVersion").toString();
  if (!security::isStrictSemanticVersion(targetVersion)) {
    errorMessage = "Updater targetVersion must be one canonical semantic version.";
    return std::nullopt;
  }
  const auto manifestUrl = input->getProperty("manifestUrl").toString();
  const auto artifactUrl = input->getProperty("artifactUrl").toString();
  const auto expectedManifestSha = input->getProperty("manifestChecksumSha256").toString().toLowerCase();
  const auto expectedArtifactSha = input->getProperty("artifactChecksumSha256").toString().toLowerCase();
  if (!security::isHttpsUrl(manifestUrl) || !security::isHttpsUrl(artifactUrl)
      || !security::isSha256(expectedManifestSha) || !security::isSha256(expectedArtifactSha)) {
    errorMessage = "Updater metadata required HTTPS URLs and canonical SHA-256 checksums.";
    return std::nullopt;
  }

  const auto runtime = buildRuntimeInfo(standaloneBuild);
  if (!security::isStrictSemanticVersion(runtime.currentVersion)) {
    errorMessage = "PadPilot native runtime reported an invalid version.";
    return std::nullopt;
  }
  const auto installBundle = juce::File(runtime.installPath.isNotEmpty()
                                            ? runtime.installPath
                                            : runtime.defaultInstallPath);
  if (installBundle.getFileName() != security::kBundleName || !installBundle.isDirectory()) {
    errorMessage = "PadPilot could not resolve its canonical installed bundle.";
    return std::nullopt;
  }

  auto stageLock = tryAcquireStageLock(installBundle.getFullPathName(), errorMessage);
  if (!stageLock.has_value()) {
    return std::nullopt;
  }
  const auto scopeRoot = security::installScopeRoot(installBundle);
  const auto activeStateFile = scopeRoot.getChildFile(security::kActiveStateName);
  if (!ensureDirectory(scopeRoot, errorMessage)
      || !removeStaleActiveState(activeStateFile, installBundle, errorMessage)) {
    return std::nullopt;
  }

  const auto updaterBinary = locateUpdaterBinary(standaloneBuild);
  if (!updaterBinary.existsAsFile()) {
    errorMessage = "PadPilot updater helper was not found in the installed distribution.";
    return std::nullopt;
  }
  const auto stateDirectory = scopeRoot.getChildFile(targetVersion);
  if (stateDirectory.exists() && !security::safeRemoveTree(stateDirectory, errorMessage)) {
    return std::nullopt;
  }
  if (!ensureDirectory(stateDirectory, errorMessage)) {
    return std::nullopt;
  }
  const auto manifestFile = stateDirectory.getChildFile(security::kManifestName);
  const auto archiveFile = stateDirectory.getChildFile(security::kArtifactName);
  const auto stateFile = stateDirectory.getChildFile(security::kStateName);
  const auto logFile = installBundle.getSiblingFile(security::kProtectedLogName);
  const auto stagedBundle = stateDirectory.getChildFile("validated").getChildFile(security::kBundleName);
  const auto stagedUpdater = stateDirectory.getChildFile(security::kHelperName);

  if (!downloadUrlToFile(
          manifestUrl, manifestFile, security::kManifestDownloadLimit, stopToken, errorMessage)
      || !downloadUrlToFile(
          artifactUrl, archiveFile, security::kArtifactDownloadLimit, stopToken, errorMessage)) {
    return std::nullopt;
  }
  if (stopToken.stop_requested()) {
    errorMessage = "PadPilot update staging was cancelled.";
    return std::nullopt;
  }
  juce::String hashError;
  const auto actualManifestSha = security::computeFileSha256(manifestFile, security::kManifestDownloadLimit, hashError);
  if (actualManifestSha != expectedManifestSha) {
    errorMessage = hashError.isNotEmpty() ? hashError : "PadPilot update manifest checksum verification failed.";
    return std::nullopt;
  }
  hashError = {};
  const auto actualArtifactSha = security::computeFileSha256(archiveFile, security::kArtifactDownloadLimit, hashError);
  if (actualArtifactSha != expectedArtifactSha) {
    errorMessage = hashError.isNotEmpty() ? hashError : "PadPilot update artifact checksum verification failed.";
    return std::nullopt;
  }
  const auto manifestText = security::readBoundedTextFile(
      manifestFile, security::kManifestDownloadLimit, "Update manifest", errorMessage);
  if (!manifestText.has_value()) {
    return std::nullopt;
  }
  const auto manifestVar = juce::JSON::parse(*manifestText);
  const auto* manifestObject = manifestVar.getDynamicObject();
  const auto marketplaceSignature = input->getProperty("manifestSignature").toString().trim();
  if (manifestObject == nullptr
      || (marketplaceSignature.isNotEmpty()
          && manifestObject->getProperty("signature").toString().trim() != marketplaceSignature)) {
    errorMessage = "PadPilot update manifest did not match signed marketplace metadata.";
    return std::nullopt;
  }
  security::Manifest manifest;
  if (!security::readManifest(*manifestText,
                              targetVersion,
                              runtime.currentVersion,
                              runtime.platform,
                              runtime.arch,
                              manifest,
                              errorMessage)
      || !security::buildPreparedBundle(installBundle, stagedBundle, archiveFile, manifest, errorMessage)
      || !security::verifyBundle(stagedBundle, manifest, errorMessage)) {
    return std::nullopt;
  }
  auto helperToLaunch = updaterBinary;
  if (!standaloneBuild) {
    if (!updaterBinary.copyFileTo(stagedUpdater)) {
      errorMessage = "PadPilot could not copy its updater helper outside the bundle before replacement.";
      return std::nullopt;
    }
    juce::String sourceHashError;
    juce::String stagedHashError;
    const auto sourceHash = security::computeFileSha256(updaterBinary, 64ll * 1024 * 1024, sourceHashError);
    const auto stagedHash = security::computeFileSha256(stagedUpdater, 64ll * 1024 * 1024, stagedHashError);
    if (sourceHash.isEmpty() || sourceHash != stagedHash) {
      errorMessage = sourceHashError.isNotEmpty() ? sourceHashError
          : stagedHashError.isNotEmpty() ? stagedHashError
                                         : "Copied updater helper failed integrity verification.";
      return std::nullopt;
    }
    helperToLaunch = stagedUpdater;
  }

  juce::DynamicObject::Ptr state = new juce::DynamicObject();
  state->setProperty("schemaVersion", 2);
  state->setProperty("artifactSha256", actualArtifactSha);
  state->setProperty("hostMode", runtime.hostMode);
  state->setProperty("installBundlePath", installBundle.getFullPathName());
  state->setProperty("manifestSha256", actualManifestSha);
  state->setProperty("targetVersion", targetVersion);
  state->setProperty("waitPid", static_cast<juce::int64>(GetCurrentProcessId()));
  if (!security::writeTextAtomically(stateFile, juce::JSON::toString(juce::var(state.get()), true), errorMessage)
      || !security::writeTextAtomically(activeStateFile, stateFile.getFullPathName(), errorMessage)) {
    return std::nullopt;
  }

  juce::StringArray arguments;
  arguments.add(helperToLaunch.getFullPathName());
  arguments.add("--state");
  arguments.add(stateFile.getFullPathName());
  if (!launchDetached(arguments, errorMessage)) {
    activeStateFile.deleteFile();
    stateFile.deleteFile();
    return std::nullopt;
  }

  StageResult result;
  result.logPath = logFile.getFullPathName();
  result.message = standaloneBuild
      ? "The signed update is staged. Restart PadPilot to apply it."
      : "The signed update is staged. Close your DAW or host process to apply it.";
  result.statePath = stateFile.getFullPathName();
  result.stagedBundlePath = stagedBundle.getFullPathName();
  result.targetVersion = targetVersion;
  return result;
}

bool restartAndApplyStagedUpdate(bool standaloneBuild,
                                 const juce::String& statePath,
                                 juce::String& errorMessage) {
  if (!standaloneBuild) {
    errorMessage = "Restart-and-apply is only available from the standalone PadPilot build.";
    return false;
  }
  if (statePath.isEmpty()) {
    errorMessage = "No staged PadPilot update is waiting to be applied.";
    return false;
  }
  const auto updaterBinary = locateUpdaterBinary(true);
  const auto trusted = security::loadTrustedState(juce::File(statePath), updaterBinary, errorMessage);
  if (!trusted.has_value()) {
    return false;
  }
  if (!security::writeTextAtomically(trusted->relaunchFlag, "restart\n", errorMessage)) {
    return false;
  }
  if (auto* app = juce::JUCEApplicationBase::getInstance()) {
    app->systemRequestedQuit();
    return true;
  }
  errorMessage = "PadPilot could not access the standalone application instance to quit.";
  return false;
}

}  // namespace padpilot::updater
