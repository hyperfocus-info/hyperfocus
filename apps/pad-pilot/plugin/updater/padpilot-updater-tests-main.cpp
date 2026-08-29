#include "updater/plugin-update-security.h"
#include "updater/plugin-update-utils.h"
#include "updater/windows-command-line.h"

#include <array>
#include <iostream>
#include <stop_token>
#include <stdexcept>

#include <juce_core/juce_core.h>

namespace {

namespace security = padpilot::updater::security;

constexpr auto kSignedManifest = R"json({
  "arch": "x64",
  "artifactKind": "directory_patch",
  "baseVersionRange": {
    "max": "0.1.10",
    "min": "0.1.9"
  },
  "bundleRoot": "PadPilot.vst3",
  "channel": "stable",
  "createdAt": "2026-03-24T00:00:00.000Z",
  "files": {
    "addOrReplace": [
      {
        "path": "Contents/x86_64-win/PadPilot.vst3",
        "payloadPath": "files/Contents/x86_64-win/PadPilot.vst3",
        "sha256": "abc123",
        "size": 42
      }
    ],
    "delete": [
      "Contents/Resources/old.dat"
    ]
  },
  "platform": "windows",
  "postApply": [],
  "releaseNotes": "Signed release",
  "version": "0.1.10",
  "signature": "MHzzRLNGE/07FOtUmk/chwG6YVEha6MK58e7Joon0kxV+O32pPhrFugrZ5OYF0mT8JNVFMCKRNqhcJ6+MqLzgTMMqxNTI6EYMzU4s1ATa0FPmGlkDpZ7Cb4mGZxzx+vVYVqGZn7Ep36KM7rAYx0suNDpMJvfMH64N5suP4339+4xEht+fIMnhopPjp2l3f+Hxu0zpl+tTYdt1hGf0fSzeAimtkkZ/l/nwdfI3Q6I4e7XRF/krki/6Ub+6WidEs5cwv2J9YqHcAC/eJdCAJbffhevVqja8y23ACTFm6EIfHyLY2fvQOTmiQRapLPqA9Xb84NlOU1ANtM4XfFAKyailQ=="
})json";

void expect(bool condition, const juce::String& message) {
  if (!condition) {
    throw std::runtime_error(message.toStdString());
  }
}

class TempDirectory {
 public:
  TempDirectory()
      : root_(juce::File::getSpecialLocation(juce::File::tempDirectory)
                  .getChildFile("PadPilot")
                  .getChildFile("updater-tests")
                  .getChildFile(juce::Uuid().toString())) {
    root_.createDirectory();
  }

  ~TempDirectory() {
    juce::String ignored;
    security::safeRemoveTree(root_, ignored);
  }

  const juce::File& root() const {
    return root_;
  }

 private:
  juce::File root_;
};

void runSemVerTests() {
  expect(padpilot::updater::compareSemanticVersions("0.1.9", "0.1.10") < 0,
         "0.1.9 should sort before 0.1.10");
  expect(padpilot::updater::compareSemanticVersions("1.0.0", "1.0.0-beta.1") > 0,
         "Stable releases must sort after prereleases");
  expect(padpilot::updater::isVersionInRange("0.1.10", "0.1.9", "0.1.10"),
         "Inclusive SemVer range checks should succeed");
  expect(!padpilot::updater::isVersionInRange("0.1.11", "0.1.9", "0.1.10"),
         "Out-of-range versions must be rejected");
  expect(security::isStrictSemanticVersion("1.2.3-alpha.1+build.9"),
         "Canonical SemVer should be accepted");
  for (const auto& invalid : {"", "1", "1.2", "v1.2.3", "01.2.3", "1.2.3/../x", "1.2.3 ", "1.2.3-01"}) {
    expect(!security::isStrictSemanticVersion(invalid), "Non-canonical target version was accepted: " + juce::String(invalid));
  }

  juce::String errorMessage;
  const auto result = padpilot::updater::stagePluginUpdate(
      R"json({"targetVersion":"../outside","manifestUrl":"http://invalid","artifactUrl":"file:///invalid"})json",
      false,
      errorMessage);
  expect(!result.has_value() && errorMessage.contains("targetVersion"),
         "Staging must reject target traversal before deriving state paths or inspecting URLs");
}

void runStagingThreadAndDeadlineContracts() {
  std::stop_source stopSource;
  stopSource.request_stop();
  juce::String errorMessage;
  const auto cancelled = padpilot::updater::stagePluginUpdate(
      "{}", false, errorMessage, stopSource.get_token());
  expect(!cancelled.has_value() && errorMessage.containsIgnoreCase("cancelled"),
         "A cancelled staging worker must return before parsing or touching updater state");

  const auto pluginRoot = juce::File(__FILE__).getParentDirectory().getParentDirectory();
  const auto editorSource = pluginRoot.getChildFile("core/pad-pilot-editor-bridge.cpp").loadFileAsString();
  expect(editorSource.contains("stageUpdateThread_ = std::jthread")
             && editorSource.contains("juce::MessageManager::callAsync([safeThis, complete, response, statePath]"),
         "The WebView staging bridge must run work off-thread and complete on the message thread");

  const auto updaterSource = pluginRoot.getChildFile("updater/plugin-update-utils.cpp").loadFileAsString();
  expect(updaterSource.contains("withConnectionTimeout(kDownloadReadTimeoutMs)")
             && updaterSource.contains("kDownloadTotalTimeout")
             && updaterSource.contains("input.cancel()"),
         "Updater downloads must retain read and total deadlines with cancellable blocking reads");
}

void runPathAndUrlTests() {
  for (const auto& valid : {"Contents/x86_64-win/PadPilot.vst3", "files/Contents/Resources/ui/app.js"}) {
    expect(security::isSafeRelativePath(valid), "Safe update path was rejected: " + juce::String(valid));
  }
  for (const auto& invalid : {"../escape", "Contents/../escape", "/absolute", "C:/drive", "a\\b", "a//b",
                              "CON", "folder/NUL.txt", "name. ", "folder/"}) {
    expect(!security::isSafeRelativePath(invalid), "Unsafe update path was accepted: " + juce::String(invalid));
  }
  expect(security::isHttpsUrl("https://updates.example.test/padpilot/manifest.json"),
         "HTTPS updater URL should be accepted");
  for (const auto& invalid : {"http://updates.example.test/file", "file:///C:/payload", "https:///missing-host", ""}) {
    expect(!security::isHttpsUrl(invalid), "Unsafe updater URL was accepted: " + juce::String(invalid));
  }
}

void runWindowsCommandLineTests() {
  struct Fixture {
    const char* input;
    const char* expected;
  };
  constexpr std::array fixtures {
      Fixture {"plain", "plain"},
      Fixture {"", "\"\""},
      Fixture {"two words", "\"two words\""},
      Fixture {"a\"b", "\"a\\\"b\""},
      Fixture {"C:\\Program Files\\PadPilot\\", "\"C:\\Program Files\\PadPilot\\\\\""},
  };
  for (const auto& fixture : fixtures) {
    expect(padpilot::updater::quoteWindowsArgument(fixture.input) == fixture.expected,
           "Windows argument quoting failed for fixture: " + juce::String(fixture.input));
  }
}

void runSignatureAndCompatibilityTests() {
  juce::String errorMessage;
  expect(padpilot::updater::verifyManifestSignature(kSignedManifest, errorMessage), errorMessage);

  const auto tampered = juce::String(kSignedManifest).replace("\"version\": \"0.1.10\"", "\"version\": \"0.1.11\"");
  errorMessage = {};
  expect(!padpilot::updater::verifyManifestSignature(tampered, errorMessage),
         "Tampered manifest should fail signature verification");

  security::Manifest manifest;
  errorMessage = {};
  expect(!security::readManifest(kSignedManifest, "0.1.11", "0.1.9", "windows", "x64", manifest, errorMessage),
         "Signed manifest must be bound to the requested target version");
  errorMessage = {};
  expect(!security::readManifest(kSignedManifest, "0.1.10", "0.1.9", "windows", "arm64", manifest, errorMessage),
         "Signed manifest must be bound to native architecture");
  errorMessage = {};
  expect(!security::readManifest(kSignedManifest, "0.1.10", "0.1.8", "windows", "x64", manifest, errorMessage),
         "Signed manifest must be bound to the native installed version range");
}

security::Manifest createArchiveManifest(const juce::File& payload) {
  juce::String errorMessage;
  security::Manifest manifest;
  manifest.version = "1.0.1";
  manifest.platform = "windows";
  manifest.arch = "x64";
  manifest.artifactKind = "directory_patch";
  manifest.bundleRoot = security::kBundleName;
  security::FileOperation operation;
  operation.path = "Contents/Resources/new.dat";
  operation.payloadPath = "files/Contents/Resources/new.dat";
  operation.size = payload.getSize();
  operation.sha256 = security::computeFileSha256(payload, security::kArchiveEntryLimit, errorMessage);
  expect(operation.sha256.isNotEmpty(), errorMessage);
  manifest.addOrReplace.push_back(operation);
  manifest.deletes.push_back("Contents/Resources/old.dat");
  return manifest;
}

juce::File buildArchive(const juce::File& root,
                        const juce::File& payload,
                        const juce::String& storedPath,
                        bool includeExtra) {
  const auto archive = root.getChildFile(juce::Uuid().toString() + ".zip");
  juce::ZipFile::Builder builder;
  builder.addFile(payload, 9, storedPath);
  if (includeExtra) {
    builder.addFile(payload, 9, "files/unsigned-extra.dat");
  }
  auto output = archive.createOutputStream();
  expect(output != nullptr && output->openedOk() && builder.writeToStream(*output, nullptr),
         "Unable to construct updater archive fixture");
  output->flush();
  return archive;
}

void runArchiveAndApplyTests() {
  TempDirectory temporary;
  const auto payload = temporary.root().getChildFile("payload.dat");
  expect(payload.replaceWithText("signed payload bytes"), "Unable to create archive payload fixture");
  const auto manifest = createArchiveManifest(payload);
  const auto archive = buildArchive(temporary.root(), payload, manifest.addOrReplace[0].payloadPath, false);

  juce::String errorMessage;
  expect(security::verifyPatchArchive(archive, manifest, errorMessage), errorMessage);

  const auto base = temporary.root().getChildFile("base").getChildFile(security::kBundleName);
  const auto oldFile = base.getChildFile("Contents/Resources/old.dat");
  expect(oldFile.getParentDirectory().createDirectory() && oldFile.replaceWithText("old"),
         "Unable to create base bundle fixture");
  const auto prepared = temporary.root().getChildFile("prepared").getChildFile(security::kBundleName);
  errorMessage = {};
  expect(security::buildPreparedBundle(base, prepared, archive, manifest, errorMessage), errorMessage);
  expect(security::verifyBundle(prepared, manifest, errorMessage), errorMessage);
  expect(!prepared.getChildFile("Contents/Resources/old.dat").exists(),
         "Signed delete operation was not applied");

  const auto extraArchive = buildArchive(temporary.root(), payload, manifest.addOrReplace[0].payloadPath, true);
  errorMessage = {};
  expect(!security::verifyPatchArchive(extraArchive, manifest, errorMessage),
         "Archive files absent from the signed inventory must be rejected");

  const auto traversalArchive = buildArchive(temporary.root(), payload, "../escape.dat", false);
  errorMessage = {};
  expect(!security::verifyPatchArchive(traversalArchive, manifest, errorMessage),
         "Archive traversal entry must be rejected before extraction");
}

void runStateScopeTests() {
  TempDirectory temporary;
  const auto installBundle = temporary.root().getChildFile(security::kBundleName);
  const auto updaterExecutable = installBundle.getChildFile("Contents/Resources/updater/padpilot-updater.exe");
  expect(updaterExecutable.getParentDirectory().createDirectory() && updaterExecutable.replaceWithText("fixture"),
         "Unable to create updater path fixture");

  const auto targetVersion = juce::String("1.2.3");
  const auto stateFile = security::stateFileFor(installBundle, targetVersion);
  expect(stateFile.getParentDirectory().createDirectory(), "Unable to create canonical state directory");
  const auto checksum = juce::String::repeatedString("a", 64);
  juce::DynamicObject::Ptr state = new juce::DynamicObject();
  state->setProperty("schemaVersion", 2);
  state->setProperty("artifactSha256", checksum);
  state->setProperty("hostMode", "plugin");
  state->setProperty("installBundlePath", installBundle.getFullPathName());
  state->setProperty("manifestSha256", checksum);
  state->setProperty("targetVersion", targetVersion);
  state->setProperty("waitPid", 123);
  state->setProperty("backupBundlePath", "C:\\Windows\\should-never-be-trusted");
  const auto stateText = juce::JSON::toString(juce::var(state.get()), true);
  expect(stateFile.replaceWithText(stateText),
         "Unable to write updater state fixture");
  const auto active = security::installScopeRoot(installBundle).getChildFile(security::kActiveStateName);
  const auto activeText = stateFile.getFullPathName();
  expect(active.replaceWithText(activeText), "Unable to write active state fixture");

  juce::String errorMessage;
  const auto trusted = security::loadTrustedState(stateFile, updaterExecutable, errorMessage);
  expect(trusted.has_value(), errorMessage);
  expect(trusted->backupBundle == installBundle.getSiblingFile(security::kBackupName),
         "Helper must derive backup path instead of trusting JSON");
  expect(trusted->preparedBundle == installBundle.getSiblingFile(security::kPreparedName),
         "Helper must derive prepared path instead of trusting JSON");
  expect(trusted->journalFile == installBundle.getSiblingFile(security::kProtectedJournalName)
             && trusted->logFile == installBundle.getSiblingFile(security::kProtectedLogName),
         "Elevated helper writes must stay in the protected install directory");
  expect(trusted->lockName.startsWith("Local\\PadPilot.Update."),
         "Per-install exclusion must use a kernel mutex rather than an elevated temp-file write");

  expect(stateFile.replaceWithText(
             juce::String::repeatedString("x", static_cast<int>(security::kStateFileLimit + 1))),
         "Unable to write oversized updater state fixture");
  errorMessage = {};
  expect(!security::loadTrustedState(stateFile, updaterExecutable, errorMessage).has_value()
             && errorMessage.containsIgnoreCase("permitted size"),
         "Helper must reject oversized state before allocating or parsing it");
  expect(stateFile.replaceWithText(stateText), "Unable to restore updater state fixture");

  expect(active.replaceWithText(
             juce::String::repeatedString("x", static_cast<int>(security::kActiveStateMarkerLimit + 1))),
         "Unable to write oversized active-state marker fixture");
  errorMessage = {};
  expect(!security::loadTrustedState(stateFile, updaterExecutable, errorMessage).has_value()
             && errorMessage.containsIgnoreCase("permitted size"),
         "Helper must reject oversized active-state marker before reading a path");
  expect(active.replaceWithText(activeText), "Unable to restore active-state marker fixture");

  const auto copiedUpdater = stateFile.getParentDirectory().getChildFile(security::kHelperName);
  expect(updaterExecutable.copyFileTo(copiedUpdater), "Unable to create staged updater helper fixture");
  errorMessage = {};
  expect(security::loadTrustedState(stateFile, copiedUpdater, errorMessage).has_value(), errorMessage);
  const auto backupBundle = installBundle.getSiblingFile(security::kBackupName);
  expect(installBundle.moveFileTo(backupBundle), "Unable to create post-backup recovery fixture");
  errorMessage = {};
  expect(security::loadTrustedState(stateFile, copiedUpdater, errorMessage).has_value(),
         "Copied helper must remain authenticated against the fixed backup after bundle move: " + errorMessage);

  const auto outsideState = temporary.root().getChildFile("forged-state.json");
  expect(stateFile.copyFileTo(outsideState), "Unable to create forged state fixture");
  errorMessage = {};
  expect(!security::loadTrustedState(outsideState, updaterExecutable, errorMessage).has_value(),
         "Helper must reject state outside the canonical install/version scope");
  juce::String cleanupError;
  security::safeRemoveTree(security::installScopeRoot(installBundle), cleanupError);
}

void runBoundedFileAndTreeTests() {
  TempDirectory temporary;
  juce::String errorMessage;

  const auto journal = temporary.root().getChildFile("journal.json");
  expect(journal.replaceWithText(
             juce::String::repeatedString("j", static_cast<int>(security::kJournalFileLimit + 1))),
         "Unable to write oversized updater journal fixture");
  expect(!security::readBoundedTextFile(
              journal, security::kJournalFileLimit, "Updater journal file", errorMessage)
              .has_value()
             && errorMessage.containsIgnoreCase("permitted size"),
         "Updater journal reads must reject oversized local metadata before parsing");

  const auto manifest = temporary.root().getChildFile("manifest.json");
  expect(manifest.replaceWithText(
             juce::String::repeatedString("m", static_cast<int>(security::kManifestDownloadLimit + 1))),
         "Unable to write oversized updater manifest fixture");
  errorMessage = {};
  expect(!security::readBoundedTextFile(
              manifest, security::kManifestDownloadLimit, "Update manifest", errorMessage)
              .has_value()
             && errorMessage.containsIgnoreCase("permitted size"),
         "Updater manifest reads must retain the download cap during local re-read");

  const auto source = temporary.root().getChildFile("oversized-tree");
  expect(source.createDirectory(), "Unable to create oversized updater tree fixture");
  for (std::size_t index = 0; index <= security::kTreeEntryLimit; ++index) {
    expect(source.getChildFile("entry-" + juce::String(static_cast<juce::int64>(index)) + ".dat")
               .replaceWithText("x"),
           "Unable to populate oversized updater tree fixture");
  }
  const auto destination = temporary.root().getChildFile("copied-tree");
  errorMessage = {};
  expect(!security::copyTreeWithoutLinks(source, destination, errorMessage)
             && errorMessage.containsIgnoreCase("entry count")
             && !destination.exists(),
         "Updater copy must bound hostile directory inventories before allocating or copying");
  errorMessage = {};
  expect(!security::safeRemoveTree(source, errorMessage)
             && errorMessage.containsIgnoreCase("entry count"),
         "Updater cleanup must bound hostile directory inventories before recursive removal");

  for (const auto& entry : juce::RangedDirectoryIterator(
           source, false, "*", juce::File::findFilesAndDirectories)) {
    expect(entry.getFile().deleteFile(), "Unable to clean oversized updater tree fixture entry");
  }
  expect(source.deleteRecursively(), "Unable to clean oversized updater tree fixture");
}

void runLockAndRecoveryTests() {
  TempDirectory temporary;
  const auto installPath = temporary.root().getChildFile(security::kBundleName).getFullPathName();
  juce::String errorMessage;
  auto firstLock = padpilot::updater::tryAcquireStageLock(installPath, errorMessage);
  expect(firstLock.has_value() && firstLock->isValid(),
         errorMessage.isNotEmpty() ? errorMessage : "First stage lock acquisition should succeed");
  errorMessage = {};
  auto secondLock = padpilot::updater::tryAcquireStageLock(installPath, errorMessage);
  expect(!secondLock.has_value(), "Second per-install lock must fail while staging/apply lock is held");

  expect(security::chooseRecoveryAction(true, true, "installed", true)
             == security::RecoveryAction::finalizeInstalled,
         "Verified installed bundle should finalize after a crash");
  expect(security::chooseRecoveryAction(true, true, "installed", false)
             == security::RecoveryAction::restoreBackup,
         "Invalid installed bundle should roll back after a crash");
  expect(security::chooseRecoveryAction(false, true, "backup_moved", false)
             == security::RecoveryAction::continueApply,
         "Backup-only crash state should resume apply");
  expect(security::chooseRecoveryAction(true, true, "backup_moved", true)
             == security::RecoveryAction::finalizeInstalled,
         "Crash after install move but before journal advance should finalize a verified bundle");
  expect(security::chooseRecoveryAction(false, false, "backup_moved", false)
             == security::RecoveryAction::fail,
         "Missing install and backup must fail closed");
  firstLock.reset();
}

}  // namespace

int main() {
  try {
    runSemVerTests();
    runStagingThreadAndDeadlineContracts();
    runPathAndUrlTests();
    runWindowsCommandLineTests();
    runSignatureAndCompatibilityTests();
    runArchiveAndApplyTests();
    runStateScopeTests();
    runBoundedFileAndTreeTests();
    runLockAndRecoveryTests();
  } catch (const std::exception& error) {
    DBG(error.what());
    std::cerr << error.what() << '\n';
    return 1;
  }
  return 0;
}
