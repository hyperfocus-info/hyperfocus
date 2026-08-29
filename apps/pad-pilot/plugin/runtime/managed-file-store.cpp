#include "runtime/managed-file-store.h"

#include <algorithm>
#include <array>
#include <cstdio>

#include <xxhash.h>

#include "runtime/backend-log.h"
#include "runtime/storage-path-safety.h"

namespace {
constexpr const char* kSampleCategory = "sample";
constexpr const char* kImpulseResponseCategory = "impulse-response";

std::string normalizeExtension(const std::string& sourceName) {
  return juce::File(sourceName).getFileExtension().toLowerCase().toStdString();
}

bool isSupportedSampleExtension(const std::string& extension) {
  static constexpr std::array<const char*, 6> kSupportedExtensions {
      ".wav",
      ".aif",
      ".aiff",
      ".flac",
      ".mp3",
      ".ogg",
  };
  return std::find(kSupportedExtensions.begin(), kSupportedExtensions.end(), extension) != kSupportedExtensions.end();
}

std::string guessMimeType(const std::string& extension) {
  if (extension == ".wav") return "audio/wav";
  if (extension == ".aif" || extension == ".aiff") return "audio/aiff";
  if (extension == ".flac") return "audio/flac";
  if (extension == ".mp3") return "audio/mpeg";
  if (extension == ".ogg") return "audio/ogg";
  return "application/octet-stream";
}

std::string hashBytes(const void* data, std::size_t size) {
  const auto hash = XXH3_128bits(data, size);
  char buffer[33] {};
  std::snprintf(buffer,
                sizeof(buffer),
                "%016llx%016llx",
                static_cast<unsigned long long>(hash.high64),
                static_cast<unsigned long long>(hash.low64));
  return std::string(buffer);
}

bool loadFileBounded(const juce::File& source,
                     const std::uint64_t maximumBytes,
                     juce::MemoryBlock& destination) {
  const auto declaredSize = source.getSize();
  if (declaredSize < 0 || static_cast<std::uint64_t>(declaredSize) > maximumBytes) {
    return false;
  }
  auto input = source.createInputStream();
  if (input == nullptr || !input->openedOk()) {
    return false;
  }

  destination.setSize(static_cast<std::size_t>(declaredSize), false);
  std::size_t offset = 0;
  while (offset < destination.getSize()) {
    const auto chunkSize = static_cast<int>(std::min<std::size_t>(64U * 1024U, destination.getSize() - offset));
    const auto read = input->read(static_cast<char*>(destination.getData()) + offset, chunkSize);
    if (read <= 0) {
      destination.reset();
      return false;
    }
    offset += static_cast<std::size_t>(read);
  }

  char extraByte {};
  if (input->read(&extraByte, 1) != 0) {
    destination.reset();
    return false;
  }
  return true;
}
}  // namespace

namespace padpilot {

ManagedFileStore::ManagedFileStore(std::string rootPath)
    : root_(rootPath.empty()
                ? juce::File::getSpecialLocation(juce::File::userApplicationDataDirectory)
                      .getChildFile("PadPilot")
                      .getChildFile("media")
                : juce::File(rootPath)) {
  storageRootReady_ = storage::ensureSafeDirectory(root_, root_) &&
                      storage::ensureSafeDirectory(root_.getChildFile("samples"), root_) &&
                      storage::ensureSafeDirectory(root_.getChildFile("impulse-responses"), root_);
  appendBackendLog("managed-file-store",
                   std::string(storageRootReady_ ? "initialized" : "rejected unsafe") +
                       " root=" + root_.getFullPathName().toStdString());
}

std::optional<ManagedFileRecord> ManagedFileStore::importSampleBytes(const void* data,
                                                                     std::size_t size,
                                                                     const std::string& sourceName,
                                                                     const std::string& mimeType,
                                                                     std::uint64_t maxBytes,
                                                                     std::string& errorMessage) const {
  return importBytes(kSampleCategory, data, size, sourceName, mimeType, maxBytes, errorMessage);
}

std::optional<ManagedFileRecord> ManagedFileStore::importImpulseResponseBytes(
    const void* data,
    std::size_t size,
    const std::string& sourceName,
    const std::string& mimeType,
    std::uint64_t maxBytes,
    std::string& errorMessage) const {
  return importBytes(kImpulseResponseCategory, data, size, sourceName, mimeType, maxBytes, errorMessage);
}

std::optional<ManagedFileRecord> ManagedFileStore::importBytes(const std::string& category,
                                                               const void* data,
                                                               std::size_t size,
                                                               const std::string& sourceName,
                                                               const std::string& mimeType,
                                                               std::uint64_t maxBytes,
                                                               std::string& errorMessage) const {
  if (!storageRootReady_ || !storage::isSafeDirectory(root_, root_)) {
    errorMessage = "PadPilot managed sample storage is unavailable.";
    return std::nullopt;
  }
  if (data == nullptr || size == 0) {
    errorMessage = "Imported sample is empty.";
    appendBackendLog("managed-file-store", "importSampleBytes rejected empty payload");
    return std::nullopt;
  }
  const auto effectiveMaxBytes = std::min(maxBytes, kDefaultMaxImportBytes);
  if (size > effectiveMaxBytes) {
    errorMessage = "Imported sample exceeds the 25 MiB limit.";
    appendBackendLog("managed-file-store", "importSampleBytes rejected size=" + std::to_string(size));
    return std::nullopt;
  }

  const auto safeSourceName = juce::File(sourceName).getFileName().toStdString();
  const auto extension = normalizeExtension(safeSourceName);
  if (!isSupportedSampleExtension(extension)) {
    errorMessage = "Unsupported sample format. Recut accepts wav, aif, aiff, flac, mp3, and ogg.";
    appendBackendLog("managed-file-store", "importSampleBytes rejected unsupported extension name=" + safeSourceName);
    return std::nullopt;
  }

  const auto contentId = hashBytes(data, size);
  const auto managedPath = buildManagedPath(category, contentId, safeSourceName);
  if (managedPath.empty()) {
    errorMessage = "PadPilot managed sample storage is unavailable.";
    return std::nullopt;
  }
  const auto managedFile = juce::File(managedPath);
  const auto managedRoot = category == kSampleCategory ? sampleRoot() : impulseResponseRoot();
  if (!isManagedPath(managedFile)) {
    errorMessage = "PadPilot refused an unsafe managed sample path.";
    return std::nullopt;
  }
  bool shouldWrite = !managedFile.existsAsFile();
  if (!shouldWrite) {
    if (!storage::isSafeFile(managedFile, managedRoot) ||
        managedFile.getSize() != static_cast<juce::int64>(size)) {
      shouldWrite = true;
    } else {
      juce::MemoryBlock existingData;
      shouldWrite = !loadFileBounded(managedFile, size, existingData) ||
          existingData.getSize() != size ||
          hashBytes(existingData.getData(), existingData.getSize()) != contentId;
    }
  }
  if (shouldWrite) {
    if (!storage::isSafeFileTarget(managedFile, managedRoot) ||
        !storage::replaceFileAtomically(managedFile, managedRoot, data, size)) {
      errorMessage = "PadPilot could not write the imported sample into managed storage.";
      appendBackendLog("managed-file-store", "importSampleBytes write failed path=" + managedPath);
      return std::nullopt;
    }
  }

  appendBackendLog(
      "managed-file-store",
      "importSampleBytes success name=" + safeSourceName +
          " size=" + std::to_string(size) +
          " contentId=" + contentId +
          " path=" + managedPath);

  ManagedFileRecord record;
  record.category = category;
  record.byteSize = static_cast<std::uint64_t>(size);
  record.contentId = contentId;
  record.managedPath = managedPath;
  record.mimeType = mimeType.empty() ? guessMimeType(extension) : mimeType;
  record.sourceName = safeSourceName;
  return record;
}

std::optional<ManagedFileRecord> ManagedFileStore::importSampleFile(const juce::File& source,
                                                                    std::uint64_t maxBytes,
                                                                    std::string& errorMessage) const {
  return importFile(kSampleCategory, source, maxBytes, errorMessage);
}

std::optional<ManagedFileRecord> ManagedFileStore::importImpulseResponseFile(
    const juce::File& source,
    std::uint64_t maxBytes,
    std::string& errorMessage) const {
  return importFile(kImpulseResponseCategory, source, maxBytes, errorMessage);
}

std::optional<ManagedFileRecord> ManagedFileStore::importFile(const std::string& category,
                                                              const juce::File& source,
                                                              std::uint64_t maxBytes,
                                                              std::string& errorMessage) const {
  if (!source.existsAsFile()) {
    errorMessage = "Sample file does not exist.";
    appendBackendLog("managed-file-store", "importSampleFile missing path=" + source.getFullPathName().toStdString());
    return std::nullopt;
  }
  const auto size = source.getSize();
  if (size <= 0) {
    errorMessage = "Imported sample is empty.";
    appendBackendLog("managed-file-store", "importSampleFile rejected empty path=" + source.getFullPathName().toStdString());
    return std::nullopt;
  }
  const auto effectiveMaxBytes = std::min(maxBytes, kDefaultMaxImportBytes);
  if (static_cast<std::uint64_t>(size) > effectiveMaxBytes) {
    errorMessage = "Imported sample exceeds the 25 MiB limit.";
    appendBackendLog("managed-file-store", "importSampleFile rejected oversize path=" + source.getFullPathName().toStdString());
    return std::nullopt;
  }

  juce::MemoryBlock data;
  if (!loadFileBounded(source, effectiveMaxBytes, data)) {
    errorMessage = "PadPilot could not read the selected sample file.";
    appendBackendLog("managed-file-store", "importSampleFile read failed path=" + source.getFullPathName().toStdString());
    return std::nullopt;
  }
  appendBackendLog("managed-file-store", "importSampleFile read source path=" + source.getFullPathName().toStdString());
  return importBytes(category,
                     data.getData(),
                     static_cast<std::size_t>(data.getSize()),
                     source.getFileName().toStdString(),
                     guessMimeType(source.getFileExtension().toLowerCase().toStdString()),
                     maxBytes,
                     errorMessage);
}

bool ManagedFileStore::loadManagedFileBytes(const std::string& managedPath,
                                            std::string* bytes,
                                            std::string& errorMessage) const {
  if (bytes == nullptr) {
    errorMessage = "Managed media destination is missing.";
    appendBackendLog("managed-file-store", "loadManagedFileBytes missing destination");
    return false;
  }

  const auto file = juce::File(managedPath);
  const auto managedRoot = file.getParentDirectory() == sampleRoot()
                               ? sampleRoot()
                               : file.getParentDirectory() == impulseResponseRoot()
                                     ? impulseResponseRoot()
                                     : juce::File {};
  if (!isManagedPath(file) || !storage::isSafeFile(file, managedRoot)) {
    errorMessage = "Managed sample path is unavailable.";
    appendBackendLog("managed-file-store", "loadManagedFileBytes unavailable path=" + managedPath);
    return false;
  }
  if (static_cast<std::uint64_t>(file.getSize()) > kDefaultMaxImportBytes) {
    errorMessage = "Managed sample exceeds the 25 MiB limit.";
    appendBackendLog("managed-file-store", "loadManagedFileBytes rejected oversize path=" + managedPath);
    return false;
  }

  juce::MemoryBlock data;
  if (!loadFileBounded(file, kDefaultMaxImportBytes, data)) {
    errorMessage = "PadPilot could not read managed sample bytes.";
    appendBackendLog("managed-file-store", "loadManagedFileBytes read failed path=" + managedPath);
    return false;
  }
  const auto expectedContentId = file.getFileNameWithoutExtension().toStdString();
  if (hashBytes(data.getData(), data.getSize()) != expectedContentId) {
    errorMessage = "Managed sample bytes do not match their content ID.";
    appendBackendLog("managed-file-store", "loadManagedFileBytes rejected content mismatch path=" + managedPath);
    return false;
  }
  appendBackendLog("managed-file-store", "loadManagedFileBytes success path=" + managedPath);
  bytes->assign(static_cast<const char*>(data.getData()), static_cast<std::size_t>(data.getSize()));
  return true;
}

bool ManagedFileStore::healManagedFile(const std::string& managedPath,
                                       const std::string& payload,
                                       std::string& errorMessage) const {
  const auto file = juce::File(managedPath);
  const auto managedRoot = file.getParentDirectory() == sampleRoot()
                               ? sampleRoot()
                               : file.getParentDirectory() == impulseResponseRoot()
                                     ? impulseResponseRoot()
                                     : juce::File {};
  if (!isManagedPath(file) || !storage::isSafeFileTarget(file, managedRoot)) {
    errorMessage = "Managed sample path is outside the PadPilot media store.";
    appendBackendLog("managed-file-store", "healManagedFile rejected non-managed path=" + managedPath);
    return false;
  }
  if (payload.empty()) {
    errorMessage = "Managed sample payload is empty.";
    appendBackendLog("managed-file-store", "healManagedFile rejected empty payload path=" + managedPath);
    return false;
  }
  if (payload.size() > kDefaultMaxImportBytes) {
    errorMessage = "Managed sample payload exceeds the 25 MiB limit.";
    appendBackendLog("managed-file-store", "healManagedFile rejected oversize path=" + managedPath);
    return false;
  }
  const auto expectedContentId = file.getFileNameWithoutExtension().toStdString();
  if (!isValidContentId(expectedContentId) || hashBytes(payload.data(), payload.size()) != expectedContentId) {
    errorMessage = "Managed sample payload does not match its content ID.";
    appendBackendLog("managed-file-store", "healManagedFile rejected content mismatch path=" + managedPath);
    return false;
  }
  if (file.existsAsFile()) {
    juce::MemoryBlock existingData;
    if (static_cast<std::uint64_t>(file.getSize()) <= kDefaultMaxImportBytes &&
        loadFileBounded(file, kDefaultMaxImportBytes, existingData) &&
        hashBytes(existingData.getData(), existingData.getSize()) == expectedContentId) {
      appendBackendLog("managed-file-store", "healManagedFile skipped valid existing path=" + managedPath);
      return true;
    }
    appendBackendLog("managed-file-store", "healManagedFile replacing corrupt cache path=" + managedPath);
  }
  if (!storage::isSafeFileTarget(file, managedRoot) ||
      !storage::replaceFileAtomically(file, managedRoot, payload.data(), payload.size())) {
    errorMessage = "PadPilot could not heal the managed sample cache.";
    appendBackendLog("managed-file-store", "healManagedFile write failed path=" + managedPath);
    return false;
  }
  appendBackendLog("managed-file-store", "healManagedFile success path=" + managedPath);
  return true;
}

std::string ManagedFileStore::resolveManagedSamplePath(const std::string& contentId,
                                                       const std::string& sourceName) const {
  return buildManagedPath(kSampleCategory, contentId, sourceName);
}

std::string ManagedFileStore::resolveManagedImpulseResponsePath(const std::string& contentId,
                                                                const std::string& sourceName) const {
  return buildManagedPath(kImpulseResponseCategory, contentId, sourceName);
}

bool ManagedFileStore::isManagedImpulseResponse(const std::string& managedPath,
                                                const std::string& contentId,
                                                const std::string& sourceName) const {
  if (!isValidContentId(contentId) || !isSupportedSampleName(sourceName)) {
    return false;
  }
  const auto expected = resolveManagedImpulseResponsePath(contentId, sourceName);
  const auto file = juce::File(managedPath);
  if (expected.empty() || file != juce::File(expected) || !isManagedPath(file) ||
      !storage::isSafeFile(file, impulseResponseRoot()) || file.getSize() <= 0 ||
      static_cast<std::uint64_t>(file.getSize()) > kDefaultMaxImportBytes) {
    return false;
  }
  std::string bytes;
  std::string errorMessage;
  return loadManagedFileBytes(managedPath, &bytes, errorMessage);
}

bool ManagedFileStore::isSupportedSampleName(const std::string& sourceName) {
  return isSupportedSampleExtension(normalizeExtension(sourceName));
}

bool ManagedFileStore::isValidContentId(const std::string& contentId) {
  return contentId.size() == 32 && std::all_of(contentId.begin(), contentId.end(), [](unsigned char character) {
    return (character >= '0' && character <= '9') || (character >= 'a' && character <= 'f');
  });
}

juce::File ManagedFileStore::sampleRoot() const {
  const auto samples = root_.getChildFile("samples");
  if (!storageRootReady_ || !storage::isSafeDirectory(root_, root_) ||
      !storage::ensureSafeDirectory(samples, root_)) {
    return {};
  }
  return samples;
}

juce::File ManagedFileStore::impulseResponseRoot() const {
  const auto responses = root_.getChildFile("impulse-responses");
  if (!storageRootReady_ || !storage::isSafeDirectory(root_, root_) ||
      !storage::ensureSafeDirectory(responses, root_)) {
    return {};
  }
  return responses;
}

bool ManagedFileStore::isManagedPath(const juce::File& file) const {
  const auto parent = file.getParentDirectory();
  const auto samples = sampleRoot();
  const auto responses = impulseResponseRoot();
  const auto managedRoot = parent == samples ? samples : parent == responses ? responses : juce::File {};
  return managedRoot != juce::File {} && storage::isSafeDirectory(managedRoot, root_) &&
         storage::isSafeFileTarget(file, managedRoot) &&
         isSupportedSampleName(file.getFileName().toStdString()) &&
         isValidContentId(file.getFileNameWithoutExtension().toStdString());
}

std::string ManagedFileStore::buildManagedPath(const std::string& category,
                                               const std::string& contentId,
                                               const std::string& sourceName) const {
  const auto extension = normalizeExtension(sourceName);
  if (!isValidContentId(contentId) || !isSupportedSampleExtension(extension)) {
    appendBackendLog(
        "managed-file-store",
        "buildManagedPath rejected contentId=" + contentId + " sourceName=" + sourceName);
    return {};
  }
  const auto managedRoot = category == kSampleCategory
                               ? sampleRoot()
                               : category == kImpulseResponseCategory ? impulseResponseRoot() : juce::File {};
  if (managedRoot == juce::File {}) {
    return {};
  }
  const auto target = managedRoot.getChildFile(contentId + extension);
  return storage::isSafeFileTarget(target, managedRoot)
             ? storage::toPortableSerializedPath(target.getFullPathName().toStdString())
             : std::string {};
}

}  // namespace padpilot
