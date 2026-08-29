#pragma once

#include <string>

#include <juce_dsp/juce_dsp.h>

namespace padpilot {

class ConvolverNode {
 public:
  void prepare(const juce::dsp::ProcessSpec& spec);
  void setWetDry(float wet, float dry);
  bool loadImpulseResponse(const std::string& path);
  bool process(juce::AudioBuffer<float>& buffer);
  bool isWetActive() const noexcept;

 private:
  static constexpr size_t kMaxImpulseSamples = 48000;
  juce::dsp::Convolution convolution_;
  juce::AudioBuffer<float> dryScratch_;
  bool impulseLoaded_ {false};
  float wet_ {0.0f};
  float dry_ {1.0f};
};

}  // namespace padpilot
