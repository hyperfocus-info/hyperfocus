#pragma once

#include <algorithm>
#include <cmath>
#include <initializer_list>

#include "audio/parametric-eq-node.h"
#include "generated/proto/fx-chain.pb.h"

namespace padpilot {

inline bool hasFiniteFxValues(std::initializer_list<float> values) {
  return std::all_of(values.begin(), values.end(), [](float value) { return std::isfinite(value); });
}

inline bool isValidTempoSync(const fx::TempoSyncState& sync) { return sync.division_index() < 20U; }

inline bool isValidFxNodeConfig(const fx::NodeState& node, bool requireMatchingConfig) {
  const auto missingConfigIsValid = !requireMatchingConfig;
  switch (node.type()) {
    case fx::FX_NODE_TYPE_CONVOLVER: {
      if (!node.has_convolver_config()) return missingConfigIsValid;
      const auto& config = node.convolver_config();
      return hasFiniteFxValues({config.blend(), config.ir_stretch(), config.start_trim(), config.end_trim(),
                                config.high_pass_hz(), config.low_pass_hz()}) &&
             config.ir_id().size() <= 32U && config.ir_source_name().size() <= 256U &&
             config.ir_source_path().size() <= 4096U;
    }
    case fx::FX_NODE_TYPE_DELAY: {
      if (!node.has_delay_config()) return missingConfigIsValid;
      const auto& config = node.delay_config();
      return hasFiniteFxValues({config.time(), config.feedback(), config.focus_mix(), config.grain_size(),
                                config.grain_density(), config.grain_spray(), config.grain_pitch_shift(),
                                config.low_cut_hz(), config.high_cut_hz(), config.width(), config.saturation()}) &&
             (!config.has_time_sync() || isValidTempoSync(config.time_sync()));
    }
    case fx::FX_NODE_TYPE_REVERB: {
      if (!node.has_reverb_config()) return missingConfigIsValid;
      const auto& config = node.reverb_config();
      return hasFiniteFxValues({config.decay(), config.size(), config.focus_mix(), config.damping(),
                                config.pre_delay_ms(), config.modulation_speed_hz(), config.modulation_depth(),
                                config.shimmer_feedback()}) &&
             (!config.has_pre_delay_sync() || isValidTempoSync(config.pre_delay_sync())) &&
             (!config.has_modulation_speed_sync() || isValidTempoSync(config.modulation_speed_sync()));
    }
    case fx::FX_NODE_TYPE_CHORUS: {
      if (!node.has_chorus_config()) return missingConfigIsValid;
      const auto& config = node.chorus_config();
      return hasFiniteFxValues(
                 {config.rate_hz(), config.depth(), config.width(), config.voice_delay_ms(), config.feedback()}) &&
             (!config.has_rate_sync() || isValidTempoSync(config.rate_sync())) &&
             (!config.has_voice_delay_sync() || isValidTempoSync(config.voice_delay_sync()));
    }
    case fx::FX_NODE_TYPE_EQ: {
      if (!node.has_eq_config()) return missingConfigIsValid;
      const auto& config = node.eq_config();
      if (config.bands_size() > ParametricEqNode::kMaxBands - 2 ||
          !hasFiniteFxValues({config.low_shelf_gain_db(), config.high_shelf_gain_db(), config.master_gain_db(),
                              config.low_shelf_frequency_hz(), config.high_shelf_frequency_hz()})) {
        return false;
      }
      return std::all_of(config.bands().begin(), config.bands().end(), [](const auto& band) {
        return hasFiniteFxValues({band.frequency_hz(), band.q(), band.gain_db()});
      });
    }
    case fx::FX_NODE_TYPE_COMPRESSOR: {
      if (!node.has_compressor_config()) return missingConfigIsValid;
      const auto& config = node.compressor_config();
      return hasFiniteFxValues({config.threshold_db(), config.ratio(), config.makeup_db(), config.attack_ms(),
                                config.release_ms(), config.knee_db(), config.sidechain_hpf_hz(), config.lookahead_ms(),
                                config.low_band().threshold_db(), config.low_band().ratio(),
                                config.mid_band().threshold_db(), config.mid_band().ratio(),
                                config.high_band().threshold_db(), config.high_band().ratio()});
    }
    case fx::FX_NODE_TYPE_TRANSIENT_SHAPER:
      return node.has_transient_shaper_config()
                 ? hasFiniteFxValues({node.transient_shaper_config().attack(), node.transient_shaper_config().sustain(),
                                      node.transient_shaper_config().gain_db(),
                                      node.transient_shaper_config().sensitivity()})
                 : missingConfigIsValid;
    case fx::FX_NODE_TYPE_NOISE_GATE:
      return node.has_noise_gate_config()
                 ? hasFiniteFxValues({node.noise_gate_config().threshold_db(), node.noise_gate_config().range_db(),
                                      node.noise_gate_config().attack_ms(), node.noise_gate_config().hold_ms(),
                                      node.noise_gate_config().release_ms()})
                 : missingConfigIsValid;
    case fx::FX_NODE_TYPE_TAPE_SATURATION:
      return node.has_tape_saturation_config()
                 ? hasFiniteFxValues({node.tape_saturation_config().drive(), node.tape_saturation_config().warmth(),
                                      node.tape_saturation_config().tape_speed_ips(),
                                      node.tape_saturation_config().wow_flutter(),
                                      node.tape_saturation_config().hysteresis(), node.tape_saturation_config().bias()})
                 : missingConfigIsValid;
    case fx::FX_NODE_TYPE_BITCRUSHER:
      return node.has_bitcrusher_config()
                 ? hasFiniteFxValues({node.bitcrusher_config().bits(), node.bitcrusher_config().downsample(),
                                      node.bitcrusher_config().jitter(), node.bitcrusher_config().post_filter(),
                                      node.bitcrusher_config().wet_dry()})
                 : missingConfigIsValid;
    case fx::FX_NODE_TYPE_EXCITER:
      return node.has_exciter_config()
                 ? hasFiniteFxValues({node.exciter_config().harmonic_drive(), node.exciter_config().mix(),
                                      node.exciter_config().odd_even_balance()})
                 : missingConfigIsValid;
    case fx::FX_NODE_TYPE_PHASER: {
      if (!node.has_phaser_config()) return missingConfigIsValid;
      const auto& config = node.phaser_config();
      return hasFiniteFxValues(
                 {config.speed_hz(), config.center_frequency_hz(), config.resonance(), config.stereo_phase_offset()}) &&
             (!config.has_speed_sync() || isValidTempoSync(config.speed_sync()));
    }
    case fx::FX_NODE_TYPE_AUTO_PAN: {
      if (!node.has_auto_pan_config()) return missingConfigIsValid;
      const auto& config = node.auto_pan_config();
      return hasFiniteFxValues({config.rate_hz(), config.amount(), config.phase_offset(), config.smoothing()}) &&
             (!config.has_rate_sync() || isValidTempoSync(config.rate_sync()));
    }
    case fx::FX_NODE_TYPE_ROTARY_SPEAKER:
      return node.has_rotary_speaker_config()
                 ? hasFiniteFxValues(
                       {node.rotary_speaker_config().drive(), node.rotary_speaker_config().horn_drum_balance(),
                        node.rotary_speaker_config().mic_distance(), node.rotary_speaker_config().acceleration()})
                 : missingConfigIsValid;
    case fx::FX_NODE_TYPE_STEREO_IMAGER:
      return node.has_stereo_imager_config()
                 ? hasFiniteFxValues({node.stereo_imager_config().width_percent(),
                                      node.stereo_imager_config().bass_mono_crossover_hz(),
                                      node.stereo_imager_config().stereo_balance(), node.stereo_imager_config().pan()})
                 : missingConfigIsValid;
    case fx::FX_NODE_TYPE_PITCH_DRIFT: {
      if (!node.has_pitch_drift_config()) return missingConfigIsValid;
      const auto& config = node.pitch_drift_config();
      return hasFiniteFxValues({config.depth(), config.rate_hz(), config.stereo_offset(), config.range_cents()}) &&
             (!config.has_rate_sync() || isValidTempoSync(config.rate_sync()));
    }
    case fx::FX_NODE_TYPE_REVERSE:
      return node.has_reverse_config()
                 ? hasFiniteFxValues({node.reverse_config().window_ms(), node.reverse_config().pitch_semitones(),
                                      node.reverse_config().forward_mix(), node.reverse_config().crossfade_ms()})
                 : missingConfigIsValid;
    case fx::FX_NODE_TYPE_TREMOLO: {
      if (!node.has_tremolo_config()) return missingConfigIsValid;
      const auto& config = node.tremolo_config();
      return hasFiniteFxValues({config.rate_hz(), config.depth(), config.stereo_phase_offset(), config.smoothing()}) &&
             (!config.has_rate_sync() || isValidTempoSync(config.rate_sync()));
    }
    case fx::FX_NODE_TYPE_SATURATION:
      return node.has_saturation_config()
                 ? hasFiniteFxValues({node.saturation_config().drive(), node.saturation_config().tone(),
                                      node.saturation_config().bias(), node.saturation_config().output_gain_db()})
                 : missingConfigIsValid;
    case fx::FX_NODE_TYPE_UNSPECIFIED:
    default:
      return missingConfigIsValid;
  }
}

}  // namespace padpilot
