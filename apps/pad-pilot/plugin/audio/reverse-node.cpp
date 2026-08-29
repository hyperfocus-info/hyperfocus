#include "audio/reverse-node.h"

#include <algorithm>
#include <cmath>

namespace padpilot {

void ReverseNode::prepare(const juce::dsp::ProcessSpec& spec) {
  sampleRate_ = std::max(1.0, spec.sampleRate);
  maximumWindowSamples_ = std::max(2, static_cast<int>(std::ceil(sampleRate_ * kMaximumWindowMs / 1000.0)));
  for (auto& bank : banks_) {
    for (auto& channel : bank) {
      channel.assign(static_cast<std::size_t>(maximumWindowSamples_), 0.0f);
    }
  }
  captureBank_ = 0;
  playbackBank_ = 1;
  capturePosition_ = 0;
  playbackPosition_ = 0.0f;
  playbackReady_ = false;
  updateWindowSamples();
}

void ReverseNode::setWindowMs(float value) {
  if (!std::isfinite(value)) return;
  const float next = std::clamp(value, 50.0f, kMaximumWindowMs);
  if (std::abs(next - windowMs_) < 0.001f) return;
  windowMs_ = next;
  updateWindowSamples();
}

void ReverseNode::setPitchSemitones(float value) {
  if (std::isfinite(value)) pitchSemitones_ = std::clamp(value, -12.0f, 12.0f);
}

void ReverseNode::setForwardMix(float value) {
  if (std::isfinite(value)) forwardMix_ = std::clamp(value, 0.0f, 1.0f);
}

void ReverseNode::setCrossfadeMs(float value) {
  if (std::isfinite(value)) crossfadeMs_ = std::clamp(value, 0.0f, 50.0f);
}

bool ReverseNode::process(juce::AudioBuffer<float>& buffer) {
  const int channels = std::min(buffer.getNumChannels(), kMaximumChannels);
  const int samples = buffer.getNumSamples();
  if (channels <= 0 || samples <= 0) return false;

  const float pitchRatio = std::exp2(pitchSemitones_ / 12.0f);
  const int crossfadeSamples = std::clamp(
      static_cast<int>(std::round(crossfadeMs_ * static_cast<float>(sampleRate_) / 1000.0f)),
      0,
      std::max(0, windowSamples_ / 2));

  for (int sample = 0; sample < samples; ++sample) {
    const int playbackIndex = std::clamp(
        windowSamples_ - 1 - static_cast<int>(playbackPosition_), 0, windowSamples_ - 1);
    float edgeGain = 1.0f;
    if (crossfadeSamples > 0) {
      const int edgeDistance = std::min(playbackIndex, windowSamples_ - 1 - playbackIndex);
      edgeGain = std::clamp(static_cast<float>(edgeDistance) / static_cast<float>(crossfadeSamples), 0.0f, 1.0f);
    }

    for (int channel = 0; channel < channels; ++channel) {
      const float input = buffer.getSample(channel, sample);
      banks_[static_cast<std::size_t>(captureBank_)][static_cast<std::size_t>(channel)][static_cast<std::size_t>(capturePosition_)] = input;
      const float reverse = playbackReady_
                                ? banks_[static_cast<std::size_t>(playbackBank_)][static_cast<std::size_t>(channel)][static_cast<std::size_t>(playbackIndex)]
                                : input;
      const float softenedReverse = reverse * edgeGain + input * (1.0f - edgeGain);
      buffer.setSample(channel, sample, softenedReverse * (1.0f - forwardMix_) + input * forwardMix_);
    }

    ++capturePosition_;
    playbackPosition_ += pitchRatio;
    while (playbackPosition_ >= static_cast<float>(windowSamples_)) playbackPosition_ -= static_cast<float>(windowSamples_);
    if (capturePosition_ >= windowSamples_) {
      std::swap(captureBank_, playbackBank_);
      capturePosition_ = 0;
      playbackPosition_ = 0.0f;
      playbackReady_ = true;
    }
  }
  return true;
}

void ReverseNode::updateWindowSamples() {
  const int next = std::clamp(
      static_cast<int>(std::round(windowMs_ * static_cast<float>(sampleRate_) / 1000.0f)),
      2,
      maximumWindowSamples_);
  if (next == windowSamples_) return;
  windowSamples_ = next;
  capturePosition_ = 0;
  playbackPosition_ = 0.0f;
  playbackReady_ = false;
}

}  // namespace padpilot
