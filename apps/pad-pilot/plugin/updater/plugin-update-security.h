#pragma once

// Windows SDK crypto headers depend on fundamental declarations from windows.h.
// Keep this order stable even when the rest of the file is auto-formatted.
// clang-format off
#include <windows.h>
#include <bcrypt.h>
#include <wincrypt.h>
// clang-format on

#include <juce_core/juce_core.h>

#include <algorithm>
#include <array>
#include <climits>
#include <cstdint>
#include <cstring>
#include <map>
#include <optional>
#include <set>
#include <vector>

#pragma comment(lib, "bcrypt.lib")
#pragma comment(lib, "crypt32.lib")

namespace padpilot::updater::security {

inline constexpr juce::int64 kManifestDownloadLimit = 1024 * 1024;
inline constexpr juce::int64 kArtifactDownloadLimit = 256ll * 1024 * 1024;
inline constexpr juce::int64 kArchiveUncompressedLimit = 512ll * 1024 * 1024;
inline constexpr juce::int64 kArchiveEntryLimit = 256ll * 1024 * 1024;
inline constexpr juce::int64 kActiveStateMarkerLimit = 32 * 1024;
inline constexpr juce::int64 kStateFileLimit = 128 * 1024;
inline constexpr juce::int64 kJournalFileLimit = 32 * 1024;
inline constexpr int kArchiveFileCountLimit = 4096;
inline constexpr int kManifestOperationLimit = 4096;
inline constexpr std::size_t kTreeEntryLimit = 4096;
inline constexpr std::size_t kTreeDepthLimit = 64;
inline constexpr auto kBundleName = "PadPilot.vst3";
inline constexpr auto kManifestName = "manifest.json";
inline constexpr auto kArtifactName = "patch.zip";
inline constexpr auto kStateName = "staged-update.json";
inline constexpr auto kHelperName = "padpilot-updater.exe";
inline constexpr auto kProtectedLogName = "PadPilot.vst3.padpilot-updater.log";
inline constexpr auto kProtectedJournalName = "PadPilot.vst3.padpilot-update-journal.json";
inline constexpr auto kRelaunchFlagName = "relaunch-requested";
inline constexpr auto kActiveStateName = "active-update.txt";
inline constexpr auto kBackupName = "PadPilot.vst3.padpilot-update-backup";
inline constexpr auto kPreparedName = "PadPilot.vst3.padpilot-update-prepared";

inline constexpr auto kManifestPublicKeyPem = R"(-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAvilrx5pe0YwNrHYlVa/C
xo2GoiNvBSbTD2pX6930jaK5Wxt4Yd+gR411yaubLuQKt6XDrKl1ygGhTZkvWpMa
tGJLQ1VC8BXhNtF4eDFitdm8yERwFNIErixKAokhYUI8iX9QwS1CUG0e92ORu/50
VdUs02jPWcOAQcXhEMUlQ3vTWcOzno1qYrQyGEGrIcv+WAX9Q9dNos6Ivyr3pcuS
mkdJHG16WJpO7aPSULoAW3mmNQ5iasPszgxIyWLAyRmYEyxjKR1c1twaKqtqAbde
x2k97wwJiVYWFk51r3cV26DzFkVAYJELkusR00jssFh+KvLOFPccda4qPHbxjX8e
cQIDAQAB
-----END PUBLIC KEY-----)";

struct ParsedSemVer {
  bool valid {false};
  std::array<std::uint64_t, 3> core {};
  std::vector<juce::String> prerelease;
};

struct FileOperation {
  juce::String path;
  juce::String payloadPath;
  juce::String sha256;
  juce::int64 size {0};
};

struct Manifest {
  juce::String arch;
  juce::String artifactKind;
  juce::String bundleRoot;
  juce::String maxBaseVersion;
  juce::String minBaseVersion;
  juce::String platform;
  juce::String version;
  std::vector<FileOperation> addOrReplace;
  std::vector<juce::String> deletes;
};

struct TrustedState {
  juce::File activeStateFile;
  juce::File archiveFile;
  juce::File backupBundle;
  juce::File installBundle;
  juce::File journalFile;
  juce::String lockName;
  juce::File logFile;
  juce::File manifestFile;
  juce::File preparedBundle;
  juce::File relaunchFlag;
  juce::File scopeRoot;
  juce::File stateDirectory;
  juce::File stateFile;
  juce::String artifactSha256;
  juce::String hostMode;
  juce::String manifestSha256;
  juce::String targetVersion;
  DWORD waitPid {0};
};

enum class RecoveryAction {
  continueApply,
  finalizeInstalled,
  restoreBackup,
  fail,
};

std::optional<juce::String> readBoundedTextFile(const juce::File& file, juce::int64 maximumBytes,
                                                const juce::String& description, juce::String& errorMessage);

RecoveryAction chooseRecoveryAction(bool installExists, bool backupExists, const juce::String& journalPhase,
                                    bool installedBundleVerified);

bool isAsciiDigit(juce::juce_wchar character);

bool isIdentifier(const juce::String& value, bool rejectNumericLeadingZero);

bool parseUnsigned(const juce::String& value, std::uint64_t& result);

ParsedSemVer parseStrictSemanticVersion(const juce::String& value);

bool isStrictSemanticVersion(const juce::String& value);

int compareNumericIdentifier(const juce::String& left, const juce::String& right);

int compareStrictSemanticVersions(const juce::String& left, const juce::String& right);

bool isSha256(const juce::String& value);

bool isReservedWindowsName(const juce::String& segment);

bool isSafeRelativePath(const juce::String& value);

bool isHttpsUrl(const juce::String& value);

juce::String canonicalPath(const juce::File& file);

bool samePath(const juce::File& left, const juce::File& right);

bool isContainedBy(const juce::File& child, const juce::File& parent);

juce::String bytesToHex(const std::vector<std::uint8_t>& bytes);

bool hashInputStream(juce::InputStream& stream, juce::int64 maximumBytes, juce::String& hash, juce::int64& byteCount,
                     juce::String& errorMessage);

juce::String computeFileSha256(const juce::File& file, juce::int64 maximumBytes, juce::String& errorMessage);

juce::String sha256Text(const juce::String& text, juce::String& errorMessage);

juce::File updaterRootDirectory();

juce::String normalizedInstallPath(const juce::File& installBundle);

juce::String installScopeKey(const juce::File& installBundle);

juce::File installScopeRoot(const juce::File& installBundle);

juce::File stateFileFor(const juce::File& installBundle, const juce::String& targetVersion);

juce::String lockNameFor(const juce::File& installBundle);

juce::String canonicalizeJsonValue(const juce::var& value, bool skipRootSignature = false);

bool decodeBase64(const juce::String& input, std::vector<std::uint8_t>& output, DWORD format,
                  juce::String& errorMessage);

bool verifyManifestSignature(const juce::String& manifestText, juce::String& errorMessage);

bool pathsOverlap(const juce::String& left, const juce::String& right);

bool readManifest(const juce::String& text, const juce::String& targetVersion, const juce::String& currentVersion,
                  const juce::String& platform, const juce::String& arch, Manifest& result, juce::String& errorMessage);

bool verifyPatchArchive(const juce::File& archive, const Manifest& manifest, juce::String& errorMessage,
                        std::map<std::string, int>* payloadIndices = nullptr);

bool inspectTreeInventory(const juce::File& root, std::size_t& entriesVisited, std::size_t depth,
                          bool rejectReparsePoints, juce::String& errorMessage);

bool safeRemoveTreeWithBudget(const juce::File& target, std::size_t& entriesVisited, std::size_t depth,
                              juce::String& errorMessage);

bool safeRemoveTree(const juce::File& target, juce::String& errorMessage);

bool copyTreeWithoutLinksWithBudget(const juce::File& source, const juce::File& destination,
                                    std::size_t& entriesVisited, std::size_t depth, juce::String& errorMessage);

bool copyTreeWithoutLinks(const juce::File& source, const juce::File& destination, juce::String& errorMessage);

bool buildPreparedBundle(const juce::File& baseBundle, const juce::File& preparedBundle, const juce::File& archive,
                         const Manifest& manifest, juce::String& errorMessage);

bool verifyBundle(const juce::File& bundle, const Manifest& manifest, juce::String& errorMessage);

bool writeTextAtomically(const juce::File& target, const juce::String& text, juce::String& errorMessage);

bool validateStatePath(const juce::File& stateFile, const juce::File& installBundle, const juce::String& targetVersion,
                       juce::String& errorMessage);

std::optional<TrustedState> loadTrustedState(const juce::File& stateFile, const juce::File& updaterExecutable,
                                             juce::String& errorMessage);
}  // namespace padpilot::updater::security
