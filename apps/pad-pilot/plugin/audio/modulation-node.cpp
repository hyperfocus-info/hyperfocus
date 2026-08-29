#include "audio/modulation-node.h"

#include <algorithm>
#include <cmath>

namespace padpilot {

namespace {

float triangleFromPhase(float phase) {
  const float normalized = std::fmod(phase / juce::MathConstants<float>::twoPi, 1.0f);
  const float wrapped = normalized < 0.0f ? normalized + 1.0f : normalized;
  return 1.0f - 4.0f * std::abs(wrapped - 0.5f);
}

}  // namespace

void ModulationNode::prepare(const juce::dsp::ProcessSpec& spec) {
  sampleRate_ = static_cast<float>(spec.sampleRate);
  maximumDelaySamples_ = std::max(
      2, static_cast<int>(std::ceil(std::max(1.0, spec.sampleRate) * kMaximumDelaySeconds)) + 1);
  delayLine_.setMaximumDelayInSamples(maximumDelaySamples_);
  delayLine_.prepare(spec);
  delayLine_.reset();
  const int rotaryMaximumDelaySamples = std::max(
      2, static_cast<int>(std::ceil(std::max(1.0, spec.sampleRate) * kRotaryMaximumDelaySeconds)) + 1);
  rotaryHornDelayLine_.setMaximumDelayInSamples(rotaryMaximumDelaySamples);
  rotaryHornDelayLine_.prepare(spec);
  rotaryHornDelayLine_.reset();
  rotaryDrumDelayLine_.setMaximumDelayInSamples(rotaryMaximumDelaySamples);
  rotaryDrumDelayLine_.prepare(spec);
  rotaryDrumDelayLine_.reset();
  phase_ = 0.0f;
  autoPanSmoothed_ = 0.0f;
  currentMotionValue_ = 0.0f;
  randomLfoValue_ = 0.0f;
  randomLfoCadence_ = 0;
  randomState_ = 0x8f3d'91a7U;
  for (auto& channel : phaserPreviousInput_) channel.fill(0.0f);
  for (auto& channel : phaserPreviousOutput_) channel.fill(0.0f);
  phaserFeedbackState_.fill(0.0f);
  rotaryLowState_.fill(0.0f);
  tremoloSmoothed_.fill(1.0f);
  rotaryHornPhase_ = 0.0f;
  rotaryDrumPhase_ = 0.0f;
  rotaryHornRateHz_ = 0.8f;
  rotaryDrumRateHz_ = 0.65f;
  pitchDriftRandomTarget_ = 0.0f;
  pitchDriftRandomValue_ = 0.0f;
  pitchDriftRandomCountdown_ = 0;
}

void ModulationNode::setHostBpm(double bpm) {
  if (!std::isfinite(bpm)) {
    return;
  }
  hostBpm_ = std::max(20.0, bpm);
}

void ModulationNode::setRateHz(float value) {
  if (!std::isfinite(value)) {
    return;
  }
  rateHz_ = std::clamp(value, 0.02f, 20.0f);
}

void ModulationNode::setRateSyncEnabled(bool enabled) {
  rateSyncEnabled_ = enabled;
}

void ModulationNode::setRateBeats(float beats) {
  if (!std::isfinite(beats)) {
    return;
  }
  rateBeats_ = std::clamp(beats, 1.0f / 32.0f, 64.0f);
}

void ModulationNode::setDepth(float value) {
  if (!std::isfinite(value)) {
    return;
  }
  depth_ = std::clamp(value, 0.0f, 1.0f);
}

void ModulationNode::setBaseDelayMs(float value) {
  if (!std::isfinite(value)) {
    return;
  }
  baseDelayMs_ = std::clamp(value, 0.5f, kMaximumDelaySeconds * 1000.0f);
}

void ModulationNode::setBaseDelaySyncEnabled(bool enabled) {
  baseDelaySyncEnabled_ = enabled;
}

void ModulationNode::setBaseDelayBeats(float beats) {
  if (!std::isfinite(beats)) {
    return;
  }
  baseDelayBeats_ = std::clamp(beats, 1.0f / 32.0f, kMaximumDelaySyncBeats);
}

void ModulationNode::setFeedback(float value) {
  if (!std::isfinite(value)) {
    return;
  }
  feedback_ = std::clamp(value, -0.95f, 0.95f);
}

void ModulationNode::setMix(float value) {
  if (!std::isfinite(value)) {
    return;
  }
  mix_ = std::clamp(value, 0.0f, 1.0f);
}

void ModulationNode::setStereoPhase(float value) {
  if (!std::isfinite(value)) {
    return;
  }
  stereoPhase_ = std::clamp(value, 0.0f, 1.0f);
}

void ModulationNode::setMode(Mode value) {
  mode_ = value;
}

void ModulationNode::setAutoPanAmount(float value) {
  if (!std::isfinite(value)) {
    return;
  }
  autoPanAmount_ = std::clamp(value, 0.0f, 1.0f);
}

void ModulationNode::setAutoPanPhaseOffset(float value) {
  if (!std::isfinite(value)) {
    return;
  }
  autoPanPhaseOffset_ = std::clamp(value, 0.0f, 1.0f);
}

void ModulationNode::setAutoPanSmoothing(float value) {
  if (!std::isfinite(value)) {
    return;
  }
  autoPanSmoothing_ = std::clamp(value, 0.0f, 1.0f);
}

void ModulationNode::setAutoPanShape(LfoShape value) {
  autoPanShape_ = value;
}

void ModulationNode::setPhaserCenterFrequencyHz(float value) {
  if (std::isfinite(value)) phaserCenterFrequencyHz_ = std::clamp(value, 40.0f, 18'000.0f);
}

void ModulationNode::setPhaserStages(int value) {
  phaserStages_ = std::clamp(value, 2, kMaximumPhaserStages);
}

void ModulationNode::setPhaserResonance(float value) {
  if (std::isfinite(value)) phaserResonance_ = std::clamp(value, 0.0f, 0.95f);
}

void ModulationNode::setRotaryFast(bool value) { rotaryFast_ = value; }

void ModulationNode::setRotaryDrive(float value) {
  if (std::isfinite(value)) rotaryDrive_ = std::clamp(value, 0.0f, 1.0f);
}

void ModulationNode::setRotaryHornDrumBalance(float value) {
  if (std::isfinite(value)) rotaryHornDrumBalance_ = std::clamp(value, 0.0f, 1.0f);
}

void ModulationNode::setRotaryMicDistance(float value) {
  if (std::isfinite(value)) rotaryMicDistance_ = std::clamp(value, 0.0f, 1.0f);
}

void ModulationNode::setRotaryAcceleration(float value) {
  if (std::isfinite(value)) rotaryAcceleration_ = std::clamp(value, 0.0f, 1.0f);
}

void ModulationNode::setPitchDriftShape(LfoShape value) { pitchDriftShape_ = value; }

void ModulationNode::setPitchDriftStereoOffset(float value) {
  if (std::isfinite(value)) pitchDriftStereoOffset_ = std::clamp(value, 0.0f, 1.0f);
}

void ModulationNode::setPitchDriftRangeCents(float value) {
  if (std::isfinite(value)) pitchDriftRangeCents_ = std::clamp(value, 0.0f, 100.0f);
}

bool ModulationNode::process(juce::AudioBuffer<float>& buffer) {
  if (mix_ <= 0.0001f && mode_ != Mode::phaser && mode_ != Mode::rotarySpeaker &&
      mode_ != Mode::pitchDrift) {
    return false;
  }

  const int channels = std::max(1, buffer.getNumChannels());
  const int modeledChannels = std::min(channels, 2);
  const int samples = buffer.getNumSamples();
  const float effectiveRateHz = rateSyncEnabled_
                                    ? static_cast<float>(1.0 / std::max(1.0e-4, (60.0 / hostBpm_) * static_cast<double>(rateBeats_)))
                                    : rateHz_;
  const float phaseIncrement = juce::MathConstants<float>::twoPi * effectiveRateHz / std::max(1.0f, sampleRate_);

  if (mode_ == Mode::phaser) {
    for (int sample = 0; sample < samples; ++sample) {
      const float basePhase = phase_;
      phase_ += phaseIncrement;
      if (phase_ > juce::MathConstants<float>::twoPi) phase_ -= juce::MathConstants<float>::twoPi;
      for (int channel = 0; channel < modeledChannels; ++channel) {
        const float offset = static_cast<float>(channel) * stereoPhase_ * juce::MathConstants<float>::twoPi;
        const float sweep = std::exp2(std::sin(basePhase + offset));
        const float frequency = std::clamp(phaserCenterFrequencyHz_ * sweep, 40.0f,
                                           std::min(18'000.0f, sampleRate_ * 0.45f));
        const float tangent = std::tan(juce::MathConstants<float>::pi * frequency /
                                       std::max(1.0f, sampleRate_));
        const float coefficient = (1.0f - tangent) / (1.0f + tangent);
        const float input = buffer.getSample(channel, sample);
        float shifted = input + phaserFeedbackState_[static_cast<std::size_t>(channel)] * phaserResonance_;
        for (int stage = 0; stage < phaserStages_; ++stage) {
          const auto channelIndex = static_cast<std::size_t>(channel);
          const auto stageIndex = static_cast<std::size_t>(stage);
          const float output = coefficient * shifted + phaserPreviousInput_[channelIndex][stageIndex] -
                               coefficient * phaserPreviousOutput_[channelIndex][stageIndex];
          phaserPreviousInput_[channelIndex][stageIndex] = shifted;
          phaserPreviousOutput_[channelIndex][stageIndex] = output;
          shifted = output;
        }
        phaserFeedbackState_[static_cast<std::size_t>(channel)] = shifted;
        buffer.setSample(channel, sample, 0.5f * (input + shifted));
      }
      currentMotionValue_ = std::sin(basePhase);
    }
    return true;
  }

  if (mode_ == Mode::rotarySpeaker) {
    const float targetHornRate = rotaryFast_ ? 6.7f : 0.8f;
    const float targetDrumRate = rotaryFast_ ? 5.8f : 0.65f;
    const float slewSeconds = 0.08f + (1.0f - rotaryAcceleration_) * 2.4f;
    const float slew = 1.0f - std::exp(-1.0f / (std::max(1.0f, sampleRate_) * slewSeconds));
    const float crossover = 1.0f - std::exp(-juce::MathConstants<float>::twoPi * 800.0f /
                                            std::max(1.0f, sampleRate_));
    const float drive = 1.0f + rotaryDrive_ * 7.0f;
    const float distanceDepth = 1.0f - rotaryMicDistance_ * 0.75f;
    for (int sample = 0; sample < samples; ++sample) {
      rotaryHornRateHz_ += (targetHornRate - rotaryHornRateHz_) * slew;
      rotaryDrumRateHz_ += (targetDrumRate - rotaryDrumRateHz_) * slew;
      rotaryHornPhase_ += juce::MathConstants<float>::twoPi * rotaryHornRateHz_ / std::max(1.0f, sampleRate_);
      rotaryDrumPhase_ += juce::MathConstants<float>::twoPi * rotaryDrumRateHz_ / std::max(1.0f, sampleRate_);
      if (rotaryHornPhase_ > juce::MathConstants<float>::twoPi) rotaryHornPhase_ -= juce::MathConstants<float>::twoPi;
      if (rotaryDrumPhase_ > juce::MathConstants<float>::twoPi) rotaryDrumPhase_ -= juce::MathConstants<float>::twoPi;
      for (int channel = 0; channel < modeledChannels; ++channel) {
        const float stereo = static_cast<float>(channel) * juce::MathConstants<float>::pi;
        const float dryInput = buffer.getSample(channel, sample);
        const float input = rotaryDrive_ <= 0.0001f
                                ? dryInput
                                : std::tanh(dryInput * drive) / std::tanh(drive);
        const auto channelIndex = static_cast<std::size_t>(channel);
        rotaryLowState_[channelIndex] += (input - rotaryLowState_[channelIndex]) * crossover;
        const float low = rotaryLowState_[channelIndex];
        const float high = input - low;
        const float hornLfo = std::sin(rotaryHornPhase_ + stereo);
        const float drumLfo = std::sin(rotaryDrumPhase_ + stereo);
        const float rotaryMaximumDelaySamples = std::max(2.0f, sampleRate_ * kRotaryMaximumDelaySeconds);
        const float hornDelay = std::clamp((2.0f + hornLfo * 1.5f * distanceDepth) * sampleRate_ / 1000.0f,
                                           1.0f, rotaryMaximumDelaySamples - 1.0f);
        const float drumDelay = std::clamp((3.5f + drumLfo * 1.0f * distanceDepth) * sampleRate_ / 1000.0f,
                                           1.0f, rotaryMaximumDelaySamples - 1.0f);
        const float delayedHorn = rotaryHornDelayLine_.popSample(channel, hornDelay);
        const float delayedDrum = rotaryDrumDelayLine_.popSample(channel, drumDelay);
        rotaryHornDelayLine_.pushSample(channel, high);
        rotaryDrumDelayLine_.pushSample(channel, low);
        const float horn = delayedHorn * (0.72f + hornLfo * 0.28f * distanceDepth);
        const float drum = delayedDrum * (0.8f + drumLfo * 0.2f * distanceDepth);
        buffer.setSample(channel, sample,
            horn * rotaryHornDrumBalance_ + drum * (1.0f - rotaryHornDrumBalance_));
      }
      currentMotionValue_ = std::sin(rotaryHornPhase_);
    }
    return true;
  }

  if (mode_ == Mode::pitchDrift) {
    if (depth_ <= 0.0001f || pitchDriftRangeCents_ <= 0.0001f) {
      currentMotionValue_ = 0.0f;
      return false;
    }
    const float maximumRatioOffset = std::exp2(pitchDriftRangeCents_ / 1200.0f) - 1.0f;
    const float delayAmplitudeSamples = std::clamp(
        maximumRatioOffset * sampleRate_ /
            std::max(0.05f, juce::MathConstants<float>::twoPi * effectiveRateHz),
        0.0f, sampleRate_ * 0.045f) * depth_;
    const float baseDelaySamples = sampleRate_ * 0.05f;
    for (int sample = 0; sample < samples; ++sample) {
      phase_ += phaseIncrement;
      if (phase_ > juce::MathConstants<float>::twoPi) phase_ -= juce::MathConstants<float>::twoPi;
      if (pitchDriftRandomCountdown_ <= 0) {
        randomState_ = randomState_ * 1664525U + 1013904223U;
        pitchDriftRandomTarget_ = static_cast<float>(randomState_ >> 8U) / 8'388'607.5f - 1.0f;
        pitchDriftRandomCountdown_ = std::max(1, static_cast<int>(sampleRate_ /
            std::max(0.05f, effectiveRateHz * 4.0f)));
      }
      --pitchDriftRandomCountdown_;
      pitchDriftRandomValue_ += (pitchDriftRandomTarget_ - pitchDriftRandomValue_) *
                                std::min(1.0f, 12.0f / std::max(1.0f, sampleRate_));
      for (int channel = 0; channel < modeledChannels; ++channel) {
        const float offset = static_cast<float>(channel) * pitchDriftStereoOffset_ *
                             juce::MathConstants<float>::twoPi;
        float drift = std::sin(phase_ + offset);
        if (pitchDriftShape_ == LfoShape::triangle) drift = triangleFromPhase(phase_ + offset);
        if (pitchDriftShape_ == LfoShape::random) drift = std::clamp(pitchDriftRandomValue_ +
            std::sin(phase_ * 0.37f + offset) * 0.25f, -1.0f, 1.0f);
        const float input = buffer.getSample(channel, sample);
        delayLine_.pushSample(channel, input);
        const float delaySamples = std::clamp(baseDelaySamples + drift * delayAmplitudeSamples,
                                              1.0f, static_cast<float>(maximumDelaySamples_ - 1));
        buffer.setSample(channel, sample, delayLine_.popSample(channel, delaySamples));
        if (channel == 0) currentMotionValue_ = drift * pitchDriftRangeCents_ * depth_;
      }
    }
    return true;
  }

  if (mode_ == Mode::autoPan) {
    const float dry = 1.0f - mix_;
    const float smoothingSeconds = 0.001f + autoPanSmoothing_ * 0.249f;
    const float smoothing = 1.0f - std::exp(-1.0f / (std::max(1.0f, sampleRate_) * smoothingSeconds));
    const float phaseOffset = autoPanPhaseOffset_ * juce::MathConstants<float>::twoPi;
    for (int sample = 0; sample < samples; ++sample) {
      phase_ += phaseIncrement;
      if (phase_ > juce::MathConstants<float>::twoPi) {
        phase_ -= juce::MathConstants<float>::twoPi;
      }

      float lfo = 0.0f;
      switch (autoPanShape_) {
        case LfoShape::triangle:
          lfo = triangleFromPhase(phase_ + phaseOffset);
          break;
        case LfoShape::square:
          lfo = std::sin(phase_ + phaseOffset) >= 0.0f ? 1.0f : -1.0f;
          break;
        case LfoShape::random:
          if (randomLfoCadence_ == 0) {
            randomState_ = randomState_ * 1664525U + 1013904223U;
            randomLfoValue_ = static_cast<float>(randomState_ >> 8U) / 8'388'607.5f - 1.0f;
          }
          randomLfoCadence_ = (randomLfoCadence_ + 1) % 16;
          lfo = randomLfoValue_;
          break;
        case LfoShape::sine:
        default:
          lfo = std::sin(phase_ + phaseOffset);
          break;
      }

      const float targetPan = std::clamp(lfo * autoPanAmount_, -1.0f, 1.0f);
      autoPanSmoothed_ += (targetPan - autoPanSmoothed_) * smoothing;
      currentMotionValue_ = autoPanSmoothed_;
      const float leftGain = std::sqrt(std::max(0.0f, 0.5f * (1.0f - autoPanSmoothed_)));
      const float rightGain = std::sqrt(std::max(0.0f, 0.5f * (1.0f + autoPanSmoothed_)));

      const float leftIn = buffer.getSample(0, sample);
      if (channels >= 2) {
        const float rightIn = buffer.getSample(1, sample);
        const float mono = 0.5f * (leftIn + rightIn);
        buffer.setSample(0, sample, leftIn * dry + mono * leftGain * mix_);
        buffer.setSample(1, sample, rightIn * dry + mono * rightGain * mix_);
      } else {
        buffer.setSample(0, sample, leftIn * (dry + mix_));
      }
    }

    return true;
  }

  if (mode_ == Mode::tremolo) {
    const float smoothingSeconds = 0.001f + autoPanSmoothing_ * 0.249f;
    const float smoothing = 1.0f - std::exp(-1.0f / (std::max(1.0f, sampleRate_) * smoothingSeconds));
    for (int sample = 0; sample < samples; ++sample) {
      phase_ += phaseIncrement;
      if (phase_ > juce::MathConstants<float>::twoPi) phase_ -= juce::MathConstants<float>::twoPi;
      if (autoPanShape_ == LfoShape::random && randomLfoCadence_ == 0) {
        randomState_ = randomState_ * 1664525U + 1013904223U;
        randomLfoValue_ = static_cast<float>(randomState_ >> 8U) / 8'388'607.5f - 1.0f;
      }
      randomLfoCadence_ = (randomLfoCadence_ + 1) % 16;
      for (int channel = 0; channel < modeledChannels; ++channel) {
        const float channelPhase = phase_ + static_cast<float>(channel) * stereoPhase_ * juce::MathConstants<float>::twoPi;
        float lfo = std::sin(channelPhase);
        if (autoPanShape_ == LfoShape::triangle) lfo = triangleFromPhase(channelPhase);
        if (autoPanShape_ == LfoShape::square) lfo = lfo >= 0.0f ? 1.0f : -1.0f;
        if (autoPanShape_ == LfoShape::random) lfo = randomLfoValue_;
        const float targetGain = 1.0f - depth_ + depth_ * (0.5f + 0.5f * lfo);
        auto& smoothed = tremoloSmoothed_[static_cast<std::size_t>(channel)];
        smoothed += (targetGain - smoothed) * smoothing;
        buffer.setSample(channel, sample, buffer.getSample(channel, sample) * smoothed);
        if (channel == 0) currentMotionValue_ = lfo;
      }
    }
    return true;
  }

  const float dry = 1.0f - mix_;
  currentMotionValue_ = 0.0f;
  const float syncedBaseDelayMs = static_cast<float>((60.0 / hostBpm_) * static_cast<double>(baseDelayBeats_) * 1000.0);
  const float baseMs = baseDelaySyncEnabled_ ? syncedBaseDelayMs : baseDelayMs_;
  const float sweepMs = mode_ == Mode::flanger ? std::max(0.5f, baseMs * 0.85f) : std::max(1.0f, baseMs * 0.66f);

  for (int sample = 0; sample < samples; ++sample) {
    const float basePhase = phase_;
    phase_ += phaseIncrement;
    if (phase_ > juce::MathConstants<float>::twoPi) {
      phase_ -= juce::MathConstants<float>::twoPi;
    }

    for (int channel = 0; channel < channels; ++channel) {
      const float phaseOffset = static_cast<float>(channel) * stereoPhase_ * juce::MathConstants<float>::pi;
      const float lfo = std::sin(basePhase + phaseOffset);
      const float shaped = (0.5f + 0.5f * lfo) * depth_;
      const float delayMs = std::max(0.5f, baseMs + sweepMs * shaped);
      const float delaySamples = std::clamp(
          (delayMs * sampleRate_) / 1000.0f,
          1.0f,
          static_cast<float>(std::max(2, maximumDelaySamples_) - 1));
      const float input = buffer.getSample(channel, sample);
      const float delayed = delayLine_.popSample(channel, delaySamples);
      const float fed = input + delayed * feedback_;
      delayLine_.pushSample(channel, fed);
      buffer.setSample(channel, sample, input * dry + delayed * mix_);
    }
  }

  return true;
}

float ModulationNode::getMotionValue() const noexcept {
  return currentMotionValue_;
}

bool ModulationNode::isWetActive() const noexcept {
  if (mode_ == Mode::pitchDrift) {
    return depth_ > 0.0001f && pitchDriftRangeCents_ > 0.0001f;
  }
  if (mode_ == Mode::phaser || mode_ == Mode::rotarySpeaker) {
    return true;
  }
  if (mode_ == Mode::tremolo) return depth_ > 0.0001f;
  return mix_ > 0.0001f || (mode_ == Mode::autoPan && autoPanAmount_ > 0.0001f);
}

}  // namespace padpilot

