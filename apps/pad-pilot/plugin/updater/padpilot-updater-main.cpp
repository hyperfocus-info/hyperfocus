#include "plugin-update-security.h"
#include "windows-command-line.h"

#include <windows.h>
#include <shellapi.h>

#include <array>
#include <cwchar>
#include <optional>

#include <juce_core/juce_core.h>

#pragma comment(lib, "shell32.lib")
#pragma comment(lib, "version.lib")
#pragma comment(lib, "advapi32.lib")

namespace {

using padpilot::updater::security::Manifest;
using padpilot::updater::security::TrustedState;
using padpilot::updater::quoteWindowsArgument;

enum class UpdaterExitCode {
  missingState = 2,
  invalidState = 3,
  lockTimedOut = 4,
  waitFailed = 5,
  integrityFailed = 6,
  backupFailed = 7,
  applyFailed = 8,
  relaunchFailed = 9,
  elevationDeclined = 10,
};

class ExclusiveLock {
 public:
  explicit ExclusiveLock(HANDLE handle)
      : handle_(handle) {}

  ExclusiveLock(const ExclusiveLock&) = delete;
  ExclusiveLock& operator=(const ExclusiveLock&) = delete;

  ~ExclusiveLock() {
    if (handle_ != nullptr && handle_ != INVALID_HANDLE_VALUE) {
      ReleaseMutex(handle_);
      CloseHandle(handle_);
    }
  }

 private:
  HANDLE handle_ {nullptr};
};

void appendLog(const juce::File& logFile, const juce::String& message) {
  if (!logFile.getParentDirectory().isDirectory()) {
    logFile.getParentDirectory().createDirectory();
  }
  juce::FileOutputStream output(logFile);
  if (!output.openedOk()) {
    return;
  }
  output.setPosition(output.getFile().getSize());
  output.writeText("[" + juce::Time::getCurrentTime().toString(true, true) + "] " + message + "\n",
                   false,
                   false,
                   nullptr);
  output.flush();
}

bool isProcessElevated() {
  HANDLE token = nullptr;
  if (!OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &token)) {
    return false;
  }
  TOKEN_ELEVATION elevation {};
  DWORD returned = 0;
  const auto success = GetTokenInformation(token,
                                           TokenElevation,
                                           &elevation,
                                           sizeof(elevation),
                                           &returned);
  CloseHandle(token);
  return success && elevation.TokenIsElevated != 0;
}

std::optional<ExclusiveLock> acquireApplyLock(const juce::String& lockName,
                                              const juce::File& logFile) {
  const auto deadline = juce::Time::getMillisecondCounterHiRes() + 30000.0;
  while (juce::Time::getMillisecondCounterHiRes() < deadline) {
    const auto handle = CreateMutexW(nullptr, TRUE, lockName.toWideCharPointer());
    if (handle == nullptr) {
      appendLog(logFile, "Unable to create the per-install updater mutex.");
      return std::nullopt;
    }
    if (GetLastError() != ERROR_ALREADY_EXISTS) {
      return std::optional<ExclusiveLock>(std::in_place, handle);
    }
    CloseHandle(handle);
    Sleep(100);
  }
  appendLog(logFile, "Timed out acquiring the per-install updater lock.");
  return std::nullopt;
}

bool waitForPid(DWORD processId, const juce::File& logFile) {
  if (processId == 0 || processId == GetCurrentProcessId()) {
    return true;
  }
  const HANDLE handle = OpenProcess(SYNCHRONIZE, FALSE, processId);
  if (handle == nullptr) {
    if (GetLastError() == ERROR_INVALID_PARAMETER) {
      appendLog(logFile, "Target process had already exited.");
      return true;
    }
    appendLog(logFile, "Updater could not safely determine whether the target process exited.");
    return false;
  }
  appendLog(logFile, "Waiting for target process exit while holding the install update lock.");
  const auto waitResult = WaitForSingleObject(handle, 30 * 60 * 1000);
  CloseHandle(handle);
  return waitResult == WAIT_OBJECT_0;
}

bool canWriteInstallDirectory(const juce::File& directory, DWORD& errorCode) {
  const auto probe = directory.getChildFile(".padpilot-updater-probe-" + juce::Uuid().toString());
  const auto handle = CreateFileW(probe.getFullPathName().toWideCharPointer(),
                                  GENERIC_READ | GENERIC_WRITE | DELETE,
                                  0,
                                  nullptr,
                                  CREATE_NEW,
                                  FILE_ATTRIBUTE_TEMPORARY | FILE_FLAG_DELETE_ON_CLOSE,
                                  nullptr);
  if (handle == INVALID_HANDLE_VALUE) {
    errorCode = GetLastError();
    return false;
  }
  CloseHandle(handle);
  errorCode = ERROR_SUCCESS;
  return true;
}

bool relaunchElevated(const TrustedState& state) {
  const auto executable = juce::File::getSpecialLocation(juce::File::currentExecutableFile);
  const auto parameters = juce::String("--state ") + quoteWindowsArgument(state.stateFile.getFullPathName());
  SHELLEXECUTEINFOW executeInfo {};
  executeInfo.cbSize = sizeof(executeInfo);
  executeInfo.fMask = SEE_MASK_NOCLOSEPROCESS;
  executeInfo.lpVerb = L"runas";
  executeInfo.lpFile = executable.getFullPathName().toWideCharPointer();
  executeInfo.lpParameters = parameters.toWideCharPointer();
  executeInfo.nShow = SW_HIDE;
  if (!ShellExecuteExW(&executeInfo)) {
    appendLog(state.logFile,
              GetLastError() == ERROR_CANCELLED
                  ? "User declined the updater elevation request."
                  : "Updater elevation request failed.");
    return false;
  }
  if (executeInfo.hProcess != nullptr) {
    CloseHandle(executeInfo.hProcess);
  }
  appendLog(state.logFile, "Updater handed the validated state to an elevated helper instance.");
  return true;
}

juce::String runOnceValueName(const TrustedState& state) {
  return "!PadPilotUpdate-" + padpilot::updater::security::installScopeKey(state.installBundle).substring(0, 16);
}

bool registerCrashRecovery(const TrustedState& state) {
  HKEY key = nullptr;
  if (RegCreateKeyExW(HKEY_CURRENT_USER,
                      L"Software\\Microsoft\\Windows\\CurrentVersion\\RunOnce",
                      0,
                      nullptr,
                      REG_OPTION_NON_VOLATILE,
                      KEY_SET_VALUE,
                      nullptr,
                      &key,
                      nullptr) != ERROR_SUCCESS) {
    appendLog(state.logFile, "Updater could not register crash recovery for the next sign-in.");
    return false;
  }
  const auto executable = juce::File::getSpecialLocation(juce::File::currentExecutableFile);
  const auto command = quoteWindowsArgument(executable.getFullPathName())
      + " --state " + quoteWindowsArgument(state.stateFile.getFullPathName());
  const auto valueName = runOnceValueName(state);
  const auto bytes = static_cast<DWORD>((std::wcslen(command.toWideCharPointer()) + 1) * sizeof(wchar_t));
  const auto result = RegSetValueExW(key,
                                     valueName.toWideCharPointer(),
                                     0,
                                     REG_SZ,
                                     reinterpret_cast<const BYTE*>(command.toWideCharPointer()),
                                     bytes);
  RegCloseKey(key);
  return result == ERROR_SUCCESS;
}

void unregisterCrashRecovery(const TrustedState& state) {
  HKEY key = nullptr;
  if (RegOpenKeyExW(HKEY_CURRENT_USER,
                    L"Software\\Microsoft\\Windows\\CurrentVersion\\RunOnce",
                    0,
                    KEY_SET_VALUE,
                    &key) != ERROR_SUCCESS) {
    return;
  }
  RegDeleteValueW(key, runOnceValueName(state).toWideCharPointer());
  RegCloseKey(key);
}

bool moveDirectoryWithoutReplacement(const juce::File& source,
                                     const juce::File& destination) {
  if (!source.isDirectory() || destination.exists()) {
    SetLastError(ERROR_ALREADY_EXISTS);
    return false;
  }
  return MoveFileExW(source.getFullPathName().toWideCharPointer(),
                     destination.getFullPathName().toWideCharPointer(),
                     MOVEFILE_WRITE_THROUGH) != 0;
}

bool writeJournal(const TrustedState& state,
                  const juce::String& phase,
                  juce::String& errorMessage) {
  juce::DynamicObject::Ptr journal = new juce::DynamicObject();
  journal->setProperty("phase", phase);
  journal->setProperty("targetVersion", state.targetVersion);
  journal->setProperty("updatedAt", juce::Time::getCurrentTime().toISO8601(true));
  return padpilot::updater::security::writeTextAtomically(
      state.journalFile,
      juce::JSON::toString(juce::var(journal.get()), true),
      errorMessage);
}

juce::String journalPhase(const TrustedState& state) {
  if (!state.journalFile.existsAsFile()) {
    return {};
  }
  juce::String errorMessage;
  const auto journalText = padpilot::updater::security::readBoundedTextFile(
      state.journalFile,
      padpilot::updater::security::kJournalFileLimit,
      "Updater journal file",
      errorMessage);
  if (!journalText.has_value()) {
    appendLog(state.logFile, errorMessage);
    return {};
  }
  const auto value = juce::JSON::parse(*journalText);
  const auto* object = value.getDynamicObject();
  if (object == nullptr || object->getProperty("targetVersion").toString() != state.targetVersion) {
    return {};
  }
  return object->getProperty("phase").toString();
}

juce::String installedBundleVersion(const juce::File& bundle) {
#if JUCE_64BIT
  const auto binary = bundle.getChildFile("Contents")
                          .getChildFile("x86_64-win")
                          .getChildFile("PadPilot.vst3");
#else
  const auto binary = bundle.getChildFile("Contents")
                          .getChildFile("x86-win")
                          .getChildFile("PadPilot.vst3");
#endif
  DWORD ignored = 0;
  const auto size = GetFileVersionInfoSizeW(binary.getFullPathName().toWideCharPointer(), &ignored);
  if (size == 0) {
    return {};
  }
  std::vector<std::uint8_t> versionData(size);
  if (!GetFileVersionInfoW(binary.getFullPathName().toWideCharPointer(), 0, size, versionData.data())) {
    return {};
  }
  VS_FIXEDFILEINFO* fixedInfo = nullptr;
  UINT fixedInfoSize = 0;
  if (!VerQueryValueW(versionData.data(), L"\\", reinterpret_cast<void**>(&fixedInfo), &fixedInfoSize)
      || fixedInfo == nullptr || fixedInfoSize < sizeof(VS_FIXEDFILEINFO)
      || fixedInfo->dwSignature != 0xfeef04bd) {
    return {};
  }
  return juce::String(HIWORD(fixedInfo->dwFileVersionMS)) + "."
      + juce::String(LOWORD(fixedInfo->dwFileVersionMS)) + "."
      + juce::String(HIWORD(fixedInfo->dwFileVersionLS));
}

bool loadAndVerifyPayloads(const TrustedState& state,
                           const juce::String& currentVersion,
                           Manifest& manifest,
                           juce::String& errorMessage) {
  auto manifestHashError = juce::String();
  const auto manifestHash = padpilot::updater::security::computeFileSha256(
      state.manifestFile,
      padpilot::updater::security::kManifestDownloadLimit,
      manifestHashError);
  if (manifestHash != state.manifestSha256) {
    errorMessage = manifestHashError.isNotEmpty()
        ? manifestHashError
        : "Staged manifest checksum no longer matched updater state.";
    return false;
  }
  auto artifactHashError = juce::String();
  const auto artifactHash = padpilot::updater::security::computeFileSha256(
      state.archiveFile,
      padpilot::updater::security::kArtifactDownloadLimit,
      artifactHashError);
  if (artifactHash != state.artifactSha256) {
    errorMessage = artifactHashError.isNotEmpty()
        ? artifactHashError
        : "Staged archive checksum no longer matched updater state.";
    return false;
  }
#if JUCE_64BIT
  const auto arch = juce::String("x64");
#else
  const auto arch = juce::String("x86");
#endif
  const auto manifestText = padpilot::updater::security::readBoundedTextFile(
      state.manifestFile,
      padpilot::updater::security::kManifestDownloadLimit,
      "Update manifest",
      errorMessage);
  if (!manifestText.has_value()) {
    return false;
  }
  return padpilot::updater::security::readManifest(*manifestText,
                                                   state.targetVersion,
                                                   currentVersion,
                                                   "windows",
                                                   arch,
                                                   manifest,
                                                   errorMessage)
      && padpilot::updater::security::verifyPatchArchive(state.archiveFile, manifest, errorMessage);
}

bool restoreBackup(const TrustedState& state, juce::String& errorMessage) {
  if (state.installBundle.exists()
      && !padpilot::updater::security::safeRemoveTree(state.installBundle, errorMessage)) {
    return false;
  }
  if (!moveDirectoryWithoutReplacement(state.backupBundle, state.installBundle)) {
    errorMessage = "Updater could not restore the backup PadPilot bundle.";
    return false;
  }
  writeJournal(state, "rolled_back", errorMessage);
  return true;
}

bool finishSuccessfulApply(const TrustedState& state,
                           const Manifest& manifest,
                           juce::String& errorMessage) {
  if (!padpilot::updater::security::verifyBundle(state.installBundle, manifest, errorMessage)
      || !writeJournal(state, "installed", errorMessage)
      || !writeJournal(state, "complete", errorMessage)) {
    return false;
  }
  if (state.backupBundle.exists()) {
    juce::String cleanupError;
    if (!padpilot::updater::security::safeRemoveTree(state.backupBundle, cleanupError)) {
      appendLog(state.logFile, "Installed bundle is valid; deferred incomplete backup cleanup: " + cleanupError);
    }
  }
  unregisterCrashRecovery(state);
  appendLog(state.logFile, "PadPilot update applied and verified successfully.");
  return true;
}

bool relaunchStandaloneIfRequested(const TrustedState& state) {
  if (state.hostMode != "standalone" || !state.relaunchFlag.existsAsFile()) {
    return true;
  }
  const auto executable = juce::File::getSpecialLocation(juce::File::currentExecutableFile)
                              .getSiblingFile("PadPilot.exe");
  if (!executable.existsAsFile()) {
    appendLog(state.logFile, "Standalone relaunch executable was not present beside the updater.");
    return false;
  }
  juce::String command = quoteWindowsArgument(executable.getFullPathName());
  STARTUPINFOW startupInfo {};
  startupInfo.cb = sizeof(startupInfo);
  PROCESS_INFORMATION processInfo {};
  std::wstring mutableCommand(command.toWideCharPointer());
  const auto launched = CreateProcessW(executable.getFullPathName().toWideCharPointer(),
                                       mutableCommand.data(),
                                       nullptr,
                                       nullptr,
                                       FALSE,
                                       0,
                                       nullptr,
                                       executable.getParentDirectory().getFullPathName().toWideCharPointer(),
                                       &startupInfo,
                                       &processInfo);
  if (!launched) {
    appendLog(state.logFile, "Standalone relaunch failed.");
    return false;
  }
  CloseHandle(processInfo.hProcess);
  CloseHandle(processInfo.hThread);
  appendLog(state.logFile, "Standalone relaunch requested from the derived install location.");
  return true;
}

}  // namespace

int main(int argc, char* argv[]) {
  juce::ConsoleApplication app;
  juce::StringArray arguments;
  for (int index = 1; index < argc; index += 1) {
    arguments.add(juce::String::fromUTF8(argv[index]));
  }
  const auto stateIndex = arguments.indexOf("--state");
  if (stateIndex < 0 || stateIndex + 1 >= arguments.size()) {
    return static_cast<int>(UpdaterExitCode::missingState);
  }

  const auto updaterExecutable = juce::File::getSpecialLocation(juce::File::currentExecutableFile);
  juce::String errorMessage;
  auto trusted = padpilot::updater::security::loadTrustedState(
      juce::File(arguments[stateIndex + 1]),
      updaterExecutable,
      errorMessage);
  if (!trusted.has_value()) {
    return static_cast<int>(UpdaterExitCode::invalidState);
  }
  appendLog(trusted->logFile, "Updater helper started with canonical scoped state.");

  auto applyLock = acquireApplyLock(trusted->lockName, trusted->logFile);
  if (!applyLock.has_value()) {
    return static_cast<int>(UpdaterExitCode::lockTimedOut);
  }
  trusted = padpilot::updater::security::loadTrustedState(
      juce::File(arguments[stateIndex + 1]),
      updaterExecutable,
      errorMessage);
  if (!trusted.has_value()) {
    return static_cast<int>(UpdaterExitCode::invalidState);
  }
  if (!registerCrashRecovery(*trusted)) {
    return static_cast<int>(UpdaterExitCode::applyFailed);
  }
  if (!waitForPid(trusted->waitPid, trusted->logFile)) {
    appendLog(trusted->logFile, "Updater refused to mutate the install while host exit was uncertain.");
    return static_cast<int>(UpdaterExitCode::waitFailed);
  }

  DWORD writeError = ERROR_SUCCESS;
  if (!canWriteInstallDirectory(trusted->installBundle.getParentDirectory(), writeError)) {
    if (!isProcessElevated() && writeError == ERROR_ACCESS_DENIED && relaunchElevated(*trusted)) {
      return 0;
    }
    appendLog(trusted->logFile, "Updater could not obtain write access to the canonical install directory.");
    return writeError == ERROR_ACCESS_DENIED
        ? static_cast<int>(UpdaterExitCode::elevationDeclined)
        : static_cast<int>(UpdaterExitCode::applyFailed);
  }

  const auto phase = journalPhase(*trusted);
  if (trusted->installBundle.isDirectory()
      && (phase == "backup_moved" || phase == "installed" || phase == "complete")) {
    const auto rawManifestText = padpilot::updater::security::readBoundedTextFile(
        trusted->manifestFile,
        padpilot::updater::security::kManifestDownloadLimit,
        "Update manifest",
        errorMessage);
    const auto rawManifest = rawManifestText.has_value()
        ? juce::JSON::parse(*rawManifestText)
        : juce::var();
    const auto* rawObject = rawManifest.getDynamicObject();
    const auto rangeVar = rawObject == nullptr ? juce::var() : rawObject->getProperty("baseVersionRange");
    const auto* range = rangeVar.getDynamicObject();
    const auto recoveryVersion = range == nullptr ? juce::String() : range->getProperty("min").toString();
    Manifest recoveredManifest;
    const auto installedBundleVerified = padpilot::updater::security::isStrictSemanticVersion(recoveryVersion)
        && loadAndVerifyPayloads(*trusted, recoveryVersion, recoveredManifest, errorMessage)
        && padpilot::updater::security::verifyBundle(trusted->installBundle, recoveredManifest, errorMessage);
    const auto recoveryAction = padpilot::updater::security::chooseRecoveryAction(
        true,
        trusted->backupBundle.isDirectory(),
        phase,
        installedBundleVerified);
    if (recoveryAction == padpilot::updater::security::RecoveryAction::finalizeInstalled) {
      if (!finishSuccessfulApply(*trusted, recoveredManifest, errorMessage)) {
        appendLog(trusted->logFile, errorMessage);
        return static_cast<int>(UpdaterExitCode::applyFailed);
      }
      return relaunchStandaloneIfRequested(*trusted)
          ? 0
          : static_cast<int>(UpdaterExitCode::relaunchFailed);
    }
    errorMessage = {};
    if (recoveryAction == padpilot::updater::security::RecoveryAction::fail) {
      appendLog(trusted->logFile, "Completed-install recovery could not verify the installed bundle.");
      writeJournal(*trusted, "rejected", errorMessage);
      unregisterCrashRecovery(*trusted);
      return static_cast<int>(UpdaterExitCode::integrityFailed);
    }
    if (!restoreBackup(*trusted, errorMessage)) {
      appendLog(trusted->logFile, "Crash recovery could not restore the prior bundle: " + errorMessage);
      return static_cast<int>(UpdaterExitCode::backupFailed);
    }
    appendLog(trusted->logFile, "Crash recovery restored the prior bundle before retrying the update.");
  }

  const auto baseBundle = trusted->installBundle.isDirectory()
      ? trusted->installBundle
      : trusted->backupBundle;
  const auto currentVersion = installedBundleVersion(baseBundle);
  Manifest manifest;
  if (!padpilot::updater::security::isStrictSemanticVersion(currentVersion)
      || !loadAndVerifyPayloads(*trusted, currentVersion, manifest, errorMessage)) {
    appendLog(trusted->logFile, "Updater integrity/compatibility verification failed: " + errorMessage);
    writeJournal(*trusted, "rejected", errorMessage);
    unregisterCrashRecovery(*trusted);
    return static_cast<int>(UpdaterExitCode::integrityFailed);
  }

  if (!padpilot::updater::security::buildPreparedBundle(baseBundle,
                                                        trusted->preparedBundle,
                                                        trusted->archiveFile,
                                                        manifest,
                                                        errorMessage)
      || !padpilot::updater::security::verifyBundle(trusted->preparedBundle, manifest, errorMessage)
      || !writeJournal(*trusted, "prepared", errorMessage)) {
    appendLog(trusted->logFile, "Updater could not reconstruct a verified prepared bundle: " + errorMessage);
    writeJournal(*trusted, "rejected", errorMessage);
    unregisterCrashRecovery(*trusted);
    return static_cast<int>(UpdaterExitCode::integrityFailed);
  }

  if (trusted->installBundle.isDirectory() && trusted->backupBundle.exists()) {
    if (!padpilot::updater::security::safeRemoveTree(trusted->backupBundle, errorMessage)) {
      appendLog(trusted->logFile, "Updater could not retire a stale fixed-path backup: " + errorMessage);
      return static_cast<int>(UpdaterExitCode::backupFailed);
    }
  }

  if (!trusted->backupBundle.exists()) {
    if (!moveDirectoryWithoutReplacement(trusted->installBundle, trusted->backupBundle)) {
      const auto moveError = GetLastError();
      if (!isProcessElevated() && moveError == ERROR_ACCESS_DENIED && relaunchElevated(*trusted)) {
        return 0;
      }
      appendLog(trusted->logFile, "Unable to move the installed bundle into the fixed backup path.");
      return moveError == ERROR_ACCESS_DENIED
          ? static_cast<int>(UpdaterExitCode::elevationDeclined)
          : static_cast<int>(UpdaterExitCode::backupFailed);
    }
    if (!writeJournal(*trusted, "backup_moved", errorMessage)) {
      appendLog(trusted->logFile, errorMessage);
      restoreBackup(*trusted, errorMessage);
      unregisterCrashRecovery(*trusted);
      return static_cast<int>(UpdaterExitCode::backupFailed);
    }
  }

  if (!moveDirectoryWithoutReplacement(trusted->preparedBundle, trusted->installBundle)) {
    const auto moveError = GetLastError();
    if (!isProcessElevated() && moveError == ERROR_ACCESS_DENIED && relaunchElevated(*trusted)) {
      return 0;
    }
    appendLog(trusted->logFile, "Unable to move the verified prepared bundle into place; restoring backup.");
    restoreBackup(*trusted, errorMessage);
    unregisterCrashRecovery(*trusted);
    return static_cast<int>(UpdaterExitCode::applyFailed);
  }
  if (!finishSuccessfulApply(*trusted, manifest, errorMessage)) {
    appendLog(trusted->logFile, "Post-move verification failed; restoring backup: " + errorMessage);
    restoreBackup(*trusted, errorMessage);
    unregisterCrashRecovery(*trusted);
    return static_cast<int>(UpdaterExitCode::applyFailed);
  }
  return relaunchStandaloneIfRequested(*trusted)
      ? 0
      : static_cast<int>(UpdaterExitCode::relaunchFailed);
}
