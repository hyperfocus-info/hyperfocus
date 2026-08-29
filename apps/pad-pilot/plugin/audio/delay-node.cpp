#include "audio/delay-node.h"

#include <algorithm>
#include <cmath>

namespace padpilot {

void DelayNode::prepare(const juce::dsp::ProcessSpec& spec) {
  sampleRate_ = spec.sampleRate;
  maximumDelaySamples_ = std::max(
      2, static_cast<int>(std::ceil(std::max(1.0, sampleRate_) * kMaximumDelaySeconds)) + 1);
  delayLine_.setMaximumDelayInSamples(maximumDelaySamples_);
  delayLine_.prepare(spec);
  delayLine_.reset();
  filterStates_.assign(spec.numChannels, {});
  updateDelaySamples(sampleRate_);
  updateFilterCoefficients(sampleRate_);
}

void DelayNode::setWetDry(float wet, float dry) {
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

void DelayNode::setSyncEnabled(bool enabled) {
  syncEnabled_ = enabled;
  updateDelaySamples(sampleRate_);
}

void DelayNode::setTimeBeats(float beats) {
  timeBeats_ = std::isfinite(beats)
                   ? std::clamp(beats, 0.03125f, kMaximumSyncBeats)
                   : (beats > 0.0f ? kMaximumSyncBeats : 0.03125f);
  updateDelaySamples(sampleRate_);
}

void DelayNode::setTimeHz(float hz) {
  if (!std::isfinite(hz)) {
    return;
  }
  timeHz_ = std::clamp(hz, 0.1f, 20.0f);
  updateDelaySamples(sampleRate_);
}

void DelayNode::setFeedback(float feedback) {
  if (!std::isfinite(feedback)) {
    return;
  }
  feedback_ = std::clamp(feedback, 0.0f, 0.95f);
}

void DelayNode::setLowCutHz(float hz) {
  if (!std::isfinite(hz)) {
    return;
  }
  lowCutHz_ = std::clamp(hz, 20.0f, 2400.0f);
  updateFilterCoefficients(sampleRate_);
}

void DelayNode::setHighCutHz(float hz) {
  if (!std::isfinite(hz)) {
    return;
  }
  highCutHz_ = std::clamp(hz, 1200.0f, 20000.0f);
  updateFilterCoefficients(sampleRate_);
}

void DelayNode::setWidth(float width) {
  if (!std::isfinite(width)) {
    return;
  }
  width_ = std::clamp(width, 0.0f, 1.0f);
}

void DelayNode::setSaturation(float amount) {
  if (std::isfinite(amount)) saturation_ = std::clamp(amount, 0.0f, 1.0f);
}

void DelayNode::setCharacter(int character) {
  character_ = std::clamp(character, 0, 3);
}

void DelayNode::setHostBpm(double bpm) {
  if (!std::isfinite(bpm)) {
    return;
  }
  const auto nextBpm = std::max(20.0, bpm);
  if (std::abs(nextBpm - hostBpm_) < 0.0001) {
    return;
  }

  hostBpm_ = nextBpm;
  updateDelaySamples(sampleRate_);
}

bool DelayNode::process(juce::AudioBuffer<float>& buffer) {
  if (wet_ <= 0.0001f && dry_ >= 0.9999f) {
    return false;
  }

  for (int channel = 0; channel < buffer.getNumChannels(); ++channel) {
    float* channelData = buffer.getWritePointer(channel);
    for (int sample = 0; sample < buffer.getNumSamples(); ++sample) {
      const float input = channelData[sample];
      const float delayed = delayLine_.popSample(channel, static_cast<float>(delaySamples_));
      const float feedbackSignal = processFeedbackSample(channel, delayed);
      delayLine_.pushSample(channel, input + feedbackSignal * feedback_);
      channelData[sample] = input * dry_ + delayed * wet_;
    }
  }

  if (buffer.getNumChannels() >= 2 && width_ < 0.9999f) {
    float* left = buffer.getWritePointer(0);
    float* right = buffer.getWritePointer(1);
    const float sideScale = width_;
    for (int sample = 0; sample < buffer.getNumSamples(); ++sample) {
      const float mid = 0.5f * (left[sample] + right[sample]);
      const float side = 0.5f * (left[sample] - right[sample]) * sideScale;
      left[sample] = mid + side;
      right[sample] = mid - side;
    }
  }

  return true;
}

bool DelayNode::isWetActive() const noexcept {
  return wet_ > 0.0001f;
}

void DelayNode::updateDelaySamples(double sampleRate) {
  sampleRate_ = sampleRate;
  const double delaySeconds = syncEnabled_ ? ((60.0 / hostBpm_) * static_cast<double>(timeBeats_))
                                           : (1.0 / static_cast<double>(timeHz_));
  const double maximumDelaySamples = static_cast<double>(std::max(2, maximumDelaySamples_) - 1);
  const double requestedSamples = delaySeconds * sampleRate_;
  const double boundedSamples = std::isfinite(requestedSamples)
                                    ? std::clamp(requestedSamples, 1.0, maximumDelaySamples)
                                    : (requestedSamples > 0.0 ? maximumDelaySamples : 1.0);
  delaySamples_ = static_cast<int>(boundedSamples);
}

void DelayNode::updateFilterCoefficients(double sampleRate) {
  sampleRate_ = std::max(1.0, sampleRate);
  const double dt = 1.0 / sampleRate_;

  const double highPassRc = 1.0 / (2.0 * juce::MathConstants<double>::pi * std::max(20.0f, lowCutHz_));
  highPassAlpha_ = static_cast<float>(highPassRc / (highPassRc + dt));

  const double lowPassExp =
      std::exp(-2.0 * juce::MathConstants<double>::pi * std::max(20.0f, highCutHz_) / sampleRate_);
  lowPassAlpha_ = static_cast<float>(std::clamp(lowPassExp, 0.0, 1.0));
}

float DelayNode::processFeedbackSample(int channel, float sample) {
  if (channel < 0 || channel >= static_cast<int>(filterStates_.size())) {
    return sample;
  }

  auto& state = filterStates_[static_cast<std::size_t>(channel)];
  float filtered = sample;

  const float hp =
      highPassAlpha_ * (state.hpY1 + filtered - state.hpX1);
  state.hpX1 = filtered;
  state.hpY1 = hp;
  filtered = hp;

  const float lp = (1.0f - lowPassAlpha_) * filtered + lowPassAlpha_ * state.lpY1;
  state.lpY1 = lp;
  if (saturation_ <= 0.0001f && character_ == 0) return lp;

  const float drive = 1.0f + saturation_ * (character_ == 2 ? 12.0f : 7.0f);
  if (character_ == 3) {
    return std::clamp(lp * drive, -1.0f, 1.0f) / drive;
  }
  if (character_ == 2) {
    return std::tanh((lp + 0.04f * saturation_) * drive) / std::tanh(drive);
  }
  if (character_ == 1) {
    const float biased = lp + 0.025f * saturation_;
    return (std::tanh(biased * drive) - std::tanh(0.025f * saturation_ * drive)) / std::tanh(drive);
  }
  return std::tanh(lp * drive) / std::tanh(drive);
}

}  // namespace padpilot

