#include "plugin-update-security.h"

namespace padpilot::updater::security {
std::optional<juce::String> readBoundedTextFile(const juce::File& file, juce::int64 maximumBytes,
                                                const juce::String& description, juce::String& errorMessage) {
  if (maximumBytes <= 0 || maximumBytes > INT_MAX) {
    errorMessage = description + " had an invalid read limit.";
    return std::nullopt;
  }

  juce::FileInputStream input(file);
  if (!input.openedOk()) {
    errorMessage = description + " was missing or unreadable.";
    return std::nullopt;
  }
  const auto size = input.getTotalLength();
  if (size <= 0 || size > maximumBytes) {
    errorMessage = description + " was empty or exceeded its permitted size.";
    return std::nullopt;
  }

  juce::MemoryBlock bytes(static_cast<std::size_t>(size), true);
  const auto bytesRead = input.read(bytes.getData(), static_cast<int>(size));
  if (bytesRead != size || !input.isExhausted()) {
    errorMessage = description + " changed or could not be read completely.";
    return std::nullopt;
  }
  if (std::memchr(bytes.getData(), '\0', static_cast<std::size_t>(bytesRead)) != nullptr) {
    errorMessage = description + " contained invalid text data.";
    return std::nullopt;
  }
  return juce::String::fromUTF8(static_cast<const char*>(bytes.getData()), bytesRead);
}

RecoveryAction chooseRecoveryAction(bool installExists, bool backupExists, const juce::String& journalPhase,
                                    bool installedBundleVerified) {
  const auto commitRecorded =
      journalPhase == "installed" || journalPhase == "complete" || (backupExists && journalPhase == "backup_moved");
  if (installExists && commitRecorded) {
    if (installedBundleVerified) {
      return RecoveryAction::finalizeInstalled;
    }
    return backupExists ? RecoveryAction::restoreBackup : RecoveryAction::fail;
  }
  if (installExists || backupExists) {
    return RecoveryAction::continueApply;
  }
  return RecoveryAction::fail;
}

bool isAsciiDigit(juce::juce_wchar character) { return character >= '0' && character <= '9'; }

bool isIdentifier(const juce::String& value, bool rejectNumericLeadingZero) {
  if (value.isEmpty()) {
    return false;
  }
  bool numeric = true;
  for (int index = 0; index < value.length(); index += 1) {
    const auto character = value[index];
    if (!(isAsciiDigit(character) || (character >= 'A' && character <= 'Z') || (character >= 'a' && character <= 'z') ||
          character == '-')) {
      return false;
    }
    numeric = numeric && isAsciiDigit(character);
  }
  return !(rejectNumericLeadingZero && numeric && value.length() > 1 && value.startsWithChar('0'));
}

bool parseUnsigned(const juce::String& value, std::uint64_t& result) {
  if (value.isEmpty() || (value.length() > 1 && value.startsWithChar('0'))) {
    return false;
  }
  std::uint64_t parsed = 0;
  for (int index = 0; index < value.length(); index += 1) {
    if (!isAsciiDigit(value[index])) {
      return false;
    }
    const auto digit = static_cast<std::uint64_t>(value[index] - '0');
    if (parsed > (UINT64_MAX - digit) / 10) {
      return false;
    }
    parsed = parsed * 10 + digit;
  }
  result = parsed;
  return true;
}

ParsedSemVer parseStrictSemanticVersion(const juce::String& value) {
  ParsedSemVer parsed;
  if (value.isEmpty() || value.length() > 128 || value != value.trim() || value.startsWithChar('v')) {
    return parsed;
  }

  const auto plus = value.indexOfChar('+');
  if (plus == value.length() - 1 || (plus >= 0 && value.indexOfChar(plus + 1, '+') >= 0)) {
    return parsed;
  }
  const auto withoutBuild = plus >= 0 ? value.substring(0, plus) : value;
  const auto build = plus >= 0 ? value.substring(plus + 1) : juce::String();
  if (build.isNotEmpty()) {
    const auto identifiers = juce::StringArray::fromTokens(build, ".", "");
    if (identifiers.isEmpty()) {
      return parsed;
    }
    for (const auto& identifier : identifiers) {
      if (!isIdentifier(identifier, false)) {
        return parsed;
      }
    }
  }

  const auto dash = withoutBuild.indexOfChar('-');
  const auto core = dash >= 0 ? withoutBuild.substring(0, dash) : withoutBuild;
  const auto prerelease = dash >= 0 ? withoutBuild.substring(dash + 1) : juce::String();
  const auto coreParts = juce::StringArray::fromTokens(core, ".", "");
  if (core.startsWithChar('.') || core.endsWithChar('.') || core.contains("..") || coreParts.size() != 3) {
    return parsed;
  }
  for (int index = 0; index < coreParts.size(); index += 1) {
    if (!parseUnsigned(coreParts[index], parsed.core[static_cast<size_t>(index)])) {
      return parsed;
    }
  }
  if (dash >= 0) {
    const auto identifiers = juce::StringArray::fromTokens(prerelease, ".", "");
    if (identifiers.isEmpty()) {
      return parsed;
    }
    for (const auto& identifier : identifiers) {
      if (!isIdentifier(identifier, true)) {
        return parsed;
      }
      parsed.prerelease.push_back(identifier);
    }
  }
  parsed.valid = true;
  return parsed;
}

bool isStrictSemanticVersion(const juce::String& value) { return parseStrictSemanticVersion(value).valid; }

int compareNumericIdentifier(const juce::String& left, const juce::String& right) {
  if (left.length() != right.length()) {
    return left.length() > right.length() ? 1 : -1;
  }
  return left.compare(right);
}

int compareStrictSemanticVersions(const juce::String& left, const juce::String& right) {
  const auto parsedLeft = parseStrictSemanticVersion(left);
  const auto parsedRight = parseStrictSemanticVersion(right);
  if (!parsedLeft.valid || !parsedRight.valid) {
    return left.compare(right);
  }
  for (size_t index = 0; index < parsedLeft.core.size(); index += 1) {
    if (parsedLeft.core[index] != parsedRight.core[index]) {
      return parsedLeft.core[index] > parsedRight.core[index] ? 1 : -1;
    }
  }
  if (parsedLeft.prerelease.empty() || parsedRight.prerelease.empty()) {
    if (parsedLeft.prerelease.empty() && parsedRight.prerelease.empty()) {
      return 0;
    }
    return parsedLeft.prerelease.empty() ? 1 : -1;
  }
  const auto count = std::max(parsedLeft.prerelease.size(), parsedRight.prerelease.size());
  for (size_t index = 0; index < count; index += 1) {
    if (index >= parsedLeft.prerelease.size()) {
      return -1;
    }
    if (index >= parsedRight.prerelease.size()) {
      return 1;
    }
    const auto& a = parsedLeft.prerelease[index];
    const auto& b = parsedRight.prerelease[index];
    const bool aNumeric = std::all_of(a.begin(), a.end(), isAsciiDigit);
    const bool bNumeric = std::all_of(b.begin(), b.end(), isAsciiDigit);
    int compared = 0;
    if (aNumeric && bNumeric) {
      compared = compareNumericIdentifier(a, b);
    } else if (aNumeric != bNumeric) {
      compared = aNumeric ? -1 : 1;
    } else {
      compared = a.compare(b);
    }
    if (compared != 0) {
      return compared;
    }
  }
  return 0;
}

bool isSha256(const juce::String& value) {
  if (value.length() != 64) {
    return false;
  }
  for (int index = 0; index < value.length(); index += 1) {
    const auto character = value[index];
    if (!(isAsciiDigit(character) || (character >= 'a' && character <= 'f') ||
          (character >= 'A' && character <= 'F'))) {
      return false;
    }
  }
  return true;
}

bool isReservedWindowsName(const juce::String& segment) {
  const auto stem = segment.upToFirstOccurrenceOf(".", false, false).toUpperCase();
  if (stem == "CON" || stem == "PRN" || stem == "AUX" || stem == "NUL") {
    return true;
  }
  if (stem.length() == 4 && (stem.startsWith("COM") || stem.startsWith("LPT"))) {
    return stem[3] >= '1' && stem[3] <= '9';
  }
  return false;
}

bool isSafeRelativePath(const juce::String& value) {
  if (value.isEmpty() || value.length() > 1024 || value != value.trim() || value.containsChar('\\') ||
      value.startsWithChar('/') || value.endsWithChar('/') || value.contains("//") || value.containsChar(0) ||
      value.containsChar(':') || juce::File::isAbsolutePath(value)) {
    return false;
  }
  const auto segments = juce::StringArray::fromTokens(value, "/", "");
  if (segments.isEmpty()) {
    return false;
  }
  for (const auto& segment : segments) {
    if (segment.isEmpty() || segment == "." || segment == ".." || segment.length() > 240 || segment.endsWithChar('.') ||
        segment.endsWithChar(' ') || isReservedWindowsName(segment)) {
      return false;
    }
    for (int index = 0; index < segment.length(); index += 1) {
      if (segment[index] < 32 || juce::String("<>\"|?*").containsChar(segment[index])) {
        return false;
      }
    }
  }
  return true;
}

bool isHttpsUrl(const juce::String& value) {
  const juce::URL url(value);
  if (!value.startsWith("https://") || value.length() <= 8 || value.containsAnyOf("\r\n\t\\")) {
    return false;
  }
  const auto remainder = value.substring(8);
  const auto delimiter = remainder.indexOfAnyOf("/?#");
  const auto authority = delimiter >= 0 ? remainder.substring(0, delimiter) : remainder;
  return !authority.isEmpty() && !authority.startsWithChar('/') && !authority.containsChar('@') && url.isWellFormed() &&
         url.getScheme() == "https" && url.getDomain().isNotEmpty();
}

juce::String canonicalPath(const juce::File& file) {
  auto path = file.getFullPathName().replaceCharacter('/', '\\');
  while (path.length() > 3 && path.endsWithChar('\\')) {
    path = path.dropLastCharacters(1);
  }
  return path.toLowerCase();
}

bool samePath(const juce::File& left, const juce::File& right) { return canonicalPath(left) == canonicalPath(right); }

bool isContainedBy(const juce::File& child, const juce::File& parent) {
  const auto childPath = canonicalPath(child);
  auto parentPath = canonicalPath(parent);
  if (!parentPath.endsWithChar('\\')) {
    parentPath += "\\";
  }
  return childPath.startsWith(parentPath);
}

juce::String bytesToHex(const std::vector<std::uint8_t>& bytes) {
  static constexpr char digits[] = "0123456789abcdef";
  juce::String result;
  result.preallocateBytes(static_cast<size_t>(bytes.size() * 2 + 1));
  for (const auto byte : bytes) {
    result += juce::String::charToString(digits[(byte >> 4) & 0x0f]);
    result += juce::String::charToString(digits[byte & 0x0f]);
  }
  return result;
}

bool hashInputStream(juce::InputStream& stream, juce::int64 maximumBytes, juce::String& hash, juce::int64& byteCount,
                     juce::String& errorMessage) {
  BCRYPT_ALG_HANDLE algorithm = nullptr;
  BCRYPT_HASH_HANDLE hashHandle = nullptr;
  DWORD objectLength = 0;
  DWORD hashLength = 0;
  DWORD bytesRead = 0;
  if (BCryptOpenAlgorithmProvider(&algorithm, BCRYPT_SHA256_ALGORITHM, nullptr, 0) != 0 ||
      BCryptGetProperty(algorithm, BCRYPT_OBJECT_LENGTH, reinterpret_cast<PUCHAR>(&objectLength), sizeof(objectLength),
                        &bytesRead, 0) != 0 ||
      BCryptGetProperty(algorithm, BCRYPT_HASH_LENGTH, reinterpret_cast<PUCHAR>(&hashLength), sizeof(hashLength),
                        &bytesRead, 0) != 0) {
    if (algorithm != nullptr) {
      BCryptCloseAlgorithmProvider(algorithm, 0);
    }
    errorMessage = "PadPilot could not initialize SHA-256 verification.";
    return false;
  }
  std::vector<std::uint8_t> hashObject(objectLength);
  std::vector<std::uint8_t> digest(hashLength);
  if (BCryptCreateHash(algorithm, &hashHandle, hashObject.data(), objectLength, nullptr, 0, 0) != 0) {
    BCryptCloseAlgorithmProvider(algorithm, 0);
    errorMessage = "PadPilot could not initialize SHA-256 verification.";
    return false;
  }
  std::array<char, 64 * 1024> buffer {};
  byteCount = 0;
  bool succeeded = true;
  while (!stream.isExhausted()) {
    const auto read = stream.read(buffer.data(), static_cast<int>(buffer.size()));
    if (read < 0 || (read == 0 && !stream.isExhausted())) {
      succeeded = false;
      break;
    }
    if (read == 0) {
      break;
    }
    byteCount += read;
    if (byteCount > maximumBytes ||
        BCryptHashData(hashHandle, reinterpret_cast<PUCHAR>(buffer.data()), static_cast<ULONG>(read), 0) != 0) {
      succeeded = false;
      break;
    }
  }
  if (!succeeded || BCryptFinishHash(hashHandle, digest.data(), hashLength, 0) != 0) {
    BCryptDestroyHash(hashHandle);
    BCryptCloseAlgorithmProvider(algorithm, 0);
    errorMessage =
        byteCount > maximumBytes ? "Update data exceeded its permitted size." : "PadPilot could not hash update data.";
    return false;
  }
  BCryptDestroyHash(hashHandle);
  BCryptCloseAlgorithmProvider(algorithm, 0);
  hash = bytesToHex(digest);
  return true;
}

juce::String computeFileSha256(const juce::File& file, juce::int64 maximumBytes, juce::String& errorMessage) {
  if (!file.existsAsFile() || file.getSize() < 0 || file.getSize() > maximumBytes) {
    errorMessage = "Update file was missing or exceeded its permitted size: " + file.getFullPathName();
    return {};
  }
  auto stream = file.createInputStream();
  if (stream == nullptr || !stream->openedOk()) {
    errorMessage = "PadPilot could not read update file: " + file.getFullPathName();
    return {};
  }
  juce::String hash;
  juce::int64 bytesRead = 0;
  if (!hashInputStream(*stream, maximumBytes, hash, bytesRead, errorMessage) || bytesRead != file.getSize()) {
    if (errorMessage.isEmpty()) {
      errorMessage = "PadPilot could not read the complete update file.";
    }
    return {};
  }
  return hash;
}

juce::String sha256Text(const juce::String& text, juce::String& errorMessage) {
  juce::MemoryInputStream input(text.toRawUTF8(), std::strlen(text.toRawUTF8()), false);
  juce::String hash;
  juce::int64 bytesRead = 0;
  if (!hashInputStream(input, 1024 * 1024, hash, bytesRead, errorMessage)) {
    return {};
  }
  return hash;
}

juce::File updaterRootDirectory() {
  return juce::File::getSpecialLocation(juce::File::tempDirectory).getChildFile("PadPilot").getChildFile("updates");
}

juce::String normalizedInstallPath(const juce::File& installBundle) { return canonicalPath(installBundle); }

juce::String installScopeKey(const juce::File& installBundle) {
  juce::String errorMessage;
  return sha256Text(normalizedInstallPath(installBundle), errorMessage);
}

juce::File installScopeRoot(const juce::File& installBundle) {
  return updaterRootDirectory().getChildFile(installScopeKey(installBundle));
}

juce::File stateFileFor(const juce::File& installBundle, const juce::String& targetVersion) {
  return installScopeRoot(installBundle).getChildFile(targetVersion).getChildFile(kStateName);
}

juce::String lockNameFor(const juce::File& installBundle) {
  return "Local\\PadPilot.Update." + installScopeKey(installBundle);
}

juce::String canonicalizeJsonValue(const juce::var& value, bool skipRootSignature) {
  if (value.isVoid() || value.isUndefined()) {
    return "null";
  }
  if (value.isString() || value.isBool() || value.isInt() || value.isInt64() || value.isDouble()) {
    return juce::JSON::toString(value, false);
  }
  if (value.isArray()) {
    juce::StringArray values;
    for (const auto& item : *value.getArray()) {
      values.add(canonicalizeJsonValue(item));
    }
    return "[" + values.joinIntoString(",") + "]";
  }
  const auto* object = value.getDynamicObject();
  if (object == nullptr) {
    return "null";
  }
  juce::StringArray keys;
  const auto& properties = object->getProperties();
  for (int index = 0; index < properties.size(); index += 1) {
    const auto key = properties.getName(index).toString();
    if (!(skipRootSignature && key == "signature")) {
      keys.add(key);
    }
  }
  keys.sort(true);
  juce::StringArray parts;
  for (const auto& key : keys) {
    parts.add(juce::JSON::toString(key, false) + ":" + canonicalizeJsonValue(object->getProperty(key)));
  }
  return "{" + parts.joinIntoString(",") + "}";
}

bool decodeBase64(const juce::String& input, std::vector<std::uint8_t>& output, DWORD format,
                  juce::String& errorMessage) {
  DWORD decodedSize = 0;
  if (!CryptStringToBinaryA(input.toRawUTF8(), 0, format, nullptr, &decodedSize, nullptr, nullptr)) {
    errorMessage = "PadPilot could not decode update signing data.";
    return false;
  }
  output.resize(decodedSize);
  if (!CryptStringToBinaryA(input.toRawUTF8(), 0, format, output.data(), &decodedSize, nullptr, nullptr)) {
    output.clear();
    errorMessage = "PadPilot could not decode update signing data.";
    return false;
  }
  output.resize(decodedSize);
  return true;
}

bool verifyManifestSignature(const juce::String& manifestText, juce::String& errorMessage) {
  const auto manifestVar = juce::JSON::parse(manifestText);
  const auto* manifestObject = manifestVar.getDynamicObject();
  if (manifestObject == nullptr) {
    errorMessage = "PadPilot update manifest could not be parsed.";
    return false;
  }
  const auto signature = manifestObject->getProperty("signature").toString().trim();
  if (signature.isEmpty()) {
    errorMessage =
        "PadPilot rejected the update because the manifest "
        "signature was missing.";
    return false;
  }

  std::vector<std::uint8_t> publicKeyDer;
  if (!decodeBase64(kManifestPublicKeyPem, publicKeyDer, CRYPT_STRING_BASE64HEADER, errorMessage)) {
    return false;
  }
  CERT_PUBLIC_KEY_INFO* publicKeyInfo = nullptr;
  DWORD publicKeyInfoSize = 0;
  if (!CryptDecodeObjectEx(X509_ASN_ENCODING | PKCS_7_ASN_ENCODING, X509_PUBLIC_KEY_INFO, publicKeyDer.data(),
                           static_cast<DWORD>(publicKeyDer.size()), CRYPT_DECODE_ALLOC_FLAG, nullptr, &publicKeyInfo,
                           &publicKeyInfoSize)) {
    errorMessage = "PadPilot could not parse the built-in update verification key.";
    return false;
  }
  BCRYPT_KEY_HANDLE keyHandle = nullptr;
  const auto imported =
      CryptImportPublicKeyInfoEx2(X509_ASN_ENCODING | PKCS_7_ASN_ENCODING, publicKeyInfo, 0, nullptr, &keyHandle);
  LocalFree(publicKeyInfo);
  if (!imported) {
    errorMessage = "PadPilot could not import the built-in update verification key.";
    return false;
  }
  std::vector<std::uint8_t> signatureBytes;
  if (!decodeBase64(signature, signatureBytes, CRYPT_STRING_BASE64, errorMessage)) {
    BCryptDestroyKey(keyHandle);
    return false;
  }
  const auto payload = canonicalizeJsonValue(manifestVar, true);
  juce::MemoryInputStream payloadStream(payload.toRawUTF8(), std::strlen(payload.toRawUTF8()), false);
  juce::String payloadHashHex;
  juce::int64 payloadBytes = 0;
  if (!hashInputStream(payloadStream, kManifestDownloadLimit, payloadHashHex, payloadBytes, errorMessage)) {
    BCryptDestroyKey(keyHandle);
    return false;
  }
  std::vector<std::uint8_t> payloadHash;
  payloadHash.reserve(32);
  for (int index = 0; index < payloadHashHex.length(); index += 2) {
    payloadHash.push_back(static_cast<std::uint8_t>(payloadHashHex.substring(index, index + 2).getHexValue32()));
  }
  BCRYPT_PKCS1_PADDING_INFO paddingInfo {};
  paddingInfo.pszAlgId = BCRYPT_SHA256_ALGORITHM;
  const auto status =
      BCryptVerifySignature(keyHandle, &paddingInfo, payloadHash.data(), static_cast<ULONG>(payloadHash.size()),
                            signatureBytes.data(), static_cast<ULONG>(signatureBytes.size()), BCRYPT_PAD_PKCS1);
  BCryptDestroyKey(keyHandle);
  if (status != 0) {
    errorMessage =
        "PadPilot rejected the update because the manifest "
        "signature was invalid.";
    return false;
  }
  return true;
}

bool pathsOverlap(const juce::String& left, const juce::String& right) {
  const auto a = left.toLowerCase();
  const auto b = right.toLowerCase();
  return a == b || a.startsWith(b + "/") || b.startsWith(a + "/");
}

bool readManifest(const juce::String& text, const juce::String& targetVersion, const juce::String& currentVersion,
                  const juce::String& platform, const juce::String& arch, Manifest& result,
                  juce::String& errorMessage) {
  if (text.getNumBytesAsUTF8() > kManifestDownloadLimit || !verifyManifestSignature(text, errorMessage)) {
    if (errorMessage.isEmpty()) {
      errorMessage = "PadPilot update manifest exceeded its permitted size.";
    }
    return false;
  }
  const auto rootVar = juce::JSON::parse(text);
  const auto* root = rootVar.getDynamicObject();
  if (root == nullptr || !isStrictSemanticVersion(targetVersion) || !isStrictSemanticVersion(currentVersion)) {
    errorMessage = "Update version metadata was invalid.";
    return false;
  }
  result.version = root->getProperty("version").toString();
  result.platform = root->getProperty("platform").toString();
  result.arch = root->getProperty("arch").toString();
  result.artifactKind = root->getProperty("artifactKind").toString();
  result.bundleRoot = root->getProperty("bundleRoot").toString();
  if (result.version != targetVersion || !isStrictSemanticVersion(result.version) || result.platform != platform ||
      result.arch != arch || result.artifactKind != "directory_patch" || result.bundleRoot != kBundleName ||
      compareStrictSemanticVersions(result.version, currentVersion) <= 0) {
    errorMessage = "Signed update manifest was incompatible with this PadPilot runtime.";
    return false;
  }
  const auto rangeVar = root->getProperty("baseVersionRange");
  const auto* range = rangeVar.getDynamicObject();
  if (range == nullptr) {
    errorMessage = "Signed update manifest was missing its base-version range.";
    return false;
  }
  result.minBaseVersion = range->getProperty("min").toString();
  result.maxBaseVersion = range->getProperty("max").toString();
  if (!isStrictSemanticVersion(result.minBaseVersion) || !isStrictSemanticVersion(result.maxBaseVersion) ||
      compareStrictSemanticVersions(result.minBaseVersion, result.maxBaseVersion) > 0 ||
      compareStrictSemanticVersions(currentVersion, result.minBaseVersion) < 0 ||
      compareStrictSemanticVersions(currentVersion, result.maxBaseVersion) > 0) {
    errorMessage = "Installed PadPilot version is outside the signed patch range.";
    return false;
  }
  const auto postApply = root->getProperty("postApply");
  if (!postApply.isArray() || !postApply.getArray()->isEmpty()) {
    errorMessage = "Signed update manifest requested unsupported post-apply actions.";
    return false;
  }
  const auto filesVar = root->getProperty("files");
  const auto* files = filesVar.getDynamicObject();
  if (files == nullptr) {
    errorMessage = "Signed update manifest was missing file operations.";
    return false;
  }
  const auto addsVar = files->getProperty("addOrReplace");
  const auto deletesVar = files->getProperty("delete");
  if (!addsVar.isArray() || !deletesVar.isArray() ||
      addsVar.getArray()->size() + deletesVar.getArray()->size() > kManifestOperationLimit) {
    errorMessage =
        "Signed update manifest contained invalid or excessive file "
        "operations.";
    return false;
  }
  std::set<std::string> targetPaths;
  std::set<std::string> payloadPaths;
  juce::int64 totalBytes = 0;
  for (const auto& fileVar : *addsVar.getArray()) {
    const auto* file = fileVar.getDynamicObject();
    if (file == nullptr) {
      errorMessage = "Signed update manifest contained a malformed file operation.";
      return false;
    }
    FileOperation operation;
    operation.path = file->getProperty("path").toString();
    operation.payloadPath = file->getProperty("payloadPath").toString();
    operation.sha256 = file->getProperty("sha256").toString().toLowerCase();
    const auto sizeVar = file->getProperty("size");
    if (!(sizeVar.isInt() || sizeVar.isInt64())) {
      errorMessage = "Signed update manifest contained an invalid file size.";
      return false;
    }
    operation.size = static_cast<juce::int64>(sizeVar);
    const auto targetKey = operation.path.toLowerCase().toStdString();
    const auto payloadKey = operation.payloadPath.toLowerCase().toStdString();
    if (!isSafeRelativePath(operation.path) || !isSafeRelativePath(operation.payloadPath) ||
        !operation.payloadPath.startsWith("files/") || !isSha256(operation.sha256) || operation.size < 0 ||
        operation.size > kArchiveEntryLimit || !targetPaths.insert(targetKey).second ||
        !payloadPaths.insert(payloadKey).second) {
      errorMessage =
          "Signed update manifest contained an unsafe or duplicate "
          "file operation.";
      return false;
    }
    totalBytes += operation.size;
    if (totalBytes > kArchiveUncompressedLimit) {
      errorMessage = "Signed update manifest exceeded its uncompressed size limit.";
      return false;
    }
    result.addOrReplace.push_back(operation);
  }
  for (const auto& deleteVar : *deletesVar.getArray()) {
    if (!deleteVar.isString()) {
      errorMessage = "Signed update manifest contained a malformed delete operation.";
      return false;
    }
    const auto path = deleteVar.toString();
    const auto key = path.toLowerCase().toStdString();
    if (!isSafeRelativePath(path) || !targetPaths.insert(key).second) {
      errorMessage =
          "Signed update manifest contained an unsafe or duplicate "
          "delete operation.";
      return false;
    }
    for (const auto& operation : result.addOrReplace) {
      if (pathsOverlap(path, operation.path)) {
        errorMessage = "Signed update manifest contained conflicting file operations.";
        return false;
      }
    }
    for (const auto& existing : result.deletes) {
      if (pathsOverlap(path, existing)) {
        errorMessage = "Signed update manifest contained overlapping delete operations.";
        return false;
      }
    }
    result.deletes.push_back(path);
  }
  return true;
}

bool verifyPatchArchive(const juce::File& archive, const Manifest& manifest, juce::String& errorMessage,
                        std::map<std::string, int>* payloadIndices) {
  if (!archive.existsAsFile() || archive.getSize() < 0 || archive.getSize() > kArtifactDownloadLimit) {
    errorMessage = "Update archive was missing or exceeded its compressed size limit.";
    return false;
  }
  juce::ZipFile zip(archive);
  const auto count = zip.getNumEntries();
  if (count < 0 || count > kArchiveFileCountLimit) {
    errorMessage = "Update archive contained too many entries.";
    return false;
  }
  std::map<std::string, const FileOperation*> expected;
  for (const auto& operation : manifest.addOrReplace) {
    expected.emplace(operation.payloadPath.toLowerCase().toStdString(), &operation);
  }
  std::set<std::string> seen;
  juce::int64 totalSize = 0;
  for (int index = 0; index < count; index += 1) {
    const auto* entry = zip.getEntry(index);
    if (entry == nullptr || entry->filename.isEmpty()) {
      errorMessage = "Update archive contained a malformed entry.";
      return false;
    }
    const bool directory = entry->filename.endsWithChar('/');
    const auto path = directory ? entry->filename.dropLastCharacters(1) : entry->filename;
    const auto key = path.toLowerCase().toStdString();
    if (!isSafeRelativePath(path) || entry->isSymbolicLink || !seen.insert(key).second || entry->uncompressedSize < 0 ||
        entry->uncompressedSize > kArchiveEntryLimit) {
      errorMessage = "Update archive contained an unsafe, duplicate, or oversized entry.";
      return false;
    }
    if (directory) {
      continue;
    }
    totalSize += entry->uncompressedSize;
    if (totalSize > kArchiveUncompressedLimit) {
      errorMessage = "Update archive exceeded its uncompressed size limit.";
      return false;
    }
    const auto expectedEntry = expected.find(key);
    if (expectedEntry == expected.end() || expectedEntry->second->payloadPath != path ||
        expectedEntry->second->size != entry->uncompressedSize) {
      errorMessage = "Update archive did not exactly match its signed file inventory.";
      return false;
    }
    std::unique_ptr<juce::InputStream> stream(zip.createStreamForEntry(index));
    juce::String hash;
    juce::int64 bytesRead = 0;
    if (stream == nullptr || !hashInputStream(*stream, expectedEntry->second->size, hash, bytesRead, errorMessage) ||
        bytesRead != expectedEntry->second->size || hash != expectedEntry->second->sha256) {
      if (errorMessage.isEmpty()) {
        errorMessage = "Update archive payload failed signed checksum verification.";
      }
      return false;
    }
    if (payloadIndices != nullptr) {
      payloadIndices->emplace(key, index);
    }
  }
  for (const auto& item : expected) {
    if (seen.find(item.first) == seen.end()) {
      errorMessage = "Update archive was missing a signed payload file.";
      return false;
    }
  }
  return true;
}

bool inspectTreeInventory(const juce::File& root, std::size_t& entriesVisited, std::size_t depth,
                          bool rejectReparsePoints, juce::String& errorMessage) {
  if (depth > kTreeDepthLimit) {
    errorMessage = "PadPilot update tree exceeded its permitted directory depth.";
    return false;
  }
  const auto attributes = GetFileAttributesW(root.getFullPathName().toWideCharPointer());
  if (attributes == INVALID_FILE_ATTRIBUTES) {
    errorMessage = "PadPilot could not inspect update tree entry: " + root.getFullPathName();
    return false;
  }
  if ((attributes & FILE_ATTRIBUTE_REPARSE_POINT) != 0) {
    if (rejectReparsePoints) {
      errorMessage = "Installed PadPilot bundle contained an unsupported reparse point.";
      return false;
    }
    return true;
  }
  if ((attributes & FILE_ATTRIBUTE_DIRECTORY) == 0) {
    return true;
  }

  for (const auto& entry : juce::RangedDirectoryIterator(root, false, "*", juce::File::findFilesAndDirectories)) {
    if (entriesVisited >= kTreeEntryLimit) {
      errorMessage = "PadPilot update tree exceeded its permitted entry count.";
      return false;
    }
    ++entriesVisited;
    if (!inspectTreeInventory(entry.getFile(), entriesVisited, depth + 1, rejectReparsePoints, errorMessage)) {
      return false;
    }
  }
  return true;
}

bool safeRemoveTreeWithBudget(const juce::File& target, std::size_t& entriesVisited, std::size_t depth,
                              juce::String& errorMessage) {
  if (depth > kTreeDepthLimit) {
    errorMessage = "PadPilot update tree changed beyond its permitted directory depth.";
    return false;
  }
  const auto attributes = GetFileAttributesW(target.getFullPathName().toWideCharPointer());
  if (attributes == INVALID_FILE_ATTRIBUTES) {
    errorMessage = "PadPilot could not inspect path before removal: " + target.getFullPathName();
    return false;
  }
  if ((attributes & FILE_ATTRIBUTE_REPARSE_POINT) != 0) {
    const auto removed = (attributes & FILE_ATTRIBUTE_DIRECTORY) != 0
                             ? RemoveDirectoryW(target.getFullPathName().toWideCharPointer())
                             : DeleteFileW(target.getFullPathName().toWideCharPointer());
    if (!removed) {
      errorMessage = "PadPilot could not remove a reparse point safely.";
    }
    return removed != 0;
  }
  if ((attributes & FILE_ATTRIBUTE_DIRECTORY) == 0) {
    if (DeleteFileW(target.getFullPathName().toWideCharPointer())) {
      return true;
    }
    errorMessage = "PadPilot could not remove update file: " + target.getFullPathName();
    return false;
  }
  for (const auto& entry : juce::RangedDirectoryIterator(target, false, "*", juce::File::findFilesAndDirectories)) {
    if (entriesVisited >= kTreeEntryLimit) {
      errorMessage = "PadPilot update tree changed beyond its permitted entry count.";
      return false;
    }
    ++entriesVisited;
    if (!safeRemoveTreeWithBudget(entry.getFile(), entriesVisited, depth + 1, errorMessage)) {
      return false;
    }
  }
  if (!RemoveDirectoryW(target.getFullPathName().toWideCharPointer())) {
    errorMessage = "PadPilot could not remove update directory: " + target.getFullPathName();
    return false;
  }
  return true;
}

bool safeRemoveTree(const juce::File& target, juce::String& errorMessage) {
  if (!target.exists()) {
    return true;
  }
  std::size_t inventoryEntries = 0;
  if (!inspectTreeInventory(target, inventoryEntries, 0, false, errorMessage)) {
    return false;
  }
  std::size_t removalEntries = 0;
  return safeRemoveTreeWithBudget(target, removalEntries, 0, errorMessage);
}

bool copyTreeWithoutLinksWithBudget(const juce::File& source, const juce::File& destination,
                                    std::size_t& entriesVisited, std::size_t depth, juce::String& errorMessage) {
  if (depth > kTreeDepthLimit) {
    errorMessage =
        "Installed PadPilot bundle changed beyond its permitted "
        "directory depth.";
    return false;
  }
  const auto attributes = GetFileAttributesW(source.getFullPathName().toWideCharPointer());
  if (attributes == INVALID_FILE_ATTRIBUTES || (attributes & FILE_ATTRIBUTE_REPARSE_POINT) != 0 ||
      (attributes & FILE_ATTRIBUTE_DIRECTORY) == 0) {
    errorMessage = "Installed PadPilot bundle was missing or contained a reparse point.";
    return false;
  }
  if (!destination.createDirectory() && !destination.isDirectory()) {
    errorMessage = "PadPilot could not create the prepared update bundle.";
    return false;
  }
  for (const auto& entry : juce::RangedDirectoryIterator(source, false, "*", juce::File::findFilesAndDirectories)) {
    if (entriesVisited >= kTreeEntryLimit) {
      errorMessage = "Installed PadPilot bundle changed beyond its permitted entry count.";
      return false;
    }
    ++entriesVisited;
    const auto child = entry.getFile();
    const auto childAttributes = GetFileAttributesW(child.getFullPathName().toWideCharPointer());
    if (childAttributes == INVALID_FILE_ATTRIBUTES || (childAttributes & FILE_ATTRIBUTE_REPARSE_POINT) != 0) {
      errorMessage = "Installed PadPilot bundle contained an unsupported reparse point.";
      return false;
    }
    const auto destinationChild = destination.getChildFile(child.getFileName());
    if ((childAttributes & FILE_ATTRIBUTE_DIRECTORY) != 0) {
      if (!copyTreeWithoutLinksWithBudget(child, destinationChild, entriesVisited, depth + 1, errorMessage)) {
        return false;
      }
    } else if (!child.copyFileTo(destinationChild)) {
      errorMessage =
          "PadPilot could not copy an installed bundle file into "
          "the prepared update.";
      return false;
    }
  }
  return true;
}

bool copyTreeWithoutLinks(const juce::File& source, const juce::File& destination, juce::String& errorMessage) {
  std::size_t inventoryEntries = 0;
  if (!inspectTreeInventory(source, inventoryEntries, 0, true, errorMessage)) {
    return false;
  }
  std::size_t copiedEntries = 0;
  return copyTreeWithoutLinksWithBudget(source, destination, copiedEntries, 0, errorMessage);
}

bool buildPreparedBundle(const juce::File& baseBundle, const juce::File& preparedBundle, const juce::File& archive,
                         const Manifest& manifest, juce::String& errorMessage) {
  std::map<std::string, int> payloadIndices;
  if (!verifyPatchArchive(archive, manifest, errorMessage, &payloadIndices)) {
    return false;
  }
  if (preparedBundle.exists() && !safeRemoveTree(preparedBundle, errorMessage)) {
    return false;
  }
  if (!copyTreeWithoutLinks(baseBundle, preparedBundle, errorMessage)) {
    safeRemoveTree(preparedBundle, errorMessage);
    return false;
  }
  for (const auto& path : manifest.deletes) {
    const auto target = preparedBundle.getChildFile(path);
    if (!isContainedBy(target, preparedBundle) || !safeRemoveTree(target, errorMessage)) {
      safeRemoveTree(preparedBundle, errorMessage);
      return false;
    }
  }
  juce::ZipFile zip(archive);
  for (const auto& operation : manifest.addOrReplace) {
    const auto target = preparedBundle.getChildFile(operation.path);
    if (!isContainedBy(target, preparedBundle) ||
        (!target.getParentDirectory().isDirectory() && !target.getParentDirectory().createDirectory())) {
      errorMessage = "PadPilot could not create a signed update target directory.";
      safeRemoveTree(preparedBundle, errorMessage);
      return false;
    }
    if (target.isDirectory() && !safeRemoveTree(target, errorMessage)) {
      safeRemoveTree(preparedBundle, errorMessage);
      return false;
    }
    const auto found = payloadIndices.find(operation.payloadPath.toLowerCase().toStdString());
    if (found == payloadIndices.end()) {
      errorMessage = "Signed update payload index was missing.";
      safeRemoveTree(preparedBundle, errorMessage);
      return false;
    }
    std::unique_ptr<juce::InputStream> input(zip.createStreamForEntry(found->second));
    juce::TemporaryFile temporary(target);
    auto output = temporary.getFile().createOutputStream();
    if (input == nullptr || output == nullptr || !output->openedOk()) {
      errorMessage = "PadPilot could not open a signed update payload for installation.";
      safeRemoveTree(preparedBundle, errorMessage);
      return false;
    }
    juce::int64 written = 0;
    std::array<char, 64 * 1024> buffer {};
    while (!input->isExhausted() && written <= operation.size) {
      const auto read = input->read(buffer.data(), static_cast<int>(buffer.size()));
      if (read <= 0) {
        break;
      }
      written += read;
      if (written > operation.size || !output->write(buffer.data(), static_cast<size_t>(read))) {
        errorMessage =
            "Signed update payload exceeded its declared size or "
            "could not be written.";
        safeRemoveTree(preparedBundle, errorMessage);
        return false;
      }
    }
    output->flush();
    output.reset();
    if (written != operation.size) {
      errorMessage = "Signed update payload size did not match its manifest.";
      safeRemoveTree(preparedBundle, errorMessage);
      return false;
    }
    juce::String hashError;
    const auto hash = computeFileSha256(temporary.getFile(), operation.size, hashError);
    if (hash != operation.sha256 || !temporary.overwriteTargetFileWithTemporary()) {
      errorMessage = hashError.isNotEmpty() ? hashError : "Signed update payload failed final verification.";
      safeRemoveTree(preparedBundle, errorMessage);
      return false;
    }
  }
  return true;
}

bool verifyBundle(const juce::File& bundle, const Manifest& manifest, juce::String& errorMessage) {
  if (!bundle.isDirectory()) {
    errorMessage = "Applied PadPilot bundle was missing.";
    return false;
  }
  for (const auto& operation : manifest.addOrReplace) {
    const auto file = bundle.getChildFile(operation.path);
    juce::String hashError;
    if (!isContainedBy(file, bundle) || !file.existsAsFile() || file.getSize() != operation.size ||
        computeFileSha256(file, operation.size, hashError) != operation.sha256) {
      errorMessage = hashError.isNotEmpty() ? hashError : "Applied PadPilot bundle failed signed payload verification.";
      return false;
    }
  }
  for (const auto& path : manifest.deletes) {
    if (bundle.getChildFile(path).exists()) {
      errorMessage = "Applied PadPilot bundle retained a file signed for deletion.";
      return false;
    }
  }
  return true;
}

bool writeTextAtomically(const juce::File& target, const juce::String& text, juce::String& errorMessage) {
  if (!target.getParentDirectory().isDirectory() && !target.getParentDirectory().createDirectory()) {
    errorMessage = "PadPilot could not create updater state storage.";
    return false;
  }
  juce::TemporaryFile temporary(target);
  if (!temporary.getFile().replaceWithText(text) || !temporary.overwriteTargetFileWithTemporary()) {
    errorMessage = "PadPilot could not atomically persist updater state.";
    return false;
  }
  return true;
}

bool validateStatePath(const juce::File& stateFile, const juce::File& installBundle, const juce::String& targetVersion,
                       juce::String& errorMessage) {
  if (!isStrictSemanticVersion(targetVersion) || installBundle.getFileName() != kBundleName ||
      !samePath(stateFile, stateFileFor(installBundle, targetVersion))) {
    errorMessage = "Updater state path was outside its canonical install scope.";
    return false;
  }
  return true;
}

std::optional<TrustedState> loadTrustedState(const juce::File& stateFile, const juce::File& updaterExecutable,
                                             juce::String& errorMessage) {
  const auto stateText = readBoundedTextFile(stateFile, kStateFileLimit, "Updater state file", errorMessage);
  if (!stateText.has_value()) {
    return std::nullopt;
  }
  const auto stateVar = juce::JSON::parse(*stateText);
  const auto* state = stateVar.getDynamicObject();
  if (state == nullptr || static_cast<int>(state->getProperty("schemaVersion")) != 2) {
    errorMessage = "Updater state file had an unsupported schema.";
    return std::nullopt;
  }
  const auto installBundle = juce::File(state->getProperty("installBundlePath").toString());
  const auto targetVersion = state->getProperty("targetVersion").toString();
  if (!validateStatePath(stateFile, installBundle, targetVersion, errorMessage)) {
    return std::nullopt;
  }
  const auto scopeRoot = installScopeRoot(installBundle);
  const auto stateDirectory = scopeRoot.getChildFile(targetVersion);
  const auto copiedUpdater = stateDirectory.getChildFile(kHelperName);
  auto updaterBundle = updaterExecutable;
  bool updaterInsideBundle = false;
  while (updaterBundle != updaterBundle.getParentDirectory()) {
    if (updaterBundle.getFileName() == kBundleName) {
      updaterInsideBundle = true;
      break;
    }
    updaterBundle = updaterBundle.getParentDirectory();
  }
  TrustedState trusted;
  trusted.stateFile = stateFile;
  trusted.installBundle = installBundle;
  trusted.targetVersion = targetVersion;
  trusted.hostMode = state->getProperty("hostMode").toString();
  const auto defaultBundle = juce::File("C:\\Program Files\\Common Files\\VST3\\PadPilot.vst3");
  const auto directPluginHelper =
      trusted.hostMode == "plugin" && updaterInsideBundle && samePath(updaterBundle, installBundle);
  bool copiedPluginHelper = false;
  if (trusted.hostMode == "plugin" && samePath(updaterExecutable, copiedUpdater)) {
    const auto backupBundle = installBundle.getSiblingFile(kBackupName);
    const auto sourceBundle = installBundle.isDirectory() ? installBundle : backupBundle;
    const auto sourceHelper = sourceBundle.getChildFile("Contents")
                                  .getChildFile("Resources")
                                  .getChildFile("updater")
                                  .getChildFile(kHelperName);
    juce::String sourceHashError;
    juce::String copiedHashError;
    const auto sourceHash = computeFileSha256(sourceHelper, 64ll * 1024 * 1024, sourceHashError);
    const auto copiedHash = computeFileSha256(updaterExecutable, 64ll * 1024 * 1024, copiedHashError);
    copiedPluginHelper = sourceHash.isNotEmpty() && sourceHash == copiedHash;
  }
  const auto standaloneHelper = trusted.hostMode == "standalone" && !updaterInsideBundle &&
                                !samePath(updaterExecutable, copiedUpdater) && samePath(defaultBundle, installBundle);
  if (!(directPluginHelper || copiedPluginHelper || standaloneHelper)) {
    errorMessage =
        "Updater helper location was not bound to the scoped "
        "PadPilot installation.";
    return std::nullopt;
  }
  trusted.manifestSha256 = state->getProperty("manifestSha256").toString().toLowerCase();
  trusted.artifactSha256 = state->getProperty("artifactSha256").toString().toLowerCase();
  const auto waitPidValue = static_cast<juce::int64>(state->getProperty("waitPid"));
  if (!isSha256(trusted.manifestSha256) || !isSha256(trusted.artifactSha256) || waitPidValue < 0 ||
      waitPidValue > UINT32_MAX) {
    errorMessage = "Updater state contained invalid integrity metadata.";
    return std::nullopt;
  }
  trusted.waitPid = static_cast<DWORD>(waitPidValue);
  trusted.scopeRoot = scopeRoot;
  trusted.stateDirectory = stateDirectory;
  trusted.activeStateFile = trusted.scopeRoot.getChildFile(kActiveStateName);
  trusted.lockName = lockNameFor(installBundle);
  trusted.manifestFile = trusted.stateDirectory.getChildFile(kManifestName);
  trusted.archiveFile = trusted.stateDirectory.getChildFile(kArtifactName);
  trusted.logFile = installBundle.getSiblingFile(kProtectedLogName);
  trusted.journalFile = installBundle.getSiblingFile(kProtectedJournalName);
  trusted.relaunchFlag = trusted.stateDirectory.getChildFile(kRelaunchFlagName);
  trusted.backupBundle = installBundle.getSiblingFile(kBackupName);
  trusted.preparedBundle = installBundle.getSiblingFile(kPreparedName);
  const auto activeStateText = readBoundedTextFile(trusted.activeStateFile, kActiveStateMarkerLimit,
                                                   "Active updater state marker", errorMessage);
  if (!activeStateText.has_value()) {
    return std::nullopt;
  }
  if (!samePath(trusted.stateFile, trusted.stateDirectory.getChildFile(kStateName)) ||
      canonicalPath(juce::File(activeStateText->trim())) != canonicalPath(trusted.stateFile)) {
    errorMessage = "Updater state was not the active state for this installation.";
    return std::nullopt;
  }
  return trusted;
}

}  // namespace padpilot::updater::security
