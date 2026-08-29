#pragma once

#include <array>
#include <vector>

#include <juce_audio_basics/juce_audio_basics.h>
#include <juce_dsp/juce_dsp.h>

namespace padpilot {

class ReverseNode {
 public:
  static constexpr float kMaximumWindowMs = 2000.0f;

  void prepare(const juce::dsp::ProcessSpec& spec);
  void setWindowMs(float value);
  void setPitchSemitones(float value);
  void setForwardMix(float value);
  void setCrossfadeMs(float value);
  bool process(juce::AudioBuffer<float>& buffer);

 private:
  static constexpr int kMaximumChannels = 2;
  static constexpr int kBankCount = 2;

  void updateWindowSamples();

  std::array<std::array<std::vector<float>, kMaximumChannels>, kBankCount> banks_ {};
  double sampleRate_ {44100.0};
  float windowMs_ {500.0f};
  float pitchSemitones_ {0.0f};
  float forwardMix_ {0.0f};
  float crossfadeMs_ {12.0f};
  int maximumWindowSamples_ {2};
  int windowSamples_ {2};
  int captureBank_ {0};
  int playbackBank_ {1};
  int capturePosition_ {0};
  float playbackPosition_ {0.0f};
  bool playbackReady_ {false};
};

}  // namespace padpilot
