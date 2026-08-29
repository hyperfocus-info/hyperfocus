#include "runtime/fx-graph-native-tests.h"

#include "audio/convolver-module-graph.h"
#include "audio/delay-node.h"
#include "audio/fx-state-validation.h"
#include "audio/modulation-node.h"
#include "audio/reverb-node.h"
#include "audio/reverse-node.h"
#include "runtime/fx-chain-proto.h"
#include "runtime/preset-store.h"

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <limits>
#include <stdexcept>
#include <string>
#include <vector>

#include <juce_audio_basics/juce_audio_basics.h>
#include <juce_audio_formats/juce_audio_formats.h>
#include <juce_core/juce_core.h>

namespace padpilot::tests {
namespace {

void expect(bool condition, const std::string& message) {
  if (!condition) {
    throw std::runtime_error(message);
  }
}

void configureMaster(padpilot::fx::FxChainState& state, float outputGainDb = 0.0f) {
  state.set_schema_version(1);
  state.set_revision(17);
  auto* master = state.mutable_master();
  master->set_input_gain_db(0.0f);
  master->set_output_gain_db(outputGainDb);
  master->set_wet_dry(1.0f);
  master->set_gain_reduction_db(0.0f);
}

padpilot::fx::NodeState* addBitcrusher(padpilot::fx::ChainState& chain, std::uint32_t id, std::uint32_t order) {
  auto* node = chain.add_nodes();
  node->set_id(id);
  node->set_order(order);
  node->set_name("1-bit fixture");
  node->set_type(padpilot::fx::FX_NODE_TYPE_BITCRUSHER);
  node->set_mix(1.0f);
  auto* config = node->mutable_bitcrusher_config();
  config->set_bits(1.0f);
  config->set_downsample(1.0f);
  config->set_jitter(0.0f);
  config->set_post_filter(0.0f);
  config->set_wet_dry(1.0f);
  return node;
}

padpilot::fx::NodeState* addCompressor(padpilot::fx::ChainState& chain, std::uint32_t id, std::uint32_t order) {
  auto* node = chain.add_nodes();
  node->set_id(id);
  node->set_order(order);
  node->set_name("Makeup fixture");
  node->set_type(padpilot::fx::FX_NODE_TYPE_COMPRESSOR);
  node->set_mix(1.0f);
  auto* config = node->mutable_compressor_config();
  config->set_threshold_db(24.0f);
  config->set_ratio(1.0f);
  config->set_makeup_db(-6.0f);
  config->set_attack_ms(1.0f);
  config->set_release_ms(1.0f);
  return node;
}

padpilot::fx::FxChainState createOrderedState(bool reordered) {
  padpilot::fx::FxChainState state;
  configureMaster(state);
  state.set_selected_preset_id("native-graph-fixture");

  auto addActiveChain = [&state, reordered] {
    auto* chain = state.add_chains();
    chain->set_id(41);
    chain->set_name("Active serial chain");
    chain->set_order(reordered ? 1 : 0);
    chain->set_mix(1.0f);
    if (reordered) {
      addCompressor(*chain, 12, 0);
      addBitcrusher(*chain, 11, 1);
    } else {
      addBitcrusher(*chain, 11, 0);
      addCompressor(*chain, 12, 1);
    }
  };
  auto addMutedChain = [&state, reordered] {
    auto* chain = state.add_chains();
    chain->set_id(42);
    chain->set_name("Muted topology fixture");
    chain->set_order(reordered ? 0 : 1);
    chain->set_mix(1.0f);
    chain->set_muted(true);
    addBitcrusher(*chain, 21, 0);
  };

  if (reordered) {
    addMutedChain();
    addActiveChain();
  } else {
    addActiveChain();
    addMutedChain();
  }
  return state;
}

padpilot::fx::FxChainState createDelayState() {
  padpilot::fx::FxChainState state;
  configureMaster(state);
  auto* chain = state.add_chains();
  chain->set_id(51);
  chain->set_name("Partition-stable delay");
  chain->set_order(0);
  chain->set_mix(1.0f);
  auto* node = chain->add_nodes();
  node->set_id(31);
  node->set_name("50 ms delay");
  node->set_order(0);
  node->set_type(padpilot::fx::FX_NODE_TYPE_DELAY);
  node->set_mix(1.0f);
  auto* config = node->mutable_delay_config();
  config->set_time(0.05f);
  config->set_feedback(0.0f);
  config->set_focus_mix(1.0f);
  config->mutable_time_sync()->set_enabled(false);
  return state;
}

padpilot::fx::FxChainState createReverbState(float decaySeconds, float modulationDepth) {
  padpilot::fx::FxChainState state;
  configureMaster(state);
  auto* chain = state.add_chains();
  chain->set_id(52);
  chain->set_name("Partition-stable reverb");
  chain->set_order(0);
  chain->set_mix(1.0f);
  auto* node = chain->add_nodes();
  node->set_id(32);
  node->set_name("Long modulated reverb");
  node->set_order(0);
  node->set_type(padpilot::fx::FX_NODE_TYPE_REVERB);
  node->set_mix(1.0f);
  auto* config = node->mutable_reverb_config();
  config->set_mode("Hall");
  config->set_decay(decaySeconds);
  config->set_size(1.0f);
  config->set_focus_mix(1.0f);
  config->set_damping(0.25f);
  config->set_pre_delay_ms(0.0f);
  config->set_modulation_speed_hz(1.7f);
  config->set_modulation_depth(modulationDepth);
  config->mutable_pre_delay_sync()->set_enabled(false);
  config->mutable_modulation_speed_sync()->set_enabled(false);
  return state;
}

padpilot::fx::FxChainState createAutoPanState() {
  padpilot::fx::FxChainState state;
  configureMaster(state);
  auto* chain = state.add_chains();
  chain->set_id(53);
  chain->set_order(0);
  chain->set_mix(1.0f);
  auto* node = chain->add_nodes();
  node->set_id(33);
  node->set_order(0);
  node->set_type(padpilot::fx::FX_NODE_TYPE_AUTO_PAN);
  node->set_mix(1.0f);
  auto* config = node->mutable_auto_pan_config();
  config->set_rate_hz(3.7f);
  config->set_amount(1.0f);
  config->set_lfo_shape("Random");
  config->set_phase_offset(0.37f);
  config->set_smoothing(0.15f);
  config->mutable_rate_sync()->set_enabled(false);
  return state;
}

padpilot::fx::FxChainState createPitchDriftState() {
  padpilot::fx::FxChainState state;
  configureMaster(state);
  auto* chain = state.add_chains();
  chain->set_id(54);
  chain->set_order(0);
  chain->set_mix(1.0f);
  auto* node = chain->add_nodes();
  node->set_id(34);
  node->set_order(0);
  node->set_type(padpilot::fx::FX_NODE_TYPE_PITCH_DRIFT);
  node->set_mix(1.0f);
  auto* config = node->mutable_pitch_drift_config();
  config->set_depth(1.0f);
  config->set_rate_hz(2.3f);
  config->set_drift_shape("Random");
  config->set_stereo_offset(0.6f);
  config->set_range_cents(100.0f);
  config->mutable_rate_sync()->set_enabled(false);
  return state;
}

padpilot::fx::FxChainState createQuarantinedNodeState(padpilot::fx::FxNodeType type) {
  padpilot::fx::FxChainState state;
  configureMaster(state);
  auto* chain = state.add_chains();
  chain->set_id(56);
  chain->set_order(0);
  chain->set_mix(1.0f);
  auto* node = chain->add_nodes();
  node->set_id(36);
  node->set_order(0);
  node->set_type(type);
  node->set_mix(1.0f);
  if (type == padpilot::fx::FX_NODE_TYPE_CONVOLVER) {
    auto* config = node->mutable_convolver_config();
    config->set_blend(1.0f);
    config->set_ir_stretch(2.0f);
    config->set_reverse(true);
  } else if (type == padpilot::fx::FX_NODE_TYPE_PHASER) {
    auto* config = node->mutable_phaser_config();
    config->set_speed_hz(2.0f);
    config->set_center_frequency_hz(1200.0f);
    config->set_stages(8);
    config->set_resonance(0.8f);
    config->set_stereo_phase_offset(0.5f);
  } else if (type == padpilot::fx::FX_NODE_TYPE_ROTARY_SPEAKER) {
    auto* config = node->mutable_rotary_speaker_config();
    config->set_fast(true);
    config->set_drive(0.8f);
    config->set_horn_drum_balance(0.7f);
    config->set_mic_distance(0.2f);
    config->set_acceleration(0.9f);
  }
  return state;
}

padpilot::fx::FxChainState createEqState(float masterGainDb) {
  padpilot::fx::FxChainState state;
  configureMaster(state);
  auto* chain = state.add_chains();
  chain->set_id(55);
  chain->set_order(0);
  chain->set_mix(1.0f);
  auto* node = chain->add_nodes();
  node->set_id(35);
  node->set_order(0);
  node->set_type(padpilot::fx::FX_NODE_TYPE_EQ);
  node->set_mix(1.0f);
  auto* config = node->mutable_eq_config();
  config->set_low_shelf_gain_db(0.0f);
  config->set_high_shelf_gain_db(0.0f);
  config->set_master_gain_db(masterGainDb);
  return state;
}

padpilot::fx::FxChainState createEqBandState(const std::string& bandType) {
  auto state = createEqState(0.0f);
  auto* band = state.mutable_chains(0)->mutable_nodes(0)->mutable_eq_config()->add_bands();
  band->set_frequency_hz(1'000.0f);
  band->set_q(4.0f);
  band->set_gain_db(0.0f);
  band->set_type(bandType);
  band->set_enabled(true);
  return state;
}

padpilot::fx::FxChainState createStereoImagerState(float crossoverHz) {
  padpilot::fx::FxChainState state;
  configureMaster(state);
  auto* chain = state.add_chains();
  chain->set_id(57);
  chain->set_order(0);
  chain->set_mix(1.0f);
  auto* node = chain->add_nodes();
  node->set_id(37);
  node->set_order(0);
  node->set_type(padpilot::fx::FX_NODE_TYPE_STEREO_IMAGER);
  node->set_mix(1.0f);
  auto* config = node->mutable_stereo_imager_config();
  config->set_width_percent(100.0f);
  config->set_bass_mono_crossover_hz(crossoverHz);
  config->set_stereo_balance(0.5f);
  config->set_pan(0.0f);
  return state;
}

float renderOrderedState(const padpilot::fx::FxChainState& state) {
  ConvolverModuleGraph graph;
  graph.prepare(48'000.0, 64, 2);
  graph.applyState(state);
  juce::AudioBuffer<float> buffer(2, 64);
  for (int channel = 0; channel < buffer.getNumChannels(); ++channel) {
    for (int sample = 0; sample < buffer.getNumSamples(); ++sample) {
      buffer.setSample(channel, sample, 0.3f);
    }
  }
  graph.processBlock(buffer, 120.0);
  return buffer.getSample(0, 32);
}

std::vector<float> renderDelayPartitions(const std::vector<int>& partitions) {
  constexpr int kSignalSamples = 2600;
  ConvolverModuleGraph graph;
  graph.prepare(48'000.0, 64, 1);
  graph.applyState(createDelayState());

  std::vector<float> output;
  output.reserve(kSignalSamples);
  int renderedSamples = 0;
  std::size_t partitionIndex = 0;
  while (renderedSamples < kSignalSamples) {
    const int requested = partitions[partitionIndex % partitions.size()];
    const int samples = std::min(requested, kSignalSamples - renderedSamples);
    juce::AudioBuffer<float> block(1, samples);
    block.clear();
    if (renderedSamples == 0) {
      block.setSample(0, 0, 1.0f);
    }
    graph.processBlock(block, 120.0);
    const float* rendered = block.getReadPointer(0);
    output.insert(output.end(), rendered, rendered + samples);
    renderedSamples += samples;
    ++partitionIndex;
  }
  return output;
}

std::vector<float> renderStatePartitions(const padpilot::fx::FxChainState& state, const std::vector<int>& partitions,
                                         int signalSamples, bool impulse) {
  ConvolverModuleGraph graph;
  graph.prepare(48'000.0, 64, 2);
  graph.applyState(state);

  std::vector<float> output;
  output.reserve(static_cast<std::size_t>(signalSamples * 2));
  int renderedSamples = 0;
  std::size_t partitionIndex = 0;
  while (renderedSamples < signalSamples) {
    const int requested = partitions[partitionIndex % partitions.size()];
    const int samples = std::min(requested, signalSamples - renderedSamples);
    juce::AudioBuffer<float> block(2, samples);
    for (int channel = 0; channel < block.getNumChannels(); ++channel) {
      for (int sample = 0; sample < samples; ++sample) {
        const int signalIndex = renderedSamples + sample;
        const float value = impulse ? (signalIndex == 0 ? 1.0f : 0.0f)
                                    : std::sin(static_cast<float>(signalIndex) * 0.037f) * 0.7f + 0.2f;
        block.setSample(channel, sample, value);
      }
    }
    graph.processBlock(block, 120.0);
    for (int sample = 0; sample < samples; ++sample) {
      for (int channel = 0; channel < block.getNumChannels(); ++channel) {
        output.push_back(block.getSample(channel, sample));
      }
    }
    renderedSamples += samples;
    ++partitionIndex;
  }
  return output;
}

float maximumDifference(const std::vector<float>& left, const std::vector<float>& right) {
  expect(left.size() == right.size(), "Partition fixtures should render equal lengths.");
  float difference = 0.0f;
  for (std::size_t index = 0; index < left.size(); ++index) {
    difference = std::max(difference, std::abs(left[index] - right[index]));
  }
  return difference;
}

void runParallelUnityGainTest() {
  padpilot::fx::FxChainState state;
  configureMaster(state);
  for (std::uint32_t chainId = 1; chainId <= ConvolverModuleGraph::kMaxChains; ++chainId) {
    auto* chain = state.add_chains();
    chain->set_id(chainId);
    chain->set_order(chainId - 1);
    chain->set_mix(1.0f);
  }

  ConvolverModuleGraph graph;
  graph.prepare(48'000.0, 64, 2);
  graph.applyState(state);
  juce::AudioBuffer<float> block(2, 64);
  for (int channel = 0; channel < block.getNumChannels(); ++channel) {
    for (int sample = 0; sample < block.getNumSamples(); ++sample) {
      block.setSample(channel, sample, 0.25f);
    }
  }
  graph.processBlock(block, 120.0);
  expect(std::abs(block.getSample(0, 32) - 0.25f) < 1.0e-6f,
         "Parallel transparent chains must preserve unity gain instead of duplicating the dry signal.");
}

void runRealtimeMixAndToggleTest() {
  auto state = createEqState(12.0f);
  ConvolverModuleGraph graph;
  graph.prepare(48'000.0, 64, 2);
  graph.applyState(state);

  AudioCommand masterDry {};
  masterDry.type = AudioCommandType::setMasterWetDry;
  masterDry.value = 0.0f;
  expect(graph.applyCommand(masterDry), "Master dry/wet command should be accepted by the graph.");

  juce::AudioBuffer<float> dryBlock(2, 64);
  for (int channel = 0; channel < dryBlock.getNumChannels(); ++channel) {
    for (int sample = 0; sample < dryBlock.getNumSamples(); ++sample) {
      dryBlock.setSample(channel, sample, 0.1f);
    }
  }
  graph.processBlock(dryBlock, 120.0);
  expect(std::abs(dryBlock.getSample(0, 32) - 0.1f) < 1.0e-6f,
         "Zero master wet/dry must return sample-identical dry audio.");

  AudioCommand masterWet {};
  masterWet.type = AudioCommandType::setMasterWetDry;
  masterWet.value = 1.0f;
  expect(graph.applyCommand(masterWet), "Master wet command should be accepted by the graph.");

  AudioCommand muteNode {};
  muteNode.type = AudioCommandType::setFxNodeMuted;
  muteNode.parameterId = (55U << 16U) | (35U << 8U);
  muteNode.boolValue = true;
  expect(graph.applyCommand(muteNode), "Realtime node mute should reach the graph.");

  juce::AudioBuffer<float> mutedBlock(2, 64);
  for (int channel = 0; channel < mutedBlock.getNumChannels(); ++channel) {
    for (int sample = 0; sample < mutedBlock.getNumSamples(); ++sample) {
      mutedBlock.setSample(channel, sample, 0.1f);
    }
  }
  graph.processBlock(mutedBlock, 120.0);
  expect(mutedBlock.getMagnitude(0, 0, mutedBlock.getNumSamples()) < 1.0e-6f,
         "Realtime node mute must change rendered audio, not only canonical UI state.");

  AudioCommand soloNode {};
  soloNode.type = AudioCommandType::setFxNodeSolo;
  soloNode.parameterId = muteNode.parameterId;
  soloNode.boolValue = true;
  expect(graph.applyCommand(soloNode), "Realtime node solo should reach the graph.");

  muteNode.boolValue = false;
  expect(graph.applyCommand(muteNode), "Realtime node unmute should reach the graph.");

  AudioCommand muteChain {};
  muteChain.type = AudioCommandType::setFxChainMuted;
  muteChain.parameterId = 55U;
  muteChain.boolValue = true;
  expect(graph.applyCommand(muteChain), "Realtime chain mute should reach the graph.");

  juce::AudioBuffer<float> mutedChainBlock(2, 64);
  for (int channel = 0; channel < mutedChainBlock.getNumChannels(); ++channel) {
    for (int sample = 0; sample < mutedChainBlock.getNumSamples(); ++sample) {
      mutedChainBlock.setSample(channel, sample, 0.1f);
    }
  }
  graph.processBlock(mutedChainBlock, 120.0);
  expect(mutedChainBlock.getMagnitude(0, 0, mutedChainBlock.getNumSamples()) < 1.0e-6f,
         "Muting the only configured chain must silence the wet rack instead of falling back to dry.");
}

double renderToneMagnitude(const padpilot::fx::FxChainState& state, float frequencyHz, bool antiPhase) {
  constexpr int kSignalSamples = 16'384;
  constexpr int kWarmupSamples = 4'096;
  constexpr float kSampleRate = 48'000.0f;
  ConvolverModuleGraph graph;
  graph.prepare(kSampleRate, 64, 2);
  graph.applyState(state);

  double magnitudeSquared = 0.0;
  std::uint64_t measuredSamples = 0;
  for (int renderedSamples = 0; renderedSamples < kSignalSamples; renderedSamples += 64) {
    const int samples = std::min(64, kSignalSamples - renderedSamples);
    juce::AudioBuffer<float> block(2, samples);
    for (int sample = 0; sample < samples; ++sample) {
      const float phase =
          juce::MathConstants<float>::twoPi * frequencyHz * static_cast<float>(renderedSamples + sample) / kSampleRate;
      const float value = std::sin(phase) * 0.5f;
      block.setSample(0, sample, value);
      block.setSample(1, sample, antiPhase ? -value : value);
    }
    graph.processBlock(block, 120.0);
    for (int sample = std::max(0, kWarmupSamples - renderedSamples); sample < samples; ++sample) {
      for (int channel = 0; channel < 2; ++channel) {
        const double value = block.getSample(channel, sample);
        magnitudeSquared += value * value;
        ++measuredSamples;
      }
    }
  }
  return std::sqrt(magnitudeSquared / static_cast<double>(std::max<std::uint64_t>(1, measuredSamples)));
}

void runRestoreAndReorderTests() {
  const auto ordered = createOrderedState(false);
  ConvolverModuleGraph graph;
  graph.prepare(48'000.0, 64, 2);
  graph.applyState(ordered);
  auto snapshot = graph.getTimingSnapshot();
  expect(snapshot.chains[0].active && snapshot.chains[0].chainId == 41,
         "FX graph restore should publish the first chain identity.");
  expect(snapshot.chains[0].activeNodeCount == 2 && snapshot.chains[0].nodes[0].nodeId == 11 &&
             snapshot.chains[0].nodes[1].nodeId == 12,
         "FX graph restore should publish every restored serial node identity.");
  expect(snapshot.chains[1].active && snapshot.chains[1].chainId == 42 && snapshot.chains[1].muted,
         "FX graph restore should preserve the second chain and its mute state.");

  const auto reordered = createOrderedState(true);
  graph.applyState(reordered);
  snapshot = graph.getTimingSnapshot();
  expect(snapshot.chains[0].chainId == 42 && snapshot.chains[1].chainId == 41,
         "Structural apply should honor repeated chain order.");
  expect(snapshot.chains[1].nodes[0].nodeId == 12 && snapshot.chains[1].nodes[1].nodeId == 11,
         "Structural apply should honor repeated serial-node order.");

  const float orderedSample = renderOrderedState(ordered);
  const float reorderedSample = renderOrderedState(reordered);
  expect(orderedSample > 0.2f && std::abs(reorderedSample) < 1.0e-4f,
         "Serial node reorder should produce the topology's observably "
         "different DSP result.");
}

void runPresetRoundTripTest() {
  const auto root = juce::File::getSpecialLocation(juce::File::tempDirectory)
                        .getChildFile("PadPilot")
                        .getChildFile("fx-graph-native-tests")
                        .getChildFile(juce::Uuid().toString());
  expect(root.createDirectory(), "FX graph preset test should create its temporary root.");
  PresetStore store(root.getChildFile("presets").getFullPathName().toStdString());
  const auto sourceState = createOrderedState(true);
  PresetRecord preset;
  preset.id = "native-graph-roundtrip";
  preset.moduleId = "fx";
  preset.name = "Native Graph Roundtrip";
  preset.payloadJson = proto::bytesToBase64(proto::serializeFxChainState(sourceState));
  expect(store.savePreset(preset), "FX graph protobuf preset should persist through PresetStore.");

  const auto presets = store.loadPresetsForModule("fx");
  const auto restoredPreset = std::find_if(presets.begin(), presets.end(),
                                           [&preset](const auto& candidate) { return candidate.id == preset.id; });
  expect(restoredPreset != presets.end(), "FX graph protobuf preset should load from PresetStore.");
  std::string restoredBytes;
  expect(proto::base64ToBytes(restoredPreset->payloadJson, &restoredBytes),
         "Restored FX graph preset payload should decode from Base64.");
  padpilot::fx::FxChainState restoredState;
  expect(proto::parseFxChainState(restoredBytes, &restoredState),
         "Restored FX graph preset payload should parse as protobuf.");

  ConvolverModuleGraph graph;
  graph.prepare(48'000.0, 64, 2);
  graph.applyState(restoredState);
  const auto snapshot = graph.getTimingSnapshot();
  expect(snapshot.chains[0].chainId == 42 && snapshot.chains[1].chainId == 41 &&
             snapshot.chains[1].nodes[0].nodeId == 12 && snapshot.chains[1].nodes[1].nodeId == 11,
         "PresetStore proto roundtrip should restore the exact native graph "
         "topology.");
  expect(std::abs(renderOrderedState(restoredState) - renderOrderedState(sourceState)) < 1.0e-6f,
         "PresetStore proto roundtrip should restore native graph "
         "configuration behavior.");
  root.deleteRecursively();
}

void runPartitionAndDelayBoundTests() {
  const auto reference = renderDelayPartitions({64});
  const auto partitioned = renderDelayPartitions({7, 31, 97, 1, 53, 130, 19});
  expect(reference.size() == partitioned.size(), "FX graph partition fixtures should render equal lengths.");
  float delayPartitionDifference = 0.0f;
  for (std::size_t index = 0; index < reference.size(); ++index) {
    delayPartitionDifference = std::max(delayPartitionDifference, std::abs(reference[index] - partitioned[index]));
  }
  const auto delayedPeak = std::max_element(reference.begin(), reference.end(),
                                            [](float left, float right) { return std::abs(left) < std::abs(right); });
  const auto delayedPeakIndex = static_cast<std::size_t>(std::distance(reference.begin(), delayedPeak));
  expect(delayedPeak != reference.end() && std::abs(*delayedPeak) > 0.9f && delayedPeakIndex >= 2399 &&
             delayedPeakIndex <= 2401,
         "FX graph delay partition fixture should contain its expected delayed "
         "impulse.");
  expect(delayPartitionDifference < 1.0e-5f,
         "FX graph DSP state should be independent of small, uneven, and oversized host partitions.");

  DelayNode delay;
  juce::dsp::ProcessSpec spec;
  spec.sampleRate = 48'000.0;
  spec.maximumBlockSize = 64;
  spec.numChannels = 1;
  delay.prepare(spec);
  delay.setWetDry(1.0f, 0.0f);
  delay.setFeedback(0.0f);
  delay.setSyncEnabled(true);
  delay.setHostBpm(20.0);
  delay.setTimeBeats(std::numeric_limits<float>::max());
  juce::AudioBuffer<float> block(1, 64);
  block.clear();
  block.setSample(0, 0, 1.0f);
  expect(delay.process(block), "Extreme bounded delay fixture should keep the wet path active.");
  expect(block.getMagnitude(0, 0, block.getNumSamples()) < 1.0e-6f,
         "Extreme delay beats should saturate safely instead of overflowing to "
         "an immediate delay.");

  const std::vector<int> unevenPartitions{7, 31, 97, 1, 53, 130, 19};
  const auto autoPanReference = renderStatePartitions(createAutoPanState(), {64}, 1024, false);
  const auto autoPanPartitioned = renderStatePartitions(createAutoPanState(), unevenPartitions, 1024, false);
  expect(maximumDifference(autoPanReference, autoPanPartitioned) < 1.0e-5f,
         "Random auto-pan cadence must not restart at host-block boundaries.");

  const auto pitchState = createPitchDriftState();
  const auto pitchReference = renderStatePartitions(pitchState, {64}, 1024, false);
  const auto pitchPartitioned = renderStatePartitions(pitchState, unevenPartitions, 1024, false);
  expect(maximumDifference(pitchReference, pitchPartitioned) < 1.0e-5f,
         "Compatibility-only pitch-drift state must remain "
         "partition-independent while bypassed.");

  const auto reverbReference = renderStatePartitions(createReverbState(4.0f, 0.8f), {64}, 4096, true);
  const auto reverbPartitioned = renderStatePartitions(createReverbState(4.0f, 0.8f), unevenPartitions, 4096, true);
  expect(maximumDifference(reverbReference, reverbPartitioned) < 1.0e-5f,
         "Reverb modulation updates must be independent of host-block "
         "boundaries.");
}

void runQuarantinedNodeBypassTests() {
  const std::vector<padpilot::fx::FxChainState> states{
      createQuarantinedNodeState(padpilot::fx::FX_NODE_TYPE_CONVOLVER),
  };
  for (const auto& state : states) {
    auto explicitlyBypassed = state;
    explicitlyBypassed.mutable_chains(0)->mutable_nodes(0)->set_bypassed(true);
    const auto compatibilityOutput = renderStatePartitions(state, {64}, 1024, false);
    const auto bypassedOutput = renderStatePartitions(explicitlyBypassed, {64}, 1024, false);
    expect(maximumDifference(compatibilityOutput, bypassedOutput) < 1.0e-6f,
           "Compatibility-only FX node types must bypass instead of running "
           "mislabeled DSP.");
  }
}

void runPhaserAudibleDifferenceTest() {
  const auto activeState = createQuarantinedNodeState(padpilot::fx::FX_NODE_TYPE_PHASER);
  auto bypassedState = activeState;
  bypassedState.mutable_chains(0)->mutable_nodes(0)->set_bypassed(true);
  const auto activeOutput = renderStatePartitions(activeState, {64}, 4096, false);
  const auto bypassedOutput = renderStatePartitions(bypassedState, {64}, 4096, false);
  expect(maximumDifference(activeOutput, bypassedOutput) > 0.01f,
         "Active Phaser must audibly differ from explicit bypass through the "
         "public graph state.");
}

void runProModulationNodeTests() {
  const std::vector<padpilot::fx::FxChainState> activeStates{
      createQuarantinedNodeState(padpilot::fx::FX_NODE_TYPE_PHASER),
      createQuarantinedNodeState(padpilot::fx::FX_NODE_TYPE_ROTARY_SPEAKER),
      createPitchDriftState(),
  };
  const std::vector<int> unevenPartitions{7, 31, 97, 1, 53, 130, 19};
  for (const auto& activeState : activeStates) {
    auto bypassedState = activeState;
    bypassedState.mutable_chains(0)->mutable_nodes(0)->set_bypassed(true);
    const auto activeOutput = renderStatePartitions(activeState, {64}, 8192, false);
    const auto bypassedOutput = renderStatePartitions(bypassedState, {64}, 8192, false);
    expect(maximumDifference(activeOutput, bypassedOutput) > 0.01f,
           "Each enabled pro modulation node must audibly differ from explicit "
           "bypass.");
    const auto partitionedOutput = renderStatePartitions(activeState, unevenPartitions, 8192, false);
    expect(maximumDifference(activeOutput, partitionedOutput) < 1.0e-5f,
           "Pro modulation DSP must remain independent of host block "
           "partitioning.");
  }
}

void runProModulationControlTests() {
  auto lowPhaser = createQuarantinedNodeState(padpilot::fx::FX_NODE_TYPE_PHASER);
  auto highPhaser = lowPhaser;
  lowPhaser.mutable_chains(0)->mutable_nodes(0)->mutable_phaser_config()->set_center_frequency_hz(200.0f);
  highPhaser.mutable_chains(0)->mutable_nodes(0)->mutable_phaser_config()->set_center_frequency_hz(5'000.0f);
  expect(maximumDifference(renderStatePartitions(lowPhaser, {64}, 8192, false),
                           renderStatePartitions(highPhaser, {64}, 8192, false)) > 0.01f,
         "Phaser center frequency must change the all-pass response.");

  auto cleanRotary = createQuarantinedNodeState(padpilot::fx::FX_NODE_TYPE_ROTARY_SPEAKER);
  auto drivenRotary = cleanRotary;
  cleanRotary.mutable_chains(0)->mutable_nodes(0)->mutable_rotary_speaker_config()->set_drive(0.0f);
  drivenRotary.mutable_chains(0)->mutable_nodes(0)->mutable_rotary_speaker_config()->set_drive(1.0f);
  expect(maximumDifference(renderStatePartitions(cleanRotary, {64}, 8192, false),
                           renderStatePartitions(drivenRotary, {64}, 8192, false)) > 0.01f,
         "Rotary drive must change the modeled cabinet output.");

  auto narrowDrift = createPitchDriftState();
  auto wideDrift = narrowDrift;
  narrowDrift.mutable_chains(0)->mutable_nodes(0)->mutable_pitch_drift_config()->set_range_cents(8.0f);
  wideDrift.mutable_chains(0)->mutable_nodes(0)->mutable_pitch_drift_config()->set_range_cents(100.0f);
  expect(maximumDifference(renderStatePartitions(narrowDrift, {64}, 8192, false),
                           renderStatePartitions(wideDrift, {64}, 8192, false)) > 0.01f,
         "Pitch Drift range must change the bounded variable-delay motion.");
}

void runToneFlxParityNodeTests() {
  juce::dsp::ProcessSpec spec;
  spec.sampleRate = 48'000.0;
  spec.maximumBlockSize = 4096;
  spec.numChannels = 1;

  ReverseNode reverse;
  reverse.prepare(spec);
  reverse.setWindowMs(50.0f);
  reverse.setForwardMix(0.0f);
  juce::AudioBuffer<float> reverseSignal(1, 4800);
  for (int sample = 0; sample < reverseSignal.getNumSamples(); ++sample) {
    reverseSignal.setSample(0, sample, static_cast<float>(sample) / 4800.0f);
  }
  expect(reverse.process(reverseSignal), "Reverse node should process a captured window.");
  expect(reverseSignal.getSample(0, 3000) > reverseSignal.getSample(0, 4200),
         "Reverse node must play each completed capture window backwards.");

  ModulationNode tremolo;
  tremolo.prepare(spec);
  tremolo.setMode(ModulationNode::Mode::tremolo);
  tremolo.setRateHz(5.0f);
  tremolo.setDepth(1.0f);
  tremolo.setMix(1.0f);
  juce::AudioBuffer<float> tremoloSignal(1, 19'200);
  tremoloSignal.clear();
  for (int sample = 0; sample < tremoloSignal.getNumSamples(); ++sample) tremoloSignal.setSample(0, sample, 1.0f);
  expect(tremolo.process(tremoloSignal), "Tremolo node should process when depth is active.");
  expect(tremoloSignal.getMagnitude(0, 0, tremoloSignal.getNumSamples()) -
                 tremoloSignal.findMinMax(0, 0, tremoloSignal.getNumSamples()).getStart() >
             0.2f,
         "Tremolo must create audible amplitude movement.");

  padpilot::fx::FxChainState baseState;
  configureMaster(baseState);
  auto* chain = baseState.add_chains();
  chain->set_id(81);
  chain->set_mix(1.0f);
  auto* node = chain->add_nodes();
  node->set_id(82);
  node->set_type(padpilot::fx::FX_NODE_TYPE_SATURATION);
  node->set_mix(1.0f);
  auto* saturation = node->mutable_saturation_config();
  saturation->set_drive(0.15f);
  saturation->set_tone(0.5f);
  saturation->set_bias(0.0f);
  saturation->set_character("Tube");
  saturation->set_output_gain_db(0.0f);
  auto* driveParam = node->add_legacy_params();
  driveParam->set_parameter_id(1);
  driveParam->set_value(0.15f);
  driveParam->set_min_value(0.0f);
  driveParam->set_max_value(1.0f);
  driveParam->set_default_value(0.15f);
  auto routedState = baseState;
  auto* modulator = routedState.add_modulators();
  modulator->set_id(1);
  modulator->set_enabled(true);
  modulator->set_shape("Sine");
  modulator->set_rate_hz(7.0f);
  auto* route = routedState.add_modulation_routes();
  route->set_modulator_id(1);
  route->set_chain_id(81);
  route->set_node_id(82);
  route->set_parameter_id(1);
  route->set_depth(1.0f);
  route->set_min_value(0.0f);
  route->set_max_value(1.0f);
  route->set_base_value(0.15f);
  route->set_enabled(true);
  expect(maximumDifference(renderStatePartitions(baseState, {64}, 8192, false),
                           renderStatePartitions(routedState, {64}, 8192, false)) > 0.01f,
         "Public LFO routes must modulate native node parameters.");
}

void runTimingCapacityTests() {
  constexpr double kHighSampleRate = 192'000.0;
  juce::dsp::ProcessSpec spec;
  spec.sampleRate = kHighSampleRate;
  spec.maximumBlockSize = 64;
  spec.numChannels = 1;

  DelayNode freeDelay;
  freeDelay.prepare(spec);
  freeDelay.setWetDry(1.0f, 0.0f);
  freeDelay.setFeedback(0.0f);
  freeDelay.setSyncEnabled(false);
  freeDelay.setTimeHz(1.0f / 1.5f);
  juce::AudioBuffer<float> freeDelaySignal(1, 290'000);
  freeDelaySignal.clear();
  freeDelaySignal.setSample(0, 0, 1.0f);
  expect(freeDelay.process(freeDelaySignal), "High-rate free delay fixture should process.");
  expect(freeDelaySignal.getMagnitude(0, 287'990, 24) > 0.9f,
         "The public 1.5-second free delay must remain available at 192 kHz.");

  DelayNode syncedDelay;
  syncedDelay.prepare(spec);
  syncedDelay.setWetDry(1.0f, 0.0f);
  syncedDelay.setFeedback(0.0f);
  syncedDelay.setHostBpm(20.0);
  syncedDelay.setSyncEnabled(true);
  syncedDelay.setTimeBeats(std::numeric_limits<float>::max());
  juce::AudioBuffer<float> syncedDelaySignal(1, 578'000);
  syncedDelaySignal.clear();
  syncedDelaySignal.setSample(0, 0, 1.0f);
  expect(syncedDelay.process(syncedDelaySignal), "High-rate synced delay fixture should process.");
  expect(syncedDelaySignal.getMagnitude(0, 575'990, 24) > 0.9f,
         "Delay sync must clamp truthfully to its advertised one-beat maximum, "
         "not buffer capacity.");

  ModulationNode modulation;
  modulation.prepare(spec);
  modulation.setMode(ModulationNode::Mode::chorus);
  modulation.setHostBpm(20.0);
  modulation.setRateHz(0.1f);
  modulation.setDepth(0.0f);
  modulation.setBaseDelaySyncEnabled(true);
  modulation.setBaseDelayBeats(std::numeric_limits<float>::max());
  modulation.setFeedback(0.0f);
  modulation.setMix(1.0f);
  juce::AudioBuffer<float> modulationSignal(1, 578'000);
  modulationSignal.clear();
  modulationSignal.setSample(0, 0, 1.0f);
  expect(modulation.process(modulationSignal), "High-rate synced modulation fixture should process.");
  expect(modulationSignal.getMagnitude(0, 575'990, 24) > 0.9f,
         "Chorus voice-delay sync must honor its one-beat maximum at 192 kHz "
         "and 20 BPM.");

  ReverbNode reverb;
  reverb.prepare(spec);
  reverb.setWetDry(1.0f, 0.0f);
  reverb.setHostBpm(20.0);
  reverb.setPreDelaySyncEnabled(true);
  reverb.setPreDelayBeats(std::numeric_limits<float>::max());
  reverb.setDecaySeconds(0.2f);
  reverb.setSize(0.0f);
  reverb.setModulationDepth(0.0f);
  juce::AudioBuffer<float> reverbSignal(1, 610'000);
  reverbSignal.clear();
  reverbSignal.setSample(0, 0, 1.0f);
  expect(reverb.process(reverbSignal), "High-rate synced reverb fixture should process.");
  expect(reverbSignal.getMagnitude(0, 0, 500'000) < 1.0e-6f && reverbSignal.getMagnitude(0, 575'000, 35'000) > 1.0e-6f,
         "Reverb pre-delay sync must honor its one-beat maximum at 192 kHz and "
         "20 BPM.");
}

void runEqMasterGainTest() {
  const auto unity = renderStatePartitions(createEqState(0.0f), {64}, 1024, false);
  const auto boosted = renderStatePartitions(createEqState(6.0f), {64}, 1024, false);
  double unityMagnitude = 0.0;
  double boostedMagnitude = 0.0;
  for (std::size_t index = 128; index < unity.size(); ++index) {
    unityMagnitude += std::abs(unity[index]);
    boostedMagnitude += std::abs(boosted[index]);
  }
  const double ratio = boostedMagnitude / std::max(1.0e-9, unityMagnitude);
  expect(ratio > 1.99 && ratio < 2.01,
         "EQ master gain must apply broadband output gain instead of changing "
         "only the high shelf.");
}

void runControlSensitivityTests() {
  const double bellMagnitude = renderToneMagnitude(createEqBandState("Bell"), 1'000.0f, false);
  const double notchMagnitude = renderToneMagnitude(createEqBandState("Notch"), 1'000.0f, false);
  expect(notchMagnitude < bellMagnitude * 0.1,
         "The public EQ Notch type must reject energy at its configured center "
         "frequency.");

  const double lowCrossoverMagnitude = renderToneMagnitude(createStereoImagerState(40.0f), 100.0f, true);
  const double highCrossoverMagnitude = renderToneMagnitude(createStereoImagerState(400.0f), 100.0f, true);
  expect(highCrossoverMagnitude < lowCrossoverMagnitude * 0.5,
         "Stereo Imager bass-mono crossover must respond to its public "
         "frequency control.");

  juce::dsp::ProcessSpec spec;
  spec.sampleRate = 48'000.0;
  spec.maximumBlockSize = 64;
  spec.numChannels = 2;
  ModulationNode fastSmoothing;
  ModulationNode slowSmoothing;
  for (auto* node : {&fastSmoothing, &slowSmoothing}) {
    node->prepare(spec);
    node->setMode(ModulationNode::Mode::autoPan);
    node->setMix(1.0f);
    node->setRateHz(0.05f);
    node->setAutoPanAmount(1.0f);
    node->setAutoPanShape(ModulationNode::LfoShape::square);
  }
  fastSmoothing.setAutoPanSmoothing(0.0f);
  slowSmoothing.setAutoPanSmoothing(1.0f);
  juce::AudioBuffer<float> fastBlock(2, 64);
  juce::AudioBuffer<float> slowBlock(2, 64);
  for (int channel = 0; channel < 2; ++channel) {
    for (int sample = 0; sample < 64; ++sample) {
      fastBlock.setSample(channel, sample, 1.0f);
    }
  }
  slowBlock.makeCopyOf(fastBlock, true);
  expect(fastSmoothing.process(fastBlock) && slowSmoothing.process(slowBlock),
         "Auto-pan smoothing fixtures should process their wet paths.");
  expect(std::abs(fastSmoothing.getMotionValue()) > std::abs(slowSmoothing.getMotionValue()) * 20.0f,
         "Higher Auto Pan smoothing must produce a slower, sample-rate-aware "
         "response.");
}

void runMalformedFloatTest() {
  ConvolverModuleGraph graph;
  graph.prepare(48'000.0, 64, 2);
  const auto validState = createOrderedState(false);
  graph.applyState(validState);

  auto malformedState = createOrderedState(true);
  malformedState.mutable_master()->set_wet_dry(std::numeric_limits<float>::quiet_NaN());
  malformedState.mutable_chains(1)->set_mix(std::numeric_limits<float>::infinity());
  malformedState.mutable_chains(1)->mutable_nodes(1)->mutable_bitcrusher_config()->set_bits(
      std::numeric_limits<float>::quiet_NaN());
  auto* poisonedParameter = malformedState.mutable_chains(1)->mutable_nodes(1)->add_legacy_params();
  poisonedParameter->set_value(std::numeric_limits<float>::infinity());
  graph.applyState(malformedState);

  const auto snapshot = graph.getTimingSnapshot();
  expect(snapshot.chains[0].chainId == 41 && snapshot.chains[0].nodes[0].nodeId == 11,
         "Malformed non-finite FX state should fail closed without replacing "
         "the valid graph.");
  juce::AudioBuffer<float> block(2, 64);
  for (int channel = 0; channel < block.getNumChannels(); ++channel) {
    for (int sample = 0; sample < block.getNumSamples(); ++sample) {
      block.setSample(channel, sample, 0.3f);
    }
  }
  graph.processBlock(block, 120.0);
  for (int channel = 0; channel < block.getNumChannels(); ++channel) {
    for (int sample = 0; sample < block.getNumSamples(); ++sample) {
      expect(std::isfinite(block.getSample(channel, sample)),
             "Rejected non-finite FX state must not poison Audio Thread output.");
    }
  }
}

void runSharedFxConfigValidationTest() {
  fx::NodeState reverse;
  reverse.set_type(fx::FX_NODE_TYPE_REVERSE);
  reverse.mutable_reverse_config()->set_window_ms(250.0f);
  expect(isValidFxNodeConfig(reverse, true), "Reverse config should pass canonical and graph validation.");

  fx::NodeState tremolo;
  tremolo.set_type(fx::FX_NODE_TYPE_TREMOLO);
  tremolo.mutable_tremolo_config()->set_rate_hz(4.0f);
  expect(isValidFxNodeConfig(tremolo, true), "Tremolo config should pass canonical and graph validation.");
  tremolo.mutable_tremolo_config()->mutable_rate_sync()->set_division_index(20U);
  expect(!isValidFxNodeConfig(tremolo, true), "Tremolo must reject an out-of-range tempo-sync division.");

  fx::NodeState saturation;
  saturation.set_type(fx::FX_NODE_TYPE_SATURATION);
  saturation.mutable_saturation_config()->set_drive(0.5f);
  expect(isValidFxNodeConfig(saturation, true), "Saturation config should pass canonical and graph validation.");
  saturation.mutable_saturation_config()->set_tone(std::numeric_limits<float>::quiet_NaN());
  expect(!isValidFxNodeConfig(saturation, false), "Shared graph validation must reject non-finite saturation state.");

  fx::NodeState missingReverse;
  missingReverse.set_type(fx::FX_NODE_TYPE_REVERSE);
  expect(!isValidFxNodeConfig(missingReverse, true) && isValidFxNodeConfig(missingReverse, false),
         "Canonical validation must require matching config while graph "
         "defaults remain supported.");
}

void runTailEstimateTest() {
  auto delayState = createDelayState();
  const double singleEchoTail = ConvolverModuleGraph::estimateTailLengthSeconds(delayState, 48'000.0);
  delayState.mutable_chains(0)->mutable_nodes(0)->mutable_delay_config()->set_feedback(0.95f);
  const double feedbackTail = ConvolverModuleGraph::estimateTailLengthSeconds(delayState, 48'000.0);
  expect(singleEchoTail >= 0.049 && singleEchoTail <= 0.051,
         "FX graph tail estimate should include one configured delay interval.");
  expect(feedbackTail > singleEchoTail * 100.0,
         "FX graph tail estimate should include feedback decay to the silence "
         "threshold.");

  auto serialTailState = delayState;
  const auto duplicateDelay = serialTailState.chains(0).nodes(0);
  *serialTailState.mutable_chains(0)->add_nodes() = duplicateDelay;
  serialTailState.mutable_chains(0)->mutable_nodes(1)->set_id(32);
  serialTailState.mutable_chains(0)->mutable_nodes(1)->set_order(1);
  const double serialTail = ConvolverModuleGraph::estimateTailLengthSeconds(serialTailState, 48'000.0);
  expect(serialTail > feedbackTail * 1.99 && serialTail < feedbackTail * 2.01,
         "Tail estimation must add serial node tails instead of taking only "
         "the longest node.");

  auto maximumSerialTailState = delayState;
  auto* maximumDelayConfig = maximumSerialTailState.mutable_chains(0)->mutable_nodes(0)->mutable_delay_config();
  maximumDelayConfig->mutable_time_sync()->set_enabled(true);
  maximumDelayConfig->mutable_time_sync()->set_division_index(9);
  const auto maximumDelayNode = maximumSerialTailState.chains(0).nodes(0);
  for (std::uint32_t nodeIndex = 1; nodeIndex < 8; ++nodeIndex) {
    auto* duplicate = maximumSerialTailState.mutable_chains(0)->add_nodes();
    *duplicate = maximumDelayNode;
    duplicate->set_id(31 + nodeIndex);
    duplicate->set_order(nodeIndex);
  }
  const double maximumSerialTail = ConvolverModuleGraph::estimateTailLengthSeconds(maximumSerialTailState, 48'000.0);
  expect(maximumSerialTail > 3'200.0 && maximumSerialTail <= kMaximumFxTailLengthSeconds,
         "Stable host tail bound must cover eight maximum-feedback serial "
         "delay nodes.");
  delayState.mutable_master()->set_wet_dry(0.0f);
  expect(ConvolverModuleGraph::estimateTailLengthSeconds(delayState, 48'000.0) == 0.0,
         "Fully dry FX state should report no processing tail.");

  const auto shortReverb = createReverbState(1.8f, 0.0f);
  const auto longReverb = createReverbState(8.0f, 0.0f);
  const double shortReverbTail = ConvolverModuleGraph::estimateTailLengthSeconds(shortReverb, 48'000.0);
  const double longReverbTail = ConvolverModuleGraph::estimateTailLengthSeconds(longReverb, 48'000.0);
  expect(longReverbTail > shortReverbTail * 4.0,
         "Native tail reporting must honor the public reverb decay range above "
         "1.8 seconds.");

  const auto shortResponse = renderStatePartitions(shortReverb, {64}, 4096, true);
  const auto longResponse = renderStatePartitions(longReverb, {64}, 4096, true);
  expect(maximumDifference(shortResponse, longResponse) > 1.0e-4f,
         "Native reverb DSP must distinguish public decay values above 1.8 "
         "seconds.");

  const double rotaryTail = ConvolverModuleGraph::estimateTailLengthSeconds(
      createQuarantinedNodeState(padpilot::fx::FX_NODE_TYPE_ROTARY_SPEAKER), 48'000.0);
  const double pitchDriftTail = ConvolverModuleGraph::estimateTailLengthSeconds(createPitchDriftState(), 48'000.0);
  expect(rotaryTail >= ModulationNode::kRotaryMaximumDelaySeconds,
         "Rotary tail estimate must include its bounded horn/drum Doppler "
         "delays.");
  expect(pitchDriftTail >= ModulationNode::kPitchDriftMaximumDelaySeconds,
         "Pitch Drift tail estimate must include its bounded variable-delay "
         "window.");
}

void runClickFreeStructuralApplyTest() {
  ConvolverModuleGraph graph;
  graph.prepare(48'000.0, 64, 2);
  graph.applyState(createEqState(12.0f));

  const auto renderConstantBlock = [&graph]() {
    juce::AudioBuffer<float> block(2, 64);
    for (int channel = 0; channel < block.getNumChannels(); ++channel) {
      for (int sample = 0; sample < block.getNumSamples(); ++sample) {
        block.setSample(channel, sample, 0.1f);
      }
    }
    graph.processBlock(block, 120.0);
    return block;
  };

  auto wet = renderConstantBlock();
  expect(wet.getSample(0, 63) > 0.25f, "Structural transition fixture should begin on an observably wet graph.");

  graph.requestStructuralBypass(true);
  float previous = wet.getSample(0, 63);
  float maximumStep = 0.0f;
  for (int blockIndex = 0; blockIndex < 8; ++blockIndex) {
    auto block = renderConstantBlock();
    for (int sample = 0; sample < block.getNumSamples(); ++sample) {
      const auto current = block.getSample(0, sample);
      maximumStep = std::max(maximumStep, std::abs(current - previous));
      previous = current;
    }
  }
  expect(graph.isStructuralBypassComplete() && std::abs(previous - 0.1f) < 1.0e-3f,
         "Structural bypass should converge to transparent dry audio before "
         "mutation.");
  expect(maximumStep < 0.01f, "Structural bypass should ramp without a sample discontinuity.");

  graph.applyState(createEqState(-12.0f));
  graph.requestStructuralBypass(false);
  previous = 0.1f;
  maximumStep = 0.0f;
  for (int blockIndex = 0; blockIndex < 8; ++blockIndex) {
    auto block = renderConstantBlock();
    for (int sample = 0; sample < block.getNumSamples(); ++sample) {
      const auto current = block.getSample(0, sample);
      maximumStep = std::max(maximumStep, std::abs(current - previous));
      previous = current;
    }
  }
  expect(!graph.isStructuralBypassComplete() && previous < 0.05f,
         "Structural apply should ramp from dry into the replacement graph.");
  expect(maximumStep < 0.01f,
         "Replacement graph publication should not create "
         "a sample discontinuity.");
}

void runManagedConvolverTest() {
  const auto root = juce::File::getSpecialLocation(juce::File::tempDirectory)
                        .getNonexistentChildFile("padpilot-convolver-test", {}, false);
  expect(root.createDirectory(), "Convolver test should create its temporary directory.");
  const auto irFile = root.getChildFile("delayed-impulse.wav");
  {
    juce::WavAudioFormat format;
    auto stream = irFile.createOutputStream();
    auto* releasedStream = stream.release();
    std::unique_ptr<juce::AudioFormatWriter> writer(format.createWriterFor(releasedStream, 48'000.0, 1, 16, {}, 0));
    expect(writer != nullptr, "Convolver test should create its impulse fixture.");
    juce::AudioBuffer<float> impulse(1, 64);
    impulse.clear();
    impulse.setSample(0, 0, -1.0f);
    impulse.setSample(0, 24, 0.5f);
    expect(writer->writeFromAudioSampleBuffer(impulse, 0, impulse.getNumSamples()),
           "Convolver test should write its impulse fixture.");
  }

  auto makeState = [&](bool bypassed) {
    padpilot::fx::FxChainState state;
    configureMaster(state);
    auto* chain = state.add_chains();
    chain->set_id(61);
    chain->set_mix(1.0f);
    auto* node = chain->add_nodes();
    node->set_id(41);
    node->set_type(padpilot::fx::FX_NODE_TYPE_CONVOLVER);
    node->set_mix(1.0f);
    node->set_bypassed(bypassed);
    auto* config = node->mutable_convolver_config();
    config->set_blend(1.0f);
    config->set_ir_id("0123456789abcdef0123456789abcdef");
    config->set_ir_source_name("delayed-impulse.wav");
    config->set_ir_source_path(irFile.getFullPathName().toStdString());
    return state;
  };

  const auto renderImpulse = [](ConvolverModuleGraph& graph) {
    std::vector<float> rendered;
    juce::AudioBuffer<float> warmup(2, 64);
    warmup.clear();
    graph.processBlock(warmup, 120.0);
    for (int blockIndex = 0; blockIndex < 16; ++blockIndex) {
      juce::AudioBuffer<float> block(2, 64);
      block.clear();
      if (blockIndex == 0) {
        block.setSample(0, 0, 1.0f);
        block.setSample(1, 0, 1.0f);
      }
      graph.processBlock(block, 120.0);
      for (int sample = 0; sample < block.getNumSamples(); ++sample) {
        rendered.push_back(block.getSample(0, sample));
      }
    }
    return rendered;
  };

  ConvolverModuleGraph graph;
  graph.prepare(48'000.0, 64, 2);
  graph.applyState(makeState(false));
  juce::Thread::sleep(500);
  const auto wet = renderImpulse(graph);
  expect(wet.front() < -0.1f ||
             std::any_of(wet.begin() + 1, wet.end(), [](float value) { return std::abs(value) > 1.0e-4f; }),
         "Managed Convolver should produce an audible impulse response "
         "distinct from dry bypass.");

  graph.applyState(makeState(true));
  const auto bypassed = renderImpulse(graph);
  expect(std::abs(bypassed.front() - 1.0f) < 1.0e-4f, "Bypassed Convolver should restore the dry impulse.");

  graph.applyState(makeState(false));
  juce::Thread::sleep(500);
  const auto restored = renderImpulse(graph);
  expect(restored.front() < -0.1f ||
             std::any_of(restored.begin() + 1, restored.end(), [](float value) { return std::abs(value) > 1.0e-4f; }),
         "Restored Convolver state should reload its per-node managed impulse.");
  root.deleteRecursively();
}

}  // namespace

void runFxGraphNativeTests() {
  runParallelUnityGainTest();
  runRealtimeMixAndToggleTest();
  runRestoreAndReorderTests();
  runPresetRoundTripTest();
  runPartitionAndDelayBoundTests();
  runQuarantinedNodeBypassTests();
  runPhaserAudibleDifferenceTest();
  runProModulationNodeTests();
  runProModulationControlTests();
  runToneFlxParityNodeTests();
  runTimingCapacityTests();
  runEqMasterGainTest();
  runControlSensitivityTests();
  runMalformedFloatTest();
  runSharedFxConfigValidationTest();
  runTailEstimateTest();
  runClickFreeStructuralApplyTest();
  runManagedConvolverTest();
}

}  // namespace padpilot::tests
