#include "audio/convolver-node.h"

#include <algorithm>
#include <cmath>

namespace padpilot {

void ConvolverNode::prepare(const juce::dsp::ProcessSpec& spec) {
  convolution_.prepare(spec);
  impulseLoaded_ = false;
  dryScratch_.setSize(static_cast<int>(spec.numChannels),
                      static_cast<int>(spec.maximumBlockSize),
                      false,
                      false,
                      true);
}

void ConvolverNode::setWetDry(float wet, float dry) {
  if (!std::isfinite(wet) || !std::isfinite(dry)) {
    return;
  }
  const float clampedWet = std::clamp(wet, 0.0f, 1.0f);
  const float clampedDry = std::clamp(dry, 0.0f, 1.0f);
  const float sum = clampedWet + clampedDry;
  if (sum > 1.0f) {
    const float scale = 1.0f / sum;
    wet_ = clampedWet * scale;
    dry_ = clampedDry * scale;
    return;
  }
  wet_ = clampedWet;
  dry_ = clampedDry;
}

bool ConvolverNode::loadImpulseResponse(const std::string& path) {
  juce::File irFile(path);
  if (!irFile.existsAsFile()) {
    return false;
  }

  convolution_.loadImpulseResponse(irFile,
                                   juce::dsp::Convolution::Stereo::yes,
                                   juce::dsp::Convolution::Trim::yes,
                                   kMaxImpulseSamples);
  impulseLoaded_ = true;
  return true;
}

bool ConvolverNode::process(juce::AudioBuffer<float>& buffer) {
  if (!impulseLoaded_) {
    return false;
  }

  const float wet = wet_;
  const float dry = dry_;
  if (wet <= 0.0001f && dry >= 0.9999f) {
    return false;
  }

  if (dryScratch_.getNumChannels() < buffer.getNumChannels() ||
      dryScratch_.getNumSamples() < buffer.getNumSamples()) {
    // Avoid allocating on the audio thread; process wet path only.
    juce::dsp::AudioBlock<float> block(buffer);
    juce::dsp::ProcessContextReplacing<float> context(block);
    convolution_.process(context);
    if (wet < 0.9999f) {
      buffer.applyGain(wet);
    }
    return true;
  }

  if (dry > 0.0001f) {
    for (int channel = 0; channel < buffer.getNumChannels(); ++channel) {
      dryScratch_.copyFrom(channel, 0, buffer, channel, 0, buffer.getNumSamples());
    }
  }

  juce::dsp::AudioBlock<float> block(buffer);
  juce::dsp::ProcessContextReplacing<float> context(block);
  convolution_.process(context);

  if (dry <= 0.0001f) {
    if (wet < 0.9999f) {
      buffer.applyGain(wet);
    }
    return true;
  }

  if (wet < 0.9999f) {
    for (int channel = 0; channel < buffer.getNumChannels(); ++channel) {
      buffer.applyGain(channel, 0, buffer.getNumSamples(), wet);
    }
  }
  for (int channel = 0; channel < buffer.getNumChannels(); ++channel) {
    buffer.addFrom(channel, 0, dryScratch_, channel, 0, buffer.getNumSamples(), dry);
  }
  return true;
}

bool ConvolverNode::isWetActive() const noexcept {
  if (!impulseLoaded_) {
    return false;
  }

  return wet_ > 0.0001f;
}

}  // namespace padpilot

