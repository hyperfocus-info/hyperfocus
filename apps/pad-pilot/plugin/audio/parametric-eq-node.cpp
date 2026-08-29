#include "audio/parametric-eq-node.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <utility>
#include <vector>

namespace padpilot {

void ParametricEqNode::prepare(const juce::dsp::ProcessSpec& spec) {
  sampleRate_ = static_cast<float>(spec.sampleRate);
  numChannels_ = static_cast<int>(spec.numChannels);
  for (int band = 0; band < kMaxBands; ++band) {
    constexpr std::array<float, 6> kIdentity {1.0f, 0.0f, 0.0f, 1.0f, 0.0f, 0.0f};
    coeffs_[static_cast<std::size_t>(band)] =
        new juce::dsp::IIR::Coefficients<float>(kIdentity);
    rebuildBandCoefficient(band);
  }

  filters_.clear();
  filters_.reserve(static_cast<std::size_t>(std::max(1, numChannels_)));
  for (int channel = 0; channel < std::max(1, numChannels_); ++channel) {
    std::vector<juce::dsp::IIR::Filter<float>> channelFilters;
    channelFilters.resize(kMaxBands);
    for (int band = 0; band < kMaxBands; ++band) {
      channelFilters[static_cast<std::size_t>(band)].coefficients =
          coeffs_[static_cast<std::size_t>(band)];
    }
    filters_.push_back(std::move(channelFilters));
  }
  dryScratch_.setSize(numChannels_, static_cast<int>(spec.maximumBlockSize), false, false, true);
}

void ParametricEqNode::setMix(float value) {
  if (!std::isfinite(value)) {
    return;
  }
  mix_ = std::clamp(value, 0.0f, 1.0f);
}

void ParametricEqNode::setOutputGainDb(float value) {
  if (!std::isfinite(value)) {
    return;
  }
  outputGainLinear_ = juce::Decibels::decibelsToGain(std::clamp(value, -18.0f, 18.0f));
}

void ParametricEqNode::setBandCount(int count) {
  bandCount_ = std::clamp(count, 0, kMaxBands);
}

void ParametricEqNode::setBandEnabled(int index, bool enabled) {
  const int i = clampIndex(index);
  bands_[static_cast<std::size_t>(i)].enabled = enabled;
}

void ParametricEqNode::setBandType(int index, BandType type) {
  const int i = clampIndex(index);
  bands_[static_cast<std::size_t>(i)].type = type;
  rebuildBandCoefficient(i);
}

void ParametricEqNode::setBandFrequency(int index, float frequencyHz) {
  if (!std::isfinite(frequencyHz)) {
    return;
  }
  const int i = clampIndex(index);
  bands_[static_cast<std::size_t>(i)].frequencyHz = std::clamp(frequencyHz, 20.0f, 20000.0f);
  rebuildBandCoefficient(i);
}

void ParametricEqNode::setBandGainDb(int index, float gainDb) {
  if (!std::isfinite(gainDb)) {
    return;
  }
  const int i = clampIndex(index);
  bands_[static_cast<std::size_t>(i)].gainDb = std::clamp(gainDb, -24.0f, 24.0f);
  rebuildBandCoefficient(i);
}

void ParametricEqNode::setBandQ(int index, float q) {
  if (!std::isfinite(q)) {
    return;
  }
  const int i = clampIndex(index);
  bands_[static_cast<std::size_t>(i)].q = std::clamp(q, 0.1f, 18.0f);
  rebuildBandCoefficient(i);
}

bool ParametricEqNode::process(juce::AudioBuffer<float>& buffer) {
  const bool filtersActive = mix_ > 0.0001f && bandCount_ > 0;
  const bool outputGainActive = std::abs(outputGainLinear_ - 1.0f) > 1.0e-6f;
  if (!filtersActive) {
    if (outputGainActive) {
      buffer.applyGain(outputGainLinear_);
    }
    return outputGainActive;
  }

  const int channels = std::min(buffer.getNumChannels(), dryScratch_.getNumChannels());
  const int samples = std::min(buffer.getNumSamples(), dryScratch_.getNumSamples());
  if (channels <= 0 || samples <= 0) {
    return false;
  }

  for (int channel = 0; channel < channels; ++channel) {
    dryScratch_.copyFrom(channel, 0, buffer, channel, 0, samples);
    float* channelData = buffer.getWritePointer(channel);
    for (int band = 0; band < bandCount_; ++band) {
      const auto& bandState = bands_[static_cast<std::size_t>(band)];
      if (!bandState.enabled || coeffs_[static_cast<std::size_t>(band)] == nullptr) {
        continue;
      }
      auto& filter = filters_[static_cast<std::size_t>(channel)][static_cast<std::size_t>(band)];
      for (int sample = 0; sample < samples; ++sample) {
        channelData[sample] = filter.processSample(channelData[sample]);
      }
    }
  }

  const float dry = 1.0f - mix_;
  for (int channel = 0; channel < channels; ++channel) {
    float* wetOut = buffer.getWritePointer(channel);
    const float* dryIn = dryScratch_.getReadPointer(channel);
    for (int sample = 0; sample < samples; ++sample) {
      wetOut[sample] = wetOut[sample] * mix_ + dryIn[sample] * dry;
    }
  }

  if (outputGainActive) {
    buffer.applyGain(outputGainLinear_);
  }

  return true;
}

bool ParametricEqNode::isWetActive() const noexcept {
  return (mix_ > 0.0001f && bandCount_ > 0) || std::abs(outputGainLinear_ - 1.0f) > 1.0e-6f;
}

void ParametricEqNode::rebuildBandCoefficient(int bandIndex) {
  const auto safeBand = static_cast<std::size_t>(clampIndex(bandIndex));
  if (coeffs_[safeBand] == nullptr) {
    return;
  }

  const auto& band = bands_[safeBand];
  const float maximumFrequency = std::max(20.0f, std::min(20000.0f, sampleRate_ * 0.49f));
  const float safeFreq = std::clamp(band.frequencyHz, 20.0f, maximumFrequency);
  const float safeQ = std::clamp(band.q, 0.1f, 18.0f);
  const float safeGain = std::clamp(band.gainDb, -24.0f, 24.0f);

  std::array<float, 6> next {};
  switch (band.type) {
    case BandType::lowShelf:
      next = juce::dsp::IIR::ArrayCoefficients<float>::makeLowShelf(
          sampleRate_, safeFreq, safeQ, juce::Decibels::decibelsToGain(safeGain));
      break;
    case BandType::highShelf:
      next = juce::dsp::IIR::ArrayCoefficients<float>::makeHighShelf(
          sampleRate_, safeFreq, safeQ, juce::Decibels::decibelsToGain(safeGain));
      break;
    case BandType::highPass:
      next = juce::dsp::IIR::ArrayCoefficients<float>::makeHighPass(sampleRate_, safeFreq, safeQ);
      break;
    case BandType::lowPass:
      next = juce::dsp::IIR::ArrayCoefficients<float>::makeLowPass(sampleRate_, safeFreq, safeQ);
      break;
    case BandType::notch:
      next = juce::dsp::IIR::ArrayCoefficients<float>::makeNotch(sampleRate_, safeFreq, safeQ);
      break;
    case BandType::bell:
    default:
      next = juce::dsp::IIR::ArrayCoefficients<float>::makePeakFilter(
          sampleRate_, safeFreq, safeQ, juce::Decibels::decibelsToGain(safeGain));
      break;
  }

  const auto a0 = std::abs(next[3]) > 1.0e-12f ? next[3] : 1.0f;
  const auto inverseA0 = 1.0f / a0;
  auto* destination = coeffs_[safeBand]->getRawCoefficients();
  destination[0] = next[0] * inverseA0;
  destination[1] = next[1] * inverseA0;
  destination[2] = next[2] * inverseA0;
  destination[3] = next[4] * inverseA0;
  destination[4] = next[5] * inverseA0;
}

int ParametricEqNode::clampIndex(int index) const {
  return std::clamp(index, 0, kMaxBands - 1);
}

}  // namespace padpilot

