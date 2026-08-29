#pragma once

#include <array>
#include <vector>

#include <juce_dsp/juce_dsp.h>

namespace padpilot {

class ParametricEqNode {
 public:
  static constexpr int kMaxBands = 32;

  enum class BandType : int {
    bell = 0,
    lowShelf = 1,
    highShelf = 2,
    highPass = 3,
    lowPass = 4,
    notch = 5
  };

  struct Band {
    bool enabled {true};
    BandType type {BandType::bell};
    float frequencyHz {1000.0f};
    float gainDb {0.0f};
    float q {1.0f};
  };

  void prepare(const juce::dsp::ProcessSpec& spec);
  void setMix(float value);
  void setOutputGainDb(float value);
  void setBandCount(int count);
  void setBandEnabled(int index, bool enabled);
  void setBandType(int index, BandType type);
  void setBandFrequency(int index, float frequencyHz);
  void setBandGainDb(int index, float gainDb);
  void setBandQ(int index, float q);
  bool process(juce::AudioBuffer<float>& buffer);
  bool isWetActive() const noexcept;

 private:
  void rebuildBandCoefficient(int bandIndex);
  int clampIndex(int index) const;

  float sampleRate_ {44100.0f};
  int numChannels_ {2};
  float mix_ {0.0f};
  float outputGainLinear_ {1.0f};
  int bandCount_ {0};
  std::array<Band, kMaxBands> bands_ {};
  std::array<juce::dsp::IIR::Coefficients<float>::Ptr, kMaxBands> coeffs_ {};
  std::vector<std::vector<juce::dsp::IIR::Filter<float>>> filters_;
  juce::AudioBuffer<float> dryScratch_;
};

}  // namespace padpilot
