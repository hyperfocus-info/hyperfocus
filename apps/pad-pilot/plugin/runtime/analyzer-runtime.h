#pragma once

#include <array>
#include <atomic>
#include <cstdint>
#include <memory>
#include <mutex>
#include <string>
#include <thread>
#include <unordered_set>
#include <vector>

#include <juce_audio_basics/juce_audio_basics.h>
#include <juce_core/juce_core.h>
#include <juce_dsp/juce_dsp.h>

#include "generated/proto/analyzer.pb.h"
#include "runtime/analyzer-state-defaults.h"
#include "runtime/lock-free-queue.h"
#include "runtime/state-wire-limits.h"

namespace padpilot {

enum class AnalyzerRecordMode {
  stop,
  startOverwrite,
  startAppend,
};

class AnalyzerRuntime {
 public:
  static constexpr float kMaxCaptureDurationSeconds = 600.0f;
  static constexpr std::size_t kMaxPersistedNoteEvents = 32'768;
  static constexpr std::size_t kMaxSerializedStateBytes = state_wire_limits::kMaximumModuleStateBytes;

  AnalyzerRuntime();
  ~AnalyzerRuntime();

  void prepare(double sampleRate, int maxBlockSize);
  void release();
  void restoreState(const padpilot::analyzer::AnalyzerModuleState& state);

  void pushAudioBlock(const juce::AudioBuffer<float>& audioBuffer, double hostBpm) noexcept;
  void setMonitoringEnabled(bool enabled);
  void setTuningHz(float tuningHz);
  void setDetectionSensitivity(float detectionSensitivity);
  void setRecordMode(AnalyzerRecordMode mode);
  bool correctNote(std::uint64_t eventId, std::uint8_t midiNote);
  bool resetNoteCorrection(std::uint64_t eventId);

  std::string getStateBase64() const;
  std::uint64_t getRevision() const;
  std::string buildFrameBase64() const;
  bool hasTake() const;
  bool writeMidiFile(const juce::File& targetFile, juce::String& errorMessage) const;
  std::uint64_t getAudioSlicesPushed() const noexcept;
  std::uint64_t getAudioSlicesDropped() const noexcept;

 private:
  static constexpr int kMaxSliceSamples = 2048;
  static constexpr int kAudioQueueCapacity = 128;
  static constexpr int kFftOrder = 11;
  static constexpr int kFftSize = 1 << kFftOrder;
  static constexpr int kHopSize = 512;
  static constexpr int kPublishEveryFrames = 6;
  static constexpr int kMaxVoices = 8;
  static constexpr int kMaxSnapshotCandidates = 48;
  static constexpr std::size_t kMaxAnalysisSnapshots = 65'536;

  struct AudioSlice {
    std::array<float, kMaxSliceSamples> samples {};
    std::uint16_t numSamples {0};
    float hostBpm {120.0f};
    float peakLevel {0.0f};
  };

  struct NoteEventData {
    std::uint64_t eventId {0};
    std::uint8_t midiNote {0};
    std::uint8_t detectedMidiNote {0};
    std::uint32_t startFrame {0};
    std::uint32_t endFrame {0};
    float intensity {0.0f};
    float confidence {0.0f};
    std::uint8_t velocity {0};
    float meanFrequencyHz {0.0f};
  };

  struct ActiveNote {
    bool active {false};
    std::uint32_t startFrame {0};
    std::uint32_t lastSeenFrame {0};
    std::uint32_t missingFrames {0};
    std::uint32_t detectionCount {0};
    float peakIntensity {0.0f};
    float intensitySum {0.0f};
    float confidenceSum {0.0f};
    float frequencySum {0.0f};
  };

  struct DetectedNote {
    std::uint8_t midiNote {0};
    float intensity {0.0f};
    float confidence {0.0f};
    float frequencyHz {0.0f};
  };

  struct PeakCandidate {
    float magnitude {0.0f};
    float frequencyHz {0.0f};
  };

  struct NoteCorrectionData {
    std::uint64_t eventId {0};
    std::uint8_t detectedMidiNote {0};
    std::uint8_t correctedMidiNote {0};
    std::uint32_t startFrame {0};
    std::uint32_t endFrame {0};
    float meanFrequencyHz {0.0f};
  };

  struct AnalysisFrameSnapshot {
    std::array<PeakCandidate, kMaxSnapshotCandidates> candidates {};
    std::uint8_t candidateCount {0};
    float maxMagnitude {0.0f};
  };

  void workerLoop();
  void applyPendingCommandLocked();
  void applyPendingSensitivityLocked();
  void startRecordingLocked(bool append);
  void stopRecordingLocked();
  void stopRecordingAtLimitLocked(const char* limitKind);
  void clearTakeLocked();
  void consumeAudioSliceLocked(const AudioSlice& slice);
  void processAnalysisFrameLocked();
  void replaySnapshotsLocked(bool finalizeActiveNotes);
  void updateActiveNotesLocked(const std::vector<DetectedNote>& detectedNotes);
  void finalizeInactiveNotesLocked(bool forceAll);
  void appendNoteEventLocked(std::uint8_t midiNote, const ActiveNote& note, std::uint32_t endFrame);
  void rebuildEventIdIndexLocked();
  std::uint64_t createEventIdLocked(std::uint8_t detectedMidiNote,
                                    std::uint32_t startFrame,
                                    std::uint32_t endFrame,
                                    float meanFrequencyHz) const;
  AnalysisFrameSnapshot extractFrameCandidatesLocked();
  std::vector<DetectedNote> detectNotesFromSnapshotLocked(const AnalysisFrameSnapshot& snapshot);
  void insertSnapshotCandidateLocked(AnalysisFrameSnapshot& snapshot, float magnitude, float frequencyHz) const;
  void rebuildSummaryLocked();
  void remapNotesForTuningLocked();
  void publishStateLocked(bool bumpRevision);
  std::uint8_t frequencyToMidiLocked(float frequencyHz) const;
  float estimateDurationSecondsLocked(std::uint32_t frameCount) const;
  float detectionThresholdMultiplierLocked() const;
  std::uint32_t maxCaptureFrameCountLocked() const;
  bool captureAtLimitLocked() const;

  juce::dsp::FFT fft_;
  std::unique_ptr<padpilot::LockFreeQueue<AudioSlice, kAudioQueueCapacity>> audioQueue_;
  std::thread workerThread_;

  mutable std::mutex stateMutex_;
  std::atomic<bool> prepared_ {false};
  std::atomic<bool> running_ {false};
  std::atomic<bool> monitoringEnabled_ {false};
  std::atomic<bool> recordEnabled_ {false};
  std::atomic<int> pendingRecordMode_ {-1};
  std::atomic<bool> pendingDetectionSensitivityDirty_ {false};
  std::atomic<float> pendingDetectionSensitivity_ {kAnalyzerDefaultDetectionSensitivity};
  std::atomic<std::uint64_t> audioSlicesPushed_ {0};
  std::atomic<std::uint64_t> audioSlicesDropped_ {0};

  double sampleRate_ {48'000.0};
  float tuningHz_ {kAnalyzerDefaultTuningHz};
  float detectionSensitivity_ {kAnalyzerDefaultDetectionSensitivity};
  float capturedBpm_ {120.0f};
  bool recording_ {false};
  bool bpmCaptured_ {false};
  bool replayableTake_ {true};
  bool captureLimitReached_ {false};
  std::uint64_t revision_ {1};
  std::uint64_t sequence_ {0};
  std::uint32_t frameCount_ {0};
  std::uint32_t idlePublishCounter_ {0};
  std::uint32_t lastPublishedFrameCount_ {0};
  float currentLevel_ {0.0f};

  std::array<float, kFftSize> analysisBuffer_ {};
  std::array<float, kFftSize> window_ {};
  std::array<float, kFftSize * 2> fftData_ {};
  std::array<float, kFftSize / 2> magnitudes_ {};
  std::array<float, 128> laneEnergies_ {};
  std::array<ActiveNote, 128> activeNotes_ {};
  int analysisFill_ {0};

  std::vector<NoteEventData> noteEvents_;
  std::unordered_set<std::uint64_t> noteEventIds_;
  std::vector<NoteCorrectionData> noteCorrections_;
  std::vector<AnalysisFrameSnapshot> analysisSnapshots_;
  std::vector<DetectedNote> detectedScratch_;
  padpilot::analyzer::AnalyzerTakeSummary summary_;
  std::string stateBase64_;
  std::string frameBase64_;
};

}  // namespace padpilot

