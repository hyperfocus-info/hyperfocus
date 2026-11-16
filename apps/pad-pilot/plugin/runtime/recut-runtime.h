#pragma once

#include <atomic>
#include <array>
#include <condition_variable>
#include <memory>
#include <mutex>
#include <optional>
#include <thread>
#include <vector>

#include <juce_audio_basics/juce_audio_basics.h>
#include <juce_core/juce_core.h>

#include "generated/proto/capability.pb.h"
#include "runtime/lock-free-queue.h"
#include "runtime/recut-proto.h"
#include "runtime/runtime-types.h"

namespace padpilot {

class RecutRuntime {
  struct LoadedSource;

 public:
  static constexpr std::size_t kMaxVoices = 16;
  static constexpr std::size_t kMaxSlices = 16;
  static constexpr std::size_t kGrainsPerVoice = 8;
  static constexpr std::size_t kGrainWindowBins = 2048;
  static constexpr std::uint32_t kMaxDecodedChannels = 8;
  static constexpr double kMinDecodedSampleRate = 8'000.0;
  static constexpr double kMaxDecodedSampleRate = 384'000.0;

  struct TransientCandidate {
    std::uint32_t frame {0};
    float intensity {0.0f};
    std::uint32_t bucketIndex {0};
  };

  explicit RecutRuntime(std::string managedMediaRootPath = {});
  ~RecutRuntime();

  void prepare(double sampleRate, int samplesPerBlock, LockFreeQueue<HapticCommand, 256>& hapticQueue);
  void release();

  void setStreamActive(bool active);
  bool isStreamActive() const noexcept;

  bool loadSourceAsync(const std::string& path,
                       const std::string& sourceName = {},
                       const std::string& sourceContentId = {});
  bool loadSource(const padpilot::capability::SampleSourceLoadRequest& request);
  bool applyStateFromBytes(const std::string& bytes);
  std::string serializeStateBytes() const;
  std::string buildFrameBase64() const;
  std::string buildSampleEditorFrameBase64() const;
  std::shared_ptr<const LoadedSource> snapshot() const;
  bool requestAnalysis(const padpilot::capability::SampleAnalysisRequest& request);
  bool applyPlaybackState(const padpilot::capability::SlicePlaybackState& state);
  bool triggerPlayback(const padpilot::capability::SlicePlaybackTrigger& trigger);
  bool editSlice(const padpilot::capability::SliceEditIntent& intent);

  void setPitchSemitones(float value);
  void setGainDb(float value);
  void setStretchEnabled(bool value);
  void setGranularEnabled(bool value);
  void setGrainSizeMs(float value);
  void setGrainDensity(float value);
  void setProjectBpm(float value);
  void triggerPad(std::uint32_t padIndex);
  void releasePad(std::uint32_t padIndex);
  void nudgeMarker(std::uint32_t sliceIndex, float deltaFrames, bool fineMode);
  void setPadAssignment(std::uint32_t padIndex,
                        std::uint32_t bank,
                        const std::string& faceButton,
                        std::uint32_t sliceIndex,
                        std::uint32_t chokeGroupId,
                        bool isEmpty = false);
  void setChokeGroup(std::uint32_t chokeGroupId, const std::string& name, std::uint32_t accentHue);
  void reanalyze();

  void processBlock(juce::AudioBuffer<float>& audioBuffer);
  static bool isValidDecodedAudioMetadata(std::uint64_t channels,
                                          std::uint64_t frames,
                                          double sampleRate) noexcept;

 private:
  struct SourceMedia {
    juce::AudioBuffer<float> audioBuffer;
    std::vector<float> monoAnalysis;
    std::vector<float> waveformPeaks;
    std::vector<std::uint32_t> candidateTransientFrames;
    std::vector<TransientCandidate> transientCandidates;
  };

  struct LoadedSource {
    padpilot::recut::RecutModuleState state;
    std::shared_ptr<const SourceMedia> media {std::make_shared<SourceMedia>()};
    std::uint64_t completedAnalysisRequestId {0};
    float analysisProgress {0.0f};
    std::uint64_t runtimeGeneration {0};
  };

  struct Grain {
    bool active {false};
    double playheadFrame {0.0};
    std::uint64_t ageFrames {0};
    std::uint64_t durationFrames {1};
  };

  struct Voice {
    bool active {false};
    bool held {false};
    bool releasing {false};
    std::uint32_t padIndex {0};
    std::uint32_t sliceIndex {0};
    std::uint32_t chokeGroupId {0};
    double playheadFrame {0.0};
    std::uint64_t sliceStartFrame {0};
    std::uint64_t sliceEndFrame {0};
    double sourceRateRatio {1.0};
    double sourceIncrement {1.0};
    float gain {1.0f};
    std::uint64_t fadeRemaining {0};
    bool granular {false};
    std::array<Grain, kGrainsPerVoice> grains {};
    std::uint64_t framesUntilNextGrain {0};
  };

  struct TriggerCommand {
    std::uint32_t padIndex {0};
    bool pressed {true};
    std::uint64_t sourceGeneration {0};
  };

  struct SourceLoadRequest {
    std::string path;
    std::string sourceName;
    std::string sourceContentId;
    std::optional<padpilot::recut::RecutModuleState> restoredState;
    std::uint64_t generation {0};
  };

  static constexpr std::size_t kTriggerQueueCapacity = 128;

  static float midiToRatio(float semitones);
  static std::uint64_t clampFrame(std::int64_t frame, std::uint64_t maxFrame);
  static std::uint64_t framesFromMilliseconds(double sampleRate, float ms);
  void rebuildSlices(LoadedSource& source);
  std::vector<TransientCandidate> selectAutoSliceCandidates(const LoadedSource& source) const;
  std::vector<std::uint32_t> selectBpmSliceStarts(const LoadedSource& source, float bpm, std::size_t targetCount) const;
  std::pair<float, float> inferBpm(const LoadedSource& source) const;

  bool enqueueSourceLoad(const std::string& path,
                         const std::string& sourceName,
                         const std::string& sourceContentId,
                         std::optional<padpilot::recut::RecutModuleState> restoredState = std::nullopt);
  bool validateManagedSource(const std::string& path,
                             const std::string& sourceName,
                             const std::string& sourceContentId) const;
  void sourceLoaderLoop();
  void processSourceLoad(SourceLoadRequest request);
  void publishSnapshot(std::shared_ptr<LoadedSource> source);
  bool publishSnapshotForLoad(std::shared_ptr<LoadedSource> source,
                              std::uint64_t generation,
                              std::uint64_t mergedRevision);
  void publishSnapshotLocked(std::shared_ptr<LoadedSource> source);
  void reclaimRetiredSourcesLocked();
  void updateMutableSnapshot(const std::function<void(LoadedSource&)>& update);
  std::shared_ptr<LoadedSource> analyzeFile(const juce::File& file, std::uint64_t generation);
  std::vector<TransientCandidate> detectTransientCandidates(
      const std::vector<float>& mono,
      std::uint64_t generation) const;
  std::vector<float> buildWaveformPeaks(const std::vector<float>& mono, std::size_t bins);
  std::uint64_t findNearestZeroCrossing(const LoadedSource& source, std::uint64_t frame) const;
  const padpilot::recut::SliceMarker* findSliceForPad(const LoadedSource& source, std::uint32_t padIndex) const;
  void startVoice(const LoadedSource& source, std::uint32_t padIndex);
  void chokeGroup(std::uint32_t chokeGroupId);
  void queuePrimaryHaptic(float lowFrequency, float highFrequency, std::uint32_t durationMs);
  void resetPlaybackState();
  void publishVoiceState();

  std::atomic<bool> running_ {false};
  std::atomic<bool> streamActive_ {false};
  std::atomic<float> pitchSemitones_ {0.0f};
  std::atomic<float> pitchRatio_ {1.0f};
  std::atomic<float> gainDb_ {0.0f};
  std::atomic<float> gainLinear_ {1.0f};
  std::atomic<bool> stretchEnabled_ {false};
  std::atomic<bool> granularEnabled_ {false};
  std::atomic<float> grainSizeMs_ {28.0f};
  std::atomic<float> grainDensity_ {0.62f};
  std::atomic<float> projectBpm_ {120.0f};
  std::atomic<double> sampleRate_ {48000.0};
  std::atomic<int> blockSize_ {0};
  std::atomic<std::uint64_t> playheadFrame_ {0};
  std::atomic<std::uint32_t> armedPadIndex_ {0};
  std::atomic<std::uint32_t> activeSliceIndex_ {0};
  std::atomic<bool> lastSnapExact_ {false};
  std::atomic<float> analysisProgress_ {0.0f};
  std::atomic<const LoadedSource*> publishedSource_ {nullptr};
  std::atomic<std::uint64_t> publishedSourceGeneration_ {0};
  std::atomic<const LoadedSource*> audioSourceHazard_ {nullptr};
  std::shared_ptr<const LoadedSource> sourceOwner_;
  std::vector<std::shared_ptr<const LoadedSource>> retiredSources_;
  std::uint64_t sourceGenerationCounter_ {0};
  std::array<Voice, kMaxVoices> voices_ {};
  std::array<float, kGrainWindowBins> grainWindow_ {};
  std::uint64_t audioSourceGeneration_ {0};
  std::size_t displayVoiceSlot_ {0};
  std::atomic<std::uint32_t> publishedVoiceState_ {0};
  LockFreeQueue<TriggerCommand, kTriggerQueueCapacity> pendingTriggers_;
  std::atomic<std::uint64_t> triggerCommandsDropped_ {0};
  std::atomic<LockFreeQueue<HapticCommand, 256>*> hapticQueue_ {nullptr};
  std::atomic<std::uint64_t> hapticCommandsDropped_ {0};
  std::atomic<std::uint32_t> activeAudioReaders_ {0};
  std::atomic<std::uint32_t> activeQueueWriters_ {0};
  mutable std::mutex stateMutex_;
  std::atomic<std::uint64_t> loadGeneration_ {0};
  std::mutex loaderMutex_;
  std::condition_variable loaderCondition_;
  std::optional<SourceLoadRequest> pendingSourceLoad_;
  bool loaderStopping_ {false};
  std::string managedMediaRootPath_;
  std::thread loaderThread_;
};

}  // namespace padpilot
