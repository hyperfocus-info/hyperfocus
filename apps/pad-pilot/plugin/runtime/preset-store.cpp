#include "runtime/preset-store.h"

#include <algorithm>
#include <cstddef>
#include <cstdint>
#include <utility>

#include <juce_core/juce_core.h>

#include "runtime/backend-log.h"
#include "runtime/module-identity.h"
#include "runtime/preset-identity.h"
#include "runtime/state-wire-limits.h"
#include "runtime/storage-path-safety.h"

namespace padpilot {

namespace {
constexpr std::size_t kMaxPresetNameBytes = 256U;
constexpr std::size_t kMaxPresetPayloadBytes = state_wire_limits::kMaximumModuleStateBytes;
constexpr std::size_t kMaxPresetPayloadBase64Chars = ((kMaxPresetPayloadBytes + 2U) / 3U) * 4U;
constexpr std::size_t kMaxPresetAggregatePayloadChars =
    state_wire_limits::kMaximumAggregatePresetStateBytes;
constexpr std::int64_t kMaxPresetFileBytes = static_cast<std::int64_t>(kMaxPresetPayloadBase64Chars + 16U * 1024U);
constexpr int kMaxPresetsPerStore =
    static_cast<int>(state_wire_limits::kMaximumPersistedPresets);

juce::File defaultPresetsRoot() {
  return juce::File::getSpecialLocation(juce::File::userApplicationDataDirectory)
      .getChildFile("PadPilot")
      .getChildFile("presets");
}

bool isValidEncodedPayload(const std::string& payload) {
  if (payload.empty() || payload.size() > kMaxPresetPayloadBase64Chars) {
    return false;
  }
  juce::MemoryOutputStream decoded;
  return juce::Base64::convertFromBase64(decoded, juce::String(payload)) &&
         decoded.getDataSize() <= kMaxPresetPayloadBytes;
}

bool isValidPresetRecord(const PresetRecord& preset) {
  if (!isValidPresetId(preset.id) || !isValidModuleId(preset.moduleId) ||
      preset.name.empty() || preset.name.size() > kMaxPresetNameBytes) {
    return false;
  }
  if (preset.payloadJson.empty() || preset.payloadJson.size() > kMaxPresetPayloadBase64Chars) {
    return false;
  }
  const auto parsedPayload = juce::JSON::parse(juce::String::fromUTF8(
      preset.payloadJson.data(), static_cast<int>(preset.payloadJson.size())));
  if (!parsedPayload.isVoid()) {
    return preset.payloadJson.size() <= kMaxPresetPayloadBytes;
  }
  return isValidEncodedPayload(preset.payloadJson);
}

juce::String presetStoreLockName(const juce::File& presetsRoot) {
  return "padpilot-preset-store-" +
         juce::String::toHexString(presetsRoot.getFullPathName().toLowerCase().hashCode64());
}
}  // namespace

PresetStore::PresetStore()
    : PresetStore(defaultPresetsRoot().getFullPathName().toStdString()) {}

PresetStore::PresetStore(std::string presetsRootPath) {
  const juce::File root {juce::String(presetsRootPath)};
  presetsRootPath_ = root.getFullPathName().toStdString();
  storageRootReady_ = storage::ensureSafeDirectory(root, root);
  if (!storageRootReady_) {
    appendBackendLog("preset-store", "Rejected unsafe preset root path=" + presetsRootPath_);
  }
}

std::vector<PresetRecord> PresetStore::loadPresetsForModule(const std::string& moduleId) const {
  std::vector<PresetRecord> presets;
  const auto presetsRoot = juce::File(presetsRootPath_);
  if (!storageRootReady_ || !storage::isSafeDirectory(presetsRoot, presetsRoot) ||
      !isValidModuleId(moduleId)) {
    return presets;
  }

  juce::Array<juce::File> files;
  for (const auto& entry : juce::RangedDirectoryIterator(
           presetsRoot, false, "*.json", juce::File::findFiles)) {
    files.add(entry.getFile());
    if (files.size() > kMaxPresetsPerStore) {
      break;
    }
  }
  files.sort();
  if (files.size() > kMaxPresetsPerStore) {
    appendBackendLog("preset-store", "Preset file count exceeds load limit; extras ignored module=" + moduleId);
  }
  const auto fileCount = juce::jmin(files.size(), kMaxPresetsPerStore);
  presets.reserve(static_cast<std::size_t>(fileCount));
  std::size_t aggregatePayloadChars = 0;
  for (int fileIndex = 0; fileIndex < fileCount; ++fileIndex) {
    const auto& file = files.getReference(fileIndex);
    if (!storage::isSafeFile(file, presetsRoot) ||
        file.getSize() <= 0 || file.getSize() > kMaxPresetFileBytes) {
      continue;
    }
    const auto parsed = juce::JSON::parse(file.loadFileAsString());
    const auto* object = parsed.getDynamicObject();
    if (object == nullptr) {
      continue;
    }

    if (object->getProperty("moduleId").toString().toStdString() != moduleId) {
      continue;
    }

    PresetRecord preset;
    preset.id = object->getProperty("id").toString().toStdString();
    if (file.getFileNameWithoutExtension().toStdString() != preset.id) {
      continue;
    }
    preset.moduleId = object->getProperty("moduleId").toString().toStdString();
    preset.name = object->getProperty("name").toString().toStdString();
    const auto encoding = object->getProperty("payloadEncoding").toString().toStdString();
    if (encoding == "proto-base64") {
      preset.payloadJson = object->getProperty("payloadBase64").toString().toStdString();
    } else {
      preset.payloadJson = juce::JSON::toString(object->getProperty("payload"), true).toStdString();
    }
    if (!isValidPresetRecord(preset)) {
      continue;
    }
    if (preset.payloadJson.size() > kMaxPresetAggregatePayloadChars - aggregatePayloadChars) {
      appendBackendLog("preset-store", "Stopped loading presets after reaching aggregate payload limit module=" + moduleId);
      break;
    }
    aggregatePayloadChars += preset.payloadJson.size();
    presets.push_back(std::move(preset));
  }

  std::sort(presets.begin(), presets.end(), [](const auto& left, const auto& right) {
    return left.id < right.id;
  });
  return presets;
}

bool PresetStore::savePreset(const PresetRecord& preset) const {
  const auto presetsRoot = juce::File(presetsRootPath_);
  if (!storageRootReady_ || !storage::isSafeDirectory(presetsRoot, presetsRoot) ||
      !isValidPresetRecord(preset)) {
    appendBackendLog("preset-store", "Rejected invalid preset record id=" + preset.id + " module=" + preset.moduleId);
    return false;
  }

  juce::InterProcessLock writeLock(presetStoreLockName(presetsRoot));
  const juce::InterProcessLock::ScopedLockType writeGuard(writeLock);
  if (!writeGuard.isLocked()) {
    appendBackendLog("preset-store", "Could not acquire preset write lock id=" + preset.id);
    return false;
  }

  juce::DynamicObject::Ptr object = new juce::DynamicObject();
  object->setProperty("id", juce::String(preset.id));
  object->setProperty("moduleId", juce::String(preset.moduleId));
  object->setProperty("name", juce::String(preset.name));
  const auto parsedPayload = juce::JSON::parse(preset.payloadJson);
  if (parsedPayload.isVoid()) {
    object->setProperty("payloadEncoding", "proto-base64");
    object->setProperty("payloadBase64", juce::String(preset.payloadJson));
  } else {
    object->setProperty("payload", parsedPayload);
  }

  const juce::var root(object.get());
  const juce::File target = presetsRoot.getChildFile(preset.id + ".json");
  if (target.getParentDirectory() != presetsRoot ||
      !storage::isSafeFileTarget(target, presetsRoot)) {
    appendBackendLog("preset-store", "Rejected preset target outside store id=" + preset.id);
    return false;
  }
  juce::TemporaryFile temporary(target);
  const auto saved = temporary.getFile().replaceWithText(juce::JSON::toString(root, true)) &&
                     storage::isSafeFile(temporary.getFile(), presetsRoot) &&
                     storage::isSafeFileTarget(target, presetsRoot) &&
                     temporary.overwriteTargetFileWithTemporary() &&
                     storage::isSafeFile(target, presetsRoot);
  appendBackendLog("preset-store", std::string(saved ? "Saved" : "Failed to save") +
                                        " preset id=" + preset.id + " module=" + preset.moduleId);
  return saved;
}

PresetRecord PresetStore::createDefaultPreset(const std::string& moduleId, const std::string& name) const {
  PresetRecord preset;
  preset.moduleId = moduleId;
  preset.name = name.empty() ? "New Preset" : name;
  preset.id = "preset-" + juce::Uuid().toString().toStdString();
  preset.payloadJson =
      R"({"convolver":{"wet":0.4,"dry":0.6,"impulsePath":""},"delay":{"syncEnabled":true,"timeBeats":0.25,"timeHz":2.0,"wet":0.25,"dry":0.75},"reverb":{"wet":0.2,"dry":0.8}})";
  return preset;
}

std::string PresetStore::getPresetsRootPath() const {
  return presetsRootPath_;
}

}  // namespace padpilot


