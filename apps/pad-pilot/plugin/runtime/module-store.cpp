#include "runtime/module-store.h"

#include <algorithm>
#include <charconv>
#include <chrono>
#include <cstdint>
#include <map>
#include <memory>
#include <unordered_set>

#include <juce_core/juce_core.h>
#include <juce_cryptography/juce_cryptography.h>

#include "generated/factory-module-catalog.h"
#include "runtime/backend-log.h"
#include "runtime/module-identity.h"
#include "runtime/module-manifest-limits.h"
#include "runtime/storage-path-safety.h"

namespace padpilot {

namespace {
constexpr const char* kFactoryVersion = factory_catalog::kFactoryVersion.data();
constexpr const char* kFactoryLoadStatus = "ready";
constexpr const char* kModuleApiVersion = factory_catalog::kModuleApiVersion.data();
constexpr const char* kHostVersion = "0.1.0";
constexpr const char* kInstallTransactionMarker = "transaction.json";
constexpr std::size_t kMaxModuleNameBytes = 256;
constexpr std::size_t kMaxModuleVersionBytes = module_manifest_limits::kMaximumVersionBytes;
constexpr std::size_t kMaxModuleApiVersionBytes = module_manifest_limits::kMaximumApiVersionBytes;
constexpr std::size_t kMaxManifestEntryPathBytes = 1024;
constexpr std::size_t kMaxCapabilityBytes = 64;
constexpr std::size_t kMaxCapabilities = 64;
constexpr std::int64_t kMaxRegistryFileBytes = 1024 * 1024;
constexpr std::int64_t kMaxManifestFileBytes = 1024 * 1024;
constexpr std::int64_t kMaxInstallTransactionFileBytes = 16 * 1024;
constexpr std::int64_t kMaxBundleArchiveBytes = 128LL * 1024LL * 1024LL;
constexpr std::int64_t kMaxBundleEntryBytes = 64LL * 1024LL * 1024LL;
constexpr std::int64_t kMaxBundleExpandedBytes = 256LL * 1024LL * 1024LL;
constexpr int kMaxRegisteredModules = 4096;
constexpr int kMaxBundleEntries = 4096;
constexpr int kMaxInstallTransactions = 256;

std::string nowTimestampMs() {
  const auto nowMs = std::chrono::duration_cast<std::chrono::milliseconds>(
                         std::chrono::system_clock::now().time_since_epoch())
                         .count();
  return std::to_string(nowMs);
}

juce::String moduleStoreInstallLockName(const juce::File& modulesRoot) {
  return "padpilot-module-install-" +
         juce::String::toHexString(modulesRoot.getFullPathName().toLowerCase().hashCode64());
}

juce::String sanitizeModuleId(const juce::String& name) {
  juce::StringArray segments;
  juce::String current;
  for (const auto character : name) {
    if (juce::CharacterFunctions::isLetterOrDigit(character)) {
      current << juce::CharacterFunctions::toLowerCase(character);
      continue;
    }
    if (current.isNotEmpty()) {
      segments.add(current);
      current.clear();
    }
  }
  if (current.isNotEmpty()) {
    segments.add(current);
  }
  const auto joined = segments.joinIntoString("-");
  return joined.isNotEmpty() ? joined : juce::String {"module"};
}

bool parseCapabilities(const juce::var& value, std::vector<std::string>* destination) {
  if (destination == nullptr) {
    return false;
  }
  destination->clear();
  const auto* array = value.getArray();
  if (array == nullptr || array->size() > static_cast<int>(kMaxCapabilities)) {
    return false;
  }
  destination->reserve(static_cast<std::size_t>(array->size()));
  for (const auto& item : *array) {
    const auto text = item.toString().toStdString();
    if (text.empty() || text.size() > kMaxCapabilityBytes ||
        !std::all_of(text.begin(), text.end(), [](const char character) {
          return (character >= 'a' && character <= 'z') ||
                 (character >= '0' && character <= '9') || character == '-';
        })) {
      destination->clear();
      return false;
    }
    destination->push_back(text);
  }
  std::sort(destination->begin(), destination->end());
  if (std::adjacent_find(destination->begin(), destination->end()) != destination->end()) {
    destination->clear();
    return false;
  }
  return true;
}

juce::Array<juce::var> toVarArray(const std::vector<std::string>& values) {
  juce::Array<juce::var> array;
  for (const auto& value : values) {
    array.add(juce::String(value));
  }
  return array;
}

int compareVersionText(const std::string& left, const std::string& right) {
  juce::StringArray leftParts;
  juce::StringArray rightParts;
  leftParts.addTokens(juce::String(left), ".", {});
  rightParts.addTokens(juce::String(right), ".", {});
  const auto partCount = juce::jmax(leftParts.size(), rightParts.size());
  for (int index = 0; index < partCount; ++index) {
    const auto leftValue = index < leftParts.size() ? leftParts[index].getIntValue() : 0;
    const auto rightValue = index < rightParts.size() ? rightParts[index].getIntValue() : 0;
    if (leftValue != rightValue) {
      return leftValue < rightValue ? -1 : 1;
    }
  }
  return 0;
}

struct ParsedSemver {
  std::uint64_t major {0};
  std::uint64_t minor {0};
  std::uint64_t patch {0};
  std::vector<std::string> prerelease;
};

bool parseSemverNumber(const juce::String& text, std::uint64_t& result) {
  if (text.isEmpty() || (text.length() > 1 && text.startsWithChar('0'))) {
    return false;
  }

  const auto bytes = text.toStdString();
  const auto [next, error] = std::from_chars(bytes.data(), bytes.data() + bytes.size(), result);
  return error == std::errc {} && next == bytes.data() + bytes.size();
}

bool parseSemverIdentifiers(const juce::String& section,
                            const bool rejectLeadingZeroNumeric,
                            std::vector<std::string>* destination) {
  if (section.isEmpty() || section.startsWithChar('.') || section.endsWithChar('.') || section.contains("..")) {
    return false;
  }

  const auto identifiers = juce::StringArray::fromTokens(section, ".", {});
  for (const auto& identifier : identifiers) {
    bool numeric = true;
    for (const auto character : identifier) {
      const bool isDigit = juce::CharacterFunctions::isDigit(character);
      if (!isDigit && !juce::CharacterFunctions::isLetter(character) && character != '-') {
        return false;
      }
      numeric = numeric && isDigit;
    }
    if (identifier.isEmpty() || (rejectLeadingZeroNumeric && numeric && identifier.length() > 1 && identifier.startsWithChar('0'))) {
      return false;
    }
    if (destination != nullptr) {
      destination->push_back(identifier.toStdString());
    }
  }
  return true;
}

std::optional<ParsedSemver> parseSemver(const juce::String& value) {
  auto coreAndPrerelease = value.trim();
  if (coreAndPrerelease.isEmpty() || coreAndPrerelease != value) {
    return std::nullopt;
  }

  const auto plusIndex = coreAndPrerelease.indexOfChar('+');
  if (plusIndex >= 0) {
    if (plusIndex != coreAndPrerelease.lastIndexOfChar('+') ||
        !parseSemverIdentifiers(coreAndPrerelease.substring(plusIndex + 1), false, nullptr)) {
      return std::nullopt;
    }
    coreAndPrerelease = coreAndPrerelease.substring(0, plusIndex);
  }

  ParsedSemver semver;
  const auto dashIndex = coreAndPrerelease.indexOfChar('-');
  auto core = coreAndPrerelease;
  if (dashIndex >= 0) {
    if (!parseSemverIdentifiers(coreAndPrerelease.substring(dashIndex + 1), true, &semver.prerelease)) {
      return std::nullopt;
    }
    core = coreAndPrerelease.substring(0, dashIndex);
  }

  if (core.startsWithChar('.') || core.endsWithChar('.') || core.contains("..")) {
    return std::nullopt;
  }
  const auto parts = juce::StringArray::fromTokens(core, ".", {});
  if (parts.size() != 3) {
    return std::nullopt;
  }

  std::uint64_t* fields[] = {&semver.major, &semver.minor, &semver.patch};
  for (int index = 0; index < parts.size(); ++index) {
    if (!parseSemverNumber(parts[index], *fields[index])) {
      return std::nullopt;
    }
  }
  return semver;
}

bool isValidSemver(const juce::String& value) {
  return parseSemver(value).has_value();
}

bool isValidPersistedModuleId(const std::string& moduleId) {
  return isValidModuleId(moduleId);
}

std::optional<std::uint32_t> parseModuleStateSchemaVersion(const juce::var& value) {
  if (!value.isInt() && !value.isInt64()) {
    return std::nullopt;
  }
  const auto parsed = static_cast<std::int64_t>(value);
  if (parsed <= 0 ||
      parsed > static_cast<std::int64_t>(module_manifest_limits::kMaximumStateSchemaVersion)) {
    return std::nullopt;
  }
  return static_cast<std::uint32_t>(parsed);
}

std::string persistedModuleVersionOrFallback(const std::string& version,
                                             const std::string& fallback) {
  if (version.size() <= kMaxModuleVersionBytes && isValidSemver(juce::String(version))) {
    return version;
  }
  return fallback;
}

ModuleRecord makeInertModuleReference(const ModuleRecord& persistedModule,
                                      const ModuleRecord* registeredModule = nullptr) {
  ModuleRecord inert;
  inert.id = persistedModule.id;
  if (registeredModule != nullptr) {
    inert.name = registeredModule->name;
    inert.version = registeredModule->version;
  } else {
    inert.name = !persistedModule.name.empty() && persistedModule.name.size() <= kMaxModuleNameBytes
                     ? persistedModule.name
                     : persistedModule.id;
    inert.version = persistedModuleVersionOrFallback(persistedModule.version, "0.0.0");
  }
  inert.expectedModuleVersion = persistedModuleVersionOrFallback(persistedModule.version, inert.version);
  inert.stateSchemaVersion = registeredModule == nullptr ? 0 : registeredModule->stateSchemaVersion;
  inert.expectedStateSchemaVersion = persistedModule.expectedStateSchemaVersion;
  inert.entryPath.clear();
  inert.scriptEntryPath.clear();
  inert.installRootPath.clear();
  inert.manifestPath.clear();
  inert.apiVersion.clear();
  inert.checksum.clear();
  inert.installedAt.clear();
  inert.capabilities.clear();
  inert.resolvedModuleVersion.clear();
  inert.loadStatus = registeredModule != nullptr && !registeredModule->loadStatus.empty() &&
                             registeredModule->loadStatus != kFactoryLoadStatus
                         ? registeredModule->loadStatus
                         : "missing";
  inert.loadErrorMessage = registeredModule != nullptr && !registeredModule->loadErrorMessage.empty()
                               ? registeredModule->loadErrorMessage
                               : "Installed module is unavailable. PadPilot preserved state and presets without "
                                 "restoring executable metadata.";
  return inert;
}

int compareSemver(const juce::String& left, const juce::String& right) {
  const auto leftSemver = parseSemver(left);
  const auto rightSemver = parseSemver(right);
  if (!leftSemver.has_value() || !rightSemver.has_value()) {
    return compareVersionText(left.toStdString(), right.toStdString());
  }

  if (leftSemver->major != rightSemver->major) {
    return leftSemver->major < rightSemver->major ? -1 : 1;
  }
  if (leftSemver->minor != rightSemver->minor) {
    return leftSemver->minor < rightSemver->minor ? -1 : 1;
  }
  if (leftSemver->patch != rightSemver->patch) {
    return leftSemver->patch < rightSemver->patch ? -1 : 1;
  }

  if (leftSemver->prerelease.empty() || rightSemver->prerelease.empty()) {
    if (leftSemver->prerelease.empty() == rightSemver->prerelease.empty()) {
      return 0;
    }
    return leftSemver->prerelease.empty() ? 1 : -1;
  }

  const auto identifierCount = std::min(leftSemver->prerelease.size(), rightSemver->prerelease.size());
  for (std::size_t index = 0; index < identifierCount; ++index) {
    const auto& leftIdentifier = leftSemver->prerelease[index];
    const auto& rightIdentifier = rightSemver->prerelease[index];
    if (leftIdentifier == rightIdentifier) {
      continue;
    }

    const bool leftNumeric = std::all_of(leftIdentifier.begin(), leftIdentifier.end(), [](const char character) {
      return character >= '0' && character <= '9';
    });
    const bool rightNumeric = std::all_of(rightIdentifier.begin(), rightIdentifier.end(), [](const char character) {
      return character >= '0' && character <= '9';
    });
    if (leftNumeric != rightNumeric) {
      return leftNumeric ? -1 : 1;
    }
    if (leftNumeric && leftIdentifier.size() != rightIdentifier.size()) {
      return leftIdentifier.size() < rightIdentifier.size() ? -1 : 1;
    }
    return leftIdentifier < rightIdentifier ? -1 : 1;
  }
  if (leftSemver->prerelease.size() != rightSemver->prerelease.size()) {
    return leftSemver->prerelease.size() < rightSemver->prerelease.size() ? -1 : 1;
  }
  return 0;
}

bool isSafeBundleRelativePath(const juce::String& path) {
  if (path.isEmpty() || path.getNumBytesAsUTF8() > kMaxManifestEntryPathBytes ||
      path.startsWithChar('/') || path.containsChar(':') || path.containsChar('\0') ||
      path.containsChar('?') || path.containsChar('#')) {
    return false;
  }

  auto normalized = path.replaceCharacter('\\', '/').trim();
  while (normalized.startsWith("./")) {
    normalized = normalized.substring(2);
  }
  if (normalized.isEmpty() || normalized.startsWithChar('/') || normalized.contains("//")) {
    return false;
  }

  const auto segments = juce::StringArray::fromTokens(normalized, "/", {});
  if (segments.isEmpty()) {
    return false;
  }

  for (const auto& segment : segments) {
    if (segment.isEmpty() || segment == "." || segment == "..") {
      return false;
    }
  }

  return true;
}

juce::String normalizeBundleRelativePath(const juce::String& path) {
  auto normalized = path.replaceCharacter('\\', '/').trim();
  while (normalized.startsWith("./")) {
    normalized = normalized.substring(2);
  }
  while (normalized.startsWithChar('/')) {
    normalized = normalized.substring(1);
  }
  return normalized;
}

bool archiveContainsEntry(juce::ZipFile& archive, const juce::String& relativePath);

bool bundlePathExists(const juce::File& installRoot, const juce::String& path) {
  if (!isSafeBundleRelativePath(path) || !installRoot.isDirectory() || installRoot.isSymbolicLink()) {
    return false;
  }
  auto resolved = installRoot;
  const auto segments = juce::StringArray::fromTokens(normalizeBundleRelativePath(path), "/", {});
  for (const auto& segment : segments) {
    resolved = resolved.getChildFile(segment);
    if (resolved.isSymbolicLink()) {
      return false;
    }
  }
  return resolved.existsAsFile() && resolved.isAChildOf(installRoot);
}

bool validateManifestAssetReferences(const juce::DynamicObject& manifest,
                                     juce::ZipFile& archive,
                                     std::string& errorMessage) {
  const auto assetsVar = manifest.getProperty("assets");
  if (!assetsVar.isObject()) {
    return true;
  }

  const auto* assets = assetsVar.getDynamicObject();
  if (assets == nullptr) {
    return true;
  }

  for (const auto& property : assets->getProperties()) {
    const auto relativePath = property.value.toString().trim();
    if (!isSafeBundleRelativePath(relativePath)) {
      errorMessage = "Module manifest assets must use safe relative paths.";
      return false;
    }
    if (!archiveContainsEntry(archive, relativePath)) {
      errorMessage = "Bundle is missing an asset declared in padpilot-module.json.";
      return false;
    }
  }

  return true;
}

bool validateManifestMigrationReferences(const juce::DynamicObject& manifest,
                                         juce::ZipFile& archive,
                                         std::string& errorMessage) {
  const auto migrationsVar = manifest.getProperty("migrations");
  if (!migrationsVar.isArray()) {
    return true;
  }

  const auto* migrations = migrationsVar.getArray();
  if (migrations == nullptr) {
    return true;
  }

  for (const auto& entry : *migrations) {
    juce::String relativePath;
    if (entry.isString()) {
      relativePath = entry.toString().trim();
    } else if (const auto* migration = entry.getDynamicObject(); migration != nullptr) {
      relativePath = migration->getProperty("path").toString().trim();
      if (relativePath.isEmpty()) {
        relativePath = migration->getProperty("metadataPath").toString().trim();
      }
    }

    if (relativePath.isEmpty()) {
      continue;
    }
    if (!isSafeBundleRelativePath(relativePath)) {
      errorMessage = "Module manifest migrations must use safe relative paths.";
      return false;
    }
    if (!archiveContainsEntry(archive, relativePath)) {
      errorMessage = "Bundle is missing migration metadata declared in padpilot-module.json.";
      return false;
    }
  }

  return true;
}

juce::String buildModuleWebPath(const juce::String& moduleId,
                                const juce::String& version,
                                const juce::String& relativePath) {
  auto normalized = normalizeBundleRelativePath(relativePath);
  return "/__padpilot/modules/" + moduleId + "/" + version + "/" + normalized;
}

juce::String buildRegistryFileName(const ModuleRecord& module) {
  return juce::String(module.id) + "--" + juce::String(module.version) + ".json";
}

struct InstallTransaction {
  juce::String moduleId;
  juce::String version;
  bool hadInstall {false};
  bool hadRegistry {false};
  bool committed {false};
};

bool storeRootsAreSafe(const juce::File& modulesRoot,
                       const juce::File& registryRoot,
                       const juce::File& installedRoot) {
  return registryRoot.getParentDirectory() == modulesRoot &&
         installedRoot.getParentDirectory() == modulesRoot &&
         storage::isSafeDirectory(modulesRoot, modulesRoot) &&
         storage::isSafeDirectory(registryRoot, modulesRoot) &&
         storage::isSafeDirectory(installedRoot, modulesRoot);
}

bool removePath(const juce::File& path, const juce::File& boundary) {
  return storage::deleteSafePath(path, boundary, static_cast<std::size_t>(kMaxBundleEntries) + 32U);
}

bool replaceTextFileAtomically(const juce::File& target,
                               const juce::File& boundary,
                               const juce::String& contents) {
  return storage::replaceFileAtomically(
      target,
      boundary,
      contents.toRawUTF8(),
      static_cast<std::size_t>(contents.getNumBytesAsUTF8()));
}

bool writeInstallTransaction(const juce::File& transactionRoot, const InstallTransaction& transaction) {
  juce::DynamicObject::Ptr object = new juce::DynamicObject();
  object->setProperty("moduleId", transaction.moduleId);
  object->setProperty("version", transaction.version);
  object->setProperty("hadInstall", transaction.hadInstall);
  object->setProperty("hadRegistry", transaction.hadRegistry);
  object->setProperty("phase", transaction.committed ? "committed" : "prepared");
  return replaceTextFileAtomically(
      transactionRoot.getChildFile(kInstallTransactionMarker),
      transactionRoot,
      juce::JSON::toString(juce::var(object.get()), true));
}

std::optional<InstallTransaction> readInstallTransaction(const juce::File& transactionRoot) {
  const auto marker = transactionRoot.getChildFile(kInstallTransactionMarker);
  if (!storage::isSafeDirectory(transactionRoot, transactionRoot.getParentDirectory()) ||
      !storage::isSafeFile(marker, transactionRoot) || marker.getSize() <= 0 ||
      marker.getSize() > kMaxInstallTransactionFileBytes) {
    return std::nullopt;
  }
  const auto parsed = juce::JSON::parse(marker.loadFileAsString());
  const auto* object = parsed.getDynamicObject();
  if (object == nullptr) {
    return std::nullopt;
  }

  InstallTransaction transaction;
  transaction.moduleId = object->getProperty("moduleId").toString();
  transaction.version = object->getProperty("version").toString();
  transaction.hadInstall = static_cast<bool>(object->getProperty("hadInstall"));
  transaction.hadRegistry = static_cast<bool>(object->getProperty("hadRegistry"));
  transaction.committed = object->getProperty("phase").toString() == "committed";
  if (!isValidModuleId(transaction.moduleId.toStdString()) ||
      transaction.version.getNumBytesAsUTF8() > static_cast<int>(kMaxModuleVersionBytes) ||
      !isValidSemver(transaction.version)) {
    return std::nullopt;
  }
  return transaction;
}

bool recoverInstallTransaction(const juce::File& transactionRoot,
                               const juce::File& installedRoot,
                               const juce::File& registryRoot) {
  const auto modulesRoot = installedRoot.getParentDirectory();
  const auto stagingRoot = transactionRoot.getParentDirectory();
  if (!storeRootsAreSafe(modulesRoot, registryRoot, installedRoot) ||
      stagingRoot != installedRoot.getChildFile(".staging") ||
      !storage::isSafeDirectory(stagingRoot, installedRoot) ||
      !storage::isSafeDirectory(transactionRoot, stagingRoot)) {
    return false;
  }
  const auto transaction = readInstallTransaction(transactionRoot);
  if (!transaction.has_value()) {
    appendBackendLog("module-store", "Ignored invalid install transaction path=" +
                                         transactionRoot.getFullPathName().toStdString());
    return false;
  }

  if (transaction->committed) {
    const bool cleaned = removePath(transactionRoot, stagingRoot);
    if (!cleaned) {
      appendBackendLog("module-store", "Could not clean committed install transaction path=" +
                                           transactionRoot.getFullPathName().toStdString());
    }
    return cleaned;
  }

  const auto moduleRoot = installedRoot.getChildFile(transaction->moduleId);
  const auto installRoot = moduleRoot.getChildFile(transaction->version);
  if (moduleRoot.getParentDirectory() != installedRoot ||
      installRoot.getParentDirectory() != moduleRoot ||
      !storage::isSameOrChildPath(installRoot, installedRoot)) {
    return false;
  }
  const auto installBackup = transactionRoot.getChildFile("install-backup");
  bool restored = true;
  if (installBackup.exists()) {
    restored = storage::isSafeTree(installBackup, transactionRoot, kMaxBundleEntries) &&
               removePath(installRoot, installedRoot) &&
               storage::ensureSafeDirectory(moduleRoot, installedRoot) &&
               storage::isSafeDirectory(transactionRoot, stagingRoot) &&
               installBackup.moveFileTo(installRoot) &&
               storage::isSafeTree(installRoot, installedRoot, kMaxBundleEntries);
  } else if (!transaction->hadInstall) {
    restored = removePath(installRoot, installedRoot);
  } else if (!storage::isSafeTree(installRoot, installedRoot, kMaxBundleEntries)) {
    restored = false;
  }

  ModuleRecord registryRecord;
  registryRecord.id = transaction->moduleId.toStdString();
  registryRecord.version = transaction->version.toStdString();
  const auto registryTarget = registryRoot.getChildFile(buildRegistryFileName(registryRecord));
  const auto registryBackup = transactionRoot.getChildFile("registry-backup.json");
  if (transaction->hadRegistry) {
    if (registryBackup.exists()) {
      restored = storage::isSafeFile(registryBackup, transactionRoot) &&
                 registryBackup.getSize() > 0 && registryBackup.getSize() <= kMaxRegistryFileBytes &&
                 removePath(registryTarget, registryRoot) &&
                 storage::isSafeFileTarget(registryTarget, registryRoot) &&
                 registryBackup.copyFileTo(registryTarget) &&
                 storage::isSafeFile(registryTarget, registryRoot) && restored;
    } else if (!storage::isSafeFile(registryTarget, registryRoot)) {
      restored = false;
    }
  } else {
    restored = removePath(registryTarget, registryRoot) && restored;
  }

  if (restored) {
    restored = removePath(transactionRoot, stagingRoot);
  }
  appendBackendLog("module-store",
                   "Recovered interrupted module install id=" + transaction->moduleId.toStdString() +
                       " version=" + transaction->version.toStdString() +
                       " success=" + std::string(restored ? "true" : "false"));
  return restored;
}

void recoverInstallTransactions(const juce::File& installedRoot, const juce::File& registryRoot) {
  const auto modulesRoot = installedRoot.getParentDirectory();
  const auto stagingRoot = installedRoot.getChildFile(".staging");
  if (!storeRootsAreSafe(modulesRoot, registryRoot, installedRoot) ||
      !storage::ensureSafeDirectory(stagingRoot, installedRoot)) {
    appendBackendLog("module-store", "Rejected unsafe install transaction root");
    return;
  }
  juce::Array<juce::File> transactions;
  for (const auto& entry : juce::RangedDirectoryIterator(
           stagingRoot, false, "transaction--*", juce::File::findDirectories)) {
    transactions.add(entry.getFile());
    if (transactions.size() > kMaxInstallTransactions) {
      break;
    }
  }
  transactions.sort();
  if (transactions.size() > kMaxInstallTransactions) {
    appendBackendLog("module-store", "Install transaction count exceeds recovery limit; extras deferred");
    transactions.removeLast();
  }
  for (const auto& transactionRoot : transactions) {
    if (!storage::isSafeDirectory(transactionRoot, stagingRoot)) {
      appendBackendLog("module-store", "Ignored install transaction reparse point path=" +
                                           transactionRoot.getFullPathName().toStdString());
      continue;
    }
    if (!transactionRoot.getChildFile(kInstallTransactionMarker).existsAsFile()) {
      if (!removePath(transactionRoot, stagingRoot)) {
        appendBackendLog("module-store", "Could not clean abandoned module extraction path=" +
                                             transactionRoot.getFullPathName().toStdString());
      }
      continue;
    }
    recoverInstallTransaction(transactionRoot, installedRoot, registryRoot);
  }
}

juce::var buildManifestVar(const ModuleRecord& module) {
  juce::DynamicObject::Ptr manifest = new juce::DynamicObject();
  manifest->setProperty("id", juce::String(module.id));
  manifest->setProperty("name", juce::String(module.name));
  manifest->setProperty("version", juce::String(module.version));
  manifest->setProperty("moduleApiVersion", juce::String(module.apiVersion));
  manifest->setProperty("uiEntry", "ui/ui-entry.js");
  manifest->setProperty("scriptEntry", module.scriptEntryPath.empty() ? juce::var {} : juce::var("script/module.js"));
  manifest->setProperty("stateSchemaVersion", 1);
  manifest->setProperty("capabilities", toVarArray(module.capabilities));
  manifest->setProperty("minHostVersion", juce::String("0.1.0"));
  manifest->setProperty("assets", juce::var(new juce::DynamicObject()));
  manifest->setProperty("migrations", juce::Array<juce::var>());
  return juce::var(manifest.get());
}

juce::String createStarterUiEntrySource(const ModuleRecord& module) {
  const auto manifestJson = juce::JSON::toString(buildManifestVar(module), true);
  juce::String source;
  source << "const runtime = window.__padpilotModuleRuntime;\n";
  source << "if (!runtime) {\n";
  source << "  throw new Error(\"PadPilot module runtime unavailable.\");\n";
  source << "}\n";
  source << "const manifest = " << manifestJson << ";\n";
  source << "export default runtime.definePadPilotModule({\n";
  source << "  manifest,\n";
  source << "  Component: runtime.createStarterModuleComponent(manifest),\n";
  source << "});\n";
  return source;
}

juce::String createStarterScriptSource() {
  return "function padpilotHealthCheck() {\n"
         "  return true;\n"
         "}\n\n"
         "function padpilotGetModuleManifest() {\n"
         "  return {\n"
         "    moduleApiVersion: \"0.1.0\"\n"
         "  };\n"
         "}\n\n"
         "function padpilotOnInput(event) {\n"
         "  return null;\n"
         "}\n";
}

bool writeStarterBundle(const juce::File& installRoot, const ModuleRecord& module) {
  const auto manifestFile = installRoot.getChildFile("padpilot-module.json");
  const auto uiRoot = installRoot.getChildFile("ui");
  const auto scriptRoot = installRoot.getChildFile("script");
  if (!storage::isSafeDirectory(installRoot, installRoot.getParentDirectory()) ||
      !storage::ensureSafeDirectory(uiRoot, installRoot) ||
      !storage::ensureSafeDirectory(scriptRoot, installRoot)) {
    return false;
  }
  const auto uiEntryFile = uiRoot.getChildFile("ui-entry.js");
  const auto scriptEntryFile = scriptRoot.getChildFile("module.js");
  return replaceTextFileAtomically(
             manifestFile, installRoot, juce::JSON::toString(buildManifestVar(module), true)) &&
         replaceTextFileAtomically(uiEntryFile, installRoot, createStarterUiEntrySource(module)) &&
         replaceTextFileAtomically(scriptEntryFile, installRoot, createStarterScriptSource());
}

ModuleRecord makeFactoryModule(const juce::String& moduleId,
                               const juce::String& name,
                               const std::vector<std::string>& capabilities,
                               const juce::String& uiEntryPath) {
  ModuleRecord module;
  module.id = moduleId.toStdString();
  module.name = name.toStdString();
  module.version = kFactoryVersion;
  module.entryPath = uiEntryPath.toStdString();
  module.apiVersion = kModuleApiVersion;
  module.capabilities = capabilities;
  module.loadStatus = kFactoryLoadStatus;
  module.resolvedModuleVersion = kFactoryVersion;
  module.stateSchemaVersion = 1;
  module.expectedStateSchemaVersion = 1;
  module.installedAt = "factory";
  return module;
}

const std::vector<ModuleRecord>& trustedFactoryModules() {
  static const auto modules = [] {
    std::vector<ModuleRecord> result;
    result.reserve(factory_catalog::kModules.size());
    for (const auto& definition : factory_catalog::kModules) {
      std::vector<std::string> capabilities;
      capabilities.reserve(definition.capabilityCount);
      for (std::size_t index = 0; index < definition.capabilityCount; ++index) {
        capabilities.emplace_back(definition.capabilities[index]);
      }
      result.push_back(makeFactoryModule(juce::String(definition.id.data()),
                                         juce::String(definition.name.data()),
                                         capabilities,
                                         juce::String(definition.uiEntry.data())));
    }
    return result;
  }();
  return modules;
}

const ModuleRecord* findTrustedFactoryModule(const std::string& moduleId,
                                             const std::string& version) {
  const auto& factories = trustedFactoryModules();
  const auto module = std::find_if(factories.begin(), factories.end(), [&](const auto& candidate) {
    return candidate.id == moduleId && candidate.version == version;
  });
  return module == factories.end() ? nullptr : &*module;
}

bool isReservedFactoryModuleId(const std::string& moduleId) {
  const auto& factories = trustedFactoryModules();
  return std::any_of(factories.begin(), factories.end(), [&moduleId](const auto& module) {
    return module.id == moduleId;
  });
}

bool validateArchiveResourceBounds(juce::ZipFile& archive, std::string& errorMessage) {
  if (archive.getNumEntries() <= 0 || archive.getNumEntries() > kMaxBundleEntries) {
    errorMessage = "Module bundle entry count is empty or exceeds the limit.";
    return false;
  }

  std::int64_t expandedBytes = 0;
  std::unordered_set<std::string> normalizedPaths;
  for (int index = 0; index < archive.getNumEntries(); ++index) {
    const auto* entry = archive.getEntry(index);
    if (entry == nullptr) {
      errorMessage = "Module bundle contains an unreadable archive entry.";
      return false;
    }
    if (entry->filename.getNumBytesAsUTF8() > kMaxManifestEntryPathBytes ||
        !isSafeBundleRelativePath(entry->filename)) {
      errorMessage = "Bundle contains an unsafe archive path: " + entry->filename.toStdString();
      return false;
    }
    if (entry->isSymbolicLink) {
      errorMessage = "Module bundle contains a symbolic link entry.";
      return false;
    }
    if (entry->uncompressedSize < 0 || entry->uncompressedSize > kMaxBundleEntryBytes ||
        entry->uncompressedSize > kMaxBundleExpandedBytes - expandedBytes) {
      errorMessage = "Module bundle contains an oversized archive entry.";
      return false;
    }
    auto normalized = normalizeBundleRelativePath(entry->filename)
                          .trimCharactersAtEnd("/")
                          .toLowerCase()
                          .toStdString();
    if (normalized.empty() || !normalizedPaths.insert(std::move(normalized)).second) {
      errorMessage = "Module bundle contains duplicate or case-colliding archive paths.";
      return false;
    }
    expandedBytes += entry->uncompressedSize;
  }
  return true;
}

std::optional<juce::var> readManifestVarFromArchive(juce::ZipFile& archive, std::string& errorMessage) {
  const auto manifestIndex = archive.getIndexOfFileName("padpilot-module.json");
  if (manifestIndex < 0) {
    errorMessage = "Bundle is missing padpilot-module.json at the archive root.";
    return std::nullopt;
  }

  const auto* manifestEntry = archive.getEntry(manifestIndex);
  if (manifestEntry == nullptr || manifestEntry->isSymbolicLink || manifestEntry->uncompressedSize <= 0 ||
      manifestEntry->uncompressedSize > kMaxManifestFileBytes) {
    errorMessage = "padpilot-module.json exceeds the manifest size limit.";
    return std::nullopt;
  }

  std::unique_ptr<juce::InputStream> manifestStream(archive.createStreamForEntry(manifestIndex));
  if (manifestStream == nullptr) {
    errorMessage = "PadPilot could not read padpilot-module.json from the bundle.";
    return std::nullopt;
  }

  const auto manifestText = manifestStream->readEntireStreamAsString();
  const auto manifestVar = juce::JSON::parse(manifestText);
  if (!manifestVar.isObject()) {
    errorMessage = "padpilot-module.json is not valid JSON.";
    return std::nullopt;
  }

  return manifestVar;
}

bool archiveContainsEntry(juce::ZipFile& archive, const juce::String& relativePath) {
  return archive.getEntry(normalizeBundleRelativePath(relativePath), false) != nullptr;
}

std::optional<ModuleRecord> parseModuleManifestRecord(const juce::var& manifestVar,
                                                      const juce::File& installRoot,
                                                      std::string& errorMessage) {
  const auto* manifest = manifestVar.getDynamicObject();
  if (manifest == nullptr) {
    errorMessage = "padpilot-module.json did not parse into an object.";
    return std::nullopt;
  }

  ModuleRecord module;
  module.id = manifest->getProperty("id").toString().trim().toStdString();
  module.name = manifest->getProperty("name").toString().trim().toStdString();
  module.version = manifest->getProperty("version").toString().trim().toStdString();
  module.apiVersion = manifest->getProperty("moduleApiVersion").toString().trim().toStdString();
  if (!parseCapabilities(manifest->getProperty("capabilities"), &module.capabilities)) {
    errorMessage = "Module manifest capabilities are invalid or exceed limits.";
    return std::nullopt;
  }
  module.loadStatus = "ready";
  module.installRootPath = installRoot.getFullPathName().toStdString();
  module.manifestPath = installRoot.getChildFile("padpilot-module.json").getFullPathName().toStdString();

  const auto uiEntry = manifest->getProperty("uiEntry").toString().trim();
  const auto scriptEntry = manifest->getProperty("scriptEntry").toString().trim();
  const auto minHostVersion = manifest->getProperty("minHostVersion").toString().trim();
  const auto stateSchemaVersion = parseModuleStateSchemaVersion(
      manifest->getProperty("stateSchemaVersion"));

  if (module.id.empty() || module.name.empty() || module.name.size() > kMaxModuleNameBytes ||
      module.version.empty() || module.version.size() > kMaxModuleVersionBytes ||
      module.apiVersion.empty() || module.apiVersion.size() > kMaxModuleApiVersionBytes) {
    errorMessage = "Module manifest is missing id, name, version, or moduleApiVersion.";
    return std::nullopt;
  }
  if (!isValidModuleId(module.id)) {
    errorMessage =
        "Module manifest id must be lowercase alphanumeric with single internal dashes.";
    return std::nullopt;
  }
  if (!isValidSemver(juce::String(module.version))) {
    errorMessage = "Module manifest version must be valid semver.";
    return std::nullopt;
  }
  if (uiEntry.getNumBytesAsUTF8() > kMaxManifestEntryPathBytes ||
      !isSafeBundleRelativePath(uiEntry)) {
    errorMessage = "Module manifest uiEntry must be a safe relative path.";
    return std::nullopt;
  }
  if (scriptEntry.getNumBytesAsUTF8() > kMaxManifestEntryPathBytes ||
      (scriptEntry.isNotEmpty() && !isSafeBundleRelativePath(scriptEntry))) {
    errorMessage = "Module manifest scriptEntry must be a safe relative path.";
    return std::nullopt;
  }
  if (!stateSchemaVersion.has_value()) {
    errorMessage = "Module manifest stateSchemaVersion must be an integer from 1 through 64.";
    return std::nullopt;
  }
  if (minHostVersion.isEmpty()) {
    errorMessage = "Module manifest minHostVersion is required.";
    return std::nullopt;
  }
  if (!isValidSemver(minHostVersion)) {
    errorMessage = "Module manifest minHostVersion must be valid semver.";
    return std::nullopt;
  }

  module.entryPath = buildModuleWebPath(module.id, module.version, uiEntry).toStdString();
  if (scriptEntry.isNotEmpty()) {
    module.scriptEntryPath = installRoot.getChildFile(normalizeBundleRelativePath(scriptEntry)).getFullPathName().toStdString();
  }
  module.expectedModuleVersion = module.version;
  module.resolvedModuleVersion = module.version;
  module.stateSchemaVersion = *stateSchemaVersion;
  module.expectedStateSchemaVersion = *stateSchemaVersion;
  if (compareSemver(minHostVersion, kHostVersion) > 0) {
    module.loadStatus = "incompatible-host";
    module.loadErrorMessage =
        "Requires PadPilot host " + minHostVersion.toStdString() + " or newer. Current host is " + std::string(kHostVersion) + ".";
  }

  return module;
}

std::optional<ModuleRecord> parseInstalledModuleRecord(const juce::var& manifestVar,
                                                       const juce::File& bundleArchive,
                                                       const juce::File& installRoot,
                                                       std::string& errorMessage) {
  auto module = parseModuleManifestRecord(manifestVar, installRoot, errorMessage);
  if (!module.has_value()) {
    return std::nullopt;
  }
  module->installedAt = nowTimestampMs();
  module->checksum = juce::SHA256(bundleArchive).toHexString().toStdString();
  return module;
}

bool validateArchiveEntries(juce::ZipFile& archive,
                            const ModuleRecord& module,
                            const juce::var& manifestVar,
                            std::string& errorMessage) {
  const auto* manifest = manifestVar.getDynamicObject();
  if (manifest == nullptr) {
    errorMessage = "Module manifest is invalid.";
    return false;
  }

  const auto uiEntry = manifest->getProperty("uiEntry").toString().trim();
  const auto scriptEntry = manifest->getProperty("scriptEntry").toString().trim();
  if (!archiveContainsEntry(archive, uiEntry)) {
    errorMessage = "Bundle is missing the UI entry declared in padpilot-module.json.";
    return false;
  }
  if (scriptEntry.isNotEmpty() && !archiveContainsEntry(archive, scriptEntry)) {
    errorMessage = "Bundle is missing the script entry declared in padpilot-module.json.";
    return false;
  }
  if (!validateManifestAssetReferences(*manifest, archive, errorMessage)) {
    return false;
  }
  if (!validateManifestMigrationReferences(*manifest, archive, errorMessage)) {
    return false;
  }

  for (int index = 0; index < archive.getNumEntries(); ++index) {
    const auto* entry = archive.getEntry(index);
    if (entry == nullptr) {
      continue;
    }
    if (!isSafeBundleRelativePath(entry->filename)) {
      errorMessage = "Bundle contains an unsafe archive path: " + entry->filename.toStdString();
      return false;
    }
  }

  juce::ignoreUnused(module);
  return true;
}

ModuleRecord hydrateModuleRecordInternal(const ModuleRecord& source) {
  auto module = source;
  if (module.id.empty()) {
    return module;
  }
  if (module.expectedModuleVersion.empty()) {
    module.expectedModuleVersion = module.version;
  }
  if (module.resolvedModuleVersion.empty()) {
    module.resolvedModuleVersion = module.version;
  }
  if (module.expectedStateSchemaVersion == 0) {
    module.expectedStateSchemaVersion = module.stateSchemaVersion;
  }

  const auto isBuiltin = juce::String(module.entryPath).startsWith("builtin://");
  if (isBuiltin) {
    const auto* trustedFactory = findTrustedFactoryModule(module.id, module.version);
    if (trustedFactory == nullptr || trustedFactory->entryPath != module.entryPath) {
      return makeInertModuleReference(module);
    }
    auto trusted = *trustedFactory;
    trusted.expectedModuleVersion = persistedModuleVersionOrFallback(module.expectedModuleVersion, trusted.version);
    trusted.expectedStateSchemaVersion = module.expectedStateSchemaVersion == 0
                                             ? trusted.stateSchemaVersion
                                             : module.expectedStateSchemaVersion;
    return trusted;
  }

  const juce::File installRoot(module.installRootPath);
  const juce::File manifestFile(module.manifestPath);
  const auto manifestExists = manifestFile.existsAsFile() && !manifestFile.isSymbolicLink() &&
                              manifestFile.getSize() > 0 && manifestFile.getSize() <= kMaxManifestFileBytes;
  const auto installRootExists = installRoot.isDirectory() && !installRoot.isSymbolicLink();
  bool uiEntryExists = false;
  bool scriptEntryExists = module.scriptEntryPath.empty();

  if (manifestExists) {
    const auto manifestVar = juce::JSON::parse(manifestFile.loadFileAsString());
    if (const auto* manifest = manifestVar.getDynamicObject(); manifest != nullptr) {
      const auto uiEntry = manifest->getProperty("uiEntry").toString().trim();
      const auto scriptEntry = manifest->getProperty("scriptEntry").toString().trim();
      uiEntryExists = bundlePathExists(installRoot, uiEntry);
      scriptEntryExists = scriptEntry.isEmpty() || bundlePathExists(installRoot, scriptEntry);
    }
  }

  if (!installRootExists || !manifestExists || !uiEntryExists || !scriptEntryExists) {
    module.loadStatus = "missing";
    if (!installRootExists || !manifestExists) {
      module.loadErrorMessage = "Installed bundle files are missing. PadPilot preserved state and presets for this module.";
    } else if (!uiEntryExists) {
      module.loadErrorMessage = "Installed bundle UI entry is missing. PadPilot preserved state and presets for this module.";
    } else {
      module.loadErrorMessage = "Installed bundle script entry is missing. PadPilot preserved state and presets for this module.";
    }
    return module;
  }

  if (module.loadStatus.empty()) {
    module.loadStatus = kFactoryLoadStatus;
  }
  return module;
}
}  // namespace

namespace {
juce::File defaultModulesRoot() {
  return juce::File::getSpecialLocation(juce::File::userApplicationDataDirectory)
      .getChildFile("PadPilot")
      .getChildFile("modules");
}
}  // namespace

ModuleStore::ModuleStore()
    : ModuleStore(defaultModulesRoot().getFullPathName().toStdString()) {}

ModuleStore::ModuleStore(std::string modulesRootPath) {
  const juce::File root {juce::String(modulesRootPath)};
  const auto registryRoot = root.getChildFile("registry");
  const auto installedRoot = root.getChildFile("installed");
  modulesRootPath_ = root.getFullPathName().toStdString();
  registryRootPath_ = registryRoot.getFullPathName().toStdString();
  installedRootPath_ = installedRoot.getFullPathName().toStdString();
  storageRootsReady_ = storage::ensureSafeDirectory(root, root) &&
                       storage::ensureSafeDirectory(registryRoot, root) &&
                       storage::ensureSafeDirectory(installedRoot, root) &&
                       storeRootsAreSafe(root, registryRoot, installedRoot);
  if (!storageRootsReady_) {
    appendBackendLog("module-store", "Rejected unsafe module storage root path=" + modulesRootPath_);
    return;
  }
  {
    juce::InterProcessLock installLock(moduleStoreInstallLockName(root));
    const juce::InterProcessLock::ScopedLockType installGuard(installLock);
    if (installGuard.isLocked()) {
      recoverInstallTransactions(juce::File(installedRootPath_), juce::File(registryRootPath_));
    } else {
      appendBackendLog("module-store", "Could not acquire install lock for recovery");
    }
  }

  const auto seedFactory = [this](const ModuleRecord& module) {
    if (!saveModule(module)) {
      appendBackendLog("module-store", "Could not repair factory registry id=" + module.id);
    }
  };
  for (const auto& module : trustedFactoryModules()) {
    seedFactory(module);
  }
}

std::vector<ModuleRecord> ModuleStore::loadAllModules() const {
  std::map<std::string, ModuleRecord> latestById;
  for (const auto& factory : trustedFactoryModules()) {
    latestById.emplace(factory.id, factory);
  }
  const auto modulesRoot = juce::File(modulesRootPath_);
  const auto registryRoot = juce::File(registryRootPath_);
  const auto installedRoot = juce::File(installedRootPath_);
  if (!storageRootsReady_ || !storeRootsAreSafe(modulesRoot, registryRoot, installedRoot)) {
    std::vector<ModuleRecord> factories;
    factories.reserve(latestById.size());
    for (auto& [id, module] : latestById) {
      factories.push_back(std::move(module));
    }
    return factories;
  }
  juce::Array<juce::File> files;
  for (const auto& entry : juce::RangedDirectoryIterator(
           registryRoot, false, "*.json", juce::File::findFiles)) {
    files.add(entry.getFile());
    if (files.size() > kMaxRegisteredModules) {
      break;
    }
  }
  files.sort();
  const auto fileCount = juce::jmin(files.size(), kMaxRegisteredModules);
  if (files.size() > kMaxRegisteredModules) {
    appendBackendLog("module-store", "Registry module count exceeds limit; extra records ignored count=" +
                                         std::to_string(files.size()));
  }

  for (int fileIndex = 0; fileIndex < fileCount; ++fileIndex) {
    const auto& file = files.getReference(fileIndex);
    if (!storage::isSafeFile(file, registryRoot) ||
        file.getSize() <= 0 || file.getSize() > kMaxRegistryFileBytes) {
      appendBackendLog("module-store", "Ignored oversized or empty registry record path=" +
                                           file.getFullPathName().toStdString());
      continue;
    }
    const auto parsed = juce::JSON::parse(file.loadFileAsString());
    const auto* object = parsed.getDynamicObject();
    if (object == nullptr) {
      continue;
    }

    ModuleRecord persistedReference;
    persistedReference.id = object->getProperty("id").toString().trim().toStdString();
    persistedReference.name = object->getProperty("name").toString().trim().toStdString();
    persistedReference.version = object->getProperty("version").toString().trim().toStdString();
    if (!isValidPersistedModuleId(persistedReference.id) ||
        persistedReference.version.size() > kMaxModuleVersionBytes ||
        !isValidSemver(juce::String(persistedReference.version)) ||
        file.getFileName().toStdString() != buildRegistryFileName(persistedReference).toStdString()) {
      continue;
    }

    if (isReservedFactoryModuleId(persistedReference.id)) {
      continue;
    }

    ModuleRecord module;
    if (persistedReference.name.empty() || persistedReference.name.size() > kMaxModuleNameBytes) {
      persistedReference.name = persistedReference.id;
    }
    const auto moduleRoot = installedRoot.getChildFile(persistedReference.id);
    const auto installRoot = moduleRoot.getChildFile(persistedReference.version);
    const auto manifestFile = installRoot.getChildFile("padpilot-module.json");
    if (moduleRoot.getParentDirectory() != installedRoot ||
        installRoot.getParentDirectory() != moduleRoot ||
        !storage::isSafeDirectory(moduleRoot, installedRoot) ||
        !storage::isSafeDirectory(installRoot, installedRoot) ||
        !storage::isSafeFile(manifestFile, installRoot) ||
        manifestFile.getSize() <= 0 || manifestFile.getSize() > kMaxManifestFileBytes) {
      module = makeInertModuleReference(persistedReference);
    } else {
      const auto manifestVar = juce::JSON::parse(manifestFile.loadFileAsString());
      std::string errorMessage;
      auto parsedModule = parseModuleManifestRecord(manifestVar, installRoot, errorMessage);
      if (!parsedModule.has_value() || parsedModule->id != persistedReference.id ||
          parsedModule->version != persistedReference.version) {
        module = makeInertModuleReference(persistedReference);
        appendBackendLog("module-store", "Ignored invalid installed manifest id=" + persistedReference.id +
                                             " error=" + errorMessage);
      } else {
        module = hydrateModuleRecordInternal(*parsedModule);
        const auto installedAt = object->getProperty("installedAt").toString().toStdString();
        const auto checksum = object->getProperty("checksum").toString().toStdString();
        if (installedAt.size() <= 64U) {
          module.installedAt = installedAt;
        }
        if (checksum.size() <= 128U) {
          module.checksum = checksum;
        }
      }
    }
    const auto existing = latestById.find(module.id);
    if (existing == latestById.end() || compareSemver(existing->second.version, module.version) < 0) {
      latestById[module.id] = module;
    }
  }

  std::vector<ModuleRecord> modules;
  modules.reserve(latestById.size());
  for (auto& [id, module] : latestById) {
    modules.push_back(std::move(module));
  }
  return modules;
}

bool ModuleStore::saveModule(const ModuleRecord& module) const {
  const auto modulesRoot = juce::File(modulesRootPath_);
  const auto registryRoot = juce::File(registryRootPath_);
  const auto installedRoot = juce::File(installedRootPath_);
  if (!storageRootsReady_ || !storeRootsAreSafe(modulesRoot, registryRoot, installedRoot) ||
      !isValidModuleId(module.id) ||
      module.name.empty() || module.name.size() > kMaxModuleNameBytes ||
      module.version.size() > kMaxModuleVersionBytes ||
      !isValidSemver(juce::String(module.version))) {
    return false;
  }

  ModuleRecord canonicalModule;
  if (const auto* factory = findTrustedFactoryModule(module.id, module.version); factory != nullptr) {
    canonicalModule = *factory;
  } else if (isReservedFactoryModuleId(module.id)) {
    return false;
  } else {
    const auto moduleRoot = installedRoot.getChildFile(module.id);
    const auto installRoot = moduleRoot.getChildFile(module.version);
    const auto manifestFile = installRoot.getChildFile("padpilot-module.json");
    if (moduleRoot.getParentDirectory() != installedRoot ||
        installRoot.getParentDirectory() != moduleRoot ||
        !storage::isSafeDirectory(moduleRoot, installedRoot) ||
        !storage::isSafeDirectory(installRoot, installedRoot) ||
        !storage::isSafeFile(manifestFile, installRoot) ||
        manifestFile.getSize() <= 0 || manifestFile.getSize() > kMaxManifestFileBytes) {
      return false;
    }
    std::string errorMessage;
    auto parsedModule = parseModuleManifestRecord(
        juce::JSON::parse(manifestFile.loadFileAsString()), installRoot, errorMessage);
    if (!parsedModule.has_value() || parsedModule->id != module.id || parsedModule->version != module.version) {
      appendBackendLog("module-store", "Refused registry write for invalid canonical manifest id=" + module.id +
                                           " error=" + errorMessage);
      return false;
    }
    canonicalModule = std::move(*parsedModule);
    if (module.installedAt.size() <= 64U) {
      canonicalModule.installedAt = module.installedAt;
    }
    if (module.checksum.size() <= 128U) {
      canonicalModule.checksum = module.checksum;
    }
  }

  juce::DynamicObject::Ptr object = new juce::DynamicObject();
  object->setProperty("id", juce::String(canonicalModule.id));
  object->setProperty("name", juce::String(canonicalModule.name));
  object->setProperty("version", juce::String(canonicalModule.version));
  object->setProperty("entryPath", juce::String(canonicalModule.entryPath));
  object->setProperty("scriptEntryPath", juce::String(canonicalModule.scriptEntryPath));
  object->setProperty("installRootPath", juce::String(canonicalModule.installRootPath));
  object->setProperty("manifestPath", juce::String(canonicalModule.manifestPath));
  object->setProperty("apiVersion", juce::String(canonicalModule.apiVersion));
  object->setProperty("checksum", juce::String(canonicalModule.checksum));
  object->setProperty("installedAt", juce::String(canonicalModule.installedAt));
  object->setProperty("capabilities", toVarArray(canonicalModule.capabilities));
  object->setProperty("loadStatus", juce::String(canonicalModule.loadStatus));
  object->setProperty("loadErrorMessage", juce::String(canonicalModule.loadErrorMessage));
  object->setProperty("expectedModuleVersion", juce::String(canonicalModule.expectedModuleVersion));
  object->setProperty("resolvedModuleVersion", juce::String(canonicalModule.resolvedModuleVersion));
  object->setProperty("stateSchemaVersion", static_cast<int>(canonicalModule.stateSchemaVersion));

  const juce::var root(object.get());
  const juce::String json = juce::JSON::toString(root, true);
  const juce::File target = registryRoot.getChildFile(buildRegistryFileName(canonicalModule));
  return target.getParentDirectory() == registryRoot &&
         replaceTextFileAtomically(target, registryRoot, json);
}

ModuleRecord ModuleStore::createDefaultModule(const std::string& name) const {
  const auto modulesRoot = juce::File(modulesRootPath_);
  const auto registryRoot = juce::File(registryRootPath_);
  const auto installedRoot = juce::File(installedRootPath_);
  if (!storageRootsReady_ || !storeRootsAreSafe(modulesRoot, registryRoot, installedRoot) ||
      name.size() > kMaxModuleNameBytes) {
    return {};
  }
  juce::InterProcessLock installLock(moduleStoreInstallLockName(modulesRoot));
  const juce::InterProcessLock::ScopedLockType installGuard(installLock);
  if (!installGuard.isLocked()) {
    appendBackendLog("module-store", "Could not acquire install lock for starter module");
    return {};
  }
  ModuleRecord module;
  module.name = name.empty() ? "New Module" : name;
  const auto existingModules = loadAllModules();
  auto baseId = sanitizeModuleId(juce::String(module.name));
  while (baseId.getNumBytesAsUTF8() > kMaximumModuleIdBytes - 24U && baseId.isNotEmpty()) {
    baseId = baseId.dropLastCharacters(1).trimCharactersAtEnd("-");
  }
  if (baseId.isEmpty()) {
    return {};
  }
  auto candidateId = baseId;
  const auto suffix = nowTimestampMs();
  const auto exists = [&existingModules, &installedRoot](const juce::String& candidate) {
    const bool registered = std::any_of(existingModules.begin(), existingModules.end(), [&candidate](const auto& record) {
      return juce::String(record.id) == candidate;
    });
    return registered || installedRoot.getChildFile(candidate).exists();
  };
  std::uint32_t collisionIndex = 0;
  while (exists(candidateId)) {
    candidateId = baseId + "-" + suffix;
    if (collisionIndex > 0) {
      candidateId << "-" << juce::String(collisionIndex);
    }
    ++collisionIndex;
  }

  module.id = candidateId.toStdString();
  module.version = "0.1.0";
  module.apiVersion = kModuleApiVersion;
  module.installedAt = suffix;
  module.loadStatus = kFactoryLoadStatus;
  module.capabilities = {"module-state", "script-runtime"};
  module.expectedModuleVersion = module.version;
  module.resolvedModuleVersion = module.version;
  module.stateSchemaVersion = 1;
  module.expectedStateSchemaVersion = 1;

  const auto moduleRoot = installedRoot.getChildFile(candidateId);
  const auto installRoot = moduleRoot.getChildFile(module.version);
  if (moduleRoot.getParentDirectory() != installedRoot ||
      installRoot.getParentDirectory() != moduleRoot ||
      !storage::ensureSafeDirectory(moduleRoot, installedRoot) ||
      !storage::ensureSafeDirectory(installRoot, installedRoot)) {
    appendBackendLog("module-store", "Could not create safe starter module directory id=" + module.id);
    return {};
  }
  module.installRootPath = installRoot.getFullPathName().toStdString();
  module.manifestPath = installRoot.getChildFile("padpilot-module.json").getFullPathName().toStdString();
  module.entryPath = buildModuleWebPath(candidateId, module.version, "ui/ui-entry.js").toStdString();
  module.scriptEntryPath = installRoot.getChildFile("script").getChildFile("module.js").getFullPathName().toStdString();
  if (!writeStarterBundle(installRoot, module) ||
      !storage::isSafeTree(installRoot, installedRoot, kMaxBundleEntries)) {
    removePath(installRoot, installedRoot);
    appendBackendLog("module-store", "Could not materialize starter module id=" + module.id);
    return {};
  }
  return module;
}

std::optional<ModuleRecord> ModuleStore::installBundle(const std::string& bundleArchivePath,
                                                       std::string& errorMessage) const {
  errorMessage.clear();
  const auto modulesRoot = juce::File(modulesRootPath_);
  const auto registryRoot = juce::File(registryRootPath_);
  const auto installedRoot = juce::File(installedRootPath_);
  if (!storageRootsReady_ || !storeRootsAreSafe(modulesRoot, registryRoot, installedRoot)) {
    errorMessage = "PadPilot module storage is unavailable or unsafe.";
    return std::nullopt;
  }
  juce::InterProcessLock installLock(moduleStoreInstallLockName(modulesRoot));
  const juce::InterProcessLock::ScopedLockType installGuard(installLock);
  if (!installGuard.isLocked()) {
    errorMessage = "PadPilot could not acquire the module install lock.";
    return std::nullopt;
  }
  const juce::File bundleArchive(bundleArchivePath);
  if (!bundleArchive.existsAsFile() || bundleArchive.getSize() <= 0 ||
      bundleArchive.getSize() > kMaxBundleArchiveBytes) {
    errorMessage = "Module bundle archive is missing, empty, or exceeds the size limit.";
    return std::nullopt;
  }

  juce::ZipFile archive(bundleArchive);
  if (!validateArchiveResourceBounds(archive, errorMessage)) {
    return std::nullopt;
  }

  const auto manifestVar = readManifestVarFromArchive(archive, errorMessage);
  if (!manifestVar.has_value()) {
    return std::nullopt;
  }

  const auto* manifest = manifestVar->getDynamicObject();
  if (manifest == nullptr) {
    errorMessage = "padpilot-module.json is invalid.";
    return std::nullopt;
  }

  const auto moduleId = manifest->getProperty("id").toString().trim();
  const auto version = manifest->getProperty("version").toString().trim();
  if (moduleId.isEmpty() || version.isEmpty()) {
    errorMessage = "Module manifest is missing id or version.";
    return std::nullopt;
  }

  const auto moduleRoot = installedRoot.getChildFile(moduleId);
  const auto installRoot = moduleRoot.getChildFile(version);
  auto parsedModule = parseInstalledModuleRecord(*manifestVar, bundleArchive, installRoot, errorMessage);
  if (!parsedModule.has_value()) {
    return std::nullopt;
  }
  if (isReservedFactoryModuleId(parsedModule->id)) {
    errorMessage = "Module bundle id is reserved for a PadPilot factory module.";
    return std::nullopt;
  }
  if (parsedModule->id != moduleId.toStdString() || parsedModule->version != version.toStdString() ||
      moduleRoot.getParentDirectory() != installedRoot ||
      installRoot.getParentDirectory() != moduleRoot ||
      !storage::isSameOrChildPath(installRoot, installedRoot)) {
    errorMessage = "Module bundle id or version does not resolve inside managed storage.";
    return std::nullopt;
  }

  if (!validateArchiveEntries(archive, *parsedModule, *manifestVar, errorMessage)) {
    return std::nullopt;
  }

  const auto stagingRoot = installedRoot.getChildFile(".staging");
  if (!storage::ensureSafeDirectory(stagingRoot, installedRoot)) {
    errorMessage = "PadPilot module staging storage is unavailable or unsafe.";
    return std::nullopt;
  }
  const auto transactionRoot = stagingRoot.getChildFile(
      "transaction--" + moduleId + "--" + version + "--" + juce::Uuid().toString());
  const auto stagingInstallRoot = transactionRoot.getChildFile("candidate");
  const auto cleanupTransaction = [&] { return removePath(transactionRoot, stagingRoot); };
  if (transactionRoot.getParentDirectory() != stagingRoot ||
      stagingInstallRoot.getParentDirectory() != transactionRoot ||
      !storage::ensureSafeDirectory(transactionRoot, stagingRoot) ||
      !storage::ensureSafeDirectory(stagingInstallRoot, transactionRoot)) {
    cleanupTransaction();
    errorMessage = "PadPilot could not create a staging directory for the module install.";
    return std::nullopt;
  }

  for (int index = 0; index < archive.getNumEntries(); ++index) {
    const auto* entry = archive.getEntry(index);
    if (entry == nullptr) {
      continue;
    }

    if (!storeRootsAreSafe(modulesRoot, registryRoot, installedRoot) ||
        !storage::isSafeDirectory(transactionRoot, stagingRoot) ||
        !storage::isSafeDirectory(stagingInstallRoot, transactionRoot)) {
      cleanupTransaction();
      errorMessage = "PadPilot stopped extraction because module staging became unsafe.";
      return std::nullopt;
    }
    const auto result = archive.uncompressEntry(index,
                                                stagingInstallRoot,
                                                juce::ZipFile::OverwriteFiles::yes,
                                                juce::ZipFile::FollowSymlinks::no);
    if (result.failed()) {
      cleanupTransaction();
      errorMessage = result.getErrorMessage().toStdString();
      return std::nullopt;
    }
    if (!storage::isSafeTree(stagingInstallRoot, transactionRoot, kMaxBundleEntries)) {
      cleanupTransaction();
      errorMessage = "Module extraction produced an unsafe staging tree.";
      return std::nullopt;
    }
  }

  const auto registryTarget = registryRoot.getChildFile(buildRegistryFileName(*parsedModule));
  if (registryTarget.getParentDirectory() != registryRoot ||
      !storage::isSafeFileTarget(registryTarget, registryRoot)) {
    cleanupTransaction();
    errorMessage = "PadPilot module registry path is not a writable file.";
    return std::nullopt;
  }

  InstallTransaction transaction;
  transaction.moduleId = moduleId;
  transaction.version = version;
  transaction.hadInstall = installRoot.exists();
  transaction.hadRegistry = registryTarget.existsAsFile();
  if ((transaction.hadInstall &&
       !storage::isSafeTree(installRoot, installedRoot, kMaxBundleEntries)) ||
      (transaction.hadRegistry && !storage::isSafeFile(registryTarget, registryRoot))) {
    cleanupTransaction();
    errorMessage = "PadPilot refused to replace an unsafe existing module path.";
    return std::nullopt;
  }
  const auto registryBackup = transactionRoot.getChildFile("registry-backup.json");
  if (transaction.hadRegistry &&
      (!storage::isSafeFileTarget(registryBackup, transactionRoot) ||
       !registryTarget.copyFileTo(registryBackup) ||
       !storage::isSafeFile(registryBackup, transactionRoot))) {
    cleanupTransaction();
    errorMessage = "PadPilot could not preserve the existing module registry entry.";
    return std::nullopt;
  }
  if (!writeInstallTransaction(transactionRoot, transaction)) {
    cleanupTransaction();
    errorMessage = "PadPilot could not prepare the module install transaction.";
    return std::nullopt;
  }

  if (!storage::ensureSafeDirectory(moduleRoot, installedRoot)) {
    cleanupTransaction();
    errorMessage = "PadPilot module destination became unavailable or unsafe.";
    return std::nullopt;
  }
  const auto backupInstallRoot = transactionRoot.getChildFile("install-backup");
  if (transaction.hadInstall) {
    if (backupInstallRoot.exists() || storage::hasReparsePointInPath(backupInstallRoot) ||
        !storage::isSafeTree(installRoot, installedRoot, kMaxBundleEntries) ||
        !installRoot.moveFileTo(backupInstallRoot)) {
      cleanupTransaction();
      errorMessage = "PadPilot could not preserve the existing module before update.";
      appendBackendLog("module-store", "Module update backup failed id=" + moduleId.toStdString() +
                                           " version=" + version.toStdString());
      return std::nullopt;
    }
    if (!storage::isSafeTree(backupInstallRoot, transactionRoot, kMaxBundleEntries)) {
      errorMessage = "PadPilot stopped the update because the module backup became unsafe.";
      appendBackendLog("module-store", "Module update backup became unsafe id=" + moduleId.toStdString());
      return std::nullopt;
    }
  }

  if (!storage::isSafeTree(stagingInstallRoot, transactionRoot, kMaxBundleEntries) ||
      installRoot.exists() || storage::hasReparsePointInPath(installRoot) ||
      !storage::isSafeDirectory(moduleRoot, installedRoot) ||
      !stagingInstallRoot.moveFileTo(installRoot) ||
      !storage::isSafeTree(installRoot, installedRoot, kMaxBundleEntries)) {
    const bool rollbackSucceeded = recoverInstallTransaction(
        transactionRoot, installedRoot, registryRoot);
    if (!rollbackSucceeded) {
      errorMessage = "PadPilot could not finalize the installed module bundle or restore the previous version.";
    } else if (transaction.hadInstall) {
      errorMessage = "PadPilot could not finalize the installed module bundle. The previous version was restored.";
    } else {
      errorMessage = "PadPilot could not finalize the installed module bundle. No existing install was changed.";
    }
    appendBackendLog("module-store", "Module update finalize failed id=" + moduleId.toStdString() +
                                         " rollback=" + std::string(rollbackSucceeded ? "true" : "false"));
    return std::nullopt;
  }

  parsedModule->installRootPath = installRoot.getFullPathName().toStdString();
  parsedModule->manifestPath = installRoot.getChildFile("padpilot-module.json").getFullPathName().toStdString();

  const auto uiEntry = manifest->getProperty("uiEntry").toString().trim();
  const auto scriptEntry = manifest->getProperty("scriptEntry").toString().trim();
  parsedModule->entryPath = buildModuleWebPath(moduleId, version, uiEntry).toStdString();
  parsedModule->scriptEntryPath.clear();
  if (scriptEntry.isNotEmpty()) {
    parsedModule->scriptEntryPath =
        installRoot.getChildFile(normalizeBundleRelativePath(scriptEntry)).getFullPathName().toStdString();
  }

  if (!saveModule(*parsedModule)) {
    const bool rollbackSucceeded = recoverInstallTransaction(
        transactionRoot, installedRoot, registryRoot);
    if (!rollbackSucceeded) {
      errorMessage = "PadPilot could not write the module registry entry or roll back the install.";
    } else if (transaction.hadInstall) {
      errorMessage = "PadPilot could not write the module registry entry. The previous version was restored.";
    } else {
      errorMessage = "PadPilot could not write the module registry entry. The new install was removed.";
    }
    appendBackendLog("module-store", "Module registry update failed id=" + moduleId.toStdString() +
                                         " rollback=" + std::string(rollbackSucceeded ? "true" : "false"));
    return std::nullopt;
  }

  transaction.committed = true;
  if (!writeInstallTransaction(transactionRoot, transaction)) {
    const bool rollbackSucceeded = recoverInstallTransaction(
        transactionRoot, installedRoot, registryRoot);
    errorMessage = rollbackSucceeded
                       ? "PadPilot could not commit the module install. The previous version was restored."
                       : "PadPilot could not commit or roll back the module install.";
    return std::nullopt;
  }
  if (!cleanupTransaction()) {
    appendBackendLog("module-store", "Committed module install cleanup deferred path=" +
                                         transactionRoot.getFullPathName().toStdString());
  }
  appendBackendLog("module-store", "Module bundle installed id=" + moduleId.toStdString() +
                                       " version=" + version.toStdString());

  return parsedModule;
}

ModuleRecord ModuleStore::hydrateModuleRecord(const ModuleRecord& module) const {
  return restorePersistedModuleReference(module, loadAllModules());
}

ModuleRecord ModuleStore::restorePersistedModuleReference(
    const ModuleRecord& persistedModule,
    const std::vector<ModuleRecord>& installedModules) const {
  if (!isValidPersistedModuleId(persistedModule.id)) {
    return {};
  }

  const auto installed = std::find_if(
      installedModules.begin(),
      installedModules.end(),
      [&persistedModule](const auto& module) { return module.id == persistedModule.id; });
  if (installed == installedModules.end()) {
    return makeInertModuleReference(persistedModule);
  }

  if (installed->loadStatus != kFactoryLoadStatus) {
    return makeInertModuleReference(persistedModule, &*installed);
  }

  auto restored = *installed;
  restored.expectedModuleVersion = persistedModuleVersionOrFallback(persistedModule.version, installed->version);
  restored.resolvedModuleVersion = installed->version;
  restored.expectedStateSchemaVersion = 0;
  const auto persistedVersion = juce::String(restored.expectedModuleVersion);
  const auto installedRoot = juce::File(installedRootPath_);
  const auto sourceManifest = installedRoot
                                  .getChildFile(juce::String(restored.id))
                                  .getChildFile(persistedVersion)
                                  .getChildFile("padpilot-module.json");
  if (storageRootsReady_ && storage::isSafeFile(sourceManifest, installedRoot) &&
      sourceManifest.getSize() > 0 && sourceManifest.getSize() <= kMaxManifestFileBytes) {
    const auto sourceManifestVar = juce::JSON::parse(sourceManifest.loadFileAsString());
    if (const auto* sourceObject = sourceManifestVar.getDynamicObject(); sourceObject != nullptr &&
        sourceObject->getProperty("id").toString().trim().toStdString() == restored.id &&
        sourceObject->getProperty("version").toString().trim() == persistedVersion) {
      const auto sourceSchema = parseModuleStateSchemaVersion(
          sourceObject->getProperty("stateSchemaVersion"));
      if (sourceSchema.has_value()) {
        restored.expectedStateSchemaVersion = *sourceSchema;
      }
    }
  }
  if (restored.expectedModuleVersion == restored.resolvedModuleVersion &&
      restored.expectedStateSchemaVersion == 0) {
    restored.expectedStateSchemaVersion = restored.stateSchemaVersion;
  }
  return restored;
}

std::optional<std::string> ModuleStore::resolveWebResourcePath(const std::string& webPath) const {
  constexpr std::string_view prefix = "/__padpilot/modules/";
  const auto modulesRoot = juce::File(modulesRootPath_);
  const auto registryRoot = juce::File(registryRootPath_);
  const auto installedRoot = juce::File(installedRootPath_);
  if (!storageRootsReady_ || !storeRootsAreSafe(modulesRoot, registryRoot, installedRoot) ||
      !webPath.starts_with(prefix) ||
      webPath.size() > prefix.size() + kMaximumModuleIdBytes + kMaxModuleVersionBytes +
                           kMaxManifestEntryPathBytes + 2U) {
    return std::nullopt;
  }

  const auto moduleIdEnd = webPath.find('/', prefix.size());
  const auto versionEnd = moduleIdEnd == std::string::npos
                              ? std::string::npos
                              : webPath.find('/', moduleIdEnd + 1U);
  if (moduleIdEnd == std::string::npos || versionEnd == std::string::npos ||
      moduleIdEnd == prefix.size() || versionEnd == moduleIdEnd + 1U ||
      versionEnd + 1U >= webPath.size()) {
    return std::nullopt;
  }

  const auto moduleId = webPath.substr(prefix.size(), moduleIdEnd - prefix.size());
  const auto version = webPath.substr(moduleIdEnd + 1U, versionEnd - moduleIdEnd - 1U);
  const auto relativePath = juce::String::fromUTF8(
      webPath.data() + versionEnd + 1U,
      static_cast<int>(webPath.size() - versionEnd - 1U));
  if (!isValidPersistedModuleId(moduleId) || version.size() > kMaxModuleVersionBytes ||
      !isValidSemver(juce::String(version)) || !isSafeBundleRelativePath(relativePath)) {
    return std::nullopt;
  }

  const auto moduleRoot = installedRoot.getChildFile(juce::String(moduleId));
  const auto installRoot = moduleRoot.getChildFile(juce::String(version));
  if (moduleRoot.getParentDirectory() != installedRoot ||
      installRoot.getParentDirectory() != moduleRoot ||
      !storage::isSafeDirectory(moduleRoot, installedRoot) ||
      !storage::isSafeDirectory(installRoot, installedRoot)) {
    return std::nullopt;
  }

  const auto installedModules = loadAllModules();
  const auto registeredModule = std::find_if(
      installedModules.begin(), installedModules.end(), [&](const auto& module) {
        return module.id == moduleId && module.version == version && module.loadStatus == kFactoryLoadStatus &&
               juce::File(module.installRootPath) == installRoot;
      });
  if (registeredModule == installedModules.end()) {
    return std::nullopt;
  }

  auto resolved = installRoot;
  const auto segments = juce::StringArray::fromTokens(normalizeBundleRelativePath(relativePath), "/", {});
  for (const auto& segment : segments) {
    resolved = resolved.getChildFile(segment);
    if (storage::hasReparsePointInPath(resolved)) {
      return std::nullopt;
    }
  }
  if (!storage::isSafeFile(resolved, installRoot) || !resolved.isAChildOf(installRoot)) {
    return std::nullopt;
  }

  return resolved.getFullPathName().toStdString();
}

std::string ModuleStore::getModulesRootPath() const {
  return modulesRootPath_;
}

}  // namespace padpilot

