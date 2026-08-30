#include "core/pad-pilot-processor.h"
#include "runtime/fx-chain-proto.h"

#include <cstdio>
#include <cstdlib>
#include <memory>
#include <stdexcept>
#include <string>

#include <juce_core/juce_core.h>

namespace {

void expect(const bool condition, const char* message) {
  if (!condition) {
    throw std::runtime_error(message);
  }
}

juce::File createFxModuleBundle(const juce::File& root,
                                const std::string& moduleId) {
  const auto manifest =
      std::string {R"({"id":")"} + moduleId +
      R"(","name":"Custom FX","version":"1.0.0","moduleApiVersion":"1","uiEntry":"ui/index.js","scriptEntry":"script/module.js","minHostVersion":"0.1.0","stateSchemaVersion":1,"capabilities":["fx-graph","fx-visualizer","automation"]})";
  juce::ZipFile::Builder builder;
  const auto addTextEntry = [&](const juce::String& path, const std::string& content) {
    builder.addEntry(new juce::MemoryInputStream(content.data(), content.size(), true),
                     9,
                     path,
                     juce::Time::getCurrentTime());
  };
  addTextEntry("padpilot-module.json", manifest);
  addTextEntry("ui/index.js", "export default {};\n");
  addTextEntry("script/module.js", "globalThis.padpilotOnInput = () => null;\n");
  const auto archive = root.getChildFile(moduleId + ".padpilot.zip");
  auto output = archive.createOutputStream();
  expect(output != nullptr && builder.writeToStream(*output, nullptr),
         "Processor test should create a Module bundle.");
  return archive;
}

padpilot::fx::FxChainState makeFxState(const std::uint64_t revision,
                                       const float wetDry) {
  auto state = padpilot::proto::createDefaultFxChainState();
  state.set_revision(revision);
  state.mutable_master()->set_wet_dry(wetDry);
  return state;
}

std::uint64_t decodeRevision(const std::string& payloadBase64) {
  std::string payloadBytes;
  padpilot::fx::FxChainState state;
  expect(padpilot::proto::base64ToBytes(payloadBase64, &payloadBytes) &&
             padpilot::proto::parseFxChainState(payloadBytes, &state),
         "Processor state should contain a valid FX graph payload.");
  return state.revision();
}

void runNonFactoryFxOwnerRoundtrip() {
  const auto root = juce::File::getSpecialLocation(juce::File::tempDirectory)
                        .getChildFile("PadPilot")
                        .getChildFile("processor-owner-tests")
                        .getChildFile(juce::Uuid().toString());
  expect(root.createDirectory(), "Processor test should create an isolated root.");
  const auto oldAppData = juce::SystemStats::getEnvironmentVariable("APPDATA", {});
  const auto oldLocalAppData = juce::SystemStats::getEnvironmentVariable("LOCALAPPDATA", {});
  _putenv_s("APPDATA", root.getFullPathName().toRawUTF8());
  _putenv_s("LOCALAPPDATA", root.getFullPathName().toRawUTF8());

  try {
    const auto firstBundle = createFxModuleBundle(root, "custom-fx-one");
    const auto secondBundle = createFxModuleBundle(root, "custom-fx-two");
    juce::MemoryBlock savedState;
    {
      auto processor = std::make_unique<PadPilotAudioProcessor>();
      std::string errorMessage;
      const auto first = processor->installModuleBundle(
          firstBundle.getFullPathName().toStdString(), errorMessage);
      expect(first.has_value() && first->id == "custom-fx-one",
             "Processor should install a non-factory FX-capable Module.");

      const auto firstState = makeFxState(7, 0.35f);
      const auto firstBytes = padpilot::proto::serializeFxChainState(firstState);
      expect(processor->setModuleStatePayloadBase64(
                 first->id,
                 padpilot::proto::bytesToBase64(firstBytes),
                 firstState.revision()),
             "Non-factory FX owner should accept canonical graph state.");

      padpilot::bridge::PresetSaveRequest request;
      request.set_name("Custom State");
      auto* preset = request.mutable_preset();
      preset->set_id("custom-fx-state");
      preset->set_module_id(first->id);
      preset->set_name("Custom State");
      preset->set_schema_version(1);
      preset->set_state(firstBytes);
      expect(processor->createAndSavePresetProto(request),
             "Non-factory FX owner should save protobuf Presets.");

      const auto second = processor->installModuleBundle(
          secondBundle.getFullPathName().toStdString(), errorMessage);
      expect(second.has_value() && processor->selectModule(second->id),
             "Processor should select a second FX-capable owner.");
      const auto secondState = makeFxState(12, 0.8f);
      expect(processor->setModuleStatePayloadBase64(
                 second->id,
                 padpilot::proto::bytesToBase64(
                     padpilot::proto::serializeFxChainState(secondState)),
                 secondState.revision()),
             "Second FX owner should accept isolated state.");
      expect(processor->selectModule(first->id),
             "Processor should switch back to the first FX owner.");

      const auto payloads = processor->getModuleStatePayloads();
      expect(decodeRevision(payloads.at(first->id)) == 7 &&
                 decodeRevision(payloads.at(second->id)) == 12,
             "Switching FX owners must preserve isolated revisions.");
      processor->getStateInformation(savedState);
    }

    {
      auto restored = std::make_unique<PadPilotAudioProcessor>();
      restored->setStateInformation(savedState.getData(),
                                    static_cast<int>(savedState.getSize()));
      const auto payloads = restored->getModuleStatePayloads();
      expect(restored->getSelectedModuleId() == "custom-fx-one" &&
                 payloads.contains("custom-fx-one") &&
                 payloads.contains("custom-fx-two") &&
                 decodeRevision(payloads.at("custom-fx-one")) == 7 &&
                 decodeRevision(payloads.at("custom-fx-two")) == 12,
             "Processor save/restore must roundtrip each non-factory FX owner.");
    }
  } catch (...) {
    _putenv_s("APPDATA", oldAppData.toRawUTF8());
    _putenv_s("LOCALAPPDATA", oldLocalAppData.toRawUTF8());
    root.deleteRecursively();
    throw;
  }

  _putenv_s("APPDATA", oldAppData.toRawUTF8());
  _putenv_s("LOCALAPPDATA", oldLocalAppData.toRawUTF8());
  root.deleteRecursively();
}

}  // namespace

int main() {
  try {
    runNonFactoryFxOwnerRoundtrip();
  } catch (const std::exception& error) {
    std::fprintf(stderr, "PadPilot processor test failure: %s\n", error.what());
    return 1;
  }
  return 0;
}
