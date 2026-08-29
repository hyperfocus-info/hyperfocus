#include "runtime/analyzer-runtime.h"

#include <algorithm>
#include <array>
#include <chrono>
#include <cmath>
#include <cstring>
#include <limits>
#include <numbers>
#include <numeric>

#include <juce_audio_basics/juce_audio_basics.h>

#include "runtime/analyzer-proto.h"
#include "runtime/backend-log.h"
#include "runtime/base64.h"
#include "runtime/finite-math.h"

namespace {
using padpilot::finiteClamped;

constexpr float kMinTuningHz = 415.0f;
constexpr float kMaxTuningHz = 465.0f;
constexpr float kDefaultTuningHz = padpilot::kAnalyzerDefaultTuningHz;
constexpr float kMinDetectionSensitivity = 0.0f;
constexpr float kMaxDetectionSensitivity = 1.0f;
constexpr float kDefaultDetectionSensitivity = padpilot::kAnalyzerDefaultDetectionSensitivity;
constexpr float kDefaultBpm = 120.0f;
constexpr float kMinAnalysisFrequencyHz = 40.0f;
constexpr float kMaxAnalysisFrequencyHz = 2200.0f;
constexpr int kTicksPerQuarterNote = 960;
constexpr int kMaxWorkerSlicesPerLock = 32;

struct ScaleDefinition {
  const char* id;
  std::array<bool, 12> mask;
};

std::array<bool, 12> buildScaleMask(std::initializer_list<int> intervals) {
  std::array<bool, 12> mask {};
  for (const auto interval : intervals) {
    mask[static_cast<std::size_t>(((interval % 12) + 12) % 12)] = true;
  }
  return mask;
}

const auto& analyzerScales() {
  static const std::array<ScaleDefinition, 23> scales {{
      {"major", buildScaleMask({0, 2, 4, 5, 7, 9, 11})},
      {"natural-minor", buildScaleMask({0, 2, 3, 5, 7, 8, 10})},
      {"harmonic-minor", buildScaleMask({0, 2, 3, 5, 7, 8, 11})},
      {"melodic-minor", buildScaleMask({0, 2, 3, 5, 7, 9, 11})},
      {"dorian", buildScaleMask({0, 2, 3, 5, 7, 9, 10})},
      {"phrygian", buildScaleMask({0, 1, 3, 5, 7, 8, 10})},
      {"lydian", buildScaleMask({0, 2, 4, 6, 7, 9, 11})},
      {"mixolydian", buildScaleMask({0, 2, 4, 5, 7, 9, 10})},
      {"aeolian", buildScaleMask({0, 2, 3, 5, 7, 8, 10})},
      {"locrian", buildScaleMask({0, 1, 3, 5, 6, 8, 10})},
      {"major-pentatonic", buildScaleMask({0, 2, 4, 7, 9})},
      {"minor-pentatonic", buildScaleMask({0, 3, 5, 7, 10})},
      {"blues", buildScaleMask({0, 3, 5, 6, 7, 10})},
      {"whole-tone", buildScaleMask({0, 2, 4, 6, 8, 10})},
      {"diminished", buildScaleMask({0, 2, 3, 5, 6, 8, 9, 11})},
      {"chromatic", buildScaleMask({0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11})},
      {"insen", buildScaleMask({0, 1, 5, 7, 10})},
      {"hirajoshi", buildScaleMask({0, 2, 3, 7, 8})},
      {"iwato", buildScaleMask({0, 1, 5, 6, 10})},
      {"yo", buildScaleMask({0, 2, 5, 7, 9})},
      {"egyptian", buildScaleMask({0, 2, 5, 7, 10})},
      {"phrygian-dominant", buildScaleMask({0, 1, 4, 5, 7, 8, 10})},
      {"double-harmonic", buildScaleMask({0, 1, 4, 5, 7, 8, 11})},
  }};
  return scales;
}

struct RankedScaleMatch {
  std::uint32_t rootPitchClass {0};
  const char* scaleId {"major"};
  float confidence {0.0f};
};

template <typename T>
T clampValue(T value, T min, T max) {
  return std::clamp(value, min, max);
}

std::vector<RankedScaleMatch> rankScaleMatches(const std::array<float, 12>& weights) {
  const float totalWeight = std::accumulate(weights.begin(), weights.end(), 0.0f);
  if (totalWeight <= 0.0f) {
    return {};
  }

  std::vector<RankedScaleMatch> matches;
  matches.reserve(analyzerScales().size() * 12);
  for (const auto& scale : analyzerScales()) {
    for (std::uint32_t rootPitchClass = 0; rootPitchClass < 12; ++rootPitchClass) {
      float includedWeight = 0.0f;
      float excludedWeight = 0.0f;
      float tonicWeight = weights[rootPitchClass];
      int coveredNotes = 0;
      int scaleNotes = 0;

      for (int pitchClass = 0; pitchClass < 12; ++pitchClass) {
        const float weight = weights[static_cast<std::size_t>(pitchClass)];
        const bool inScale = scale.mask[static_cast<std::size_t>(((pitchClass - static_cast<int>(rootPitchClass)) % 12 + 12) % 12)];
        if (inScale) {
          includedWeight += weight;
          scaleNotes += 1;
          if (weight > 0.05f) {
            coveredNotes += 1;
          }
        } else {
          excludedWeight += weight;
        }
      }

      const float coverage = includedWeight / totalWeight;
      const float penalty = excludedWeight / totalWeight;
      const float noteCoverage = scaleNotes > 0 ? static_cast<float>(coveredNotes) / static_cast<float>(scaleNotes) : 0.0f;
      const float confidence = clampValue(coverage * 0.74f + noteCoverage * 0.16f + tonicWeight / totalWeight * 0.18f - penalty * 0.35f, 0.0f, 1.0f);
      matches.push_back({rootPitchClass, scale.id, confidence});
    }
  }

  std::sort(matches.begin(), matches.end(), [](const auto& left, const auto& right) {
    if (left.confidence != right.confidence) {
      return left.confidence > right.confidence;
    }
    if (left.rootPitchClass != right.rootPitchClass) {
      return left.rootPitchClass < right.rootPitchClass;
    }
    return std::strcmp(left.scaleId, right.scaleId) < 0;
  });
  if (matches.size() > 3) {
    matches.resize(3);
  }
  return matches;
}
}  // namespace

namespace padpilot {

AnalyzerRuntime::AnalyzerRuntime()
    : fft_(kFftOrder),
      audioQueue_(std::make_unique<LockFreeQueue<AudioSlice, kAudioQueueCapacity>>()) {
  noteEvents_.reserve(4096);
  noteEventIds_.reserve(4096);
  noteCorrections_.reserve(256);
  analysisSnapshots_.reserve(4096);
  detectedScratch_.reserve(16);
}

AnalyzerRuntime::~AnalyzerRuntime() {
  release();
}

void AnalyzerRuntime::prepare(double sampleRate, int) {
  release();
  audioQueue_->clear();
  audioSlicesPushed_.store(0, std::memory_order_relaxed);
  audioSlicesDropped_.store(0, std::memory_order_relaxed);
  {
    std::lock_guard<std::mutex> guard(stateMutex_);
    sampleRate_ = std::isfinite(sampleRate) && sampleRate > 0.0 ? sampleRate : 48'000.0;
    tuningHz_ = kDefaultTuningHz;
    detectionSensitivity_ = kDefaultDetectionSensitivity;
    capturedBpm_ = kDefaultBpm;
    bpmCaptured_ = false;
    recording_ = false;
    monitoringEnabled_.store(false, std::memory_order_release);
    recordEnabled_.store(false, std::memory_order_release);
    replayableTake_ = true;
    captureLimitReached_ = false;
    pendingRecordMode_.store(-1, std::memory_order_release);
    pendingDetectionSensitivityDirty_.store(false, std::memory_order_release);
    pendingDetectionSensitivity_.store(kDefaultDetectionSensitivity, std::memory_order_release);
    revision_ = 1;
    sequence_ = 0;
    frameCount_ = 0;
    idlePublishCounter_ = 0;
    lastPublishedFrameCount_ = 0;
    currentLevel_ = 0.0f;
    analysisFill_ = 0;
    analysisBuffer_.fill(0.0f);
    laneEnergies_.fill(0.0f);
    activeNotes_.fill({});
    summary_.Clear();
    noteEvents_.clear();
    noteEventIds_.clear();
    noteCorrections_.clear();
    analysisSnapshots_.clear();
    for (int index = 0; index < kFftSize; ++index) {
      const auto phase = static_cast<float>(index) / static_cast<float>(kFftSize - 1);
      window_[static_cast<std::size_t>(index)] = 0.5f - 0.5f * std::cos(2.0f * std::numbers::pi_v<float> * phase);
    }
    publishStateLocked(false);
  }

  prepared_.store(true, std::memory_order_release);
  running_.store(true, std::memory_order_release);
  workerThread_ = std::thread([this]() { workerLoop(); });
}

void AnalyzerRuntime::release() {
  prepared_.store(false, std::memory_order_release);
  running_.store(false, std::memory_order_release);
  if (workerThread_.joinable()) {
    workerThread_.join();
  }
  audioQueue_->clear();
}

void AnalyzerRuntime::restoreState(const padpilot::analyzer::AnalyzerModuleState& state) {
  std::lock_guard<std::mutex> guard(stateMutex_);
  tuningHz_ = finiteClamped(state.tuning_hz(), kMinTuningHz, kMaxTuningHz, kDefaultTuningHz);
  detectionSensitivity_ =
      state.schema_version() >= 2
          ? finiteClamped(state.detection_sensitivity(),
                          kMinDetectionSensitivity,
                          kMaxDetectionSensitivity,
                          kDefaultDetectionSensitivity)
          : kDefaultDetectionSensitivity;
  revision_ = std::max<std::uint64_t>(1, state.revision());
  recording_ = false;
  replayableTake_ = state.note_events_size() == 0;
  monitoringEnabled_.store(false, std::memory_order_release);
  recordEnabled_.store(false, std::memory_order_release);
  pendingRecordMode_.store(-1, std::memory_order_release);
  pendingDetectionSensitivityDirty_.store(false, std::memory_order_release);
  pendingDetectionSensitivity_.store(detectionSensitivity_, std::memory_order_release);
  frameCount_ = std::min(
      state.has_take_summary() ? state.take_summary().frame_count() : 0U,
      maxCaptureFrameCountLocked());
  capturedBpm_ = state.has_take_summary()
                     ? finiteClamped(state.take_summary().captured_bpm(), 20.0f, 400.0f, kDefaultBpm)
                     : kDefaultBpm;
  bpmCaptured_ = state.has_take_summary();
  currentLevel_ = 0.0f;
  idlePublishCounter_ = 0;
  lastPublishedFrameCount_ = 0;
  analysisFill_ = 0;
  analysisBuffer_.fill(0.0f);
  laneEnergies_.fill(0.0f);
  activeNotes_.fill({});
  noteEvents_.clear();
  noteEventIds_.clear();
  noteCorrections_.clear();
  analysisSnapshots_.clear();
  for (const auto& event : state.note_events()) {
    if (noteEvents_.size() >= kMaxPersistedNoteEvents) {
      break;
    }
    if (event.midi_note() > 127U || event.velocity() > 127U ||
        !std::isfinite(event.intensity()) || !std::isfinite(event.mean_frequency_hz()) ||
        event.mean_frequency_hz() <= 0.0f ||
        event.start_frame() >= maxCaptureFrameCountLocked()) {
      continue;
    }
    const auto endFrame = std::min(event.end_frame(), maxCaptureFrameCountLocked());
    if (endFrame <= event.start_frame()) {
      continue;
    }
    const auto detectedMidiNote = state.schema_version() >= 3 && event.detected_midi_note() <= 127U
                                      ? static_cast<std::uint8_t>(event.detected_midi_note())
                                      : static_cast<std::uint8_t>(event.midi_note());
    const auto meanFrequencyHz = finiteClamped(event.mean_frequency_hz(),
                                                1.0f,
                                                kMaxAnalysisFrequencyHz,
                                                kDefaultTuningHz);
    const auto hasUniquePersistedId = state.schema_version() >= 3 && event.event_id() != 0 &&
                                      !noteEventIds_.contains(event.event_id());
    const auto eventId = hasUniquePersistedId
                             ? event.event_id()
                             : createEventIdLocked(detectedMidiNote,
                                                   event.start_frame(),
                                                   endFrame,
                                                   meanFrequencyHz);
    noteEvents_.push_back({
        eventId,
        static_cast<std::uint8_t>(event.midi_note()),
        detectedMidiNote,
        event.start_frame(),
        endFrame,
        finiteClamped(event.intensity(), 0.0f, 1.0f, 0.0f),
        state.schema_version() >= 3
            ? finiteClamped(event.confidence(), 0.0f, 1.0f, 0.0f)
            : finiteClamped(event.intensity(), 0.0f, 1.0f, 0.0f),
        static_cast<std::uint8_t>(event.velocity()),
        meanFrequencyHz,
    });
    noteEventIds_.insert(eventId);
    if (static_cast<std::uint8_t>(event.midi_note()) != detectedMidiNote) {
      noteCorrections_.push_back({
          eventId,
          detectedMidiNote,
          static_cast<std::uint8_t>(event.midi_note()),
          event.start_frame(),
          endFrame,
          meanFrequencyHz,
      });
    }
    frameCount_ = std::max(frameCount_, endFrame);
  }
  captureLimitReached_ = state.note_events_size() > static_cast<int>(kMaxPersistedNoteEvents) ||
                         (state.has_take_summary() &&
                          state.take_summary().frame_count() > maxCaptureFrameCountLocked());
  rebuildSummaryLocked();
  publishStateLocked(false);
}

void AnalyzerRuntime::pushAudioBlock(const juce::AudioBuffer<float>& audioBuffer, double hostBpm) noexcept {
  if (!prepared_.load(std::memory_order_acquire)) {
    return;
  }

  const bool monitoringEnabled = monitoringEnabled_.load(std::memory_order_acquire);
  const bool recordEnabled = recordEnabled_.load(std::memory_order_acquire);
  if (!monitoringEnabled && !recordEnabled) {
    return;
  }

  const auto channelCount = audioBuffer.getNumChannels();
  const auto blockSamples = audioBuffer.getNumSamples();
  if (channelCount <= 0 || blockSamples <= 0) {
    return;
  }

  const auto scale = 1.0f / static_cast<float>(channelCount);
  const auto safeHostBpm = std::isfinite(hostBpm) && hostBpm > 0.0
                               ? static_cast<float>(hostBpm)
                               : kDefaultBpm;
  for (int sliceStart = 0; sliceStart < blockSamples; sliceStart += kMaxSliceSamples) {
    const auto sliceSamples = std::min(kMaxSliceSamples, blockSamples - sliceStart);
    AudioSlice slice;
    slice.numSamples = static_cast<std::uint16_t>(sliceSamples);
    slice.hostBpm = safeHostBpm;
    for (int sampleIndex = 0; sampleIndex < sliceSamples; ++sampleIndex) {
      float downmixed = 0.0f;
      for (int channel = 0; channel < channelCount; ++channel) {
        downmixed += audioBuffer.getReadPointer(channel)[sliceStart + sampleIndex];
      }
      downmixed *= scale;
      if (!std::isfinite(downmixed)) {
        downmixed = 0.0f;
      }
      slice.samples[static_cast<std::size_t>(sampleIndex)] = downmixed;
      slice.peakLevel = std::max(slice.peakLevel, std::abs(downmixed));
    }

    if (audioQueue_->push(slice)) {
      audioSlicesPushed_.fetch_add(1, std::memory_order_relaxed);
    } else {
      audioSlicesDropped_.fetch_add(1, std::memory_order_relaxed);
    }
  }
}

std::uint64_t AnalyzerRuntime::getAudioSlicesPushed() const noexcept {
  return audioSlicesPushed_.load(std::memory_order_relaxed);
}

std::uint64_t AnalyzerRuntime::getAudioSlicesDropped() const noexcept {
  return audioSlicesDropped_.load(std::memory_order_relaxed);
}

void AnalyzerRuntime::setMonitoringEnabled(bool enabled) {
  monitoringEnabled_.store(enabled, std::memory_order_release);

  std::lock_guard<std::mutex> guard(stateMutex_);
  idlePublishCounter_ = 0;
  if (!enabled) {
    currentLevel_ = 0.0f;
  }
  publishStateLocked(false);
}

void AnalyzerRuntime::setTuningHz(float tuningHz) {
  std::lock_guard<std::mutex> guard(stateMutex_);
  const auto nextTuning = finiteClamped(tuningHz, kMinTuningHz, kMaxTuningHz, kDefaultTuningHz);
  if (std::abs(nextTuning - tuningHz_) < 0.001f) {
    return;
  }
  tuningHz_ = nextTuning;
  finalizeInactiveNotesLocked(true);
  remapNotesForTuningLocked();
  rebuildSummaryLocked();
  publishStateLocked(true);
}

void AnalyzerRuntime::setDetectionSensitivity(float detectionSensitivity) {
  pendingDetectionSensitivity_.store(
      finiteClamped(detectionSensitivity,
                    kMinDetectionSensitivity,
                    kMaxDetectionSensitivity,
                    kDefaultDetectionSensitivity),
      std::memory_order_release);
  pendingDetectionSensitivityDirty_.store(true, std::memory_order_release);
}

void AnalyzerRuntime::setRecordMode(AnalyzerRecordMode mode) {
  recordEnabled_.store(mode != AnalyzerRecordMode::stop, std::memory_order_release);
  pendingRecordMode_.store(static_cast<int>(mode), std::memory_order_release);
}

bool AnalyzerRuntime::correctNote(const std::uint64_t eventId, const std::uint8_t midiNote) {
  if (eventId == 0) {
    return false;
  }
  std::lock_guard<std::mutex> guard(stateMutex_);
  const auto event = std::find_if(noteEvents_.begin(), noteEvents_.end(), [eventId](const auto& candidate) {
    return candidate.eventId == eventId;
  });
  if (event == noteEvents_.end()) {
    return false;
  }
  event->midiNote = midiNote;
  const auto correction = std::find_if(noteCorrections_.begin(), noteCorrections_.end(), [eventId](const auto& candidate) {
    return candidate.eventId == eventId;
  });
  if (midiNote == event->detectedMidiNote) {
    if (correction != noteCorrections_.end()) {
      noteCorrections_.erase(correction);
    }
  } else if (correction != noteCorrections_.end()) {
    correction->correctedMidiNote = midiNote;
  } else {
    noteCorrections_.push_back({
        event->eventId,
        event->detectedMidiNote,
        midiNote,
        event->startFrame,
        event->endFrame,
        event->meanFrequencyHz,
    });
  }
  rebuildSummaryLocked();
  publishStateLocked(true);
  return true;
}

bool AnalyzerRuntime::resetNoteCorrection(const std::uint64_t eventId) {
  if (eventId == 0) {
    return false;
  }
  std::lock_guard<std::mutex> guard(stateMutex_);
  const auto event = std::find_if(noteEvents_.begin(), noteEvents_.end(), [eventId](const auto& candidate) {
    return candidate.eventId == eventId;
  });
  if (event == noteEvents_.end()) {
    return false;
  }
  event->midiNote = event->detectedMidiNote;
  noteCorrections_.erase(
      std::remove_if(noteCorrections_.begin(), noteCorrections_.end(), [eventId](const auto& candidate) {
        return candidate.eventId == eventId;
      }),
      noteCorrections_.end());
  rebuildSummaryLocked();
  publishStateLocked(true);
  return true;
}

std::string AnalyzerRuntime::getStateBase64() const {
  std::lock_guard<std::mutex> guard(stateMutex_);
  return stateBase64_;
}

std::uint64_t AnalyzerRuntime::getRevision() const {
  std::lock_guard<std::mutex> guard(stateMutex_);
  return revision_;
}

std::string AnalyzerRuntime::buildFrameBase64() const {
  std::lock_guard<std::mutex> guard(stateMutex_);
  return frameBase64_;
}

bool AnalyzerRuntime::hasTake() const {
  std::lock_guard<std::mutex> guard(stateMutex_);
  return !noteEvents_.empty();
}

bool AnalyzerRuntime::writeMidiFile(const juce::File& targetFile, juce::String& errorMessage) const {
  std::vector<NoteEventData> noteEvents;
  float capturedBpm = kDefaultBpm;
  double sampleRate = 48'000.0;
  {
    std::lock_guard<std::mutex> guard(stateMutex_);
    noteEvents = noteEvents_;
    capturedBpm = finiteClamped(capturedBpm_, 20.0f, 400.0f, kDefaultBpm);
    sampleRate = std::isfinite(sampleRate_) && sampleRate_ > 0.0 ? sampleRate_ : 48'000.0;
  }

  if (noteEvents.empty()) {
    errorMessage = "No analyzed take is available to export.";
    return false;
  }

  juce::MidiMessageSequence sequence;
  for (const auto& event : noteEvents) {
    const auto startSeconds = static_cast<double>(event.startFrame * kHopSize) / sampleRate;
    const auto endSeconds = static_cast<double>(std::max(event.endFrame, event.startFrame + 1U) * kHopSize) / sampleRate;
    const auto startBeats = startSeconds * static_cast<double>(capturedBpm) / 60.0;
    const auto endBeats = endSeconds * static_cast<double>(capturedBpm) / 60.0;
    const auto startTicks = startBeats * kTicksPerQuarterNote;
    const auto endTicks = std::max(startTicks + 1.0, endBeats * kTicksPerQuarterNote);
    const auto velocity = juce::uint8(std::clamp<int>(event.velocity, 1, 127));

    auto noteOn = juce::MidiMessage::noteOn(1, static_cast<int>(event.midiNote), velocity);
    noteOn.setTimeStamp(startTicks);
    sequence.addEvent(noteOn);

    auto noteOff = juce::MidiMessage::noteOff(1, static_cast<int>(event.midiNote));
    noteOff.setTimeStamp(endTicks);
    sequence.addEvent(noteOff);
  }

  sequence.updateMatchedPairs();

  juce::MidiFile midiFile;
  midiFile.setTicksPerQuarterNote(kTicksPerQuarterNote);
  midiFile.addTrack(sequence);

  targetFile.getParentDirectory().createDirectory();
  juce::FileOutputStream stream(targetFile);
  if (!stream.openedOk()) {
    errorMessage = "Unable to open MIDI export destination.";
    return false;
  }

  if (!midiFile.writeTo(stream)) {
    errorMessage = "Unable to write MIDI export file.";
    return false;
  }

  return true;
}

void AnalyzerRuntime::workerLoop() {
  while (running_.load(std::memory_order_acquire)) {
    AudioSlice firstSlice;
    const bool hasAudio = audioQueue_->pop(firstSlice);
    const bool hasPendingCommand = pendingRecordMode_.load(std::memory_order_acquire) >= 0 ||
                                   pendingDetectionSensitivityDirty_.load(std::memory_order_acquire);
    if (!hasAudio && !hasPendingCommand) {
      std::this_thread::sleep_for(std::chrono::milliseconds(1));
      continue;
    }

    int processedSlices = 0;
    {
      std::lock_guard<std::mutex> guard(stateMutex_);
      applyPendingCommandLocked();

      if (hasAudio) {
        consumeAudioSliceLocked(firstSlice);
        ++processedSlices;
      }
      AudioSlice slice;
      while (processedSlices < kMaxWorkerSlicesPerLock && audioQueue_->pop(slice)) {
        consumeAudioSliceLocked(slice);
        ++processedSlices;
      }
    }
    if (processedSlices == kMaxWorkerSlicesPerLock) {
      std::this_thread::yield();
    }
  }
}

void AnalyzerRuntime::applyPendingCommandLocked() {
  const auto pendingCommand = pendingRecordMode_.exchange(-1, std::memory_order_acq_rel);
  if (pendingCommand >= 0) {
    const auto mode = static_cast<AnalyzerRecordMode>(pendingCommand);
    if (mode == AnalyzerRecordMode::stop) {
      stopRecordingLocked();
    } else {
      startRecordingLocked(mode == AnalyzerRecordMode::startAppend);
    }
  }
  applyPendingSensitivityLocked();
}

void AnalyzerRuntime::applyPendingSensitivityLocked() {
  if (!pendingDetectionSensitivityDirty_.exchange(false, std::memory_order_acq_rel)) {
    return;
  }

  const auto nextSensitivity = finiteClamped(
      pendingDetectionSensitivity_.load(std::memory_order_acquire),
      kMinDetectionSensitivity,
      kMaxDetectionSensitivity,
      kDefaultDetectionSensitivity);
  if (std::abs(nextSensitivity - detectionSensitivity_) < 0.0001f) {
    return;
  }

  detectionSensitivity_ = nextSensitivity;
  if (replayableTake_ && !analysisSnapshots_.empty()) {
    replaySnapshotsLocked(!recording_);
  }
  rebuildSummaryLocked();
  publishStateLocked(true);
}

void AnalyzerRuntime::startRecordingLocked(bool append) {
  finalizeInactiveNotesLocked(true);
  if (!append) {
    clearTakeLocked();
  } else if (captureAtLimitLocked()) {
    recording_ = false;
    recordEnabled_.store(false, std::memory_order_release);
    captureLimitReached_ = true;
    rebuildSummaryLocked();
    publishStateLocked(true);
    padpilot::appendBackendLog("analyzer-runtime", "Append capture rejected because the bounded take is full");
    return;
  }

  recording_ = true;
  recordEnabled_.store(true, std::memory_order_release);
  replayableTake_ = replayableTake_ && append;
  if (!append) {
    replayableTake_ = true;
  }
  captureLimitReached_ = false;
  idlePublishCounter_ = 0;
  bpmCaptured_ = append && capturedBpm_ > 0.0f;
  currentLevel_ = 0.0f;
  laneEnergies_.fill(0.0f);
  activeNotes_.fill({});
  analysisFill_ = 0;
  analysisBuffer_.fill(0.0f);
  if (append && !analysisSnapshots_.empty()) {
    replaySnapshotsLocked(false);
  }
  publishStateLocked(true);
}

void AnalyzerRuntime::stopRecordingLocked() {
  finalizeInactiveNotesLocked(true);
  recording_ = false;
  recordEnabled_.store(false, std::memory_order_release);
  idlePublishCounter_ = 0;
  rebuildSummaryLocked();
  publishStateLocked(true);
}

void AnalyzerRuntime::stopRecordingAtLimitLocked(const char* limitKind) {
  captureLimitReached_ = true;
  stopRecordingLocked();
  padpilot::appendBackendLog(
      "analyzer-runtime",
      "Capture stopped at bounded " + std::string(limitKind) +
          " limit frames=" + std::to_string(frameCount_) +
          " snapshots=" + std::to_string(analysisSnapshots_.size()) +
          " notes=" + std::to_string(noteEvents_.size()));
}

void AnalyzerRuntime::clearTakeLocked() {
  noteEvents_.clear();
  noteEventIds_.clear();
  noteCorrections_.clear();
  analysisSnapshots_.clear();
  summary_.Clear();
  replayableTake_ = true;
  frameCount_ = 0;
  lastPublishedFrameCount_ = 0;
  capturedBpm_ = kDefaultBpm;
  bpmCaptured_ = false;
  captureLimitReached_ = false;
}

void AnalyzerRuntime::consumeAudioSliceLocked(const AudioSlice& slice) {
  currentLevel_ = finiteClamped(slice.peakLevel, 0.0f, 1.0e6f, 0.0f);
  if (!recording_) {
    idlePublishCounter_ += 1;
    if (idlePublishCounter_ >= kPublishEveryFrames) {
      idlePublishCounter_ = 0;
      publishStateLocked(true);
    }
    return;
  }

  if (!bpmCaptured_) {
    capturedBpm_ = finiteClamped(slice.hostBpm, 20.0f, 400.0f, kDefaultBpm);
    bpmCaptured_ = true;
  }

  for (std::uint16_t sampleIndex = 0; sampleIndex < slice.numSamples; ++sampleIndex) {
    analysisBuffer_[static_cast<std::size_t>(analysisFill_)] = slice.samples[static_cast<std::size_t>(sampleIndex)];
    analysisFill_ += 1;
    if (analysisFill_ < kFftSize) {
      continue;
    }

    processAnalysisFrameLocked();
    if (!recording_) {
      analysisFill_ = 0;
      analysisBuffer_.fill(0.0f);
      break;
    }
    std::memmove(
        analysisBuffer_.data(),
        analysisBuffer_.data() + kHopSize,
        sizeof(float) * static_cast<std::size_t>(kFftSize - kHopSize));
    analysisFill_ -= kHopSize;
  }
}

void AnalyzerRuntime::processAnalysisFrameLocked() {
  for (int index = 0; index < kFftSize; ++index) {
    fftData_[static_cast<std::size_t>(index)] = analysisBuffer_[static_cast<std::size_t>(index)] * window_[static_cast<std::size_t>(index)];
  }
  for (int index = kFftSize; index < static_cast<int>(fftData_.size()); ++index) {
    fftData_[static_cast<std::size_t>(index)] = 0.0f;
  }

  fft_.performRealOnlyForwardTransform(fftData_.data());
  for (auto& value : laneEnergies_) {
    value *= 0.56f;
  }

  const auto snapshot = extractFrameCandidatesLocked();
  if (recording_) {
    if (analysisSnapshots_.size() >= kMaxAnalysisSnapshots) {
      stopRecordingAtLimitLocked("snapshot-memory");
      return;
    }
    analysisSnapshots_.push_back(snapshot);
  }
  const auto detectedNotes = detectNotesFromSnapshotLocked(snapshot);
  frameCount_ += 1;
  idlePublishCounter_ = 0;
  updateActiveNotesLocked(detectedNotes);
  if (captureLimitReached_) {
    stopRecordingAtLimitLocked("note-event");
    return;
  }
  if (frameCount_ >= maxCaptureFrameCountLocked()) {
    stopRecordingAtLimitLocked("duration");
    return;
  }
  if (analysisSnapshots_.size() >= kMaxAnalysisSnapshots) {
    stopRecordingAtLimitLocked("snapshot-memory");
    return;
  }
  if (frameCount_ - lastPublishedFrameCount_ >= kPublishEveryFrames) {
    rebuildSummaryLocked();
    publishStateLocked(true);
  }
}

void AnalyzerRuntime::replaySnapshotsLocked(bool finalizeActiveNotes) {
  noteEvents_.clear();
  noteEventIds_.clear();
  summary_.Clear();
  frameCount_ = 0;
  lastPublishedFrameCount_ = 0;
  laneEnergies_.fill(0.0f);
  activeNotes_.fill({});

  for (const auto& snapshot : analysisSnapshots_) {
    for (auto& value : laneEnergies_) {
      value *= 0.56f;
    }
    const auto detectedNotes = detectNotesFromSnapshotLocked(snapshot);
    frameCount_ += 1;
    updateActiveNotesLocked(detectedNotes);
  }

  if (finalizeActiveNotes) {
    finalizeInactiveNotesLocked(true);
  }
}

void AnalyzerRuntime::updateActiveNotesLocked(const std::vector<DetectedNote>& detectedNotes) {
  std::array<bool, 128> seen {};
  for (const auto& detected : detectedNotes) {
    const auto noteIndex = static_cast<std::size_t>(detected.midiNote);
    seen[noteIndex] = true;
    laneEnergies_[noteIndex] = std::max(laneEnergies_[noteIndex], detected.intensity);

    auto& note = activeNotes_[noteIndex];
    if (!note.active) {
      note.active = true;
      note.startFrame = frameCount_ > 0 ? frameCount_ - 1 : 0;
      note.lastSeenFrame = frameCount_;
      note.missingFrames = 0;
      note.detectionCount = 0;
      note.peakIntensity = 0.0f;
      note.intensitySum = 0.0f;
      note.confidenceSum = 0.0f;
      note.frequencySum = 0.0f;
    }

    note.lastSeenFrame = frameCount_;
    note.missingFrames = 0;
    note.detectionCount += 1;
    note.peakIntensity = std::max(note.peakIntensity, detected.intensity);
    note.intensitySum += detected.intensity;
    note.confidenceSum += detected.confidence;
    note.frequencySum += detected.frequencyHz;
  }

  for (std::size_t noteIndex = 0; noteIndex < activeNotes_.size(); ++noteIndex) {
    auto& note = activeNotes_[noteIndex];
    if (!note.active) {
      continue;
    }
    if (!seen[noteIndex]) {
      note.missingFrames += 1;
    }
  }

  finalizeInactiveNotesLocked(false);
}

void AnalyzerRuntime::finalizeInactiveNotesLocked(bool forceAll) {
  for (std::size_t noteIndex = 0; noteIndex < activeNotes_.size(); ++noteIndex) {
    auto& note = activeNotes_[noteIndex];
    if (!note.active) {
      continue;
    }
    if (!forceAll && note.missingFrames <= 2) {
      continue;
    }

    const auto endFrame = forceAll
                              ? std::max(note.startFrame + 1, frameCount_)
                              : std::max(note.startFrame + 1, note.lastSeenFrame + 1);
    appendNoteEventLocked(static_cast<std::uint8_t>(noteIndex), note, endFrame);
    note = {};
  }
}

void AnalyzerRuntime::appendNoteEventLocked(std::uint8_t midiNote, const ActiveNote& note, std::uint32_t endFrame) {
  if (note.detectionCount == 0 || endFrame <= note.startFrame ||
      !std::isfinite(note.intensitySum) || !std::isfinite(note.peakIntensity) ||
      !std::isfinite(note.frequencySum)) {
    return;
  }
  if (noteEvents_.size() >= kMaxPersistedNoteEvents) {
    captureLimitReached_ = true;
    return;
  }

  const auto averageIntensity = finiteClamped(
      note.intensitySum / static_cast<float>(note.detectionCount), 0.0f, 1.0f, 0.0f);
  const auto durationFrames = std::max<std::uint32_t>(1, endFrame - note.startFrame);
  const auto temporalConfidence = clampValue(
      static_cast<float>(note.detectionCount) / static_cast<float>(durationFrames), 0.0f, 1.0f);
  const auto spectralConfidence = finiteClamped(
      note.confidenceSum / static_cast<float>(note.detectionCount), 0.0f, 1.0f, 0.0f);
  const auto eventConfidence = clampValue(spectralConfidence * 0.62f + temporalConfidence * 0.38f,
                                          0.0f,
                                          1.0f);
  const auto velocity = static_cast<std::uint8_t>(std::clamp<int>(static_cast<int>(std::round(note.peakIntensity * 127.0f)), 1, 127));
  const auto meanFrequencyHz = finiteClamped(
      note.frequencySum / static_cast<float>(note.detectionCount),
      1.0f,
      kMaxAnalysisFrequencyHz,
      kDefaultTuningHz);
  auto eventId = createEventIdLocked(midiNote, note.startFrame, endFrame, meanFrequencyHz);
  auto correctedMidiNote = midiNote;
  const auto correction = std::min_element(
      noteCorrections_.begin(),
      noteCorrections_.end(),
      [midiNote, startFrame = note.startFrame, endFrame](const auto& left, const auto& right) {
        const auto score = [midiNote, startFrame, endFrame](const auto& candidate) {
          if (candidate.detectedMidiNote != midiNote ||
              candidate.endFrame <= startFrame || candidate.startFrame >= endFrame) {
            return std::numeric_limits<std::uint32_t>::max();
          }
          return candidate.startFrame > startFrame
                     ? candidate.startFrame - startFrame
                     : startFrame - candidate.startFrame;
        };
        return score(left) < score(right);
      });
  if (correction != noteCorrections_.end() && correction->detectedMidiNote == midiNote &&
      correction->endFrame > note.startFrame && correction->startFrame < endFrame &&
      !noteEventIds_.contains(correction->eventId)) {
    eventId = correction->eventId;
    correctedMidiNote = correction->correctedMidiNote;
  }
  noteEvents_.push_back({
      eventId,
      correctedMidiNote,
      midiNote,
      note.startFrame,
      endFrame,
      averageIntensity,
      eventConfidence,
      velocity,
      meanFrequencyHz,
  });
  noteEventIds_.insert(eventId);
  captureLimitReached_ = noteEvents_.size() >= kMaxPersistedNoteEvents;
}

void AnalyzerRuntime::rebuildEventIdIndexLocked() {
  noteEventIds_.clear();
  noteEventIds_.reserve(noteEvents_.size());
  for (const auto& event : noteEvents_) {
    noteEventIds_.insert(event.eventId);
  }
}

std::uint64_t AnalyzerRuntime::createEventIdLocked(const std::uint8_t detectedMidiNote,
                                                   const std::uint32_t startFrame,
                                                   const std::uint32_t endFrame,
                                                   const float meanFrequencyHz) const {
  constexpr std::uint64_t kFnvOffset = 1469598103934665603ULL;
  constexpr std::uint64_t kFnvPrime = 1099511628211ULL;
  auto hash = kFnvOffset;
  const auto mix = [&hash](const std::uint64_t value) {
    hash ^= value;
    hash *= kFnvPrime;
  };
  mix(detectedMidiNote);
  mix(startFrame);
  mix(endFrame);
  mix(static_cast<std::uint64_t>(std::llround(
      static_cast<double>(finiteClamped(meanFrequencyHz,
                                        1.0f,
                                        kMaxAnalysisFrequencyHz,
                                        kDefaultTuningHz)) *
      100.0)));
  if (hash == 0) {
    hash = 1;
  }
  while (noteEventIds_.contains(hash)) {
    hash = hash * kFnvPrime + 1U;
    if (hash == 0) {
      hash = 1;
    }
  }
  return hash;
}

AnalyzerRuntime::AnalysisFrameSnapshot AnalyzerRuntime::extractFrameCandidatesLocked() {
  AnalysisFrameSnapshot snapshot;
  for (int bin = 1; bin < kFftSize / 2; ++bin) {
    const auto real = fftData_[static_cast<std::size_t>(bin * 2)];
    const auto imaginary = fftData_[static_cast<std::size_t>(bin * 2 + 1)];
    const auto magnitude = std::sqrt(real * real + imaginary * imaginary);
    magnitudes_[static_cast<std::size_t>(bin)] = magnitude;
    snapshot.maxMagnitude = std::max(snapshot.maxMagnitude, magnitude);
  }

  for (int bin = 3; bin < kFftSize / 2 - 2; ++bin) {
    const auto magnitude = magnitudes_[static_cast<std::size_t>(bin)];
    if (magnitude < magnitudes_[static_cast<std::size_t>(bin - 1)] || magnitude < magnitudes_[static_cast<std::size_t>(bin + 1)]) {
      continue;
    }

    const auto denominator = magnitudes_[static_cast<std::size_t>(bin - 1)] -
                             2.0f * magnitude +
                             magnitudes_[static_cast<std::size_t>(bin + 1)];
    const auto offset = std::abs(denominator) > 1.0e-12f
                            ? clampValue(0.5f *
                                             (magnitudes_[static_cast<std::size_t>(bin - 1)] -
                                              magnitudes_[static_cast<std::size_t>(bin + 1)]) /
                                             denominator,
                                         -0.5f,
                                         0.5f)
                            : 0.0f;
    const auto frequencyHz = static_cast<float>(sampleRate_ *
                                                 (static_cast<double>(bin) + static_cast<double>(offset)) /
                                                 static_cast<double>(kFftSize));
    if (frequencyHz < kMinAnalysisFrequencyHz || frequencyHz > kMaxAnalysisFrequencyHz) {
      continue;
    }

    insertSnapshotCandidateLocked(snapshot, magnitude, frequencyHz);
  }

  return snapshot;
}

std::vector<AnalyzerRuntime::DetectedNote> AnalyzerRuntime::detectNotesFromSnapshotLocked(const AnalysisFrameSnapshot& snapshot) {
  std::array<float, 128> bestIntensity {};
  std::array<float, 128> bestFrequency {};
  std::array<float, 128> bestConfidence {};

  if (snapshot.maxMagnitude <= 0.0f || snapshot.candidateCount == 0) {
    detectedScratch_.clear();
    return detectedScratch_;
  }

  const auto threshold = std::max(0.0008f, snapshot.maxMagnitude * detectionThresholdMultiplierLocked());
  for (std::size_t candidateIndex = 0; candidateIndex < snapshot.candidateCount; ++candidateIndex) {
    const auto& candidate = snapshot.candidates[candidateIndex];
    if (candidate.magnitude < threshold || candidate.frequencyHz <= 0.0f) {
      continue;
    }

    const auto midiNote = frequencyToMidiLocked(candidate.frequencyHz);
    const auto intensity = clampValue(candidate.magnitude / snapshot.maxMagnitude, 0.0f, 1.0f);
    int harmonicSupport = 0;
    for (std::size_t supportIndex = 0; supportIndex < snapshot.candidateCount; ++supportIndex) {
      if (supportIndex == candidateIndex) {
        continue;
      }
      const auto& support = snapshot.candidates[supportIndex];
      const auto ratio = support.frequencyHz / candidate.frequencyHz;
      const auto nearestHarmonic = std::round(ratio);
      if (nearestHarmonic >= 2.0f && nearestHarmonic <= 6.0f &&
          std::abs(ratio - nearestHarmonic) <= 0.035f) {
        harmonicSupport += 1;
      }
    }

    bool explainedByLowerFundamental = false;
    for (std::size_t lowerIndex = 0; lowerIndex < snapshot.candidateCount; ++lowerIndex) {
      if (lowerIndex == candidateIndex) {
        continue;
      }
      const auto& lower = snapshot.candidates[lowerIndex];
      if (lower.frequencyHz >= candidate.frequencyHz || lower.magnitude < candidate.magnitude * 0.32f) {
        continue;
      }
      const auto ratio = candidate.frequencyHz / lower.frequencyHz;
      const auto nearestHarmonic = std::round(ratio);
      if (nearestHarmonic < 2.0f || nearestHarmonic > 6.0f ||
          std::abs(ratio - nearestHarmonic) > 0.035f) {
        continue;
      }

      int lowerSupport = 0;
      for (std::size_t supportIndex = 0; supportIndex < snapshot.candidateCount; ++supportIndex) {
        if (supportIndex == lowerIndex) {
          continue;
        }
        const auto supportRatio = snapshot.candidates[supportIndex].frequencyHz / lower.frequencyHz;
        const auto supportHarmonic = std::round(supportRatio);
        if (supportHarmonic >= 2.0f && supportHarmonic <= 6.0f &&
            std::abs(supportRatio - supportHarmonic) <= 0.035f) {
          lowerSupport += 1;
        }
      }
      if (lowerSupport >= 2) {
        explainedByLowerFundamental = true;
        break;
      }
    }
    if (explainedByLowerFundamental) {
      continue;
    }

    const auto confidence = clampValue(intensity * 0.72f +
                                           std::min(3, harmonicSupport) * 0.093333f,
                                       0.0f,
                                       1.0f);
    if (intensity > bestIntensity[static_cast<std::size_t>(midiNote)]) {
      bestIntensity[static_cast<std::size_t>(midiNote)] = intensity;
      bestFrequency[static_cast<std::size_t>(midiNote)] = candidate.frequencyHz;
      bestConfidence[static_cast<std::size_t>(midiNote)] = confidence;
    }
  }

  detectedScratch_.clear();
  for (std::size_t noteIndex = 0; noteIndex < bestIntensity.size(); ++noteIndex) {
    if (bestIntensity[noteIndex] <= 0.0f) {
      continue;
    }
    detectedScratch_.push_back({
        static_cast<std::uint8_t>(noteIndex),
        bestIntensity[noteIndex],
        bestConfidence[noteIndex],
        bestFrequency[noteIndex],
    });
  }

  std::sort(detectedScratch_.begin(), detectedScratch_.end(), [](const auto& left, const auto& right) {
    return left.intensity > right.intensity;
  });
  if (detectedScratch_.size() > kMaxVoices) {
    detectedScratch_.resize(kMaxVoices);
  }
  return detectedScratch_;
}

void AnalyzerRuntime::insertSnapshotCandidateLocked(AnalysisFrameSnapshot& snapshot, float magnitude, float frequencyHz) const {
  if (!std::isfinite(magnitude) || !std::isfinite(frequencyHz) ||
      magnitude <= 0.0f || frequencyHz <= 0.0f) {
    return;
  }

  const auto capacity = snapshot.candidates.size();
  auto insertIndex = static_cast<std::size_t>(snapshot.candidateCount);
  while (insertIndex > 0 && magnitude > snapshot.candidates[insertIndex - 1].magnitude) {
    insertIndex -= 1;
  }

  if (snapshot.candidateCount < capacity) {
    const auto count = static_cast<std::size_t>(snapshot.candidateCount);
    for (auto moveIndex = count; moveIndex > insertIndex; --moveIndex) {
      snapshot.candidates[moveIndex] = snapshot.candidates[moveIndex - 1];
    }
    snapshot.candidates[insertIndex] = {magnitude, frequencyHz};
    snapshot.candidateCount = static_cast<std::uint8_t>(count + 1);
    return;
  }

  if (insertIndex >= capacity) {
    return;
  }

  for (auto moveIndex = capacity - 1; moveIndex > insertIndex; --moveIndex) {
    snapshot.candidates[moveIndex] = snapshot.candidates[moveIndex - 1];
  }
  snapshot.candidates[insertIndex] = {magnitude, frequencyHz};
}

void AnalyzerRuntime::rebuildSummaryLocked() {
  summary_.Clear();
  summary_.set_duration_seconds(estimateDurationSecondsLocked(frameCount_));
  summary_.set_captured_bpm(finiteClamped(capturedBpm_, 20.0f, 400.0f, kDefaultBpm));
  summary_.set_frame_count(frameCount_);

  if (noteEvents_.empty()) {
    return;
  }

  std::uint32_t minMidiNote = 127;
  std::uint32_t maxMidiNote = 0;
  std::array<float, 12> pitchWeights {};
  for (const auto& event : noteEvents_) {
    minMidiNote = std::min(minMidiNote, static_cast<std::uint32_t>(event.midiNote));
    maxMidiNote = std::max(maxMidiNote, static_cast<std::uint32_t>(event.midiNote));
    const auto durationWeight = static_cast<float>(std::max<std::uint32_t>(1, event.endFrame - event.startFrame));
    const auto intensityWeight = std::max(0.12f, event.intensity > 0.0f ? event.intensity : static_cast<float>(event.velocity) / 127.0f);
    pitchWeights[static_cast<std::size_t>(event.midiNote % 12)] += durationWeight * intensityWeight;
  }

  summary_.set_min_midi_note(minMidiNote);
  summary_.set_max_midi_note(maxMidiNote);
  for (const auto& match : rankScaleMatches(pitchWeights)) {
    auto* topMatch = summary_.add_top_matches();
    topMatch->set_root_pitch_class(match.rootPitchClass);
    topMatch->set_scale_id(match.scaleId);
    topMatch->set_confidence(match.confidence);
  }
}

void AnalyzerRuntime::remapNotesForTuningLocked() {
  for (auto& event : noteEvents_) {
    const auto corrected = event.midiNote != event.detectedMidiNote;
    event.detectedMidiNote = frequencyToMidiLocked(event.meanFrequencyHz);
    if (!corrected) {
      event.midiNote = event.detectedMidiNote;
    }
    const auto correction = std::find_if(noteCorrections_.begin(), noteCorrections_.end(), [&event](const auto& candidate) {
      return candidate.eventId == event.eventId;
    });
    if (correction != noteCorrections_.end()) {
      correction->detectedMidiNote = event.detectedMidiNote;
    }
  }
  std::sort(noteEvents_.begin(), noteEvents_.end(), [](const auto& left, const auto& right) {
    if (left.startFrame != right.startFrame) {
      return left.startFrame < right.startFrame;
    }
    return left.midiNote < right.midiNote;
  });
}

void AnalyzerRuntime::publishStateLocked(bool bumpRevision) {
  tuningHz_ = finiteClamped(tuningHz_, kMinTuningHz, kMaxTuningHz, kDefaultTuningHz);
  detectionSensitivity_ = finiteClamped(
      detectionSensitivity_,
      kMinDetectionSensitivity,
      kMaxDetectionSensitivity,
      kDefaultDetectionSensitivity);
  capturedBpm_ = finiteClamped(capturedBpm_, 20.0f, 400.0f, kDefaultBpm);
  currentLevel_ = finiteClamped(currentLevel_, 0.0f, 1.0e6f, 0.0f);
  if (bumpRevision) {
    revision_ += 1;
  }

  const auto buildState = [this]() {
    auto state = padpilot::proto::createDefaultAnalyzerState();
    state.set_revision(revision_);
    state.set_record_enabled(recording_);
    state.set_tuning_hz(tuningHz_);
    state.set_detection_sensitivity(detectionSensitivity_);
    if (!noteEvents_.empty() || frameCount_ > 0) {
      *state.mutable_take_summary() = summary_;
    }
    for (const auto& event : noteEvents_) {
      auto* noteEvent = state.add_note_events();
      noteEvent->set_event_id(event.eventId);
      noteEvent->set_midi_note(event.midiNote);
      noteEvent->set_detected_midi_note(event.detectedMidiNote);
      noteEvent->set_start_frame(event.startFrame);
      noteEvent->set_end_frame(event.endFrame);
      noteEvent->set_intensity(finiteClamped(event.intensity, 0.0f, 1.0f, 0.0f));
      noteEvent->set_confidence(finiteClamped(event.confidence, 0.0f, 1.0f, 0.0f));
      noteEvent->set_velocity(event.velocity);
      noteEvent->set_mean_frequency_hz(finiteClamped(event.meanFrequencyHz,
                                                     1.0f,
                                                     kMaxAnalysisFrequencyHz,
                                                     kDefaultTuningHz));
    }
    return state;
  };

  auto state = buildState();
  auto stateBytes = padpilot::proto::serializeAnalyzerModuleState(state);
  while (stateBytes.size() > kMaxSerializedStateBytes && !noteEvents_.empty()) {
    noteEvents_.resize(noteEvents_.size() / 2U);
    rebuildEventIdIndexLocked();
    analysisSnapshots_.clear();
    replayableTake_ = false;
    captureLimitReached_ = true;
    rebuildSummaryLocked();
    state = buildState();
    stateBytes = padpilot::proto::serializeAnalyzerModuleState(state);
  }
  if (stateBytes.size() > kMaxSerializedStateBytes) {
    clearTakeLocked();
    replayableTake_ = false;
    captureLimitReached_ = true;
    state = buildState();
    stateBytes = padpilot::proto::serializeAnalyzerModuleState(state);
  }
  stateBase64_ = padpilot::proto::bytesToBase64(stateBytes);

  padpilot::analyzer::AnalyzerFrame frame;
  frame.set_sequence(++sequence_);
  frame.set_recording(recording_);
  frame.set_tuning_hz(tuningHz_);
  frame.set_duration_seconds(estimateDurationSecondsLocked(frameCount_));
  frame.set_current_level(currentLevel_);
  frame.set_frame_count(frameCount_);
  frame.set_detection_sensitivity(detectionSensitivity_);
  frame.set_min_midi_note(summary_.min_midi_note());
  frame.set_max_midi_note(summary_.max_midi_note());
  for (const auto energy : laneEnergies_) {
    frame.add_lane_energies(finiteClamped(energy, 0.0f, 1.0e12f, 0.0f));
  }
  if (summary_.top_matches_size() > 0) {
    *frame.mutable_primary_match() = summary_.top_matches(0);
    for (int index = 1; index < summary_.top_matches_size(); ++index) {
      *frame.add_alternate_matches() = summary_.top_matches(index);
    }
  }
  frameBase64_ = padpilot::proto::buildAnalyzerFrameBase64(frame);
  lastPublishedFrameCount_ = frameCount_;
}

std::uint8_t AnalyzerRuntime::frequencyToMidiLocked(float frequencyHz) const {
  const auto safeFrequency = finiteClamped(
      frequencyHz, 1.0f, kMaxAnalysisFrequencyHz, kDefaultTuningHz);
  const auto safeTuning = finiteClamped(tuningHz_, kMinTuningHz, kMaxTuningHz, kDefaultTuningHz);
  const auto midiNote = std::lround(69.0 + 12.0 * std::log2(static_cast<double>(safeFrequency) / static_cast<double>(safeTuning)));
  return static_cast<std::uint8_t>(clampValue(midiNote, 0L, 127L));
}

float AnalyzerRuntime::estimateDurationSecondsLocked(std::uint32_t frameCount) const {
  return static_cast<float>(static_cast<double>(frameCount * kHopSize) / std::max(1.0, sampleRate_));
}

float AnalyzerRuntime::detectionThresholdMultiplierLocked() const {
  return clampValue(0.28f - detectionSensitivity_ * 0.20f, 0.08f, 0.28f);
}

std::uint32_t AnalyzerRuntime::maxCaptureFrameCountLocked() const {
  const auto durationFrames = std::floor(
      std::max(1.0, sampleRate_) * static_cast<double>(kMaxCaptureDurationSeconds) /
      static_cast<double>(kHopSize));
  return static_cast<std::uint32_t>(std::clamp(
      durationFrames,
      1.0,
      static_cast<double>(std::numeric_limits<std::uint32_t>::max())));
}

bool AnalyzerRuntime::captureAtLimitLocked() const {
  return frameCount_ >= maxCaptureFrameCountLocked() ||
         analysisSnapshots_.size() >= kMaxAnalysisSnapshots ||
         noteEvents_.size() >= kMaxPersistedNoteEvents;
}

}  // namespace padpilot

