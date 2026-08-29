#include "audio/reverb-node.h"

#include <algorithm>
#include <chrono>
#include <cmath>

namespace padpilot {

void ReverbNode::prepare(const juce::dsp::ProcessSpec& spec) {
  sampleRate_ = spec.sampleRate;
  reverb_.prepare(spec);
  reverb_.reset();
  maximumPreDelaySamples_ = std::max(
      2, static_cast<int>(std::ceil(std::max(1.0, sampleRate_) * kMaximumPreDelaySeconds)) + 1);
  preDelayLine_.setMaximumDelayInSamples(maximumPreDelaySamples_);
  preDelayLine_.prepare(spec);
  preDelayLine_.reset();
  dryScratch_.setSize(static_cast<int>(spec.numChannels), static_cast<int>(spec.maximumBlockSize), false, false, true);
  preDelayNs_.store(0, std::memory_order_relaxed);
  coreNs_.store(0, std::memory_order_relaxed);
  mixNs_.store(0, std::memory_order_relaxed);
  modulationSamplesUntilUpdate_ = 0;
  updatePreDelaySamples();
  updateReverbParameters();
}

void ReverbNode::setHostBpm(double bpm) {
  if (!std::isfinite(bpm)) {
    return;
  }
  hostBpm_ = std::max(20.0, bpm);
  updatePreDelaySamples();
}

void ReverbNode::setWetDry(float wet, float dry) {
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

void ReverbNode::setPreDelayMs(float ms) {
  if (!std::isfinite(ms)) {
    return;
  }
  preDelayMs_ = std::clamp(ms, 0.0f, kMaximumPreDelaySeconds * 1000.0f);
  updatePreDelaySamples();
}

void ReverbNode::setPreDelaySyncEnabled(bool enabled) {
  preDelaySyncEnabled_ = enabled;
  updatePreDelaySamples();
}

void ReverbNode::setPreDelayBeats(float beats) {
  if (!std::isfinite(beats)) {
    return;
  }
  preDelayBeats_ = std::clamp(beats, 1.0f / 32.0f, kMaximumPreDelaySyncBeats);
  updatePreDelaySamples();
}

void ReverbNode::setDecaySeconds(float seconds) {
  if (!std::isfinite(seconds)) {
    return;
  }
  decaySeconds_ = std::clamp(seconds, kMinimumDecaySeconds, kMaximumDecaySeconds);
  updateReverbParameters();
}

void ReverbNode::setSize(float size) {
  if (!std::isfinite(size)) {
    return;
  }
  size_ = std::clamp(size, 0.0f, 1.0f);
  updateReverbParameters();
}

void ReverbNode::setDampening(float dampening) {
  if (!std::isfinite(dampening)) {
    return;
  }
  dampening_ = std::clamp(dampening, 0.0f, 1.0f);
  updateReverbParameters();
}

void ReverbNode::setWidth(float width) {
  if (!std::isfinite(width)) {
    return;
  }
  width_ = std::clamp(width, 0.0f, 1.0f);
  updateReverbParameters();
}

void ReverbNode::setModulationSpeedHz(float hz) {
  if (!std::isfinite(hz)) {
    return;
  }
  modulationSpeedHz_ = std::clamp(hz, 0.02f, 10.0f);
}

void ReverbNode::setModulationSpeedSyncEnabled(bool enabled) {
  modulationSpeedSyncEnabled_ = enabled;
}

void ReverbNode::setModulationSpeedBeats(float beats) {
  if (!std::isfinite(beats)) {
    return;
  }
  modulationSpeedBeats_ = std::clamp(beats, 1.0f / 32.0f, 64.0f);
}

void ReverbNode::setModulationDepth(float depth) {
  if (!std::isfinite(depth)) {
    return;
  }
  modulationDepth_ = std::clamp(depth, 0.0f, 1.0f);
}

void ReverbNode::updatePreDelaySamples() {
  const double preDelayMs = preDelaySyncEnabled_
                                ? (60.0 / hostBpm_) * static_cast<double>(preDelayBeats_) * 1000.0
                                : static_cast<double>(preDelayMs_);
  const double delaySamples = (sampleRate_ * preDelayMs) / 1000.0;
  preDelaySamples_ = static_cast<int>(std::clamp(
      delaySamples, 0.0, static_cast<double>(std::max(2, maximumPreDelaySamples_) - 1)));
  preDelayLine_.setDelay(static_cast<float>(preDelaySamples_));
}

void ReverbNode::updateReverbParameters(float widthOverride) {
  juce::dsp::Reverb::Parameters params = reverb_.getParameters();
  const float decayNormalized =
      (decaySeconds_ - kMinimumDecaySeconds) / (kMaximumDecaySeconds - kMinimumDecaySeconds);
  params.roomSize = std::clamp(size_ * (0.35f + 0.65f * decayNormalized), 0.0f, 1.0f);
  params.damping = dampening_;
  params.width = widthOverride >= 0.0f ? std::clamp(widthOverride, 0.0f, 1.0f) : width_;
  params.wetLevel = 1.0f;
  params.dryLevel = 0.0f;
  params.freezeMode = 0.0f;
  reverb_.setParameters(params);
}

bool ReverbNode::process(juce::AudioBuffer<float>& buffer, bool profilingEnabled) {
  if (wet_ <= 0.0001f && dry_ >= 0.9999f) {
    return false;
  }

  if (wet_ <= 0.0001f) {
    if (dry_ < 0.9999f) {
      buffer.applyGain(dry_);
      return true;
    }
    return false;
  }

  const int numChannels = buffer.getNumChannels();
  const int numSamples = buffer.getNumSamples();
  const bool needDryCopy = dry_ > 0.0001f;
  if (needDryCopy && (dryScratch_.getNumChannels() < numChannels || dryScratch_.getNumSamples() < numSamples)) {
    return false;
  }

  if (needDryCopy) {
    for (int channel = 0; channel < numChannels; ++channel) {
      dryScratch_.copyFrom(channel, 0, buffer, channel, 0, numSamples);
    }
  }

  if (preDelaySamples_ > 0) {
    const auto preDelayStart = profilingEnabled ? std::chrono::steady_clock::now() : std::chrono::steady_clock::time_point {};
    for (int channel = 0; channel < numChannels; ++channel) {
      const float* dryRead = needDryCopy ? dryScratch_.getReadPointer(channel) : nullptr;
      float* wetWrite = buffer.getWritePointer(channel);
      for (int sample = 0; sample < numSamples; ++sample) {
        const float input = needDryCopy ? dryRead[sample] : wetWrite[sample];
        const float delayed = preDelayLine_.popSample(channel);
        preDelayLine_.pushSample(channel, input);
        wetWrite[sample] = delayed;
      }
    }
    if (profilingEnabled) {
      const auto preDelayEnd = std::chrono::steady_clock::now();
      preDelayNs_.fetch_add(
          static_cast<std::uint64_t>(std::chrono::duration_cast<std::chrono::nanoseconds>(preDelayEnd - preDelayStart).count()),
          std::memory_order_relaxed);
    }
  }

  juce::dsp::AudioBlock<float> wetBlock(buffer);
  const auto coreStart = profilingEnabled ? std::chrono::steady_clock::now() : std::chrono::steady_clock::time_point {};
  const double modulationRateHz = modulationSpeedSyncEnabled_
                                      ? 1.0 / std::max(
                                            1.0e-4,
                                            (60.0 / hostBpm_) * static_cast<double>(modulationSpeedBeats_))
                                      : static_cast<double>(modulationSpeedHz_);
  if (modulationDepth_ > 0.0001f && modulationRateHz > 0.0001) {
    constexpr int kModulationUpdateSamples = 16;
    const double phaseIncrement = static_cast<double>(juce::MathConstants<float>::twoPi) *
                                  modulationRateHz / std::max(1.0, sampleRate_);
    int startSample = 0;
    while (startSample < numSamples) {
      if (modulationSamplesUntilUpdate_ <= 0) {
        const float widthOffset = std::sin(modulationPhase_) * modulationDepth_ * 0.18f;
        updateReverbParameters(std::clamp(width_ + widthOffset, 0.0f, 1.0f));
        modulationSamplesUntilUpdate_ = kModulationUpdateSamples;
      }
      const int chunkSamples = std::min(modulationSamplesUntilUpdate_, numSamples - startSample);
      auto wetSubBlock = wetBlock.getSubBlock(
          static_cast<std::size_t>(startSample), static_cast<std::size_t>(chunkSamples));
      juce::dsp::ProcessContextReplacing<float> context(wetSubBlock);
      reverb_.process(context);
      modulationPhase_ += static_cast<float>(phaseIncrement * static_cast<double>(chunkSamples));
      if (modulationPhase_ >= juce::MathConstants<float>::twoPi) {
        modulationPhase_ = std::fmod(modulationPhase_, juce::MathConstants<float>::twoPi);
      }
      modulationSamplesUntilUpdate_ -= chunkSamples;
      startSample += chunkSamples;
    }
  } else {
    modulationSamplesUntilUpdate_ = 0;
    updateReverbParameters();
    auto wetSubBlock = wetBlock.getSubBlock(0, static_cast<std::size_t>(numSamples));
    juce::dsp::ProcessContextReplacing<float> context(wetSubBlock);
    reverb_.process(context);
  }
  if (profilingEnabled) {
    const auto coreEnd = std::chrono::steady_clock::now();
    coreNs_.fetch_add(
        static_cast<std::uint64_t>(std::chrono::duration_cast<std::chrono::nanoseconds>(coreEnd - coreStart).count()),
        std::memory_order_relaxed);
  }

  const auto mixStart = profilingEnabled ? std::chrono::steady_clock::now() : std::chrono::steady_clock::time_point {};
  if (needDryCopy) {
    for (int channel = 0; channel < numChannels; ++channel) {
      const float* dryRead = dryScratch_.getReadPointer(channel);
      float* wetWrite = buffer.getWritePointer(channel);
      for (int sample = 0; sample < numSamples; ++sample) {
        wetWrite[sample] = wetWrite[sample] * wet_ + dryRead[sample] * dry_;
      }
    }
  } else if (wet_ < 0.9999f) {
    buffer.applyGain(wet_);
  }
  if (profilingEnabled && (needDryCopy || wet_ < 0.9999f)) {
    const auto mixEnd = std::chrono::steady_clock::now();
    mixNs_.fetch_add(
        static_cast<std::uint64_t>(std::chrono::duration_cast<std::chrono::nanoseconds>(mixEnd - mixStart).count()),
        std::memory_order_relaxed);
  }
  return true;
}

bool ReverbNode::isWetActive() const noexcept {
  return wet_ > 0.0001f;
}

ReverbNode::TimingSnapshot ReverbNode::getTimingSnapshot() const noexcept {
  return {
      preDelayNs_.load(std::memory_order_relaxed),
      coreNs_.load(std::memory_order_relaxed),
      mixNs_.load(std::memory_order_relaxed),
  };
}

}  // namespace padpilot

