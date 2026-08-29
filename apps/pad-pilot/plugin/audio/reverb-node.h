#pragma once

#include <atomic>
#include <cstdint>

#include <juce_dsp/juce_dsp.h>

namespace padpilot {

class ReverbNode {
 public:
  static constexpr float kMinimumDecaySeconds = 0.2f;
  static constexpr float kMaximumDecaySeconds = 12.0f;
  static constexpr float kMaximumPreDelaySeconds = 3.0f;
  static constexpr float kMaximumPreDelaySyncBeats = 1.0f;

  struct TimingSnapshot {
    std::uint64_t preDelayNs {};
    std::uint64_t coreNs {};
    std::uint64_t mixNs {};
  };

  void prepare(const juce::dsp::ProcessSpec& spec);
  void setHostBpm(double bpm);
  void setWetDry(float wet, float dry);
  void setPreDelayMs(float ms);
  void setPreDelaySyncEnabled(bool enabled);
  void setPreDelayBeats(float beats);
  void setDecaySeconds(float seconds);
  void setSize(float size);
  void setDampening(float dampening);
  void setWidth(float width);
  void setModulationSpeedHz(float hz);
  void setModulationSpeedSyncEnabled(bool enabled);
  void setModulationSpeedBeats(float beats);
  void setModulationDepth(float depth);
  bool process(juce::AudioBuffer<float>& buffer, bool profilingEnabled = false);
  bool isWetActive() const noexcept;
  TimingSnapshot getTimingSnapshot() const noexcept;

 private:
  void updatePreDelaySamples();
  void updateReverbParameters(float widthOverride = -1.0f);

  juce::dsp::Reverb reverb_;
  juce::dsp::DelayLine<float, juce::dsp::DelayLineInterpolationTypes::Linear> preDelayLine_ {1};
  juce::AudioBuffer<float> dryScratch_;
  float wet_ {0.0f};
  float dry_ {1.0f};
  float preDelayMs_ {18.0f};
  bool preDelaySyncEnabled_ {false};
  float preDelayBeats_ {0.25f};
  float decaySeconds_ {0.8f};
  float size_ {0.68f};
  float dampening_ {0.32f};
  float width_ {0.84f};
  float modulationSpeedHz_ {0.35f};
  bool modulationSpeedSyncEnabled_ {false};
  float modulationSpeedBeats_ {0.75f};
  float modulationDepth_ {0.0f};
  int modulationSamplesUntilUpdate_ {0};
  double hostBpm_ {120.0};
  double sampleRate_ {44100.0};
  int preDelaySamples_ {0};
  int maximumPreDelaySamples_ {2};
  float modulationPhase_ {0.0f};
  std::atomic<std::uint64_t> preDelayNs_ {0};
  std::atomic<std::uint64_t> coreNs_ {0};
  std::atomic<std::uint64_t> mixNs_ {0};
};

}  // namespace padpilot
