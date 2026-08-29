#pragma once

#include <vector>

#include <juce_dsp/juce_dsp.h>

namespace padpilot {

class DelayNode {
 public:
  static constexpr float kMaximumDelaySeconds = 3.0f;
  static constexpr float kMaximumSyncBeats = 1.0f;

  void prepare(const juce::dsp::ProcessSpec& spec);
  void setWetDry(float wet, float dry);
  void setSyncEnabled(bool enabled);
  void setTimeBeats(float beats);
  void setTimeHz(float hz);
  void setFeedback(float feedback);
  void setLowCutHz(float hz);
  void setHighCutHz(float hz);
  void setWidth(float width);
  void setSaturation(float amount);
  void setCharacter(int character);
  void setHostBpm(double bpm);
  bool process(juce::AudioBuffer<float>& buffer);
  bool isWetActive() const noexcept;

 private:
  struct FilterState {
    float hpX1 {0.0f};
    float hpY1 {0.0f};
    float lpY1 {0.0f};
  };

  void updateDelaySamples(double sampleRate);
  void updateFilterCoefficients(double sampleRate);
  float processFeedbackSample(int channel, float sample);

  juce::dsp::DelayLine<float, juce::dsp::DelayLineInterpolationTypes::Linear> delayLine_ {1};
  float wet_ {0.0f};
  float dry_ {1.0f};
  bool syncEnabled_ {true};
  float timeBeats_ {0.25f};
  float timeHz_ {2.0f};
  float feedback_ {0.42f};
  float lowCutHz_ {110.0f};
  float highCutHz_ {6800.0f};
  float width_ {1.0f};
  float saturation_ {0.0f};
  int character_ {0};
  double hostBpm_ {120.0};
  double sampleRate_ {44100.0};
  int delaySamples_ {22050};
  int maximumDelaySamples_ {2};
  float highPassAlpha_ {0.0f};
  float lowPassAlpha_ {0.0f};
  std::vector<FilterState> filterStates_;
};

}  // namespace padpilot
