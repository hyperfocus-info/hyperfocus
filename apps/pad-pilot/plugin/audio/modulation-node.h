#pragma once

#include <array>
#include <cstdint>

#include <juce_dsp/juce_dsp.h>

namespace padpilot {

class ModulationNode {
 public:
  static constexpr float kMaximumDelaySeconds = 3.0f;
  static constexpr float kMaximumDelaySyncBeats = 1.0f;
  static constexpr float kRotaryMaximumDelaySeconds = 0.005f;
  static constexpr float kPitchDriftMaximumDelaySeconds = 0.1f;

  enum class Mode : int {
    chorus = 0,
    flanger = 1,
    autoPan = 2,
    phaser = 3,
    rotarySpeaker = 4,
    pitchDrift = 5,
    tremolo = 6
  };

  enum class LfoShape : int {
    sine = 0,
    triangle = 1,
    square = 2,
    random = 3
  };

  void prepare(const juce::dsp::ProcessSpec& spec);
  void setHostBpm(double bpm);
  void setRateHz(float value);
  void setRateSyncEnabled(bool enabled);
  void setRateBeats(float beats);
  void setDepth(float value);
  void setBaseDelayMs(float value);
  void setBaseDelaySyncEnabled(bool enabled);
  void setBaseDelayBeats(float beats);
  void setFeedback(float value);
  void setMix(float value);
  void setStereoPhase(float value);
  void setMode(Mode value);
  void setAutoPanAmount(float value);
  void setAutoPanPhaseOffset(float value);
  void setAutoPanSmoothing(float value);
  void setAutoPanShape(LfoShape value);
  void setPhaserCenterFrequencyHz(float value);
  void setPhaserStages(int value);
  void setPhaserResonance(float value);
  void setRotaryFast(bool value);
  void setRotaryDrive(float value);
  void setRotaryHornDrumBalance(float value);
  void setRotaryMicDistance(float value);
  void setRotaryAcceleration(float value);
  void setPitchDriftShape(LfoShape value);
  void setPitchDriftStereoOffset(float value);
  void setPitchDriftRangeCents(float value);
  bool process(juce::AudioBuffer<float>& buffer);
  float getMotionValue() const noexcept;
  bool isWetActive() const noexcept;

 private:
  juce::dsp::DelayLine<float, juce::dsp::DelayLineInterpolationTypes::Linear> delayLine_ {1};
  juce::dsp::DelayLine<float, juce::dsp::DelayLineInterpolationTypes::Linear> rotaryHornDelayLine_ {1};
  juce::dsp::DelayLine<float, juce::dsp::DelayLineInterpolationTypes::Linear> rotaryDrumDelayLine_ {1};
  float sampleRate_ {44100.0f};
  float phase_ {0.0f};
  float rateHz_ {0.35f};
  bool rateSyncEnabled_ {false};
  float rateBeats_ {0.75f};
  float depth_ {0.45f};
  float baseDelayMs_ {12.0f};
  bool baseDelaySyncEnabled_ {false};
  float baseDelayBeats_ {1.0f / 12.0f};
  float feedback_ {0.12f};
  float mix_ {0.3f};
  float stereoPhase_ {0.25f};
  float autoPanAmount_ {0.6f};
  float autoPanPhaseOffset_ {0.25f};
  float autoPanSmoothing_ {0.2f};
  float autoPanSmoothed_ {0.0f};
  float currentMotionValue_ {0.0f};
  float randomLfoValue_ {0.0f};
  int randomLfoCadence_ {0};
  std::uint32_t randomState_ {0x8f3d'91a7U};
  int maximumDelaySamples_ {2};
  double hostBpm_ {120.0};
  Mode mode_ {Mode::chorus};
  LfoShape autoPanShape_ {LfoShape::sine};
  static constexpr int kMaximumPhaserStages = 12;
  std::array<std::array<float, kMaximumPhaserStages>, 2> phaserPreviousInput_ {};
  std::array<std::array<float, kMaximumPhaserStages>, 2> phaserPreviousOutput_ {};
  std::array<float, 2> phaserFeedbackState_ {};
  float phaserCenterFrequencyHz_ {1200.0f};
  int phaserStages_ {4};
  float phaserResonance_ {0.4f};
  float rotaryHornPhase_ {0.0f};
  float rotaryDrumPhase_ {0.0f};
  float rotaryHornRateHz_ {0.8f};
  float rotaryDrumRateHz_ {0.65f};
  float rotaryDrive_ {0.2f};
  float rotaryHornDrumBalance_ {0.5f};
  float rotaryMicDistance_ {0.35f};
  float rotaryAcceleration_ {0.5f};
  bool rotaryFast_ {false};
  std::array<float, 2> rotaryLowState_ {};
  std::array<float, 2> tremoloSmoothed_ {1.0f, 1.0f};
  LfoShape pitchDriftShape_ {LfoShape::sine};
  float pitchDriftStereoOffset_ {0.25f};
  float pitchDriftRangeCents_ {24.0f};
  float pitchDriftRandomTarget_ {0.0f};
  float pitchDriftRandomValue_ {0.0f};
  int pitchDriftRandomCountdown_ {0};
};

}  // namespace padpilot
