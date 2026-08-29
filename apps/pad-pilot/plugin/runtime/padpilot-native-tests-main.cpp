#include "runtime/analyzer-proto.h"
#include "runtime/analyzer-runtime.h"
#include "runtime/automation-identity.h"
#include "runtime/bounded-json.h"
#include "runtime/capability-handle.h"
#include "runtime/controller-config.h"
#include "runtime/finite-math.h"
#include "runtime/fx-chain-proto.h"
#include "runtime/fx-graph-native-tests.h"
#include "runtime/managed-file-store.h"
#include "runtime/managed-file-limits.h"
#include "runtime/midi-output-runtime.h"
#include "runtime/lock-free-queue.h"
#include "runtime/module-identity.h"
#include "runtime/module-manifest-limits.h"
#include "runtime/module-store.h"
#include "runtime/preset-store.h"
#include "runtime/preset-identity.h"
#include "runtime/plugin-state-wire.h"
#include "runtime/quick-js-host.h"
#include "runtime/recut-proto.h"
#include "runtime/recut-runtime.h"
#include "runtime/sample-capability-proto.h"
#include "runtime/script-host.h"
#include "runtime/state-wire-limits.h"
#include "runtime/storage-path-safety.h"
#include "runtime/wake-signal.h"
#include "runtime/web-navigation-policy.h"

#include <array>
#include <atomic>
#include <chrono>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <limits>
#include <memory>
#include <mutex>
#include <stdexcept>
#include <thread>
#include <utility>
#include <unordered_set>
#include <vector>

#include <juce_audio_formats/juce_audio_formats.h>
#include <juce_core/juce_core.h>

namespace {

void expect(bool condition, const juce::String& message) {
  if (!condition) {
    throw std::runtime_error(message.toStdString());
  }
}

juce::File createTempRoot() {
  const auto root = juce::File::getSpecialLocation(juce::File::tempDirectory)
                        .getChildFile("PadPilot")
                        .getChildFile("native-tests")
                        .getChildFile(juce::Uuid().toString());
  root.createDirectory();
  return root;
}

padpilot::ScriptModuleAuthorization makeScriptAuthorization(
    const std::string& moduleId,
    const std::vector<std::string>& capabilities = {}) {
  const auto authorization = padpilot::authorizeScriptModule(moduleId, capabilities);
  expect(authorization.has_value(), "Script authorization fixture should use a valid module identity.");
  return *authorization;
}

class RecordingKeystrokeOutput final : public padpilot::KeystrokeOutput {
 public:
  bool sendKey(std::uint16_t virtualKeyCode, bool isKeyDown) const override {
    std::lock_guard<std::mutex> guard(mutex_);
    events_.emplace_back(virtualKeyCode, isKeyDown);
    return true;
  }

  std::size_t size() const {
    std::lock_guard<std::mutex> guard(mutex_);
    return events_.size();
  }

  std::pair<std::uint16_t, bool> at(std::size_t index) const {
    std::lock_guard<std::mutex> guard(mutex_);
    return events_.at(index);
  }

 private:
  mutable std::mutex mutex_;
  mutable std::vector<std::pair<std::uint16_t, bool>> events_;
};

bool waitForKeystrokeCount(const RecordingKeystrokeOutput& output, std::size_t expectedCount) {
  const auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(1);
  while (output.size() < expectedCount && std::chrono::steady_clock::now() < deadline) {
    std::this_thread::sleep_for(std::chrono::milliseconds(1));
  }
  return output.size() == expectedCount;
}

void runModuleIdentityTests() {
  expect(padpilot::isValidModuleId("fx") && padpilot::isValidModuleId("user-module-2"),
         "Shared Module identity grammar should accept canonical lowercase ids.");
  expect(!padpilot::isValidModuleId("") && !padpilot::isValidModuleId("-module") &&
             !padpilot::isValidModuleId("module-") && !padpilot::isValidModuleId("module--name") &&
             !padpilot::isValidModuleId("Module") && !padpilot::isValidModuleId("module_name") &&
             !padpilot::isValidModuleId(std::string(padpilot::kMaximumModuleIdBytes + 1U, 'm')),
         "Shared Module identity grammar should reject ambiguous or oversized ids.");
  expect(padpilot::canonicalModuleId("reverb") == "fx" &&
             padpilot::canonicalModuleId("recut") == "recut" &&
             padpilot::moduleIdMatchesCanonical("reverb", "fx") &&
             !padpilot::moduleIdMatchesCanonical("reverb", "recut"),
         "Shared Module identity aliases should resolve consistently across native consumers.");
}

void runPresetIdentityTests() {
  expect(padpilot::isValidPresetId("factory_default-2") &&
             !padpilot::isValidPresetId("") &&
             !padpilot::isValidPresetId("preset/name") &&
             !padpilot::isValidPresetId(
                 std::string(padpilot::kMaximumPresetIdBytes + 1U, 'p')),
         "Shared Preset identity grammar should reject unsafe or oversized ids.");
}

void runSharedLimitTests() {
  static_assert(padpilot::state_wire_limits::kMaximumModuleStateBytes == 4U * 1024U * 1024U);
  static_assert(padpilot::state_wire_limits::kMaximumPluginStateBytes == 96U * 1024U * 1024U);
  static_assert(padpilot::state_wire_limits::kMaximumEditorViewStateBytes == 256U * 1024U);
  static_assert(padpilot::state_wire_limits::kMaximumControllerConfigBytes == 256U * 1024U);
  static_assert(padpilot::state_wire_limits::kMaximumPersistedParameterValues == 19U);
  static_assert(padpilot::state_wire_limits::kMaximumAggregateModuleStateBytes ==
                24U * 1024U * 1024U);
  static_assert(padpilot::kMaximumManagedFileBytes == 25ULL * 1024ULL * 1024ULL);
  static_assert(padpilot::ManagedFileStore::kDefaultMaxImportBytes ==
                padpilot::kMaximumManagedFileBytes);
  static_assert(padpilot::module_manifest_limits::kMaximumVersionBytes == 128U);
  static_assert(padpilot::module_manifest_limits::kMaximumApiVersionBytes == 128U);
  static_assert(padpilot::module_manifest_limits::kMaximumStateSchemaVersion == 64U);
  static_assert(padpilot::module_manifest_limits::kMaximumStateMigrationSteps == 63U);

  const auto analyzerState = padpilot::proto::createDefaultAnalyzerState();
  expect(analyzerState.tuning_hz() == padpilot::kAnalyzerDefaultTuningHz &&
             analyzerState.detection_sensitivity() ==
                 padpilot::kAnalyzerDefaultDetectionSensitivity,
         "Analyzer runtime and protobuf defaults should share one native contract.");
}

void runStoragePathSafetyTests() {
  const auto root = createTempRoot();
  const auto boundary = root.getChildFile("safe");
  expect(boundary.createDirectory(), "Atomic file fixture should create its trusted boundary.");
  const auto target = boundary.getChildFile("state.bin");
  const std::array<std::uint8_t, 5> initial {0U, 1U, 2U, 3U, 255U};
  const std::array<std::uint8_t, 2> replacement {9U, 8U};

  expect(padpilot::storage::replaceFileAtomically(
             target, boundary, initial.data(), initial.size()),
         "Atomic file replacement should create a bounded binary file.");
  expect(padpilot::storage::replaceFileAtomically(
             target, boundary, replacement.data(), replacement.size()),
         "Atomic file replacement should replace an existing bounded file.");
  juce::MemoryBlock persisted;
  expect(target.loadFileAsData(persisted) && persisted.getSize() == replacement.size() &&
             std::memcmp(persisted.getData(), replacement.data(), replacement.size()) == 0 &&
             boundary.getNumberOfChildFiles(juce::File::findFilesAndDirectories) == 1,
         "Atomic file replacement should publish exact bytes without leaving a temporary file.");

  const auto outsideTarget = root.getChildFile("outside.bin");
  expect(!padpilot::storage::replaceFileAtomically(
             outsideTarget, boundary, replacement.data(), replacement.size()) &&
             !outsideTarget.exists(),
         "Atomic file replacement should reject targets outside its boundary.");

  const auto outsideDirectory = root.getChildFile("outside");
  expect(outsideDirectory.createDirectory(),
         "Atomic file symlink fixture should create an outside directory.");
  const auto linkedDirectory = boundary.getChildFile("linked");
  if (outsideDirectory.createSymbolicLink(linkedDirectory, true)) {
    expect(!padpilot::storage::replaceFileAtomically(
               linkedDirectory.getChildFile("escaped.bin"),
               boundary,
               replacement.data(),
               replacement.size()) &&
               !outsideDirectory.getChildFile("escaped.bin").exists(),
           "Atomic file replacement should reject symlink and reparse-point traversal.");
    linkedDirectory.deleteFile();
  }
  root.deleteRecursively();
}

void runFiniteMathTests() {
  expect(padpilot::finiteClamped(0.25f, 0.0f, 1.0f, 0.5f) == 0.25f &&
             padpilot::finiteClamped(-1.0f, 0.0f, 1.0f, 0.5f) == 0.0f &&
             padpilot::finiteClamped(2.0f, 0.0f, 1.0f, 0.5f) == 1.0f &&
             padpilot::finiteClamped(
                 std::numeric_limits<float>::infinity(), 0.0f, 1.0f, 0.5f) == 0.5f,
         "Shared finite clamping should preserve, clamp, and replace non-finite values.");
}

void runCapabilityHandleTests() {
  const auto valid = padpilot::parseCapabilityHandle("fx::fx-visualizer::main");
  expect(valid.has_value() && valid->moduleInstanceId == "fx" &&
             valid->capability == "fx-visualizer" && valid->slot == "main",
         "Capability handles should parse exactly three non-empty segments.");
  expect(!padpilot::parseCapabilityHandle("fx::fx-visualizer::main::forged").has_value() &&
             !padpilot::parseCapabilityHandle("fx::::main").has_value() &&
             !padpilot::parseCapabilityHandle("fx::fx-visualizer::").has_value(),
         "Capability handles should reject extra separators and empty segments.");
}

void runLockFreeQueueTests() {
  constexpr std::uint32_t kProducerCount = 4;
  constexpr std::uint32_t kConsumerCount = 2;
  constexpr std::uint32_t kItemsPerProducer = 20'000;
  constexpr std::uint32_t kTotalItems = kProducerCount * kItemsPerProducer;
  padpilot::LockFreeQueue<std::uint32_t, 1024> queue;
  auto seen = std::make_unique<std::atomic<std::uint32_t>[]>(kTotalItems);
  for (std::uint32_t index = 0; index < kTotalItems; ++index) {
    seen[index].store(0, std::memory_order_relaxed);
  }
  std::atomic<std::uint32_t> consumed {0};
  std::atomic<bool> invalidValue {false};
  std::atomic<bool> duplicateValue {false};

  std::array<std::thread, kProducerCount> producers;
  for (std::uint32_t producerIndex = 0; producerIndex < kProducerCount; ++producerIndex) {
    producers[producerIndex] = std::thread([&, producerIndex] {
      for (std::uint32_t itemIndex = 0; itemIndex < kItemsPerProducer; ++itemIndex) {
        const auto value = producerIndex * kItemsPerProducer + itemIndex;
        while (!queue.push(value)) {
          std::this_thread::yield();
        }
      }
    });
  }

  std::array<std::thread, kConsumerCount> consumers;
  for (auto& consumer : consumers) {
    consumer = std::thread([&] {
      while (consumed.load(std::memory_order_acquire) < kTotalItems) {
        std::uint32_t value = 0;
        if (!queue.pop(value)) {
          std::this_thread::yield();
          continue;
        }
        if (value >= kTotalItems) {
          invalidValue.store(true, std::memory_order_release);
        } else if (seen[value].fetch_add(1, std::memory_order_relaxed) != 0) {
          duplicateValue.store(true, std::memory_order_release);
        }
        consumed.fetch_add(1, std::memory_order_release);
      }
    });
  }

  for (auto& producer : producers) {
    producer.join();
  }
  for (auto& consumer : consumers) {
    consumer.join();
  }
  expect(consumed.load(std::memory_order_acquire) == kTotalItems,
         "MPMC queue should deliver every produced value.");
  expect(!invalidValue.load(std::memory_order_acquire),
         "MPMC queue returned an out-of-range value.");
  expect(!duplicateValue.load(std::memory_order_acquire),
         "MPMC queue returned a duplicate value.");
  for (std::uint32_t index = 0; index < kTotalItems; ++index) {
    expect(seen[index].load(std::memory_order_relaxed) == 1,
           "MPMC queue should deliver each value exactly once.");
  }

  expect(queue.push(1) && queue.push(2), "MPMC drain fixture should enqueue values.");
  queue.drain();
  std::uint32_t value = 0;
  expect(!queue.pop(value), "MPMC drain should leave queue empty without resetting live atomics.");
}

void runGraphEpochTests() {
  constexpr std::size_t kThreadCount = 4;
  constexpr std::size_t kAdvancesPerThread = 32;
  constexpr std::size_t kAdvanceCount = kThreadCount * kAdvancesPerThread;
  std::atomic<std::uint64_t> epoch {
      std::numeric_limits<std::uint64_t>::max() - (kAdvanceCount - 1)};
  std::array<std::array<std::uint64_t, kAdvancesPerThread>, kThreadCount> observed {};
  std::array<std::thread, kThreadCount> threads;
  for (std::size_t threadIndex = 0; threadIndex < kThreadCount; ++threadIndex) {
    threads[threadIndex] = std::thread([&, threadIndex] {
      for (std::size_t advanceIndex = 0; advanceIndex < kAdvancesPerThread; ++advanceIndex) {
        observed[threadIndex][advanceIndex] = padpilot::advanceGraphEpoch(epoch);
      }
    });
  }
  for (auto& thread : threads) {
    thread.join();
  }

  std::unordered_set<std::uint64_t> uniqueEpochs;
  for (const auto& threadEpochs : observed) {
    for (const auto observedEpoch : threadEpochs) {
      expect(observedEpoch != 0, "Graph epoch advancement must reserve zero across rollover.");
      uniqueEpochs.insert(observedEpoch);
    }
  }
  expect(uniqueEpochs.size() == kAdvanceCount,
         "Concurrent graph epoch advancement must return one unique generation per discontinuity.");
  expect(epoch.load(std::memory_order_acquire) == 1,
         "Graph epoch advancement should roll the maximum generation directly to one.");
}

juce::File createModuleBundle(const juce::File& root,
                              const juce::String& archiveName,
                              const juce::String& marker,
                              const std::vector<juce::String>& extraEntryPaths = {},
                              const juce::String& version = "1.0.0",
                              const juce::String& moduleId = "rollback-fixture") {
  const std::string manifest =
      R"({"id":")" + moduleId.toStdString() +
      R"(","name":"Rollback Fixture","version":")" + version.toStdString() +
      R"(","moduleApiVersion":"1","uiEntry":"ui/index.js","scriptEntry":"script/module.js","minHostVersion":"0.1.0","stateSchemaVersion":1,"capabilities":[]})";
  juce::ZipFile::Builder builder;
  const auto addTextEntry = [&](const juce::String& path, const std::string& content) {
    builder.addEntry(
        new juce::MemoryInputStream(content.data(), content.size(), true),
        9,
        path,
        juce::Time::getCurrentTime());
  };
  addTextEntry("padpilot-module.json", manifest);
  addTextEntry("ui/index.js", "export default {};\n");
  addTextEntry("script/module.js", "globalThis.padpilotOnInput = () => null;\n");
  addTextEntry("marker.txt", marker.toStdString());
  for (const auto& path : extraEntryPaths) {
    addTextEntry(path, "unsafe");
  }

  const auto archive = root.getChildFile(archiveName);
  auto output = archive.createOutputStream();
  expect(output != nullptr && builder.writeToStream(*output, nullptr),
         "Native module test should create bundle archive.");
  return archive;
}

padpilot::capability::SampleEditorFrame parseSampleEditorFrameBase64(const std::string& payloadBase64) {
  std::string bytes;
  expect(padpilot::proto::base64ToBytes(payloadBase64, &bytes),
         "Recut sample-editor frame should decode from base64.");
  padpilot::capability::SampleEditorFrame frame;
  expect(frame.ParseFromString(bytes),
         "Recut sample-editor frame bytes should parse back into protobuf.");
  return frame;
}

bool waitForRecutLoaded(padpilot::RecutRuntime& runtime, std::chrono::milliseconds timeout = std::chrono::seconds(5)) {
  const auto deadline = std::chrono::steady_clock::now() + timeout;
  while (std::chrono::steady_clock::now() < deadline) {
    if (parseSampleEditorFrameBase64(runtime.buildSampleEditorFrameBase64()).loaded()) {
      return true;
    }
    juce::Thread::sleep(2);
  }
  return false;
}

juce::File createRecutFixtureWav(const juce::File& root,
                                 double sampleRate = 48000.0,
                                 const juce::String& name = "recut-fixture.wav") {
  const auto file = root.getChildFile(name);
  juce::AudioBuffer<float> buffer(1, 2048);
  buffer.clear();
  for (int sample = 0; sample < 1024; ++sample) {
    buffer.setSample(0, sample, 0.1f);
  }
  for (int sample = 1024; sample < 2048; ++sample) {
    buffer.setSample(0, sample, 0.8f);
  }

  juce::WavAudioFormat format;
  auto output = file.createOutputStream();
  expect(output != nullptr, "Native Recut test should create fixture output stream.");
  auto* releasedStream = output.release();
  std::unique_ptr<juce::AudioFormatWriter> writer(
      format.createWriterFor(releasedStream, sampleRate, 1, 16, {}, 0));
  if (writer == nullptr) {
    delete releasedStream;
  }
  expect(writer != nullptr, "Native Recut test should create wav writer.");
  expect(writer->writeFromAudioSampleBuffer(buffer, 0, buffer.getNumSamples()),
         "Native Recut fixture wav should write successfully.");
  return file;
}

juce::File createRecutStereoFixtureWav(const juce::File& root,
                                       const juce::String& name = "recut-stereo-fixture.wav") {
  const auto file = root.getChildFile(name);
  juce::AudioBuffer<float> buffer(2, 2048);
  for (int sample = 0; sample < buffer.getNumSamples(); ++sample) {
    buffer.setSample(0, sample, 0.2f);
    buffer.setSample(1, sample, 0.8f);
  }

  juce::WavAudioFormat format;
  auto output = file.createOutputStream();
  expect(output != nullptr, "Native Recut stereo test should create fixture output stream.");
  auto* releasedStream = output.release();
  std::unique_ptr<juce::AudioFormatWriter> writer(
      format.createWriterFor(releasedStream, 48000.0, 2, 16, {}, 0));
  if (writer == nullptr) {
    delete releasedStream;
  }
  expect(writer != nullptr, "Native Recut stereo test should create wav writer.");
  expect(writer->writeFromAudioSampleBuffer(buffer, 0, buffer.getNumSamples()),
         "Native Recut stereo fixture wav should write successfully.");
  return file;
}

juce::File createRecutSineFixtureWav(const juce::File& root,
                                     const juce::String& name = "recut-sine-fixture.wav") {
  const auto file = root.getChildFile(name);
  constexpr int kFrames = 48'000;
  constexpr double kSampleRate = 48'000.0;
  constexpr double kFrequency = 220.0;
  juce::AudioBuffer<float> buffer(1, kFrames);
  for (int sample = 0; sample < buffer.getNumSamples(); ++sample) {
    buffer.setSample(
        0,
        sample,
        static_cast<float>(0.5 * std::sin(
            juce::MathConstants<double>::twoPi * kFrequency * static_cast<double>(sample) / kSampleRate)));
  }

  juce::WavAudioFormat format;
  auto output = file.createOutputStream();
  expect(output != nullptr, "Native Recut pitch test should create fixture output stream.");
  auto* releasedStream = output.release();
  std::unique_ptr<juce::AudioFormatWriter> writer(
      format.createWriterFor(releasedStream, kSampleRate, 1, 16, {}, 0));
  if (writer == nullptr) {
    delete releasedStream;
  }
  expect(writer != nullptr, "Native Recut pitch test should create wav writer.");
  expect(writer->writeFromAudioSampleBuffer(buffer, 0, buffer.getNumSamples()),
         "Native Recut pitch fixture wav should write successfully.");
  return file;
}

double tonePower(const std::vector<float>& samples, double frequencyHz, double sampleRate) {
  double real = 0.0;
  double imaginary = 0.0;
  for (std::size_t index = 0; index < samples.size(); ++index) {
    const auto phase = juce::MathConstants<double>::twoPi * frequencyHz *
                       static_cast<double>(index) / sampleRate;
    real += static_cast<double>(samples[index]) * std::cos(phase);
    imaginary -= static_cast<double>(samples[index]) * std::sin(phase);
  }
  return real * real + imaginary * imaginary;
}

juce::File createRecutPulseFixtureWav(const juce::File& root,
                                      const juce::String& name,
                                      const std::vector<std::pair<int, float>>& pulses,
                                      const int totalSamples) {
  const auto file = root.getChildFile(name);
  juce::AudioBuffer<float> buffer(1, totalSamples);
  buffer.clear();
  for (const auto& pulse : pulses) {
    for (int sample = 0; sample < 96; ++sample) {
      const auto frame = pulse.first + sample;
      if (frame < 0 || frame >= totalSamples) {
        break;
      }
      const auto envelope = std::sin((static_cast<float>(sample) / 96.0f) * juce::MathConstants<float>::pi);
      buffer.setSample(0, frame, envelope * pulse.second);
    }
  }

  juce::WavAudioFormat format;
  auto output = file.createOutputStream();
  expect(output != nullptr, "Native Recut pulse fixture should create output stream.");
  auto* releasedStream = output.release();
  std::unique_ptr<juce::AudioFormatWriter> writer(
      format.createWriterFor(releasedStream, 48000.0, 1, 16, {}, 0));
  if (writer == nullptr) {
    delete releasedStream;
  }
  expect(writer != nullptr, "Native Recut pulse fixture should create wav writer.");
  expect(writer->writeFromAudioSampleBuffer(buffer, 0, buffer.getNumSamples()),
         "Native Recut pulse fixture wav should write successfully.");
  return file;
}

padpilot::capability::SlicePlaybackState createCustomRecutPlaybackState() {
  padpilot::capability::SlicePlaybackState state;
  state.set_analysis_mode(padpilot::capability::SAMPLE_ANALYSIS_MODE_CUSTOM);
  state.set_density(0.5f);
  state.set_manual_edit_revision(1);
  state.set_project_bpm(120.0f);
  state.set_sample_handle("recut::sample-source::primary");

  auto* firstSlice = state.add_slice_markers();
  firstSlice->set_start_frame(0);
  firstSlice->set_end_frame(1024);
  firstSlice->set_transient_frame(0);
  firstSlice->set_confidence(1.0f);
  firstSlice->set_pad_index(0);
  firstSlice->set_fade_ms(4.0f);
  firstSlice->set_snap_exact(true);

  auto* secondSlice = state.add_slice_markers();
  secondSlice->set_start_frame(1024);
  secondSlice->set_end_frame(2047);
  secondSlice->set_transient_frame(1024);
  secondSlice->set_confidence(1.0f);
  secondSlice->set_pad_index(1);
  secondSlice->set_fade_ms(4.0f);
  secondSlice->set_snap_exact(true);

  for (std::uint32_t padIndex = 0; padIndex < 16; ++padIndex) {
    auto* assignment = state.add_pad_assignments();
    assignment->set_pad_index(padIndex);
    assignment->set_bank(padIndex / 4);
    assignment->set_face_button(std::array<const char*, 4> {"X", "Y", "A", "B"}[padIndex % 4]);
    assignment->set_slice_index(padIndex % 2);
    assignment->set_choke_group_id(0);
  }

  return state;
}

padpilot::analyzer::AnalyzerModuleState readAnalyzerRuntimeState(
    const padpilot::AnalyzerRuntime& runtime) {
  std::string stateBytes;
  expect(padpilot::proto::base64ToBytes(runtime.getStateBase64(), &stateBytes),
         "Analyzer runtime state should decode from Base64.");
  padpilot::analyzer::AnalyzerModuleState state;
  expect(padpilot::proto::parseAnalyzerModuleState(stateBytes, &state),
         "Analyzer runtime state should parse as protobuf.");
  return state;
}

void runAnalyzerRuntimeTests() {
  {
    padpilot::AnalyzerRuntime monitoringRuntime;
    monitoringRuntime.prepare(48'000.0, 2048);
    const auto baselineRevision = monitoringRuntime.getRevision();
    const auto baselineState = monitoringRuntime.getStateBase64();
    monitoringRuntime.setMonitoringEnabled(true);
    monitoringRuntime.setMonitoringEnabled(false);
    expect(monitoringRuntime.getRevision() == baselineRevision &&
               monitoringRuntime.getStateBase64() == baselineState,
           "Analyzer stream lifecycle must not mutate canonical module state or revision.");
    monitoringRuntime.release();
  }

  {
    padpilot::AnalyzerRuntime slicingRuntime;
    slicingRuntime.prepare(48'000.0, 8192);
    slicingRuntime.setMonitoringEnabled(true);
    juce::AudioBuffer<float> fourKBlock(2, 4096);
    fourKBlock.clear();
    slicingRuntime.pushAudioBlock(fourKBlock, 120.0);
    expect(slicingRuntime.getAudioSlicesPushed() == 2 &&
               slicingRuntime.getAudioSlicesDropped() == 0,
           "Analyzer should split a 4096-sample host block into two bounded slices.");
    juce::AudioBuffer<float> eightKBlock(2, 8192);
    eightKBlock.clear();
    slicingRuntime.pushAudioBlock(eightKBlock, 120.0);
    expect(slicingRuntime.getAudioSlicesPushed() == 6 &&
               slicingRuntime.getAudioSlicesDropped() == 0,
           "Analyzer should preserve all samples in an 8192-sample host block as four more slices.");
    slicingRuntime.release();
  }

  {
    padpilot::AnalyzerRuntime harmonicRuntime;
    harmonicRuntime.prepare(48'000.0, 2048);
    harmonicRuntime.setMonitoringEnabled(true);
    harmonicRuntime.setRecordMode(padpilot::AnalyzerRecordMode::startOverwrite);

    juce::AudioBuffer<float> richTone(1, 2048);
    std::uint64_t sampleOffset = 0;
    for (int block = 0; block < 16; ++block) {
      for (int sample = 0; sample < richTone.getNumSamples(); ++sample) {
        const auto time = static_cast<double>(sampleOffset + static_cast<std::uint64_t>(sample)) / 48'000.0;
        float value = 0.0f;
        for (int harmonic = 1; harmonic <= 6; ++harmonic) {
          value += static_cast<float>(std::sin(2.0 * juce::MathConstants<double>::pi *
                                               220.0 * static_cast<double>(harmonic) * time) /
                                      static_cast<double>(harmonic));
        }
        richTone.setSample(0, sample, value * 0.4f);
      }
      sampleOffset += static_cast<std::uint64_t>(richTone.getNumSamples());
      harmonicRuntime.pushAudioBlock(richTone, 120.0);
      juce::Thread::sleep(2);
    }
    harmonicRuntime.setRecordMode(padpilot::AnalyzerRecordMode::stop);

    const auto harmonicDeadline = std::chrono::steady_clock::now() + std::chrono::seconds(3);
    auto harmonicState = readAnalyzerRuntimeState(harmonicRuntime);
    while ((harmonicState.record_enabled() || harmonicState.note_events_size() == 0) &&
           std::chrono::steady_clock::now() < harmonicDeadline) {
      juce::Thread::sleep(2);
      harmonicState = readAnalyzerRuntimeState(harmonicRuntime);
    }

    const auto hasMidiNote = [&harmonicState](const std::uint32_t midiNote) {
      return std::any_of(harmonicState.note_events().begin(),
                         harmonicState.note_events().end(),
                         [midiNote](const auto& event) { return event.midi_note() == midiNote; });
    };
    expect(hasMidiNote(57), "Analyzer should preserve the 220 Hz fundamental of a harmonic-rich tone.");
    expect(!hasMidiNote(69) && !hasMidiNote(76) && !hasMidiNote(81),
           "Analyzer should group strong integer harmonics under their fundamental instead of exporting false notes.");
    const auto fundamental = std::find_if(
        harmonicState.note_events().begin(),
        harmonicState.note_events().end(),
        [](const auto& event) { return event.midi_note() == 57U; });
    expect(fundamental != harmonicState.note_events().end() &&
               fundamental->event_id() != 0 &&
               fundamental->detected_midi_note() == 57U &&
               fundamental->confidence() > 0.0f &&
               fundamental->confidence() <= 1.0f,
           "Analyzer events should publish stable identity, detected pitch, and bounded confidence.");
    const auto fundamentalId = fundamental->event_id();
    expect(harmonicRuntime.correctNote(fundamentalId, 60),
           "Analyzer should accept a correction for a current stable event id.");
    const auto correctedState = readAnalyzerRuntimeState(harmonicRuntime);
    const auto corrected = std::find_if(
        correctedState.note_events().begin(),
        correctedState.note_events().end(),
        [fundamentalId](const auto& event) { return event.event_id() == fundamentalId; });
    expect(corrected != correctedState.note_events().end() &&
               corrected->midi_note() == 60U && corrected->detected_midi_note() == 57U,
           "Analyzer corrections should change exported pitch without destroying detected pitch identity.");
    const auto correctionRevision = correctedState.revision();
    harmonicRuntime.setDetectionSensitivity(0.8f);
    const auto sensitivityDeadline = std::chrono::steady_clock::now() + std::chrono::seconds(2);
    auto reanalyzedState = readAnalyzerRuntimeState(harmonicRuntime);
    while (reanalyzedState.revision() == correctionRevision &&
           std::chrono::steady_clock::now() < sensitivityDeadline) {
      juce::Thread::sleep(2);
      reanalyzedState = readAnalyzerRuntimeState(harmonicRuntime);
    }
    const auto reanalyzedCorrection = std::find_if(
        reanalyzedState.note_events().begin(),
        reanalyzedState.note_events().end(),
        [fundamentalId](const auto& event) { return event.event_id() == fundamentalId; });
    expect(reanalyzedCorrection != reanalyzedState.note_events().end() &&
               reanalyzedCorrection->midi_note() == 60U,
           "Analyzer sensitivity reanalysis should preserve a correction and its stable event id.");

    padpilot::AnalyzerRuntime restoredCorrectionRuntime;
    restoredCorrectionRuntime.prepare(48'000.0, 2048);
    restoredCorrectionRuntime.restoreState(correctedState);
    const auto restoredCorrectionState = readAnalyzerRuntimeState(restoredCorrectionRuntime);
    const auto restoredCorrection = std::find_if(
        restoredCorrectionState.note_events().begin(),
        restoredCorrectionState.note_events().end(),
        [fundamentalId](const auto& event) { return event.event_id() == fundamentalId; });
    expect(restoredCorrection != restoredCorrectionState.note_events().end() &&
               restoredCorrection->midi_note() == 60U &&
               restoredCorrection->detected_midi_note() == 57U,
           "Analyzer correction identity and output pitch should survive canonical state restore.");
    expect(restoredCorrectionRuntime.resetNoteCorrection(fundamentalId) &&
               readAnalyzerRuntimeState(restoredCorrectionRuntime).note_events(0).midi_note() == 57U,
           "Analyzer should reset a correction to the preserved detected pitch.");
    restoredCorrectionRuntime.release();
    harmonicRuntime.release();
  }

  {
    padpilot::AnalyzerRuntime polyphonicRuntime;
    polyphonicRuntime.prepare(48'000.0, 2048);
    polyphonicRuntime.setMonitoringEnabled(true);
    polyphonicRuntime.setRecordMode(padpilot::AnalyzerRecordMode::startOverwrite);

    constexpr std::array<double, 3> chordFrequencies {261.6256, 329.6276, 391.9954};
    juce::AudioBuffer<float> chordAudio(1, 2048);
    std::uint64_t sampleOffset = 0;
    for (int block = 0; block < 16; ++block) {
      for (int sample = 0; sample < chordAudio.getNumSamples(); ++sample) {
        const auto time = static_cast<double>(sampleOffset + static_cast<std::uint64_t>(sample)) / 48'000.0;
        float value = 0.0f;
        for (const auto frequency : chordFrequencies) {
          for (int harmonic = 1; harmonic <= 4; ++harmonic) {
            value += static_cast<float>(std::sin(2.0 * juce::MathConstants<double>::pi *
                                                 frequency * static_cast<double>(harmonic) * time) /
                                        static_cast<double>(harmonic));
          }
        }
        chordAudio.setSample(0, sample, value * 0.12f);
      }
      sampleOffset += static_cast<std::uint64_t>(chordAudio.getNumSamples());
      polyphonicRuntime.pushAudioBlock(chordAudio, 120.0);
      juce::Thread::sleep(2);
    }
    polyphonicRuntime.setRecordMode(padpilot::AnalyzerRecordMode::stop);

    const auto chordDeadline = std::chrono::steady_clock::now() + std::chrono::seconds(3);
    auto chordState = readAnalyzerRuntimeState(polyphonicRuntime);
    while ((chordState.record_enabled() || chordState.note_events_size() == 0) &&
           std::chrono::steady_clock::now() < chordDeadline) {
      juce::Thread::sleep(2);
      chordState = readAnalyzerRuntimeState(polyphonicRuntime);
    }
    const auto hasChordNote = [&chordState](const std::uint32_t midiNote) {
      return std::any_of(chordState.note_events().begin(),
                         chordState.note_events().end(),
                         [midiNote](const auto& event) { return event.midi_note() == midiNote; });
    };
    expect(hasChordNote(60) && hasChordNote(64) && hasChordNote(67),
           "Analyzer harmonic grouping should retain each fundamental in a rich polyphonic triad.");
    expect(!hasChordNote(72) && !hasChordNote(76) && !hasChordNote(79),
           "Analyzer harmonic grouping should not export the triad's octave partials as extra notes.");
    polyphonicRuntime.release();
  }

  auto runtime = std::make_unique<padpilot::AnalyzerRuntime>();
  runtime->prepare(1.0, 2048);

  auto nonFiniteState = padpilot::proto::createDefaultAnalyzerState();
  nonFiniteState.set_tuning_hz(std::numeric_limits<float>::quiet_NaN());
  nonFiniteState.set_detection_sensitivity(std::numeric_limits<float>::infinity());
  auto* nonFiniteSummary = nonFiniteState.mutable_take_summary();
  nonFiniteSummary->set_frame_count(1);
  nonFiniteSummary->set_captured_bpm(-std::numeric_limits<float>::infinity());
  auto* nonFiniteEvent = nonFiniteState.add_note_events();
  nonFiniteEvent->set_midi_note(60);
  nonFiniteEvent->set_start_frame(0);
  nonFiniteEvent->set_end_frame(1);
  nonFiniteEvent->set_intensity(std::numeric_limits<float>::quiet_NaN());
  nonFiniteEvent->set_velocity(64);
  nonFiniteEvent->set_mean_frequency_hz(std::numeric_limits<float>::infinity());
  runtime->restoreState(nonFiniteState);
  runtime->setTuningHz(std::numeric_limits<float>::infinity());
  runtime->setDetectionSensitivity(std::numeric_limits<float>::quiet_NaN());
  juce::Thread::sleep(5);
  const auto finiteState = readAnalyzerRuntimeState(*runtime);
  std::string analyzerFrameBytes;
  expect(padpilot::proto::base64ToBytes(runtime->buildFrameBase64(), &analyzerFrameBytes),
         "Analyzer finite frame fixture should decode from Base64.");
  padpilot::analyzer::AnalyzerFrame finiteFrame;
  expect(finiteFrame.ParseFromString(analyzerFrameBytes) &&
             std::isfinite(finiteState.tuning_hz()) &&
             std::isfinite(finiteState.detection_sensitivity()) &&
             (!finiteState.has_take_summary() ||
              std::isfinite(finiteState.take_summary().captured_bpm())) &&
             finiteState.note_events_size() == 0 &&
             std::isfinite(finiteFrame.tuning_hz()) &&
             std::isfinite(finiteFrame.detection_sensitivity()) &&
             std::isfinite(finiteFrame.current_level()),
         "Analyzer should normalize live controls and skip non-finite persisted events before publishing.");

  runtime->setRecordMode(padpilot::AnalyzerRecordMode::startOverwrite);

  juce::AudioBuffer<float> audio(1, 2048);
  audio.clear();
  for (int block = 0; block < 8; ++block) {
    runtime->pushAudioBlock(audio, 120.0);
    juce::Thread::sleep(2);
  }

  const auto stopDeadline = std::chrono::steady_clock::now() + std::chrono::seconds(5);
  auto boundedCapture = readAnalyzerRuntimeState(*runtime);
  while ((boundedCapture.record_enabled() || !boundedCapture.has_take_summary()) &&
         std::chrono::steady_clock::now() < stopDeadline) {
    juce::Thread::sleep(2);
    boundedCapture = readAnalyzerRuntimeState(*runtime);
  }
  expect(!boundedCapture.record_enabled() && boundedCapture.has_take_summary() &&
             boundedCapture.take_summary().duration_seconds() <=
                 padpilot::AnalyzerRuntime::kMaxCaptureDurationSeconds,
         "Analyzer capture should stop deterministically at its duration bound. recording=" +
             juce::String(boundedCapture.record_enabled() ? "true" : "false") +
             " summary=" + juce::String(boundedCapture.has_take_summary() ? "true" : "false") +
             " duration=" + juce::String(boundedCapture.has_take_summary()
                                              ? boundedCapture.take_summary().duration_seconds()
                                              : -1.0f) +
             " frames=" + juce::String(boundedCapture.has_take_summary()
                                            ? static_cast<int>(boundedCapture.take_summary().frame_count())
                                            : -1));

  auto oversizedState = padpilot::proto::createDefaultAnalyzerState();
  oversizedState.set_revision(23);
  auto* summary = oversizedState.mutable_take_summary();
  summary->set_frame_count(1);
  summary->set_duration_seconds(1.0f);
  summary->set_captured_bpm(120.0f);
  for (std::size_t index = 0;
       index <= padpilot::AnalyzerRuntime::kMaxPersistedNoteEvents;
       ++index) {
    auto* event = oversizedState.add_note_events();
    event->set_midi_note(static_cast<std::uint32_t>(index % 128U));
    event->set_start_frame(0);
    event->set_end_frame(1);
    event->set_intensity(0.5f);
    event->set_velocity(64);
    event->set_mean_frequency_hz(440.0f);
  }
  runtime->restoreState(oversizedState);
  const auto truncatedState = readAnalyzerRuntimeState(*runtime);
  std::string truncatedBytes;
  expect(truncatedState.SerializeToString(&truncatedBytes),
         "Bounded Analyzer state should serialize.");
  expect(truncatedState.note_events_size() ==
             static_cast<int>(padpilot::AnalyzerRuntime::kMaxPersistedNoteEvents),
         "Analyzer restore should retain only the deterministic note-event prefix.");
  expect(truncatedBytes.size() <= padpilot::AnalyzerRuntime::kMaxSerializedStateBytes,
         "Analyzer serialized state should always fit the host module-state payload limit.");
  runtime->release();
}

void runModuleStoreTests() {
  const auto root = createTempRoot();
  const auto modulesRoot = root.getChildFile("modules");
  const auto oversizedTransaction = modulesRoot.getChildFile("installed")
                                        .getChildFile(".staging")
                                        .getChildFile("transaction--oversized--1.0.0");
  expect(oversizedTransaction.createDirectory(),
         "Module recovery fixture should create an oversized transaction directory.");
  const auto oversizedTransactionMarker = oversizedTransaction.getChildFile("transaction.json");
  {
    auto output = oversizedTransactionMarker.createOutputStream();
    expect(output != nullptr && output->setPosition(16 * 1024) && output->writeByte(0),
           "Module recovery fixture should create an oversized transaction marker.");
  }
  padpilot::ModuleStore store(modulesRoot.getFullPathName().toStdString());
  expect(oversizedTransactionMarker.existsAsFile(),
         "Module recovery should ignore oversized transaction markers without reading or applying them.");

  const auto seeded = store.loadAllModules();
  expect(std::any_of(seeded.begin(), seeded.end(), [](const auto& module) { return module.id == "fx"; }),
         "Factory modules should be seeded into a fresh module store.");

  const auto created = store.createDefaultModule("Staff Approval Fixture");
  expect(created.id.find("staff-approval-fixture") != std::string::npos,
         "Default modules should derive kebab-case ids from the requested name.");
  expect(juce::File(created.installRootPath).exists(),
         "Default modules should materialize a starter bundle on disk.");
  expect(store.saveModule(created), "Default modules should save into the registry.");

  const auto loaded = store.loadAllModules();
  const auto match = std::find_if(loaded.begin(), loaded.end(), [&created](const auto& module) { return module.id == created.id; });
  expect(match != loaded.end(), "Saved modules should be discoverable in the registry.");
  expect(match->entryPath == created.entryPath, "Saved modules should preserve their resolved UI entry path.");

  auto forgedReference = created;
  forgedReference.name = "Forged Name";
  forgedReference.version = "9.9.9";
  forgedReference.entryPath = "builtin://forged/ui";
  forgedReference.scriptEntryPath = root.getChildFile("forged-script.js").getFullPathName().toStdString();
  forgedReference.installRootPath = root.getFullPathName().toStdString();
  forgedReference.manifestPath = root.getChildFile("forged-manifest.json").getFullPathName().toStdString();
  forgedReference.capabilities = {"haptics", "fx-graph"};
  forgedReference.loadStatus = "ready";
  const auto trustedReference = store.restorePersistedModuleReference(forgedReference, loaded);
  expect(trustedReference.name == created.name && trustedReference.entryPath == created.entryPath &&
             trustedReference.scriptEntryPath == created.scriptEntryPath &&
             trustedReference.installRootPath == created.installRootPath &&
             trustedReference.capabilities == created.capabilities && trustedReference.loadStatus == "ready" &&
             trustedReference.expectedModuleVersion == "9.9.9" &&
             trustedReference.resolvedModuleVersion == created.version,
         "Host state module references should use installed registry execution metadata exclusively.");

  const auto createdRegistry = root.getChildFile("modules")
                                   .getChildFile("registry")
                                   .getChildFile(created.id + "--" + created.version + ".json");
  auto forgedRegistryVar = juce::JSON::parse(createdRegistry.loadFileAsString());
  auto* forgedRegistry = forgedRegistryVar.getDynamicObject();
  expect(forgedRegistry != nullptr, "Registry trust fixture should parse starter record.");
  forgedRegistry->setProperty("entryPath", "builtin://forged/ui");
  forgedRegistry->setProperty("scriptEntryPath", root.getChildFile("forged-script.js").getFullPathName());
  forgedRegistry->setProperty("installRootPath", root.getFullPathName());
  forgedRegistry->setProperty("manifestPath", root.getChildFile("forged-manifest.json").getFullPathName());
  forgedRegistry->setProperty("capabilities", juce::Array<juce::var> {"haptics", "fx-graph"});
  expect(createdRegistry.replaceWithText(juce::JSON::toString(forgedRegistryVar, true)),
         "Registry trust fixture should write forged execution metadata.");
  const auto registryHardenedModules = store.loadAllModules();
  const auto registryHardened = std::find_if(
      registryHardenedModules.begin(), registryHardenedModules.end(), [&created](const auto& module) {
        return module.id == created.id;
      });
  expect(registryHardened != registryHardenedModules.end() &&
             registryHardened->entryPath == created.entryPath &&
             registryHardened->scriptEntryPath == created.scriptEntryPath &&
             registryHardened->installRootPath == created.installRootPath &&
             registryHardened->capabilities == created.capabilities,
         "Registry loading should reconstruct executable metadata from the canonical installed manifest.");

  const auto forgedBuiltinRegistry = root.getChildFile("modules")
                                         .getChildFile("registry")
                                         .getChildFile("forged-builtin--1.0.0.json");
  expect(forgedBuiltinRegistry.replaceWithText(
             R"({"id":"forged-builtin","name":"Forged","version":"1.0.0","entryPath":"builtin://factory/forged-builtin","loadStatus":"ready","capabilities":["haptics"]})"),
         "Registry trust fixture should write unknown builtin record.");
  const auto unknownBuiltinModules = store.loadAllModules();
  const auto unknownBuiltin = std::find_if(
      unknownBuiltinModules.begin(), unknownBuiltinModules.end(), [](const auto& module) {
        return module.id == "forged-builtin";
      });
  expect(unknownBuiltin != unknownBuiltinModules.end() && unknownBuiltin->loadStatus == "missing" &&
             unknownBuiltin->entryPath.empty() && unknownBuiltin->scriptEntryPath.empty() &&
             unknownBuiltin->capabilities.empty(),
         "Registry loading should never trust unknown builtin URLs or capabilities.");

  const auto forgedFactoryRegistry = root.getChildFile("modules")
                                         .getChildFile("registry")
                                         .getChildFile("fx--99.0.0.json");
  expect(forgedFactoryRegistry.replaceWithText(
             R"({"id":"fx","name":"Forged FX","version":"99.0.0","entryPath":"builtin://forged/fx","loadStatus":"ready","capabilities":["haptics"]})"),
         "Registry trust fixture should write a forged factory record.");
  const auto factoryHardenedModules = store.loadAllModules();
  const auto factoryCount = std::count_if(
      factoryHardenedModules.begin(), factoryHardenedModules.end(), [](const auto& module) { return module.id == "fx"; });
  const auto factoryModule = std::find_if(
      factoryHardenedModules.begin(), factoryHardenedModules.end(), [](const auto& module) { return module.id == "fx"; });
  expect(factoryCount == 1 && factoryModule != factoryHardenedModules.end() &&
             factoryModule->name == "FX" && factoryModule->entryPath == "builtin://factory/fx" &&
             std::find(factoryModule->capabilities.begin(), factoryModule->capabilities.end(), "haptics") ==
                 factoryModule->capabilities.end(),
         "Reserved factory ids should always resolve to the exact built-in allowlist record.");

  forgedReference.id = "missing-forged-module";
  const auto inertReference = store.restorePersistedModuleReference(forgedReference, loaded);
  expect(inertReference.id == forgedReference.id && inertReference.name == forgedReference.name &&
             inertReference.version == forgedReference.version && inertReference.loadStatus == "missing" &&
             inertReference.entryPath.empty() && inertReference.scriptEntryPath.empty() &&
             inertReference.installRootPath.empty() && inertReference.manifestPath.empty() &&
             inertReference.capabilities.empty() && inertReference.resolvedModuleVersion.empty(),
         "Missing host state module references should remain inert without executable metadata or capabilities.");

  forgedReference.id = "../unsafe";
  expect(store.restorePersistedModuleReference(forgedReference, loaded).id.empty(),
         "Host state should reject invalid persisted module identifiers.");

  const auto resolved = store.resolveWebResourcePath(created.entryPath);
  expect(resolved.has_value() && juce::File(*resolved).existsAsFile(),
         "Module web resource resolution should point to installed UI assets.");
  const auto moduleWebPrefix = "/__padpilot/modules/" + created.id + "/" + created.version + "/";
  expect(!store.resolveWebResourcePath(moduleWebPrefix + "C:/Windows/win.ini").has_value() &&
             !store.resolveWebResourcePath(moduleWebPrefix + "../" + created.version + "-sibling/leak.js").has_value() &&
             !store.resolveWebResourcePath(moduleWebPrefix + std::string(1025, 'x')).has_value(),
         "Module web resource resolution should reject absolute, prefix-sibling, and oversized paths.");

  const auto outsideResource = root.getChildFile("outside-resource.js");
  expect(outsideResource.replaceWithText("export default 'outside';"),
         "Module resource link fixture should create an outside file.");
  const auto linkedResource = juce::File(created.installRootPath).getChildFile("ui").getChildFile("linked-resource.js");
  if (outsideResource.createSymbolicLink(linkedResource, true)) {
    expect(!store.resolveWebResourcePath(moduleWebPrefix + "ui/linked-resource.js").has_value(),
           "Module web resource resolution should reject symlinks and Windows reparse points.");
  }

  const auto oversizedManifest = juce::File(created.manifestPath);
  {
    auto output = oversizedManifest.createOutputStream();
    expect(output != nullptr && output->setPosition(1024 * 1024) && output->writeByte(0),
           "Module hydration fixture should create an oversized manifest.");
  }
  const auto oversizedManifestModules = store.loadAllModules();
  const auto oversizedManifestModule = std::find_if(
      oversizedManifestModules.begin(), oversizedManifestModules.end(), [&created](const auto& module) {
        return module.id == created.id;
      });
  expect(oversizedManifestModule != oversizedManifestModules.end() &&
             oversizedManifestModule->loadStatus == "missing",
         "Module hydration should reject oversized manifests before loading their contents.");

  auto missing = created;
  juce::File(missing.installRootPath).deleteRecursively();
  missing = store.hydrateModuleRecord(missing);
  expect(missing.loadStatus == "missing",
         "Hydration should flag installed modules whose bundle files disappeared.");
  forgedReference.id = missing.id;
  const auto missingRegisteredReference = store.restorePersistedModuleReference(forgedReference, {missing});
  expect(missingRegisteredReference.loadStatus == "missing" &&
             missingRegisteredReference.entryPath.empty() && missingRegisteredReference.scriptEntryPath.empty() &&
             missingRegisteredReference.capabilities.empty(),
         "Unavailable registered modules should restore as inert references.");

  std::string installError;
  const auto firstBundle = createModuleBundle(root, "rollback-first.zip", "old-install");
  const auto firstInstall = store.installBundle(firstBundle.getFullPathName().toStdString(), installError);
  expect(firstInstall.has_value(), "Module store should install rollback fixture.");
  const auto markerFile = juce::File(firstInstall->installRootPath).getChildFile("marker.txt");
  expect(markerFile.loadFileAsString() == "old-install",
         "Module rollback fixture should begin with old installed marker.");

  const auto registryTarget = root.getChildFile("modules")
                                  .getChildFile("registry")
                                  .getChildFile("rollback-fixture--1.0.0.json");
  const auto oldRegistryText = registryTarget.loadFileAsString();
  expect(oldRegistryText.isNotEmpty(), "Module rollback fixture should preserve original registry JSON.");
  expect(registryTarget.deleteFile() && registryTarget.createDirectory(),
         "Module rollback fixture should replace registry file with a blocking directory.");
  const auto replacementBundle = createModuleBundle(root, "rollback-replacement.zip", "new-install");
  expect(!store.installBundle(replacementBundle.getFullPathName().toStdString(), installError).has_value(),
         "Module replacement should fail when registry update cannot commit.");
  expect(markerFile.existsAsFile() && markerFile.loadFileAsString() == "old-install",
         "Failed same-version replacement should restore previous installed bundle.");

  expect(registryTarget.deleteRecursively() && registryTarget.replaceWithText(oldRegistryText),
         "Module recovery fixture should restore writable original registry record.");
  const auto stagingRoot = root.getChildFile("modules").getChildFile("installed").getChildFile(".staging");
  const auto transactionRoot = stagingRoot.getChildFile("transaction--rollback-fixture--1.0.0--recovery");
  expect(transactionRoot.createDirectory(), "Module recovery fixture should create prepared transaction root.");
  expect(juce::File(firstInstall->installRootPath).copyDirectoryTo(transactionRoot.getChildFile("install-backup")),
         "Module recovery fixture should preserve old install backup.");
  expect(registryTarget.copyFileTo(transactionRoot.getChildFile("registry-backup.json")),
         "Module recovery fixture should preserve old registry backup.");
  expect(transactionRoot.getChildFile("transaction.json").replaceWithText(
             R"({"moduleId":"rollback-fixture","version":"1.0.0","hadInstall":true,"hadRegistry":true,"phase":"prepared"})"),
         "Module recovery fixture should write prepared marker.");
  expect(markerFile.replaceWithText("new-live-install") && registryTarget.replaceWithText("new-live-registry"),
         "Module recovery fixture should synthesize partially committed live state.");
  const auto markerlessTransaction = stagingRoot.getChildFile("transaction--markerless");
  expect(markerlessTransaction.getChildFile("candidate").createDirectory() &&
             markerlessTransaction.getChildFile("candidate").getChildFile("partial.txt").replaceWithText("partial"),
         "Module recovery fixture should synthesize markerless extraction.");
  padpilot::ModuleStore recoveredStore(root.getChildFile("modules").getFullPathName().toStdString());
  expect(markerFile.loadFileAsString() == "old-install" && registryTarget.loadFileAsString() == oldRegistryText,
         "Module store startup should restore prepared install and registry backups.");
  expect(!transactionRoot.exists() && !markerlessTransaction.exists(),
         "Module store startup should remove recovered transaction and markerless extraction.");
  const auto recoveredModules = recoveredStore.loadAllModules();
  expect(std::any_of(recoveredModules.begin(), recoveredModules.end(), [](const auto& module) {
           return module.id == "rollback-fixture";
         }),
         "Recovered module registry should remain discoverable.");

  const auto absoluteBundle = createModuleBundle(root, "unsafe-absolute.zip", "unsafe", {"C:/escape.txt"});
  expect(!store.installBundle(absoluteBundle.getFullPathName().toStdString(), installError).has_value() &&
             installError.find("unsafe archive path") != std::string::npos,
         "Module store should reject raw drive-absolute archive entries.");
  const auto uncBundle = createModuleBundle(root, "unsafe-unc.zip", "unsafe", {"//server/share/escape.txt"});
  expect(!store.installBundle(uncBundle.getFullPathName().toStdString(), installError).has_value() &&
             installError.find("unsafe archive path") != std::string::npos,
         "Module store should reject raw UNC archive entries.");
  const auto caseCollisionBundle = createModuleBundle(
      root, "unsafe-case-collision.zip", "unsafe", {"UI/INDEX.JS"});
  expect(!store.installBundle(caseCollisionBundle.getFullPathName().toStdString(), installError).has_value() &&
             installError.find("case-colliding") != std::string::npos,
         "Module store should reject case-colliding archive paths on Windows.");
  const auto unsafeVersionBundle = createModuleBundle(
      root,
      "unsafe-version.zip",
      "unsafe",
      {},
      "1.0.0-../../escape");
  expect(!store.installBundle(unsafeVersionBundle.getFullPathName().toStdString(), installError).has_value(),
         "Module store should reject traversal-shaped semantic versions.");
  const auto reservedFactoryBundle = createModuleBundle(
      root,
      "reserved-factory-id.zip",
      "unsafe",
      {},
      "99.0.0",
      "fx");
  expect(!store.installBundle(reservedFactoryBundle.getFullPathName().toStdString(), installError).has_value() &&
             installError.find("reserved") != std::string::npos,
         "Module store should reject custom bundles that try to replace a factory module id.");

  const auto boundaryRoot = createTempRoot();
  const auto outsideInstalled = boundaryRoot.getChildFile("outside-installed");
  const auto linkedModules = boundaryRoot.getChildFile("linked-modules");
  expect(outsideInstalled.createDirectory() &&
             linkedModules.getChildFile("registry").createDirectory(),
         "Module storage boundary fixture should create directory roots.");
  const auto linkedInstalled = linkedModules.getChildFile("installed");
  if (outsideInstalled.createSymbolicLink(linkedInstalled, true)) {
    padpilot::ModuleStore linkedInstalledStore(linkedModules.getFullPathName().toStdString());
    expect(linkedInstalledStore.createDefaultModule("Unsafe Root Fixture").id.empty(),
           "Module storage should fail closed when installed is a symlink or reparse point.");
    linkedInstalled.deleteFile();
  }

  const auto outsideRegistry = boundaryRoot.getChildFile("outside-registry");
  const auto registryLinkedModules = boundaryRoot.getChildFile("registry-linked-modules");
  expect(outsideRegistry.createDirectory() &&
             registryLinkedModules.getChildFile("installed").createDirectory(),
         "Module registry boundary fixture should create directory roots.");
  const auto linkedRegistry = registryLinkedModules.getChildFile("registry");
  if (outsideRegistry.createSymbolicLink(linkedRegistry, true)) {
    padpilot::ModuleStore linkedRegistryStore(registryLinkedModules.getFullPathName().toStdString());
    auto factory = loaded.front();
    expect(!linkedRegistryStore.saveModule(factory),
           "Module storage should fail closed when registry is a symlink or reparse point.");
    linkedRegistry.deleteFile();
  }

  const auto stagingModules = boundaryRoot.getChildFile("staging-modules");
  padpilot::ModuleStore stagingStore(stagingModules.getFullPathName().toStdString());
  const auto stagingPath = stagingModules.getChildFile("installed").getChildFile(".staging");
  const auto outsideStaging = boundaryRoot.getChildFile("outside-staging");
  expect(outsideStaging.createDirectory() && stagingPath.deleteRecursively(),
         "Module staging boundary fixture should replace the trusted empty staging root.");
  if (outsideStaging.createSymbolicLink(stagingPath, true)) {
    const auto stagingBundle = createModuleBundle(boundaryRoot, "staging-link.zip", "unsafe-staging");
    expect(!stagingStore.installBundle(stagingBundle.getFullPathName().toStdString(), installError).has_value(),
           "Module installation should reject a symlinked or reparse-point staging root.");
    stagingPath.deleteFile();
  }
  boundaryRoot.deleteRecursively();

  root.deleteRecursively();
}

void runPresetStoreTests() {
  const auto root = createTempRoot();
  padpilot::PresetStore store(root.getChildFile("presets").getFullPathName().toStdString());

  const auto preset = store.createDefaultPreset("fx", "Staff Fixture Preset");
  expect(store.savePreset(preset), "JSON-backed presets should save successfully.");
  const auto distinctPreset = store.createDefaultPreset("fx", "Distinct Fixture Preset");
  expect(distinctPreset.id != preset.id,
         "Preset ids should remain unique when multiple presets are created in one clock tick.");

  padpilot::PresetRecord protoPreset;
  protoPreset.id = "proto-fixture";
  protoPreset.moduleId = "fx";
  protoPreset.name = "Proto Fixture";
  protoPreset.payloadJson = "AQIDBA==";
  expect(store.savePreset(protoPreset), "Base64-backed presets should save successfully.");

  const auto loaded = store.loadPresetsForModule("fx");
  expect(loaded.size() == 2, "Preset store should return saved presets for the requested module.");
  expect(std::any_of(loaded.begin(), loaded.end(), [&protoPreset](const auto& entry) {
           return entry.id == protoPreset.id && entry.payloadJson == protoPreset.payloadJson;
         }),
         "Preset store should round-trip proto-base64 payloads without JSON coercion.");

  auto unsafePreset = protoPreset;
  unsafePreset.id = "../escaped-preset";
  expect(!store.savePreset(unsafePreset),
         "Preset store should reject ids that could escape the preset directory.");
  expect(!root.getChildFile("escaped-preset.json").exists(),
         "Rejected preset ids should not create files outside the preset directory.");

  auto malformedPreset = protoPreset;
  malformedPreset.id = "malformed-payload";
  malformedPreset.payloadJson = "not json or base64!";
  expect(!store.savePreset(malformedPreset),
         "Preset store should reject malformed encoded payloads.");

  const auto forgedFile = root.getChildFile("presets").getChildFile("forged-file.json");
  expect(forgedFile.replaceWithText(
             R"({"id":"different-id","moduleId":"fx","name":"Forged","payload":{}})"),
         "Preset test should create a forged registry fixture.");
  expect(store.loadPresetsForModule("fx").size() == 2,
         "Preset store should ignore records whose id does not match the containing filename.");

  const auto boundaryRoot = createTempRoot();
  const auto outsidePresets = boundaryRoot.getChildFile("outside-presets");
  const auto linkedPresets = boundaryRoot.getChildFile("presets");
  expect(outsidePresets.createDirectory(),
         "Preset storage boundary fixture should create an outside directory.");
  if (outsidePresets.createSymbolicLink(linkedPresets, true)) {
    padpilot::PresetStore linkedStore(linkedPresets.getFullPathName().toStdString());
    expect(!linkedStore.savePreset(preset) &&
               !outsidePresets.getChildFile(preset.id + ".json").exists(),
           "Preset storage should reject a symlinked or reparse-point root without writing through it.");
    linkedPresets.deleteFile();
  }
  boundaryRoot.deleteRecursively();

  root.deleteRecursively();
}

void runProtoTests() {
  padpilot::bridge::PluginState minimalPluginState;
  minimalPluginState.set_schema_version(7);
  std::string minimalPluginStateBytes;
  expect(minimalPluginState.SerializeToString(&minimalPluginStateBytes) &&
             padpilot::preflightPluginStateWire(
                 minimalPluginStateBytes.data(), minimalPluginStateBytes.size()),
         "Plugin-state wire preflight should accept canonical bounded protobuf.");

  padpilot::bridge::PluginState parameterState;
  parameterState.set_schema_version(8);
  for (std::size_t index = 0; index < padpilot::state_wire_limits::kMaximumPersistedParameterValues; ++index) {
    parameterState.add_parameter_values(static_cast<float>(index) /
                                        static_cast<float>(padpilot::state_wire_limits::kMaximumPersistedParameterValues));
  }
  std::string parameterStateBytes;
  expect(parameterState.SerializeToString(&parameterStateBytes) &&
             padpilot::preflightPluginStateWire(parameterStateBytes.data(), parameterStateBytes.size()),
         "Plugin-state wire preflight should accept the complete bounded parameter snapshot.");
  parameterState.add_parameter_values(0.5f);
  expect(parameterState.SerializeToString(&parameterStateBytes) &&
             !padpilot::preflightPluginStateWire(parameterStateBytes.data(), parameterStateBytes.size()),
         "Plugin-state wire preflight should reject oversized parameter snapshots before parsing.");

  padpilot::bridge::PluginState legacyLongPathState;
  legacyLongPathState.set_schema_version(7);
  auto* legacyModule = legacyLongPathState.add_modules();
  legacyModule->set_id("legacy-long-root");
  legacyModule->set_name("Legacy long root");
  legacyModule->set_version("1.0.0");
  legacyModule->set_ui_entry_path(std::string(32 * 1024, 'u'));
  legacyModule->set_script_entry_path(std::string(32 * 1024, 's'));
  std::string legacyLongPathBytes;
  expect(legacyLongPathState.SerializeToString(&legacyLongPathBytes) &&
             padpilot::preflightPluginStateWire(legacyLongPathBytes.data(), legacyLongPathBytes.size()),
         "Plugin-state wire preflight should accept bounded legacy absolute module paths.");

  std::string repeatedPresetBomb;
  repeatedPresetBomb.reserve(2U * 4097U);
  for (int index = 0; index < 4097; ++index) {
    repeatedPresetBomb.push_back(static_cast<char>((3U << 3U) | 2U));
    repeatedPresetBomb.push_back('\0');
  }
  expect(!padpilot::preflightPluginStateWire(repeatedPresetBomb.data(), repeatedPresetBomb.size()),
         "Plugin-state wire preflight should reject repeated preset counts before protobuf allocation.");

  std::string repeatedModuleStateBomb;
  repeatedModuleStateBomb.reserve(2U * 259U);
  for (int index = 0; index < 259; ++index) {
    repeatedModuleStateBomb.push_back(static_cast<char>((4U << 3U) | 2U));
    repeatedModuleStateBomb.push_back('\0');
  }
  expect(!padpilot::preflightPluginStateWire(
             repeatedModuleStateBomb.data(), repeatedModuleStateBomb.size()),
         "Plugin-state wire preflight should reject repeated module-state counts before protobuf allocation.");

  const std::array<std::uint8_t, 2> truncatedPluginState {
      static_cast<std::uint8_t>((4U << 3U) | 2U),
      0x80U,
  };
  expect(!padpilot::preflightPluginStateWire(
             truncatedPluginState.data(), truncatedPluginState.size()),
         "Plugin-state wire preflight should reject truncated length-delimited fields.");

  padpilot::analyzer::AnalyzerModuleState analyzerBomb;
  for (std::size_t index = 0;
       index <= padpilot::AnalyzerRuntime::kMaxPersistedNoteEvents;
       ++index) {
    analyzerBomb.add_note_events();
  }
  std::string analyzerBombBytes;
  analyzerBomb.SerializeToString(&analyzerBombBytes);
  expect(!padpilot::preflightAnalyzerModuleStateWire(analyzerBombBytes),
         "Analyzer wire preflight should reject repeated note-event bombs before parsing.");

  padpilot::recut::RecutModuleState recutBomb;
  for (int index = 0; index < 17; ++index) {
    recutBomb.add_slice_markers();
  }
  std::string recutBombBytes;
  recutBomb.SerializeToString(&recutBombBytes);
  expect(!padpilot::preflightRecutModuleStateWire(recutBombBytes),
         "Recut wire preflight should reject repeated slice bombs before parsing.");

  padpilot::fx::FxChainState fxBomb;
  for (int index = 0; index < 9; ++index) {
    fxBomb.add_chains();
  }
  std::string fxBombBytes;
  fxBomb.SerializeToString(&fxBombBytes);
  expect(!padpilot::preflightFxChainStateWire(fxBombBytes),
         "FX wire preflight should reject repeated chain bombs before parsing.");

  padpilot::bridge::SetControllerConfigRequest controllerBomb;
  for (std::size_t index = 0; index <= padpilot::kMaxControllerConfigRows; ++index) {
    controllerBomb.mutable_controller_config()->add_rows();
  }
  std::string controllerBombBytes;
  controllerBomb.SerializeToString(&controllerBombBytes);
  expect(!padpilot::preflightSetControllerConfigRequestWire(controllerBombBytes),
         "Controller wire preflight should reject repeated row bombs before parsing.");

  padpilot::capability::SampleAnalysisRequest analysisBomb;
  padpilot::capability::SlicePlaybackState playbackBomb;
  for (int index = 0; index < 17; ++index) {
    analysisBomb.add_manual_markers();
    playbackBomb.add_slice_markers();
  }
  std::string analysisBombBytes;
  std::string playbackBombBytes;
  analysisBomb.SerializeToString(&analysisBombBytes);
  playbackBomb.SerializeToString(&playbackBombBytes);
  expect(!padpilot::preflightSampleAnalysisRequestWire(analysisBombBytes) &&
             !padpilot::preflightSlicePlaybackStateWire(playbackBombBytes),
         "Capability wire preflights should reject repeated slice bombs before parsing.");

  const auto analyzerState = padpilot::proto::createDefaultAnalyzerState();
  expect(analyzerState.schema_version() == 3, "Analyzer default state should set the current schema version.");
  padpilot::analyzer::AnalyzerModuleState parsedAnalyzer;
  expect(padpilot::proto::parseAnalyzerModuleState(
             padpilot::proto::serializeAnalyzerModuleState(analyzerState),
             &parsedAnalyzer),
         "Analyzer proto should round-trip through bytes.");
  expect(parsedAnalyzer.detection_sensitivity() == analyzerState.detection_sensitivity(),
         "Analyzer proto round-trip should preserve detection sensitivity.");

  const auto recutState = padpilot::proto::createDefaultRecutState();
  padpilot::recut::RecutModuleState parsedRecut;
  expect(padpilot::proto::parseRecutModuleState(
             padpilot::proto::serializeRecutModuleState(recutState),
             &parsedRecut),
         "Recut proto should round-trip through bytes.");
  expect(!parsedRecut.loaded(), "Recut default state should stay unloaded after round-trip.");

  const auto fxState = padpilot::proto::createDefaultFxChainState();
  padpilot::fx::FxChainState parsedFx;
  expect(padpilot::proto::parseFxChainState(
             padpilot::proto::serializeFxChainState(fxState),
             &parsedFx),
         "FX chain proto should round-trip through bytes.");
  expect(parsedFx.chains_size() == fxState.chains_size(),
         "FX chain proto round-trip should preserve chain count.");

  padpilot::bridge::PresetSaveRequest presetRequest;
  presetRequest.set_name("Staff Approval");
  presetRequest.mutable_preset()->set_id("fixture");
  std::string presetRequestBytes;
  presetRequest.SerializeToString(&presetRequestBytes);
  padpilot::bridge::PresetSaveRequest parsedPresetRequest;
  expect(padpilot::proto::parsePresetSaveRequestBase64(
             padpilot::proto::bytesToBase64(presetRequestBytes),
             &parsedPresetRequest),
         "Preset save requests should parse from base64.");
  expect(parsedPresetRequest.name() == presetRequest.name(),
         "Preset save request parsing should preserve request data.");

  padpilot::bridge::SetModuleStateRequest stateRequest;
  stateRequest.set_module_id("fx");
  stateRequest.set_payload("state");
  stateRequest.set_revision(7);
  std::string stateRequestBytes;
  stateRequest.SerializeToString(&stateRequestBytes);
  padpilot::bridge::SetModuleStateRequest parsedStateRequest;
  expect(padpilot::proto::parseSetModuleStateRequestBase64(
             padpilot::proto::bytesToBase64(stateRequestBytes),
             &parsedStateRequest),
         "Set-module-state requests should parse from base64.");
  expect(parsedStateRequest.revision() == 7,
         "Set-module-state request parsing should preserve revisions.");

  padpilot::capability::CapabilityFrameEnvelope envelope;
  envelope.set_handle("recut::sample-analysis::primary");
  envelope.set_payload_type("SampleEditorFrame");
  envelope.set_payload("frame");
  std::string envelopeBytes;
  expect(padpilot::proto::base64ToBytes(
             padpilot::proto::buildCapabilityFrameEnvelopeBase64(envelope),
             &envelopeBytes),
         "Capability envelopes should encode to base64.");
  padpilot::capability::CapabilityFrameEnvelope parsedEnvelope;
  expect(parsedEnvelope.ParseFromString(envelopeBytes),
         "Capability envelope bytes should parse back into the protobuf message.");
  expect(parsedEnvelope.handle() == envelope.handle(),
         "Capability envelope round-trip should preserve the handle.");

  const auto defaultControllerConfig = padpilot::createDefaultControllerConfig();
  static_assert(padpilot::kMaximumControllerHardwareIdBytes == 127U);
  static_assert(padpilot::kMaximumControllerLayoutNameBytes == 128U);
  static_assert(padpilot::state_wire_limits::kMaximumLegalHostSyncFrameBytes <=
                padpilot::state_wire_limits::kMaximumHostSyncFrameBytes);
  expect(defaultControllerConfig.rows.size() == 1,
         "Default controller config should seed one blank row.");
  expect(defaultControllerConfig.rows.front().isPrimary,
         "Default controller config should seed a primary row.");

  padpilot::bridge::ControllerConfigState controllerConfigProto;
  padpilot::populateProtoControllerConfig(defaultControllerConfig, &controllerConfigProto);
  auto restoredControllerConfig = padpilot::controllerConfigFromProto(controllerConfigProto);
  expect(restoredControllerConfig.rows.size() == 1,
         "Controller config protobuf round-trip should preserve rows.");
  expect(restoredControllerConfig.rows.front().isPrimary,
         "Controller config protobuf round-trip should preserve primary row.");
  restoredControllerConfig.rows.front().isPrimary = false;
  padpilot::ensureControllerConfigPrimaryRow(&restoredControllerConfig);
  expect(restoredControllerConfig.rows.front().isPrimary,
         "Controller config helper should re-seed a primary row when missing.");

  padpilot::bridge::ControllerConfigState hostileControllerConfig;
  for (int index = 0; index < 80; ++index) {
    auto* row = hostileControllerConfig.add_rows();
    row->set_stable_id("duplicate-row");
    row->set_hardware_id(std::string(512, 'x'));
    row->set_layout_kind(padpilot::bridge::CONTROLLER_LAYOUT_KIND_CUSTOM);
    row->set_custom_layout_id("missing-layout");
    row->set_is_primary(true);
  }
  for (int index = 0; index < 80; ++index) {
    auto* layout = hostileControllerConfig.add_custom_layouts();
    layout->set_id("duplicate-layout");
    layout->set_name(std::string(512, 'n'));
    auto* binding = layout->add_button_bindings();
    binding->set_binding_kind(padpilot::bridge::CONTROLLER_BINDING_KIND_BUTTON);
    binding->set_source_index(999);
    binding->set_threshold(std::numeric_limits<float>::quiet_NaN());
  }
  const auto boundedControllerConfig = padpilot::controllerConfigFromProto(hostileControllerConfig);
  expect(boundedControllerConfig.rows.size() == 64 && boundedControllerConfig.customLayouts.size() == 64,
         "Controller config parsing should cap persisted collection counts.");
  expect(std::count_if(boundedControllerConfig.rows.begin(), boundedControllerConfig.rows.end(), [](const auto& row) {
           return row.isPrimary;
         }) == 1,
         "Controller config parsing should retain exactly one primary row.");
  std::unordered_set<std::string> restoredRowIds;
  for (const auto& row : boundedControllerConfig.rows) {
    restoredRowIds.insert(row.stableId);
    expect(row.hardwareId.size() <= padpilot::kMaximumControllerHardwareIdBytes,
           "Controller config parsing should bound persisted hardware ids.");
    expect(row.layoutKind == padpilot::ControllerLayoutKind::autoDetect && row.customLayoutId.empty(),
           "Controller config parsing should clear missing custom-layout references.");
  }
  expect(restoredRowIds.size() == boundedControllerConfig.rows.size(),
         "Controller config parsing should repair duplicate stable row ids.");
  expect(boundedControllerConfig.customLayouts.front().name.size() ==
             padpilot::kMaximumControllerLayoutNameBytes,
         "Controller config parsing should apply the public layout-name byte cap.");
  expect(boundedControllerConfig.customLayouts.front().buttonBindings.front().bindingKind ==
             padpilot::ControllerBindingKind::none,
         "Controller config parsing should reject non-finite or out-of-range bindings.");

  padpilot::ControllerConfigState saturatedControllerConfig;
  for (std::size_t index = 0; index < padpilot::kMaxControllerConfigRows; ++index) {
    padpilot::ControllerConfigRow row;
    row.stableId = "saturated-" + std::to_string(index);
    row.hardwareId = "connected-" + std::to_string(index);
    row.isPrimary = index == 0;
    saturatedControllerConfig.rows.push_back(std::move(row));
  }
  std::vector<std::string> saturatedHardwareIds;
  for (std::size_t index = 0; index < padpilot::kMaxControllerConfigRows; ++index) {
    saturatedHardwareIds.push_back("connected-" + std::to_string(index));
  }
  saturatedHardwareIds.push_back("new-controller");
  expect(!padpilot::syncControllerConfigRows(&saturatedControllerConfig, saturatedHardwareIds) &&
             saturatedControllerConfig.rows.size() == padpilot::kMaxControllerConfigRows &&
             padpilot::findControllerConfigRow(saturatedControllerConfig, "new-controller") == nullptr,
         "Controller auto-sync should never append a sixty-fifth live controller row.");

  auto reusableControllerConfig = saturatedControllerConfig;
  const auto reusedStableId = reusableControllerConfig.rows[1].stableId;
  reusableControllerConfig.rows[1].hardwareId = "disconnected-controller";
  reusableControllerConfig.rows[1].layoutKind = padpilot::ControllerLayoutKind::customLayout;
  reusableControllerConfig.rows[1].customLayoutId = "old-layout";
  saturatedHardwareIds[1] = "new-controller";
  expect(padpilot::syncControllerConfigRows(&reusableControllerConfig, saturatedHardwareIds) &&
             reusableControllerConfig.rows.size() == padpilot::kMaxControllerConfigRows &&
             reusableControllerConfig.rows[1].stableId == reusedStableId &&
             reusableControllerConfig.rows[1].hardwareId == "new-controller" &&
             reusableControllerConfig.rows[1].layoutKind == padpilot::ControllerLayoutKind::autoDetect &&
             reusableControllerConfig.rows[1].customLayoutId.empty(),
         "Controller auto-sync should deterministically reuse the first disconnected non-primary row.");
  expect(padpilot::detectControllerLayout("Sony DualSense Wireless Controller", "sony") ==
             padpilot::ControllerLayoutKind::playstation,
         "Controller autodetect should recognize common PlayStation naming.");
  expect(padpilot::detectControllerLayout("Nintendo Switch Pro Controller", "nintendo") ==
             padpilot::ControllerLayoutKind::switchPro,
         "Controller autodetect should recognize common Switch naming.");

  std::array<float, padpilot::kMaxControllerAxes> rawAxes {};
  std::array<float, padpilot::kMaxControllerButtons> rawButtons {};
  padpilot::ControllerButtonBinding thresholdBinding {
      padpilot::ControllerBindingKind::axisPositive,
      0,
      0.5f,
  };
  rawAxes[0] = 0.49f;
  expect(padpilot::resolveControllerButtonValue(thresholdBinding, rawAxes, rawButtons) == 0.0f,
         "Axis-backed buttons should remain inactive below their configured threshold.");
  rawAxes[0] = 0.5f;
  expect(padpilot::resolveControllerButtonValue(thresholdBinding, rawAxes, rawButtons) == 0.5f,
         "Axis-backed buttons should activate at their configured threshold.");
  rawAxes[0] = 0.8f;
  expect(padpilot::resolveControllerButtonValue(thresholdBinding, rawAxes, rawButtons) == 0.8f,
         "Axis-backed buttons should preserve normalized pressure above threshold.");
  thresholdBinding.bindingKind = padpilot::ControllerBindingKind::axisNegative;
  rawAxes[0] = -0.75f;
  expect(padpilot::resolveControllerButtonValue(thresholdBinding, rawAxes, rawButtons) == 0.75f,
         "Negative-axis button bindings should invert before applying their threshold.");

  auto primaryConfig = padpilot::createDefaultControllerConfig();
  primaryConfig.rows.front().hardwareId = "pad-b";
  padpilot::InputDeviceStates devices {};
  devices[0].connected = true;
  devices[0].kind = padpilot::InputDeviceKind::gamepad;
  std::memcpy(devices[0].hardwareId.data(), "pad-a", 5);
  devices[3].connected = true;
  devices[3].kind = padpilot::InputDeviceKind::gamepad;
  std::memcpy(devices[3].hardwareId.data(), "pad-b", 5);
  expect(padpilot::findPrimaryControllerDeviceSlot(primaryConfig, devices) == 3U,
         "Primary-device routing should select the configured controller even outside slot zero.");
  devices[3].connected = false;
  expect(padpilot::findPrimaryControllerDeviceSlot(primaryConfig, devices) == 0U,
         "Primary-device routing should fall back to a connected gamepad after disconnect.");
  devices[0].connected = false;
  expect(!padpilot::findPrimaryControllerDeviceSlot(primaryConfig, devices).has_value(),
         "Primary-device routing should report no target when every controller is disconnected.");
}

void runWebNavigationPolicyTests() {
  using Disposition = padpilot::WebNavigationDisposition;
  constexpr std::string_view root = "https://juce.backend/";
  expect(padpilot::classifyWebNavigation("https://juce.backend/index.html", root) ==
             Disposition::allowInternal &&
             padpilot::classifyWebNavigation("https://juce.backend/__padpilot/modules/example/1.0.0/ui.js", root) ==
                 Disposition::allowInternal,
         "Web navigation should allow only the exact internal resource-provider origin.");
  expect(padpilot::classifyWebNavigation("https://checkout.example/session", root) ==
             Disposition::openExternal &&
             padpilot::classifyWebNavigation("https://juce.backend.evil/index.html", root) ==
                 Disposition::openExternal,
         "HTTPS navigation outside the resource-provider origin should leave the native WebView.");
  expect(padpilot::classifyWebNavigation("http://localhost:8787/checkout", root) ==
             Disposition::reject,
         "Cleartext HTTP navigation should fail closed.");
  expect(padpilot::classifyWebNavigation("https://juce.backend/assets/index.html",
                                         "https://juce.backend/app/") == Disposition::openExternal,
         "Sibling same-origin paths should not inherit resource-provider trust.");
  expect(padpilot::classifyWebNavigation("padpilot://bridge/%7B%7D", root) ==
             Disposition::handleBridge,
         "The exact PadPilot bridge URL should remain internally handled.");
  for (const auto unsafe : {
           "padpilot://other/value",
           "file:///C:/Windows/win.ini",
           "javascript:alert(1)",
           "data:text/html,<script>alert(1)</script>",
           "mailto:test@example.com",
       }) {
    expect(padpilot::classifyWebNavigation(unsafe, root) == Disposition::reject,
           "Unsafe custom/local WebView navigation should fail closed.");
  }
}

void runAutomationIdentityTests() {
  expect(padpilot::isValidAutomationParameterId("pp.master.wet_dry") &&
             !padpilot::isValidAutomationParameterId("") &&
             !padpilot::isValidAutomationParameterId(
                 std::string(padpilot::kMaximumAutomationParameterIdBytes + 1U, 'a')) &&
             !padpilot::isValidAutomationParameterId("pp.master.wet_dry\nforged"),
         "Automation parameter IDs should use a small exact grammar.");
}

void runBoundedJsonTests() {
  expect(!padpilot::readBoundedJsonUInt(juce::var(1.0e300), 255U).has_value() &&
             !padpilot::readBoundedJsonUInt(juce::var(1.5), 255U).has_value() &&
             !padpilot::readBoundedJsonUInt(juce::var(-1), 255U).has_value(),
         "Bounded JSON integers should reject overflow, fractional, and negative values before casting.");
  expect(padpilot::readBoundedJsonUInt(juce::var(255), 255U) == 255U &&
             !padpilot::readBoundedJsonFloat(
                  juce::var(std::numeric_limits<double>::infinity()), -1.0f, 1.0f).has_value(),
         "Bounded JSON numeric parsing should accept exact limits and reject non-finite values.");
}

void runManagedFileStoreTests() {
  expect(padpilot::fitsAggregateByteBudget(16U * 1024U * 1024U,
                                           16U * 1024U * 1024U,
                                           32U * 1024U * 1024U) &&
             !padpilot::fitsAggregateByteBudget(25U * 1024U * 1024U,
                                                25U * 1024U * 1024U,
                                                32U * 1024U * 1024U) &&
             !padpilot::fitsAggregateByteBudget(std::numeric_limits<std::size_t>::max(),
                                                1U,
                                                32U * 1024U * 1024U),
         "Imported-media aggregate budget should accept its boundary and reject overflow safely.");
  const auto root = createTempRoot();
  padpilot::ManagedFileStore store(root.getChildFile("media").getFullPathName().toStdString());
  const std::string payload = "managed sample fixture bytes";
  std::string errorMessage;
  const auto imported = store.importSampleBytes(
      payload.data(),
      payload.size(),
      "fixture.wav",
      "audio/wav",
      padpilot::ManagedFileStore::kDefaultMaxImportBytes,
      errorMessage);
  expect(imported.has_value(), "Managed media should import valid bounded sample bytes.");
  expect(padpilot::ManagedFileStore::isValidContentId(imported->contentId),
         "Managed media should derive a validated content ID.");
  expect(imported->managedPath.find('\\') == std::string::npos,
         "Managed paths should serialize with portable forward slashes.");
  expect(store.resolveManagedSamplePath("../escape", "fixture.wav").empty(),
         "Managed media should reject path-shaped content IDs.");

  const auto impulse = store.importImpulseResponseBytes(
      payload.data(), payload.size(), "room.wav", "audio/wav",
      padpilot::ManagedFileStore::kDefaultMaxImportBytes, errorMessage);
  expect(impulse.has_value() && impulse->category == "impulse-response" &&
             juce::File(impulse->managedPath).getParentDirectory().getFileName() == "impulse-responses",
         "Managed IR import should use its own bounded media category.");
  expect(store.isManagedImpulseResponse(impulse->managedPath, impulse->contentId, impulse->sourceName),
         "Managed IR references should validate exact path, identity, name, size, and category.");
  expect(!store.isManagedImpulseResponse(imported->managedPath, imported->contentId, imported->sourceName),
         "Managed sample paths must not impersonate impulse responses.");

  const auto siblingPath = root.getChildFile("media-evil").getChildFile(imported->contentId + ".wav");
  expect(!store.healManagedFile(siblingPath.getFullPathName().toStdString(), payload, errorMessage),
         "Managed media should reject similarly prefixed sibling paths.");

  const auto managedFile = juce::File(imported->managedPath);
  expect(managedFile.deleteFile(), "Managed media fixture should delete before cache healing.");
  expect(!store.healManagedFile(imported->managedPath, payload + "corrupt", errorMessage),
         "Managed media should reject payloads that do not match content ID.");
  expect(store.healManagedFile(imported->managedPath, payload, errorMessage),
         "Managed media should heal matching fallback bytes.");
  std::string loadedBytes;
  expect(store.loadManagedFileBytes(imported->managedPath, &loadedBytes, errorMessage) && loadedBytes == payload,
         "Managed media should round-trip healed bytes.");

  const std::string oversizePayload(
      static_cast<std::size_t>(padpilot::ManagedFileStore::kDefaultMaxImportBytes + 1),
      'x');
  expect(!store.importSampleBytes(
              oversizePayload.data(),
              oversizePayload.size(),
              "oversize.wav",
              "audio/wav",
              std::numeric_limits<std::uint64_t>::max(),
              errorMessage)
              .has_value(),
         "Managed media should enforce hard 25 MiB cap even when caller requests more.");
  expect(!store.healManagedFile(imported->managedPath, oversizePayload, errorMessage),
         "Managed media healing should enforce the 25 MiB cap before touching disk.");
  expect(managedFile.replaceWithText("corrupt"),
         "Managed media fixture should replace cache with corrupt bytes.");
  expect(!store.loadManagedFileBytes(imported->managedPath, &loadedBytes, errorMessage),
         "Managed media should reject existing cache bytes with wrong content hash.");
  expect(store.healManagedFile(imported->managedPath, payload, errorMessage),
         "Managed media should replace corrupt existing cache from validated fallback.");
  expect(store.loadManagedFileBytes(imported->managedPath, &loadedBytes, errorMessage) && loadedBytes == payload,
         "Managed media should expose validated bytes after corrupt-cache healing.");
  {
    auto output = managedFile.createOutputStream();
    expect(output != nullptr &&
               output->setPosition(static_cast<juce::int64>(padpilot::ManagedFileStore::kDefaultMaxImportBytes)) &&
               output->writeByte('x'),
           "Managed media fixture should create an oversized sparse corrupt cache.");
  }
  const auto repairedImport = store.importSampleBytes(
      payload.data(),
      payload.size(),
      "fixture.wav",
      "audio/wav",
      padpilot::ManagedFileStore::kDefaultMaxImportBytes,
      errorMessage);
  expect(repairedImport.has_value() && managedFile.getSize() == static_cast<juce::int64>(payload.size()),
         "Managed media import should replace oversized corrupt cache without buffering it.");

  const auto boundaryRoot = createTempRoot();
  const auto mediaRoot = boundaryRoot.getChildFile("media");
  const auto outsideSamples = boundaryRoot.getChildFile("outside-samples");
  expect(mediaRoot.createDirectory() && outsideSamples.createDirectory(),
         "Managed media boundary fixture should create directory roots.");
  const auto linkedSamples = mediaRoot.getChildFile("samples");
  if (outsideSamples.createSymbolicLink(linkedSamples, true)) {
    padpilot::ManagedFileStore linkedStore(mediaRoot.getFullPathName().toStdString());
    expect(!linkedStore.importSampleBytes(
                payload.data(),
                payload.size(),
                "linked.wav",
                "audio/wav",
                padpilot::ManagedFileStore::kDefaultMaxImportBytes,
                errorMessage)
                .has_value() &&
               outsideSamples.getNumberOfChildFiles(juce::File::findFiles) == 0,
           "Managed media should reject a symlinked or reparse-point samples root without writing through it.");
    linkedSamples.deleteFile();
  }
  boundaryRoot.deleteRecursively();
  root.deleteRecursively();
}

void runQuickJsRuntimeTests() {
  const auto root = createTempRoot();
  const auto validModule = root.getChildFile("valid-module.js");
  expect(validModule.replaceWithText(
             "globalThis.padpilotHealthCheck = () => true;\n"
             "globalThis.padpilotGetModuleManifest = () => ({ moduleApiVersion: '1' });\n"
             "globalThis.padpilotOnInput = (event) => ({ type: 'keystroke', keyCode: 65, isKeyDown: event.value > 0 });\n"),
         "QuickJS fixture should write valid module source.");

  padpilot::QuickJSHost validHost;
  expect(validHost.loadModule(validModule.getFullPathName().toStdString(), "1",
                              makeScriptAuthorization("valid-module", {"keyboard-output"})),
         "QuickJS should load a healthy module within limits.");
  padpilot::InputEvent event {};
  event.type = padpilot::InputEventType::button;
  event.value = 1.0f;
  const auto action = validHost.dispatchInputEvent(event);
  expect(action.has_value() && action->type == padpilot::ScriptActionType::keystroke &&
             action->keyCode == 65 && action->isKeyDown,
         "QuickJS should dispatch a valid module input action.");

  padpilot::QuickJSHost deniedKeyboardHost;
  expect(deniedKeyboardHost.loadModule(validModule.getFullPathName().toStdString(), "1",
                                       makeScriptAuthorization("denied-keyboard-module")),
         "QuickJS should load a healthy module without optional capability grants.");
  expect(!deniedKeyboardHost.dispatchInputEvent(event).has_value(),
         "QuickJS should reject undeclared keyboard-output actions.");

  padpilot::QuickJSHost unauthenticatedHost;
  expect(!unauthenticatedHost.loadModule(validModule.getFullPathName().toStdString(), "1", {}),
         "QuickJS should fail closed when no authenticated module identity is supplied.");

  const auto unicodeDirectory = root.getChildFile(juce::String::fromUTF8("m\xC3\xB3" "dulo"));
  const auto unicodeModule = unicodeDirectory.getChildFile("valid-module.js");
  expect(unicodeDirectory.createDirectory() && validModule.copyFileTo(unicodeModule),
         "QuickJS test should create a module below a Unicode path.");
  padpilot::QuickJSHost unicodePathHost;
  expect(unicodePathHost.loadModule(unicodeModule.getFullPathName().toStdString(), "1",
                                    makeScriptAuthorization("unicode-path-module")),
         "QuickJS should load installed modules from Unicode Windows profile paths.");

  const auto commandModule = root.getChildFile("command-module.js");
  expect(commandModule.replaceWithText(
             "globalThis.padpilotHealthCheck = () => true;\n"
             "globalThis.padpilotGetModuleManifest = () => ({ moduleApiVersion: '1' });\n"
             "globalThis.padpilotOnInput = (event) => {\n"
             "  if (event.controlId === 2) return { type: 'audioCommand', command: 'setFxNodeParamFloat', parameterId: 73, value: NaN };\n"
             "  if (event.controlId === 3) return { type: 'audioCommand', command: 'setFxNodeParamFloat', parameterId: 73, value: 'bad' };\n"
             "  if (event.controlId === 4) return { type: 'keystroke', keyCode: 12.5, isKeyDown: true };\n"
             "  if (event.controlId === 5) return { type: 'keystroke', keyCode: 65, isKeyDown: 'yes' };\n"
             "  if (event.controlId === 6) return { type: 'audioCommand', command: 'setFxNodeParamFloat', text: 'x'.repeat(260) };\n"
             "  if (event.controlId === 7) return { type: 'audioCommand', command: 'setFxNodeParamFloat', text: 'x'.repeat(259) };\n"
             "  if (event.controlId === 8) return { type: 'x'.repeat(1024 * 1024) };\n"
             "  if (event.controlId === 9) return { type: 'audioCommand', command: 'x'.repeat(1024 * 1024) };\n"
             "  if (event.controlId === 10) return { type: 'keystroke', keyCode: 256, isKeyDown: true };\n"
             "  return { type: 'audioCommand', command: 'setFxNodeParamFloat', parameterId: 73, value: 0.5, valueB: 2 };\n"
             "};\n"),
         "QuickJS fixture should write audio-command module source.");
  padpilot::QuickJSHost commandHost;
  expect(commandHost.loadModule(commandModule.getFullPathName().toStdString(), "1",
                                 makeScriptAuthorization("command-module", {"fx-graph", "keyboard-output"})),
         "QuickJS should load audio-command module.");
  event.controlId = 1;
  const auto commandAction = commandHost.dispatchInputEvent(event);
  expect(commandAction.has_value() && commandAction->type == padpilot::ScriptActionType::audioCommand &&
             commandAction->audioCommand.parameterId == 73 && commandAction->audioCommand.value == 0.5f,
         "QuickJS should preserve nonzero audio command parameter ID and finite values.");
  event.controlId = 2;
  expect(!commandHost.dispatchInputEvent(event).has_value(),
         "QuickJS should reject non-finite audio command values.");
  event.controlId = 3;
  expect(!commandHost.dispatchInputEvent(event).has_value(),
         "QuickJS should reject wrong-type audio command values.");
  event.controlId = 4;
  expect(!commandHost.dispatchInputEvent(event).has_value(),
         "QuickJS should reject fractional keystroke key codes.");
  event.controlId = 5;
  expect(!commandHost.dispatchInputEvent(event).has_value(),
         "QuickJS should reject wrong-type keystroke state values.");
  event.controlId = 6;
  expect(!commandHost.dispatchInputEvent(event).has_value(),
         "QuickJS should reject overlong audio-command text instead of truncating it.");
  event.controlId = 7;
  const auto maximumTextAction = commandHost.dispatchInputEvent(event);
  expect(maximumTextAction.has_value() &&
             std::strlen(maximumTextAction->audioCommand.text) == padpilot::kMaxPathChars - 1,
         "QuickJS should preserve audio-command text at the transport boundary.");
  event.controlId = 8;
  const auto oversizedTypeStartedAt = std::chrono::steady_clock::now();
  expect(!commandHost.dispatchInputEvent(event).has_value(),
         "QuickJS should reject an oversized action type.");
  expect(std::chrono::steady_clock::now() - oversizedTypeStartedAt < std::chrono::seconds(1),
         "QuickJS should reject oversized action types without a large native string copy.");
  event.controlId = 9;
  expect(!commandHost.dispatchInputEvent(event).has_value(),
         "QuickJS should reject an oversized audio-command name.");
  event.controlId = 10;
  expect(!commandHost.dispatchInputEvent(event).has_value(),
         "QuickJS should reject virtual key codes outside the Windows byte range.");
  event.controlId = 1;
  expect(commandHost.dispatchInputEvent(event).has_value(),
         "Malformed QuickJS action should not poison later command output.");

  padpilot::QuickJSHost deniedCommandHost;
  expect(deniedCommandHost.loadModule(commandModule.getFullPathName().toStdString(), "1",
                                      makeScriptAuthorization("denied-command-module")),
         "QuickJS should load an audio-command module without optional capability grants.");
  expect(!deniedCommandHost.dispatchInputEvent(event).has_value(),
         "QuickJS should reject undeclared fx-graph actions.");

  const auto oversizedVersionModule = root.getChildFile("oversized-version-module.js");
  expect(oversizedVersionModule.replaceWithText(
             "globalThis.padpilotHealthCheck = () => true;\n"
             "globalThis.padpilotGetModuleManifest = () => ({ moduleApiVersion: 'x'.repeat(1024 * 1024) });\n"
             "globalThis.padpilotOnInput = () => null;\n"),
         "QuickJS fixture should write oversized API-version module source.");
  padpilot::QuickJSHost oversizedVersionHost;
  const auto oversizedVersionStartedAt = std::chrono::steady_clock::now();
  expect(!oversizedVersionHost.loadModule(
             oversizedVersionModule.getFullPathName().toStdString(),
             "1",
             makeScriptAuthorization("oversized-version-module")),
         "QuickJS should reject an oversized Module API version.");
  expect(std::chrono::steady_clock::now() - oversizedVersionStartedAt < std::chrono::seconds(1),
         "QuickJS should reject oversized API versions without a large native string copy.");

  const auto oversizedSourceModule = root.getChildFile("oversized-source-module.js");
  {
    auto output = oversizedSourceModule.createOutputStream();
    expect(output != nullptr && output->setPosition(4LL * 1024LL * 1024LL) &&
               output->writeByte('x'),
           "QuickJS fixture should create an oversized sparse Module source.");
  }
  padpilot::QuickJSHost oversizedSourceHost;
  expect(!oversizedSourceHost.loadModule(
             oversizedSourceModule.getFullPathName().toStdString(),
             "1",
             makeScriptAuthorization("oversized-source-module")),
         "QuickJS should reject Module source above its read cap before allocation.");

  const auto runawayModule = root.getChildFile("runaway-module.js");
  expect(runawayModule.replaceWithText("while (true) {}"),
         "QuickJS fixture should write runaway module source.");
  padpilot::QuickJSHost boundedHost;
  const auto startedAt = std::chrono::steady_clock::now();
  expect(!boundedHost.loadModule(runawayModule.getFullPathName().toStdString(), "1",
                                 makeScriptAuthorization("runaway-module")),
         "QuickJS should reject a runaway module.");
  const auto elapsed = std::chrono::steady_clock::now() - startedAt;
  expect(elapsed < std::chrono::seconds(2),
         "QuickJS should interrupt runaway module evaluation within bounded time.");

  const auto runawayCallbackModule = root.getChildFile("runaway-callback-module.js");
  expect(runawayCallbackModule.replaceWithText(
             "globalThis.padpilotHealthCheck = () => true;\n"
             "globalThis.padpilotGetModuleManifest = () => ({ moduleApiVersion: '1' });\n"
             "globalThis.padpilotOnInput = () => { while (true) {} };\n"),
         "QuickJS fixture should write runaway callback module source.");
  padpilot::QuickJSHost callbackHost;
  expect(callbackHost.loadModule(runawayCallbackModule.getFullPathName().toStdString(), "1",
                                  makeScriptAuthorization("runaway-callback-module")),
         "QuickJS should load module before bounded callback dispatch.");
  const auto callbackStartedAt = std::chrono::steady_clock::now();
  expect(!callbackHost.dispatchInputEvent(event).has_value(),
         "QuickJS should reject a runaway input callback.");
  const auto callbackElapsed = std::chrono::steady_clock::now() - callbackStartedAt;
  expect(callbackElapsed < std::chrono::seconds(1),
         "QuickJS should interrupt runaway input callback within bounded time.");

  const auto runawayGetterModule = root.getChildFile("runaway-getter-module.js");
  expect(runawayGetterModule.replaceWithText(
             "globalThis.padpilotHealthCheck = () => true;\n"
             "globalThis.padpilotGetModuleManifest = () => ({ moduleApiVersion: '1' });\n"
             "globalThis.padpilotOnInput = () => Object.defineProperty({}, 'type', { get() { while (true) {} } });\n"),
         "QuickJS fixture should write runaway action-getter module source.");
  padpilot::QuickJSHost getterHost;
  expect(getterHost.loadModule(runawayGetterModule.getFullPathName().toStdString(), "1",
                                makeScriptAuthorization("runaway-getter-module")),
         "QuickJS should load module before bounded action parsing.");
  const auto getterStartedAt = std::chrono::steady_clock::now();
  expect(!getterHost.dispatchInputEvent(event).has_value(),
         "QuickJS should reject a runaway action property getter.");
  const auto getterElapsed = std::chrono::steady_clock::now() - getterStartedAt;
  expect(getterElapsed < std::chrono::seconds(1),
         "QuickJS should interrupt runaway action property access within bounded time.");

  const auto runawayMigrationGetterModule = root.getChildFile("runaway-migration-getter-module.js");
  expect(runawayMigrationGetterModule.replaceWithText(
             "globalThis.padpilotHealthCheck = () => true;\n"
             "globalThis.padpilotGetModuleManifest = () => ({ moduleApiVersion: '1' });\n"
             "globalThis.padpilotOnInput = () => null;\n"
             "Object.defineProperty(globalThis, 'onUpgradeState', { get() { while (true) {} } });\n"),
         "QuickJS fixture should write runaway migration-getter module source.");
  padpilot::QuickJSHost migrationGetterHost;
  expect(migrationGetterHost.loadModule(
             runawayMigrationGetterModule.getFullPathName().toStdString(),
             "1",
             makeScriptAuthorization("runaway-migration-getter-module")),
         "QuickJS should load runaway migration-getter fixture before migration discovery.");
  const auto migrationGetterStartedAt = std::chrono::steady_clock::now();
  expect(!migrationGetterHost.upgradeModuleState("{}", 1, 2).has_value(),
         "QuickJS should reject a runaway state-migration function getter.");
  const auto migrationGetterElapsed = std::chrono::steady_clock::now() - migrationGetterStartedAt;
  expect(migrationGetterElapsed < std::chrono::seconds(1),
         "QuickJS runaway state-migration getter should remain bounded.");
  root.deleteRecursively();
}

void runScriptHostAuthorizationTests() {
  const auto root = createTempRoot();
  const auto commandModule = root.getChildFile("authorized-command-module.js");
  expect(commandModule.replaceWithText(
             "globalThis.padpilotHealthCheck = () => true;\n"
             "globalThis.padpilotGetModuleManifest = () => ({ moduleApiVersion: '0.1.0' });\n"
             "globalThis.padpilotOnInput = () => ({ type: 'audioCommand', command: 'setFxNodeParamFloat', parameterId: 91, value: 0.75 });\n"),
         "ScriptHost fixture should write audio-command module source.");
  const auto keyboardModule = root.getChildFile("authorized-keyboard-module.js");
  expect(keyboardModule.replaceWithText(
             "globalThis.padpilotHealthCheck = () => true;\n"
             "globalThis.padpilotGetModuleManifest = () => ({ moduleApiVersion: '0.1.0' });\n"
             "globalThis.padpilotOnInput = (event) => ({ type: 'keystroke', keyCode: 65, isKeyDown: event.value > 0 });\n"),
         "ScriptHost fixture should write keyboard-output module source.");

  auto inputQueue = std::make_unique<padpilot::LockFreeQueue<padpilot::InputEvent, 2048>>();
  auto audioCommandQueue = std::make_unique<padpilot::LockFreeQueue<padpilot::AudioCommand, 2048>>();
  auto wakeSignal = std::make_unique<padpilot::WakeSignal>();
  auto graphEpoch = std::make_unique<std::atomic<std::uint64_t>>(17);
  RecordingKeystrokeOutput keystrokeOutput;
  auto host = std::make_unique<padpilot::ScriptHost>(
      *inputQueue, *audioCommandQueue, *wakeSignal, *graphEpoch, &keystrokeOutput);
  host->start();

  const auto commandPath = commandModule.getFullPathName().toStdString();
  expect(host->loadModule({commandPath, "authorized-command-module", {"fx-graph"}}),
         "ScriptHost should load an authenticated Module with its manifest grants.");
  const auto commandGraphEpoch = graphEpoch->load(std::memory_order_acquire);

  padpilot::InputEvent event {};
  event.type = padpilot::InputEventType::button;
  event.graphEpoch = commandGraphEpoch;
  expect(inputQueue->push(event), "ScriptHost fixture should enqueue input.");
  wakeSignal->notify();

  padpilot::AudioCommand command {};
  const auto commandDeadline = std::chrono::steady_clock::now() + std::chrono::seconds(1);
  while (!audioCommandQueue->pop(command) && std::chrono::steady_clock::now() < commandDeadline) {
    std::this_thread::sleep_for(std::chrono::milliseconds(1));
  }
  expect(command.type == padpilot::AudioCommandType::setFxNodeParamFloat &&
             command.parameterId == 91 && command.value == 0.75f &&
             command.graphEpoch == commandGraphEpoch,
         "ScriptHost should execute declared fx-graph output with the input graph epoch.");

  const auto processedBeforeDeniedInput = host->getProcessedInputEvents();
  expect(host->loadModule({commandPath, "denied-command-module", {}}),
         "ScriptHost should load a Module that declares no privileged capabilities.");
  event.graphEpoch = graphEpoch->load(std::memory_order_acquire);
  expect(inputQueue->push(event), "ScriptHost fixture should enqueue denied input.");
  wakeSignal->notify();
  const auto deniedDeadline = std::chrono::steady_clock::now() + std::chrono::seconds(1);
  while (host->getProcessedInputEvents() == processedBeforeDeniedInput &&
         std::chrono::steady_clock::now() < deniedDeadline) {
    std::this_thread::sleep_for(std::chrono::milliseconds(1));
  }
  std::this_thread::sleep_for(std::chrono::milliseconds(10));
  expect(host->getProcessedInputEvents() > processedBeforeDeniedInput && !audioCommandQueue->pop(command),
         "ScriptHost should reject undeclared fx-graph output from QuickJS.");

  padpilot::ScriptAction queuedAudioAction {};
  queuedAudioAction.type = padpilot::ScriptActionType::audioCommand;
  queuedAudioAction.audioCommand.type = padpilot::AudioCommandType::setFxChainMix;
  queuedAudioAction.audioCommand.value = 0.25f;
  expect(!host->enqueueActions("wrong-module", {queuedAudioAction}),
         "ScriptHost should reject queued actions with a mismatched Module identity.");
  expect(!host->enqueueActions("denied-command-module", {queuedAudioAction}),
         "ScriptHost should reject queued actions without their required manifest grant.");

  graphEpoch->store(23, std::memory_order_release);
  expect(host->loadModule({{}, "ui-only-fx-module", {"fx-graph"}}),
         "ScriptHost should authorize a UI-only Module from the trusted installed manifest.");
  const auto queuedGraphEpoch = graphEpoch->load(std::memory_order_acquire);
  expect(host->enqueueActions("ui-only-fx-module", {queuedAudioAction}),
         "ScriptHost should accept queued actions for the authenticated Module and declared grant.");
  const auto queuedDeadline = std::chrono::steady_clock::now() + std::chrono::seconds(1);
  command = {};
  while (!audioCommandQueue->pop(command) && std::chrono::steady_clock::now() < queuedDeadline) {
    std::this_thread::sleep_for(std::chrono::milliseconds(1));
  }
  expect(command.type == padpilot::AudioCommandType::setFxChainMix &&
             command.value == 0.25f && command.graphEpoch == queuedGraphEpoch,
         "ScriptHost should execute an authorized queued action with the current graph epoch.");

  expect(!host->loadModule({commandPath, "Invalid Module", {"fx-graph"}}),
         "ScriptHost should fail closed for an invalid authenticated Module identity.");
  expect(!host->enqueueActions("ui-only-fx-module", {queuedAudioAction}),
         "A failed Module load should revoke the previous Module authorization.");

  const auto keyboardPath = keyboardModule.getFullPathName().toStdString();
  host->stop();
  graphEpoch->store(30, std::memory_order_release);
  event.graphEpoch = 30;
  event.value = 1.0f;
  const auto processedBeforeStaleInput = host->getProcessedInputEvents();
  expect(inputQueue->push(event),
         "ScriptHost fixture should enqueue input before a Module switch.");
  expect(host->loadModule({keyboardPath, "authorized-keyboard-module", {"keyboard-output"}}),
         "ScriptHost should load an authenticated keyboard-output Module.");
  const auto keyboardGraphEpoch = graphEpoch->load(std::memory_order_acquire);
  host->start();
  wakeSignal->notify();
  const auto staleDeadline = std::chrono::steady_clock::now() + std::chrono::seconds(1);
  while (host->getProcessedInputEvents() == processedBeforeStaleInput &&
         std::chrono::steady_clock::now() < staleDeadline) {
    std::this_thread::sleep_for(std::chrono::milliseconds(1));
  }
  std::this_thread::sleep_for(std::chrono::milliseconds(10));
  expect(host->getProcessedInputEvents() > processedBeforeStaleInput &&
             keystrokeOutput.size() == 0,
         "ScriptHost should reject pre-switch input before it reaches a replacement Module.");

  event.graphEpoch = keyboardGraphEpoch;
  const auto processedBeforeKeyDown = host->getProcessedInputEvents();
  expect(inputQueue->push(event), "ScriptHost fixture should enqueue current keyboard input.");
  wakeSignal->notify();
  expect(waitForKeystrokeCount(keystrokeOutput, 1) &&
             host->getProcessedInputEvents() > processedBeforeKeyDown &&
             keystrokeOutput.at(0) == std::make_pair<std::uint16_t, bool>(65, true),
         "ScriptHost should dispatch current keyboard input through the injected output.");

  const auto processedBeforeDuplicateDown = host->getProcessedInputEvents();
  expect(inputQueue->push(event), "ScriptHost fixture should enqueue duplicate key-down input.");
  wakeSignal->notify();
  const auto duplicateDownDeadline = std::chrono::steady_clock::now() + std::chrono::seconds(1);
  while (host->getProcessedInputEvents() == processedBeforeDuplicateDown &&
         std::chrono::steady_clock::now() < duplicateDownDeadline) {
    std::this_thread::sleep_for(std::chrono::milliseconds(1));
  }
  std::this_thread::sleep_for(std::chrono::milliseconds(10));
  expect(keystrokeOutput.size() == 1,
         "ScriptHost should suppress duplicate key-down output.");

  event.value = 0.0f;
  expect(inputQueue->push(event), "ScriptHost fixture should enqueue key-up input.");
  wakeSignal->notify();
  expect(waitForKeystrokeCount(keystrokeOutput, 2) &&
             keystrokeOutput.at(1) == std::make_pair<std::uint16_t, bool>(65, false),
         "ScriptHost should dispatch key-up for a tracked pressed key.");
  const auto processedBeforeDuplicateUp = host->getProcessedInputEvents();
  expect(inputQueue->push(event), "ScriptHost fixture should enqueue duplicate key-up input.");
  wakeSignal->notify();
  const auto duplicateUpDeadline = std::chrono::steady_clock::now() + std::chrono::seconds(1);
  while (host->getProcessedInputEvents() == processedBeforeDuplicateUp &&
         std::chrono::steady_clock::now() < duplicateUpDeadline) {
    std::this_thread::sleep_for(std::chrono::milliseconds(1));
  }
  std::this_thread::sleep_for(std::chrono::milliseconds(10));
  expect(keystrokeOutput.size() == 2,
         "ScriptHost should suppress key-up output for a key that is not pressed.");

  event.value = 1.0f;
  expect(inputQueue->push(event), "ScriptHost fixture should enqueue key-down before replacement.");
  wakeSignal->notify();
  expect(waitForKeystrokeCount(keystrokeOutput, 3),
         "ScriptHost should track a pressed key before Module replacement.");

  padpilot::InputEvent resetEvent {};
  resetEvent.type = padpilot::InputEventType::controlStreamReset;
  const auto resetGraphEpoch = padpilot::advanceGraphEpoch(*graphEpoch);
  resetEvent.graphEpoch = keyboardGraphEpoch;
  expect(inputQueue->push(resetEvent),
         "ScriptHost fixture should enqueue a control-stream reset.");
  expect(inputQueue->push(event),
         "ScriptHost fixture should enqueue a pre-reset mapping event after its reset marker.");
  wakeSignal->notify();
  expect(waitForKeystrokeCount(keystrokeOutput, 4) &&
             keystrokeOutput.at(3) == std::make_pair<std::uint16_t, bool>(65, false),
         "ScriptHost should release pressed keys on a control-stream reset regardless of graph epoch.");
  std::this_thread::sleep_for(std::chrono::milliseconds(10));
  expect(keystrokeOutput.size() == 4,
         "ScriptHost should reject an old-mapping input queued after its control-stream reset.");

  event.graphEpoch = resetGraphEpoch;
  expect(inputQueue->push(event),
         "ScriptHost fixture should enqueue key-down after control-stream recovery.");
  wakeSignal->notify();
  expect(waitForKeystrokeCount(keystrokeOutput, 5),
         "ScriptHost should resume current input after control-stream recovery.");
  expect(host->loadModule({{}, "replacement-ui-module", {}}) &&
             keystrokeOutput.size() == 6 &&
             keystrokeOutput.at(5) == std::make_pair<std::uint16_t, bool>(65, false),
         "ScriptHost should release pressed keys when replacing a Module.");

  padpilot::ScriptAction queuedKeyAction {};
  queuedKeyAction.type = padpilot::ScriptActionType::keystroke;
  queuedKeyAction.keyCode = 66;
  queuedKeyAction.isKeyDown = true;
  expect(host->loadModule({{}, "ui-only-keyboard-module", {"keyboard-output"}}),
         "ScriptHost should authorize keyboard output for a UI-only Module.");
  expect(host->enqueueActions("ui-only-keyboard-module", {queuedKeyAction, queuedKeyAction}),
         "ScriptHost should queue authenticated UI keyboard output.");
  expect(waitForKeystrokeCount(keystrokeOutput, 7) &&
             keystrokeOutput.at(6) == std::make_pair<std::uint16_t, bool>(66, true),
         "ScriptHost should suppress duplicate queued key-down output.");
  host->revokeModuleAuthorization();
  expect(keystrokeOutput.size() == 8 &&
             keystrokeOutput.at(7) == std::make_pair<std::uint16_t, bool>(66, false),
         "ScriptHost should release pressed keys when authorization is revoked.");

  expect(host->loadModule({{}, "stopping-keyboard-module", {"keyboard-output"}}) &&
             host->enqueueActions("stopping-keyboard-module", {queuedKeyAction}),
         "ScriptHost should queue a pressed key before shutdown.");
  expect(waitForKeystrokeCount(keystrokeOutput, 9),
         "ScriptHost should dispatch the final key-down before shutdown.");
  host->stop();
  expect(keystrokeOutput.size() == 10 &&
             keystrokeOutput.at(9) == std::make_pair<std::uint16_t, bool>(66, false),
         "ScriptHost should release pressed keys when stopped.");
  root.deleteRecursively();
}

void runWakeSignalTests() {
  padpilot::WakeSignal signal;
  for (int index = 0; index < 100000; ++index) {
    signal.notify();
  }
  signal.wait();

  std::atomic<bool> waiterStarted {false};
  std::atomic<bool> waiterWoke {false};
  std::thread waiter([&] {
    waiterStarted.store(true, std::memory_order_release);
    signal.wait();
    waiterWoke.store(true, std::memory_order_release);
  });
  while (!waiterStarted.load(std::memory_order_acquire)) {
    std::this_thread::yield();
  }
  juce::Thread::sleep(10);
  const auto burstStayedConsumed = !waiterWoke.load(std::memory_order_acquire);
  signal.notify();
  waiter.join();
  expect(burstStayedConsumed,
         "Wake signal should consume a coalesced burst exactly once.");
  expect(waiterWoke.load(std::memory_order_acquire),
         "Wake signal should wake a waiter after its next notification.");
}

void runRecutRuntimeTests() {
  const auto root = createTempRoot();
  const auto fixtureFile = createRecutFixtureWav(root);

  expect(padpilot::RecutRuntime::isValidDecodedAudioMetadata(2, 48'000, 48'000.0),
         "Recut should accept ordinary stereo audio metadata.");
  expect(!padpilot::RecutRuntime::isValidDecodedAudioMetadata(
             static_cast<std::uint64_t>(padpilot::RecutRuntime::kMaxDecodedChannels) + 1U,
             1,
             48'000.0) &&
             !padpilot::RecutRuntime::isValidDecodedAudioMetadata(
                 1, 1, std::numeric_limits<double>::quiet_NaN()) &&
             !padpilot::RecutRuntime::isValidDecodedAudioMetadata(1, 1, 1.0e12),
         "Recut should reject pathological channel counts and non-finite or absurd sample rates.");

  {
    const auto slowFixture = createRecutPulseFixtureWav(
        root,
        "recut-concurrent-edit.wav",
        {{1'000, 1.0f}, {120'000, 0.8f}, {300'000, 0.6f}},
        480'000);
    padpilot::RecutRuntime runtime;
    padpilot::LockFreeQueue<padpilot::HapticCommand, 256> hapticQueue;
    runtime.prepare(48'000.0, 64, hapticQueue);
    expect(runtime.loadSourceAsync(
               slowFixture.getFullPathName().toStdString(), "recut-concurrent-edit.wav", "concurrent-edit"),
           "Recut should queue the concurrent-edit fixture.");
    padpilot::capability::SampleAnalysisRequest edit;
    edit.set_analysis_mode(padpilot::capability::SAMPLE_ANALYSIS_MODE_AUTO);
    edit.set_density(0.23f);
    edit.set_project_bpm(133.0f);
    expect(runtime.requestAnalysis(edit),
           "Recut should accept mutable analysis edits while source decoding is in flight.");
    runtime.setChokeGroup(0, "Edited during load", 123);
    expect(waitForRecutLoaded(runtime),
           "Recut should finish the concurrent-edit fixture analysis.");
    padpilot::recut::RecutModuleState loadedState;
    expect(padpilot::proto::parseRecutModuleState(runtime.serializeStateBytes(), &loadedState) &&
               std::abs(loadedState.density() - 0.23f) < 0.001f &&
               loadedState.project_bpm_snapshot() == 133.0f &&
               loadedState.choke_groups_size() > 0 &&
               loadedState.choke_groups(0).name() == "Edited during load" &&
               loadedState.choke_groups(0).accent_hue() == 123,
           "Recut load commit must merge concurrent mutable edits instead of overwriting them.");
    runtime.release();
  }

  {
    padpilot::RecutRuntime runtime;
    padpilot::LockFreeQueue<padpilot::HapticCommand, 256> hapticQueue;
    runtime.prepare(48'000.0, 64, hapticQueue);
    auto state = padpilot::proto::createDefaultRecutState();
    state.set_pitch_semitones(std::numeric_limits<float>::quiet_NaN());
    state.set_gain_db(std::numeric_limits<float>::infinity());
    state.set_grain_size_ms(-std::numeric_limits<float>::infinity());
    state.set_grain_density(std::numeric_limits<float>::quiet_NaN());
    state.set_density(std::numeric_limits<float>::infinity());
    state.set_bpm_value(std::numeric_limits<float>::quiet_NaN());
    state.set_bpm_confidence(std::numeric_limits<float>::infinity());
    state.set_bpm_suggested_value(-std::numeric_limits<float>::infinity());
    state.set_bpm_suggested_confidence(std::numeric_limits<float>::quiet_NaN());
    state.set_project_bpm_snapshot(std::numeric_limits<float>::infinity());
    auto* marker = state.add_slice_markers();
    marker->set_start_frame(0);
    marker->set_end_frame(0);
    marker->set_transient_frame(0);
    marker->set_pad_index(0);
    marker->set_choke_group_id(0);
    marker->set_confidence(std::numeric_limits<float>::quiet_NaN());
    marker->set_fade_ms(std::numeric_limits<float>::infinity());
    expect(runtime.applyStateFromBytes(padpilot::proto::serializeRecutModuleState(state)),
           "Recut should accept a structurally valid state after normalizing non-finite controls.");
    runtime.setPitchSemitones(std::numeric_limits<float>::infinity());
    runtime.setGainDb(std::numeric_limits<float>::quiet_NaN());
    runtime.setGrainSizeMs(std::numeric_limits<float>::infinity());
    runtime.setGrainDensity(std::numeric_limits<float>::quiet_NaN());
    runtime.setProjectBpm(-std::numeric_limits<float>::infinity());

    padpilot::recut::RecutModuleState finiteState;
    expect(padpilot::proto::parseRecutModuleState(runtime.serializeStateBytes(), &finiteState),
           "Recut normalized state should parse.");
    const auto finiteFrame = parseSampleEditorFrameBase64(runtime.buildSampleEditorFrameBase64());
    expect(std::isfinite(finiteState.pitch_semitones()) &&
               std::isfinite(finiteState.gain_db()) &&
               std::isfinite(finiteState.grain_size_ms()) &&
               std::isfinite(finiteState.grain_density()) &&
               std::isfinite(finiteState.density()) &&
               std::isfinite(finiteState.bpm_value()) &&
               std::isfinite(finiteState.bpm_confidence()) &&
               std::isfinite(finiteState.bpm_suggested_value()) &&
               std::isfinite(finiteState.bpm_suggested_confidence()) &&
               std::isfinite(finiteState.project_bpm_snapshot()) &&
               finiteState.slice_markers_size() == 1 &&
               std::isfinite(finiteState.slice_markers(0).confidence()) &&
               std::isfinite(finiteState.slice_markers(0).fade_ms()) &&
               std::isfinite(finiteFrame.density()) &&
               std::isfinite(finiteFrame.project_bpm()),
           "Recut serialized state and runtime frames should contain only finite controls.");

    auto invalidPlayback = createCustomRecutPlaybackState();
    invalidPlayback.set_density(std::numeric_limits<float>::quiet_NaN());
    expect(!runtime.applyPlaybackState(invalidPlayback),
           "Recut playback restore intents should reject non-finite controls.");
    runtime.release();
  }

  {
    const auto tinyFixture = createRecutPulseFixtureWav(root, "recut-tiny.wav", {}, 8);
    padpilot::RecutRuntime runtime;
    padpilot::LockFreeQueue<padpilot::HapticCommand, 256> hapticQueue;
    runtime.prepare(48'000.0, 64, hapticQueue);
    expect(runtime.loadSourceAsync(tinyFixture.getFullPathName().toStdString(), "recut-tiny.wav", "tiny-content") &&
               waitForRecutLoaded(runtime),
           "Recut should load a valid sub-sixteen-frame fixture.");
    const auto frame = parseSampleEditorFrameBase64(runtime.buildSampleEditorFrameBase64());
    std::unordered_set<std::uint32_t> candidateFrames;
    for (const auto candidate : frame.candidate_transients()) {
      candidateFrames.insert(candidate);
    }
    expect(frame.candidate_transients_size() <= 8 &&
               candidateFrames.size() == static_cast<std::size_t>(frame.candidate_transients_size()),
           "Recut fallback candidates should stay unique for files shorter than sixteen frames.");
    for (const auto& marker : frame.slice_markers()) {
      expect(marker.start_frame() < 8 && marker.end_frame() < 8,
             "Recut fallback slices should stay within a tiny source's frame range.");
    }
    runtime.release();
  }

  {
    padpilot::RecutRuntime runtime;
    padpilot::LockFreeQueue<padpilot::HapticCommand, 256> hapticQueue;
    runtime.prepare(48000.0, 64, hapticQueue);
    expect(runtime.loadSourceAsync(fixtureFile.getFullPathName().toStdString(), "fixture.wav", "fixture-content"),
           "Recut runtime should queue stale-trigger fixture load.");
    runtime.triggerPad(0);
    expect(waitForRecutLoaded(runtime), "Recut runtime should finish stale-trigger fixture analysis.");
    juce::AudioBuffer<float> renderBuffer(1, 64);
    renderBuffer.clear();
    runtime.processBlock(renderBuffer);
    const auto frame = parseSampleEditorFrameBase64(runtime.buildSampleEditorFrameBase64());
    expect(frame.playing_pad_indices_size() == 0,
           "Recut should discard triggers queued for an unloaded source generation.");
    runtime.release();
  }

  {
    padpilot::RecutRuntime runtime;
    padpilot::LockFreeQueue<padpilot::HapticCommand, 256> hapticQueue;
    runtime.prepare(48000.0, 64, hapticQueue);
    expect(runtime.loadSourceAsync(fixtureFile.getFullPathName().toStdString(), "fixture.wav", "fixture-content"),
           "Recut runtime should queue malformed-capability fixture load.");
    expect(waitForRecutLoaded(runtime), "Recut runtime should finish malformed-capability fixture analysis.");
    const auto baseline = runtime.serializeStateBytes();

    auto malformedPlayback = createCustomRecutPlaybackState();
    malformedPlayback.set_pitch_semitones(std::numeric_limits<float>::quiet_NaN());
    for (int index = malformedPlayback.slice_markers_size(); index <= 16; ++index) {
      malformedPlayback.add_slice_markers()->CopyFrom(malformedPlayback.slice_markers(0));
    }
    expect(!runtime.applyPlaybackState(malformedPlayback) && runtime.serializeStateBytes() == baseline,
           "Recut should reject malformed oversized/non-finite playback state without partial mutation.");

    padpilot::capability::SampleAnalysisRequest malformedAnalysis;
    malformedAnalysis.set_analysis_mode(padpilot::capability::SAMPLE_ANALYSIS_MODE_AUTO);
    malformedAnalysis.set_density(std::numeric_limits<float>::infinity());
    expect(!runtime.requestAnalysis(malformedAnalysis) && runtime.serializeStateBytes() == baseline,
           "Recut should reject non-finite analysis requests without snapshot mutation.");

    padpilot::capability::SliceEditIntent malformedEdit;
    malformedEdit.set_type(padpilot::capability::SLICE_EDIT_TYPE_NUDGE_MARKER);
    malformedEdit.set_slice_index(0);
    malformedEdit.set_delta_frames(std::numeric_limits<float>::quiet_NaN());
    expect(!runtime.editSlice(malformedEdit) && runtime.serializeStateBytes() == baseline,
           "Recut should reject non-finite marker edits without snapshot mutation.");

    padpilot::capability::SlicePlaybackTrigger malformedTrigger;
    malformedTrigger.set_pad_index(16);
    malformedTrigger.set_velocity(1.0f);
    malformedTrigger.set_pressed(true);
    expect(!runtime.triggerPlayback(malformedTrigger),
           "Recut should reject out-of-range capability trigger pads.");

    auto clampedPlayback = createCustomRecutPlaybackState();
    clampedPlayback.set_pitch_semitones(1000.0f);
    clampedPlayback.set_gain_db(-1000.0f);
    clampedPlayback.set_grain_size_ms(5000.0f);
    clampedPlayback.set_grain_density(10.0f);
    clampedPlayback.set_density(10.0f);
    clampedPlayback.set_bpm_value(5000.0f);
    clampedPlayback.set_bpm_confidence(10.0f);
    clampedPlayback.set_bpm_suggested_value(5000.0f);
    clampedPlayback.set_bpm_suggested_confidence(10.0f);
    clampedPlayback.set_project_bpm(5000.0f);
    expect(runtime.applyPlaybackState(clampedPlayback),
           "Recut should accept finite capability values that can be safely clamped.");
    padpilot::recut::RecutModuleState clampedState;
    expect(padpilot::proto::parseRecutModuleState(runtime.serializeStateBytes(), &clampedState) &&
               clampedState.pitch_semitones() == 48.0f &&
               clampedState.gain_db() == -96.0f &&
               clampedState.grain_size_ms() == 1000.0f &&
               clampedState.grain_density() == 1.0f &&
               clampedState.density() == 1.0f &&
               clampedState.bpm_value() == 400.0f &&
               clampedState.bpm_confidence() == 1.0f &&
               clampedState.project_bpm_snapshot() == 400.0f,
           "Recut should clamp finite capability values to canonical bounds.");
    runtime.release();
  }

  auto renderFirstSample = [&](std::uint32_t padIndex) {
    padpilot::RecutRuntime runtime;
    padpilot::LockFreeQueue<padpilot::HapticCommand, 256> hapticQueue;
    runtime.prepare(48000.0, 64, hapticQueue);
    expect(runtime.loadSourceAsync(fixtureFile.getFullPathName().toStdString(), "fixture.wav", "fixture-content"),
           "Recut runtime should load fixture wav.");
    expect(waitForRecutLoaded(runtime), "Recut runtime should finish fixture analysis asynchronously.");
    runtime.applyPlaybackState(createCustomRecutPlaybackState());

    juce::AudioBuffer<float> renderBuffer(1, 1);
    renderBuffer.clear();
    runtime.triggerPad(padIndex);
    runtime.processBlock(renderBuffer);
    runtime.release();
    return renderBuffer.getSample(0, 0);
  };

  const auto firstSliceSample = renderFirstSample(0);
  const auto secondSliceSample = renderFirstSample(1);
  expect(firstSliceSample > 0.05f && firstSliceSample < 0.2f,
         "Pad 0 should start playback from the first slice.");
  expect(secondSliceSample > 0.6f && secondSliceSample < 0.9f,
         "Pad 1 should start playback from the mapped second slice, not the file start.");

  {
    const auto stereoFixture = createRecutStereoFixtureWav(root);
    padpilot::RecutRuntime runtime;
    padpilot::LockFreeQueue<padpilot::HapticCommand, 256> hapticQueue;
    runtime.prepare(48000.0, 64, hapticQueue);
    expect(runtime.loadSourceAsync(stereoFixture.getFullPathName().toStdString(), "stereo.wav", "stereo-content") &&
               waitForRecutLoaded(runtime),
           "Recut should load the stereo playback fixture.");
    runtime.applyPlaybackState(createCustomRecutPlaybackState());
    runtime.triggerPad(0);
    juce::AudioBuffer<float> renderBuffer(2, 1);
    renderBuffer.clear();
    runtime.processBlock(renderBuffer);
    expect(renderBuffer.getSample(0, 0) > 0.15f && renderBuffer.getSample(0, 0) < 0.25f &&
               renderBuffer.getSample(1, 0) > 0.7f && renderBuffer.getSample(1, 0) < 0.85f,
           "Recut playback should preserve source stereo separation.");
    runtime.release();
  }

  {
    padpilot::RecutRuntime runtime;
    padpilot::LockFreeQueue<padpilot::HapticCommand, 256> hapticQueue;
    runtime.prepare(48000.0, 64, hapticQueue);
    expect(runtime.loadSourceAsync(fixtureFile.getFullPathName().toStdString(), "fixture.wav", "fixture-content"),
           "Recut runtime should load fixture wav for frame publication.");
    expect(waitForRecutLoaded(runtime), "Recut runtime should publish loaded frame after analysis.");
    auto frame = parseSampleEditorFrameBase64(runtime.buildSampleEditorFrameBase64());
    expect(frame.loaded(), "Recut runtime frame should report loaded after source load.");
    expect(frame.waveform_peaks_size() > 0, "Recut runtime frame should publish waveform peaks after load.");
    expect(frame.slice_markers_size() > 0, "Recut runtime frame should publish slices after load.");
    runtime.reanalyze();
    expect(waitForRecutLoaded(runtime), "Recut runtime should finish reanalysis asynchronously.");
    frame = parseSampleEditorFrameBase64(runtime.buildSampleEditorFrameBase64());
    expect(frame.loaded(), "Recut runtime should remain loaded after reanalysis.");
    runtime.release();
  }

  {
    padpilot::RecutRuntime runtime;
    padpilot::LockFreeQueue<padpilot::HapticCommand, 256> hapticQueue;
    runtime.prepare(48000.0, 64, hapticQueue);
    expect(runtime.loadSourceAsync(fixtureFile.getFullPathName().toStdString(), "fixture.wav", "fixture-content"),
           "Recut runtime should load fixture wav for slice-end playback.");
    expect(waitForRecutLoaded(runtime), "Recut runtime should finish slice-end fixture analysis.");
    runtime.applyPlaybackState(createCustomRecutPlaybackState());
    runtime.triggerPad(0);
    juce::AudioBuffer<float> renderBuffer(1, 64);
    renderBuffer.clear();
    for (int block = 0; block < 20; ++block) {
      renderBuffer.clear();
      runtime.processBlock(renderBuffer);
    }
    const auto frame = parseSampleEditorFrameBase64(runtime.buildSampleEditorFrameBase64());
    expect(frame.playing_pad_indices_size() == 0,
           "Recut runtime should stop playback when the slice end is reached, before file end.");
    runtime.release();
  }

  {
    const auto sparseFixture = createRecutPulseFixtureWav(
        root,
        "recut-sparse-auto.wav",
        {{1200, 1.0f}, {9200, 0.82f}, {18400, 0.68f}, {29600, 0.54f}},
        36000);
    padpilot::RecutRuntime runtime;
    padpilot::LockFreeQueue<padpilot::HapticCommand, 256> hapticQueue;
    runtime.prepare(48000.0, 64, hapticQueue);
    expect(runtime.loadSourceAsync(sparseFixture.getFullPathName().toStdString(), "sparse-auto.wav", "sparse-auto"),
           "Recut runtime should load sparse auto fixture.");
    expect(waitForRecutLoaded(runtime), "Recut runtime should finish sparse fixture analysis.");
    const auto frame = parseSampleEditorFrameBase64(runtime.buildSampleEditorFrameBase64());
    expect(frame.slice_markers_size() < 16,
           "Sparse auto fixture should keep only the winning real slices.");
    expect(std::any_of(frame.pad_assignments().begin(), frame.pad_assignments().end(), [](const auto& assignment) {
             return assignment.is_empty();
           }),
           "Sparse auto fixture should mark unused pads empty.");
    juce::AudioBuffer<float> renderBuffer(1, 64);
    renderBuffer.clear();
    runtime.triggerPad(1);
    runtime.processBlock(renderBuffer);
    expect(std::abs(renderBuffer.getSample(0, 0)) < 1.0e-4f,
           "Triggering an empty pad should produce silence.");
    runtime.release();
  }

  {
    const auto denseFixture = createRecutPulseFixtureWav(
        root,
        "recut-dense-auto.wav",
        {
            {900, 1.0f},   {2800, 0.98f}, {4700, 0.96f}, {6600, 0.94f}, {8500, 0.92f}, {10400, 0.9f},
            {12300, 0.88f}, {14200, 0.86f}, {16100, 0.84f}, {18000, 0.82f}, {19900, 0.8f}, {21800, 0.78f},
            {23700, 0.76f}, {25600, 0.74f}, {27500, 0.72f}, {29400, 0.7f}, {31300, 0.68f}, {33200, 0.66f},
            {35100, 0.64f}, {37000, 0.62f}, {38900, 0.6f}, {40800, 0.58f}, {42700, 0.56f}, {44600, 0.54f},
        },
        48000);
    padpilot::RecutRuntime runtime;
    padpilot::LockFreeQueue<padpilot::HapticCommand, 256> hapticQueue;
    runtime.prepare(48000.0, 64, hapticQueue);
    expect(runtime.loadSourceAsync(denseFixture.getFullPathName().toStdString(), "dense-auto.wav", "dense-auto"),
           "Recut runtime should load dense auto fixture.");
    expect(waitForRecutLoaded(runtime), "Recut runtime should finish dense fixture analysis.");
    const auto frame = parseSampleEditorFrameBase64(runtime.buildSampleEditorFrameBase64());
    expect(frame.slice_markers_size() == 16,
           "Dense auto fixture should bucket and keep exactly 16 slices.");
    for (int index = 1; index < frame.slice_markers_size(); ++index) {
      expect(frame.slice_markers(index).start_frame() > frame.slice_markers(index - 1).start_frame(),
             "Dense auto fixture slice starts should stay unique and sorted.");
    }
    runtime.release();
  }

  {
    padpilot::RecutRuntime runtime;
    padpilot::LockFreeQueue<padpilot::HapticCommand, 256> hapticQueue;
    runtime.prepare(48000.0, 64, hapticQueue);
    expect(runtime.loadSourceAsync(fixtureFile.getFullPathName().toStdString(), "fixture.wav", "fixture-content"),
           "Recut runtime should load fixture wav for trigger regression coverage.");
    expect(waitForRecutLoaded(runtime), "Recut runtime should finish trigger fixture analysis.");
    runtime.applyPlaybackState(createCustomRecutPlaybackState());
    juce::AudioBuffer<float> renderBuffer(1, 32);
    for (int iteration = 0; iteration < 24; ++iteration) {
      renderBuffer.clear();
      runtime.triggerPad(static_cast<std::uint32_t>(iteration % 2));
      runtime.processBlock(renderBuffer);
      runtime.releasePad(static_cast<std::uint32_t>(iteration % 2));
      runtime.processBlock(renderBuffer);
    }
    const auto frame = parseSampleEditorFrameBase64(runtime.buildSampleEditorFrameBase64());
    expect(frame.sequence() > 0, "Recut runtime should keep publishing stable frames after repeated trigger processing.");
    runtime.release();
  }

  {
    const auto renderPlayhead = [&](float pitchSemitones, bool stretchEnabled) {
      padpilot::RecutRuntime runtime;
      padpilot::LockFreeQueue<padpilot::HapticCommand, 256> hapticQueue;
      runtime.prepare(48000.0, 16, hapticQueue);
      expect(runtime.loadSourceAsync(fixtureFile.getFullPathName().toStdString(), "fixture.wav", "fixture-content"),
             "Recut runtime should queue pitch fixture load.");
      expect(waitForRecutLoaded(runtime), "Recut runtime should finish pitch fixture analysis.");
      auto playbackState = createCustomRecutPlaybackState();
      playbackState.set_pitch_semitones(pitchSemitones);
      playbackState.set_stretch_enabled(stretchEnabled);
      runtime.applyPlaybackState(playbackState);
      runtime.triggerPad(0);
      juce::AudioBuffer<float> renderBuffer(1, 16);
      renderBuffer.clear();
      runtime.processBlock(renderBuffer);
      const auto playhead = parseSampleEditorFrameBase64(runtime.buildSampleEditorFrameBase64()).playhead_frame();
      runtime.release();
      return playhead;
    };

    expect(renderPlayhead(-12.0f, false) == 8,
           "Negative pitch should advance fractionally instead of freezing.");
    expect(renderPlayhead(12.0f, false) == 32,
           "Positive pitch should apply one varispeed ratio, not square it.");
    expect(renderPlayhead(12.0f, true) == 16,
           "Stretch mode should preserve source duration while pitch changes.");
  }

  {
    const auto sineFixture = createRecutSineFixtureWav(root);
    const auto renderStretch = [&](float pitchSemitones) {
      padpilot::RecutRuntime runtime;
      padpilot::LockFreeQueue<padpilot::HapticCommand, 256> hapticQueue;
      runtime.prepare(48'000.0, 64, hapticQueue);
      expect(runtime.loadSourceAsync(sineFixture.getFullPathName().toStdString(), "sine.wav", "sine-content") &&
                 waitForRecutLoaded(runtime),
             "Recut should load the pitch-shift fixture.");
      auto state = createCustomRecutPlaybackState();
      state.set_pitch_semitones(pitchSemitones);
      state.set_stretch_enabled(true);
      state.set_grain_size_ms(40.0f);
      state.set_grain_density(1.0f);
      state.mutable_slice_markers(0)->set_end_frame(47'999);
      for (auto& assignment : *state.mutable_pad_assignments()) {
        assignment.set_slice_index(0);
      }
      runtime.applyPlaybackState(state);
      runtime.triggerPad(0);

      std::vector<float> rendered;
      rendered.reserve(8'192);
      for (int blockIndex = 0; blockIndex < 160; ++blockIndex) {
        juce::AudioBuffer<float> block(1, 64);
        block.clear();
        runtime.processBlock(block);
        if (blockIndex >= 32) {
          rendered.insert(rendered.end(), block.getReadPointer(0), block.getReadPointer(0) + 64);
        }
      }
      runtime.release();
      return rendered;
    };

    const auto unshifted = renderStretch(0.0f);
    const auto octaveUp = renderStretch(12.0f);
    expect(tonePower(unshifted, 220.0, 48'000.0) > tonePower(unshifted, 440.0, 48'000.0) * 4.0,
           "Stretch mode at zero semitones should retain source pitch.");
    expect(tonePower(octaveUp, 440.0, 48'000.0) > tonePower(octaveUp, 220.0, 48'000.0) * 2.0,
           "Stretch mode should transpose grain reads while preserving transport duration.");
  }

  {
    padpilot::RecutRuntime runtime;
    padpilot::LockFreeQueue<padpilot::HapticCommand, 256> hapticQueue;
    runtime.prepare(48000.0, 16, hapticQueue);
    expect(runtime.loadSourceAsync(fixtureFile.getFullPathName().toStdString(), "fixture.wav", "fixture-content"),
           "Recut runtime should queue live-parameter fixture load.");
    expect(waitForRecutLoaded(runtime), "Recut runtime should finish live-parameter fixture analysis.");
    auto playbackState = createCustomRecutPlaybackState();
    runtime.applyPlaybackState(playbackState);
    runtime.triggerPad(0);
    juce::AudioBuffer<float> renderBuffer(1, 16);
    renderBuffer.clear();
    runtime.processBlock(renderBuffer);
    playbackState.set_pitch_semitones(-12.0f);
    runtime.applyPlaybackState(playbackState);
    renderBuffer.clear();
    runtime.processBlock(renderBuffer);
    const auto frame = parseSampleEditorFrameBase64(runtime.buildSampleEditorFrameBase64());
    expect(frame.playing_pad_indices_size() == 1 && frame.playhead_frame() == 24,
           "Playback-state updates should preserve held voice and apply new fractional rate.");
    runtime.release();
  }

  {
    padpilot::RecutRuntime runtime;
    padpilot::LockFreeQueue<padpilot::HapticCommand, 256> hapticQueue;
    runtime.prepare(48000.0, 64, hapticQueue);
    expect(runtime.loadSourceAsync(fixtureFile.getFullPathName().toStdString(), "fixture.wav", "fixture-content"),
           "Recut runtime should queue granular fixture load.");
    expect(waitForRecutLoaded(runtime), "Recut runtime should finish granular fixture analysis.");
    auto playbackState = createCustomRecutPlaybackState();
    playbackState.set_granular_enabled(true);
    playbackState.set_grain_size_ms(2.0f);
    runtime.applyPlaybackState(playbackState);
    runtime.triggerPad(0);
    juce::AudioBuffer<float> renderBuffer(1, 64);
    for (int block = 0; block < 5; ++block) {
      renderBuffer.clear();
      runtime.processBlock(renderBuffer);
    }
    expect(renderBuffer.getMagnitude(0, 0, renderBuffer.getNumSamples()) > 1.0e-3f,
           "Granular playback should wrap grain phase instead of becoming permanently silent.");
    runtime.release();
  }

  {
    const auto rateFixture = createRecutFixtureWav(root, 24000.0, "recut-24khz-fixture.wav");
    padpilot::RecutRuntime runtime;
    padpilot::LockFreeQueue<padpilot::HapticCommand, 256> hapticQueue;
    runtime.prepare(48000.0, 16, hapticQueue);
    expect(runtime.loadSourceAsync(rateFixture.getFullPathName().toStdString(), "recut-24khz-fixture.wav", "rate-content"),
           "Recut runtime should queue source-rate fixture load.");
    expect(waitForRecutLoaded(runtime), "Recut runtime should finish source-rate fixture analysis.");
    runtime.applyPlaybackState(createCustomRecutPlaybackState());
    runtime.triggerPad(0);
    juce::AudioBuffer<float> renderBuffer(1, 16);
    renderBuffer.clear();
    runtime.processBlock(renderBuffer);
    auto frame = parseSampleEditorFrameBase64(runtime.buildSampleEditorFrameBase64());
    expect(frame.playhead_frame() == 8,
           "Recut playhead should advance using source-rate to host-rate ratio.");
    expect(frame.playing_pad_indices_size() == 1 && frame.playing_pad_indices(0) == 0,
           "Recut frame should publish Audio Thread voice state without reading mutable voices.");
    runtime.release();
    frame = parseSampleEditorFrameBase64(runtime.buildSampleEditorFrameBase64());
    expect(frame.playhead_frame() == 0 && frame.playing_pad_indices_size() == 0,
           "Recut release should reset playhead and published voice state.");
  }

  {
    const auto restoreMediaRoot = root.getChildFile("restore-media");
    padpilot::ManagedFileStore restoreFiles(restoreMediaRoot.getFullPathName().toStdString());
    std::string importError;
    const auto managedFixture = restoreFiles.importSampleFile(
        fixtureFile,
        padpilot::ManagedFileStore::kDefaultMaxImportBytes,
        importError);
    expect(managedFixture.has_value(), "Recut restore fixture should import into managed media.");
    padpilot::capability::SampleSourceLoadRequest sourceRequest;
    sourceRequest.set_source_path(managedFixture->managedPath);
    sourceRequest.set_source_name(managedFixture->sourceName);
    sourceRequest.set_source_content_id(managedFixture->contentId);

    padpilot::RecutRuntime sourceRuntime(restoreMediaRoot.getFullPathName().toStdString());
    padpilot::LockFreeQueue<padpilot::HapticCommand, 256> sourceHaptics;
    sourceRuntime.prepare(48000.0, 64, sourceHaptics);
    expect(sourceRuntime.loadSource(sourceRequest),
           "Recut runtime should queue canonical-state fixture load.");
    expect(waitForRecutLoaded(sourceRuntime), "Recut runtime should finish canonical-state fixture analysis.");
    auto playbackState = createCustomRecutPlaybackState();
    playbackState.set_pitch_semitones(-7.0f);
    sourceRuntime.applyPlaybackState(playbackState);
    const auto serialized = sourceRuntime.serializeStateBytes();
    expect(sourceRuntime.serializeStateBytes() == serialized,
           "Recut serialization should be pure and preserve coherent revision.");

    padpilot::RecutRuntime restoredRuntime(restoreMediaRoot.getFullPathName().toStdString());
    padpilot::LockFreeQueue<padpilot::HapticCommand, 256> restoredHaptics;
    restoredRuntime.prepare(48000.0, 64, restoredHaptics);
    expect(restoredRuntime.applyStateFromBytes(serialized),
           "Recut runtime should accept canonical persisted state.");
    expect(waitForRecutLoaded(restoredRuntime),
           "Recut runtime should asynchronously decode persisted source.");
    const auto restoredFrame = parseSampleEditorFrameBase64(restoredRuntime.buildSampleEditorFrameBase64());
    expect(restoredFrame.slice_markers_size() == 2 &&
               restoredFrame.slice_markers(1).start_frame() == 1024,
           "Recut restore should preserve exact persisted custom slices.");
    padpilot::recut::RecutModuleState restoredState;
    expect(padpilot::proto::parseRecutModuleState(restoredRuntime.serializeStateBytes(), &restoredState) &&
               restoredState.pitch_semitones() == -7.0f,
           "Recut restore should preserve persisted playback parameters.");
    restoredState.set_source_path(fixtureFile.getFullPathName().toStdString());
    padpilot::RecutRuntime rejectedRuntime(restoreMediaRoot.getFullPathName().toStdString());
    padpilot::LockFreeQueue<padpilot::HapticCommand, 256> rejectedHaptics;
    rejectedRuntime.prepare(48000.0, 64, rejectedHaptics);
    expect(!rejectedRuntime.applyStateFromBytes(padpilot::proto::serializeRecutModuleState(restoredState)),
           "Recut restore should reject unmanaged persisted source paths.");
    expect(!parseSampleEditorFrameBase64(rejectedRuntime.buildSampleEditorFrameBase64()).loaded(),
           "Rejected unmanaged restore should not decode arbitrary filesystem audio.");
    padpilot::recut::RecutModuleState rejectedState;
    expect(padpilot::proto::parseRecutModuleState(rejectedRuntime.serializeStateBytes(), &rejectedState) &&
               rejectedState.pitch_semitones() == 0.0f,
           "Rejected unmanaged restore should not partially mutate playback state.");
    sourceRuntime.release();
    restoredRuntime.release();
    rejectedRuntime.release();
  }

  {
    padpilot::RecutRuntime runtime;
    padpilot::LockFreeQueue<padpilot::HapticCommand, 256> hapticQueue;
    runtime.prepare(48000.0, 64, hapticQueue);
    expect(runtime.loadSourceAsync(fixtureFile.getFullPathName().toStdString(), "fixture.wav", "fixture-content"),
           "Recut runtime should queue valid source before invalid-load regression.");
    expect(waitForRecutLoaded(runtime), "Recut runtime should load valid source before invalid-load regression.");
    expect(!runtime.loadSourceAsync(root.getChildFile("missing.wav").getFullPathName().toStdString()),
           "Recut runtime should reject missing ordinary source load.");
    expect(parseSampleEditorFrameBase64(runtime.buildSampleEditorFrameBase64()).loaded(),
           "Rejected ordinary load should preserve current valid source.");
    const auto oversizeFile = root.getChildFile("oversize-direct.wav");
    {
      auto output = oversizeFile.createOutputStream();
      expect(output != nullptr &&
                 output->setPosition(static_cast<juce::int64>(padpilot::ManagedFileStore::kDefaultMaxImportBytes)) &&
                 output->writeByte(0),
             "Recut oversized fixture should create sparse file over hard cap.");
    }
    expect(!runtime.loadSourceAsync(oversizeFile.getFullPathName().toStdString(), "oversize-direct.wav", "oversize"),
           "Recut runtime should reject oversized direct source before decode.");
    expect(parseSampleEditorFrameBase64(runtime.buildSampleEditorFrameBase64()).loaded(),
           "Rejected oversized source should not publish placeholder or replace valid source.");

    std::atomic<bool> keepRendering {true};
    std::thread audioThread([&] {
      juce::AudioBuffer<float> renderBuffer(1, 64);
      while (keepRendering.load(std::memory_order_acquire)) {
        renderBuffer.clear();
        runtime.processBlock(renderBuffer);
      }
    });
    juce::Thread::sleep(5);
    runtime.release();
    keepRendering.store(false, std::memory_order_release);
    audioThread.join();
    expect(!parseSampleEditorFrameBase64(runtime.buildSampleEditorFrameBase64()).loaded(),
           "Recut release should wait for active Audio Thread reader before clearing source.");
  }

  root.deleteRecursively();
}

void runMidiOutputRuntimeTests() {
  padpilot::MidiOutputRuntime runtime;
  padpilot::MidiOutputCommand noteOn {};
  noteOn.type = padpilot::MidiOutputCommandType::noteOn;
  noteOn.channel = 2;
  noteOn.data1 = 64;
  noteOn.data2 = 101;
  noteOn.sampleOffset = 31;
  expect(runtime.enqueue(noteOn), "MIDI output runtime should accept a bounded note-on command.");

  padpilot::MidiOutputCommand controlChange {};
  controlChange.type = padpilot::MidiOutputCommandType::controlChange;
  controlChange.channel = 2;
  controlChange.data1 = 74;
  controlChange.data2 = 88;
  controlChange.sampleOffset = 47;
  expect(runtime.enqueue(controlChange), "MIDI output runtime should accept a bounded CC command.");

  juce::MidiBuffer output;
  runtime.processBlock(output, 64);
  auto iterator = output.cbegin();
  expect(iterator != output.cend(), "MIDI output runtime should emit queued note-on data.");
  const auto first = *iterator++;
  expect(first.getMessage().isNoteOn() && first.getMessage().getChannel() == 2 &&
             first.getMessage().getNoteNumber() == 64 && first.getMessage().getVelocity() == 101U &&
             first.samplePosition == 31,
         "MIDI output runtime should preserve a bounded sample offset inside the next block.");
  expect(iterator != output.cend(), "MIDI output runtime should emit queued CC data.");
  const auto second = *iterator++;
  expect(second.getMessage().isController() && second.getMessage().getChannel() == 2 &&
             second.getMessage().getControllerNumber() == 74 && second.getMessage().getControllerValue() == 88,
         "MIDI output runtime should materialize queued CC data.");
  expect(iterator == output.cend(),
         "MIDI output runtime should emit each queued command exactly once.");

  output.clear();
  runtime.requestPanic();
  runtime.processBlock(output);
  int allNotesOffCount = 0;
  for (const auto metadata : output) {
    if (metadata.getMessage().isAllNotesOff()) ++allNotesOffCount;
  }
  expect(allNotesOffCount == 16,
         "MIDI output ownership teardown should emit all-notes-off on every channel.");

  const auto pluginRoot = juce::File(__FILE__).getParentDirectory().getParentDirectory();
  const auto dependencySource = pluginRoot.getChildFile("cmake/dependencies.cmake").loadFileAsString();
  const auto standalonePatch = pluginRoot
                                   .getChildFile("cmake/patches/juce-standalone-midi-buffer.patch")
                                   .loadFileAsString();
  expect(dependencySource.contains("juce-standalone-midi-buffer.patch") &&
             standalonePatch.contains("incomingMidi.ensureSize (2048)") &&
             padpilot::MidiOutputRuntime::kMaximumMidiBufferBytesPerBlock <= 2048U,
         "Standalone must reserve its persistent MIDI buffer before Audio Thread output.");
}

void runProcessorSourceContracts() {
  const auto pluginRoot = juce::File(__FILE__).getParentDirectory().getParentDirectory();
  const auto processorSource = pluginRoot
                                   .getChildFile("core/pad-pilot-processor-modules.cpp")
                                   .loadFileAsString();
  const auto saveStart = processorSource.indexOf("bool PadPilotAudioProcessor::createAndSavePresetProto");
  const auto saveEnd = processorSource.indexOf(saveStart, "bool PadPilotAudioProcessor::selectPreset");
  expect(saveStart >= 0 && saveEnd > saveStart,
         "Preset save source contract should locate the native save implementation.");
  const auto saveImplementation = processorSource.substring(saveStart, saveEnd);
  expect(!saveImplementation.contains("moduleStatePayloadById_[moduleId] = preset.payloadJson") &&
             !saveImplementation.contains("acceptedRevisionByModuleId_[moduleId] = 0"),
         "Saving a preset must not silently replace active canonical state without applying its runtime.");
}

}  // namespace

int main() {
  try {
    runLockFreeQueueTests();
    runGraphEpochTests();
    runModuleIdentityTests();
    runPresetIdentityTests();
    runSharedLimitTests();
    runStoragePathSafetyTests();
    runFiniteMathTests();
    runCapabilityHandleTests();
    runModuleStoreTests();
    runPresetStoreTests();
    runProtoTests();
    padpilot::tests::runFxGraphNativeTests();
    runWebNavigationPolicyTests();
    runAutomationIdentityTests();
    runBoundedJsonTests();
    runManagedFileStoreTests();
    runAnalyzerRuntimeTests();
    runQuickJsRuntimeTests();
    runScriptHostAuthorizationTests();
    runWakeSignalTests();
    runMidiOutputRuntimeTests();
    runRecutRuntimeTests();
    runProcessorSourceContracts();
  } catch (const std::exception& error) {
    DBG(error.what());
    std::fprintf(stderr, "PadPilot native test failure: %s\n", error.what());
    return 1;
  }

  return 0;
}
