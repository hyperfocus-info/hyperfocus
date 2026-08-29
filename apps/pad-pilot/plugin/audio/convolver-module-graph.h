#pragma once

#include <array>
#include <atomic>
#include <cstdint>
#include <memory>
#include <string>
#include <vector>

#include <juce_audio_processors/juce_audio_processors.h>

#include "generated/proto/fx-chain.pb.h"
#include "audio/convolver-node.h"
#include "audio/delay-node.h"
#include "audio/modulation-node.h"
#include "audio/parametric-eq-node.h"
#include "audio/reverb-node.h"
#include "audio/reverse-node.h"
#include "runtime/runtime-types.h"

namespace padpilot {

class ConvolverModuleGraph {
 public:
  static constexpr int kMaxChains = static_cast<int>(kMaxFxChains);
  static constexpr int kMaxNodesPerChain = 8;
  static constexpr int kWaveformBins = 24;

  enum class TelemetryMode : std::uint8_t {
    off = 0,
    visible = 1,
    diagnostics = 2,
  };

  struct NodeMeterSnapshot {
    bool active {};
    std::uint32_t chainId {};
    std::uint32_t nodeId {};
    float inputPeakDb {-120.0f};
    float inputPeakDbLeft {-120.0f};
    float inputPeakDbRight {-120.0f};
    float outputPeakDb {-120.0f};
    float outputPeakDbLeft {-120.0f};
    float outputPeakDbRight {-120.0f};
    std::array<float, kWaveformBins> inputWaveform {};
    std::array<float, kWaveformBins> outputWaveform {};
    std::array<float, kWaveformBins> leftSignedWaveform {};
    std::array<float, kWaveformBins> rightSignedWaveform {};
    float motionValue {0.0f};
  };

  struct ChainMeterSnapshot {
    bool active {};
    std::uint32_t chainId {};
    bool muted {};
    bool solo {};
    std::uint32_t activeNodeCount {};
    std::uint64_t totalNs {};
    float inputPeakDb {-120.0f};
    float inputPeakDbLeft {-120.0f};
    float inputPeakDbRight {-120.0f};
    float outputPeakDb {-120.0f};
    float outputPeakDbLeft {-120.0f};
    float outputPeakDbRight {-120.0f};
    std::array<NodeMeterSnapshot, kMaxNodesPerChain> nodes {};
  };

  struct TimingSnapshot {
    std::uint64_t blocks {};
    std::uint64_t totalNs {};
    std::uint64_t convolverNs {};
    std::uint64_t delayNs {};
    std::uint64_t reverbNs {};
    std::uint64_t reverbPreDelayNs {};
    std::uint64_t reverbCoreNs {};
    std::uint64_t reverbMixNs {};
    std::uint64_t modulationNs {};
    std::uint64_t eqNs {};
    std::uint64_t gainNs {};
    std::uint64_t convolverBypassedBlocks {};
    std::uint64_t delayBypassedBlocks {};
    std::uint64_t reverbBypassedBlocks {};
    float inputPeakDb {-120.0f};
    float inputPeakDbLeft {-120.0f};
    float inputPeakDbRight {-120.0f};
    float convolverPeakDb {-120.0f};
    float delayPeakDb {-120.0f};
    float reverbPeakDb {-120.0f};
    float modulationPeakDb {-120.0f};
    float eqPeakDb {-120.0f};
    float outputPeakDb {-120.0f};
    float outputPeakDbLeft {-120.0f};
    float outputPeakDbRight {-120.0f};
    std::array<ChainMeterSnapshot, kMaxChains> chains {};
  };

  void prepare(double sampleRate, int samplesPerBlock, int numChannels);
  void processBlock(juce::AudioBuffer<float>& buffer, double hostBpm);
  bool applyCommand(const AudioCommand& command);
  void applyState(const padpilot::fx::FxChainState& state);
  static double estimateTailLengthSeconds(const padpilot::fx::FxChainState& state, double sampleRate);
  static bool supportsRealtimeNodeParameter(padpilot::fx::FxNodeType type,
                                            std::uint32_t parameterId) noexcept;
  TimingSnapshot getTimingSnapshot() const noexcept;
  void setProfilingEnabled(bool enabled) noexcept;
  void setTelemetryMode(TelemetryMode mode) noexcept;
  bool isWetPathBypassed() const noexcept;
  void requestStructuralBypass(bool bypassed) noexcept;
  bool isStructuralBypassComplete() const noexcept;

 private:
  enum class FXChainType : std::uint8_t {
    convolver = 0,
    delay = 1,
    reverb = 2,
    modulation = 3,
    eq = 4,
    reverse = 5,
    passthrough = 6,
  };

  static constexpr std::size_t kMaxRealtimeNodeParameters = 32;
  static constexpr std::size_t kMaxModulators = 2;
  static constexpr std::size_t kMaxModulationRoutes = 16;

  enum class ModulatorShape : std::uint8_t {
    sine = 0,
    triangle = 1,
    square = 2,
    random = 3,
  };

  struct ModulatorSlot {
    bool active {false};
    bool syncEnabled {false};
    ModulatorShape shape {ModulatorShape::sine};
    float rateHz {0.25f};
    float rateBeats {1.0f};
    float phase {0.0f};
    float randomValue {0.0f};
    std::uint32_t randomState {0x82a9'3f17U};
  };

  struct ModulationRouteSlot {
    bool active {false};
    std::uint8_t modulatorIndex {0};
    std::uint32_t chainId {0};
    std::uint32_t nodeId {0};
    std::uint32_t parameterId {0};
    float depth {0.0f};
    float minValue {0.0f};
    float maxValue {1.0f};
    float baseValue {0.5f};
  };

  struct NodeProcessors {
    std::unique_ptr<ConvolverNode> convolver;
    std::unique_ptr<DelayNode> delay;
    std::unique_ptr<ReverbNode> reverb;
    std::unique_ptr<ModulationNode> modulation;
    std::unique_ptr<ParametricEqNode> eq;
    std::unique_ptr<ReverseNode> reverse;
  };

  struct NodeSlot {
    std::uint32_t id {};
    std::uint32_t order {};
    bool active {false};
    bool bypassed {false};
    bool muted {false};
    bool solo {false};
    float mix {1.0f};
    FXChainType type {FXChainType::delay};
    padpilot::fx::NodeState sourceState {};
    float envelope {0.0f};
    float phase {0.0f};
    int holdCounter {0};
    std::uint32_t randomState {0x12345678U};
    std::array<float, 2> heldSample {};
    std::array<float, 2> lowState {};
    std::array<float, 2> auxState {};
    std::array<float, kMaxRealtimeNodeParameters> realtimeParameterValues {};
    std::array<bool, kMaxRealtimeNodeParameters> realtimeParameterPresent {};
    float exciterSmoothing {0.08f};
    NodeProcessors processors {};
  };

  struct ChainSlot {
    std::uint32_t id {};
    std::uint32_t order {};
    bool configured {false};
    bool active {false};
    bool muted {false};
    bool solo {false};
    float mix {1.0f};
    float gainLinear {1.0f};
    std::array<NodeSlot, kMaxNodesPerChain> nodes {};
  };

  void clearMeterSnapshots();
  void resetChainSlot(ChainSlot& chain, int slotIndex);
  void ensureNodePrepared(NodeSlot& node);
  void configureNodeDefaults(NodeSlot& node);
  void applyTypedNodeState(NodeSlot& node, const padpilot::fx::NodeState& sourceNode);
  bool applyRealtimeNodeParameter(NodeSlot& node, std::uint32_t parameterId, float value) noexcept;
  void applyModulationRoutes(double hostBpm, int samples) noexcept;
  void updateModulationRouteBase(std::uint32_t chainId, std::uint32_t nodeId,
                                 std::uint32_t parameterId, float value) noexcept;
  float getRealtimeNodeParameter(const NodeSlot& node, std::uint32_t parameterId, float fallback) const noexcept;
  NodeSlot* findFirstNodeOfType(FXChainType type) noexcept;
  void publishTopologySnapshot() noexcept;
  bool processCustomNode(NodeSlot& node, juce::AudioBuffer<float>& buffer);
  bool processNode(NodeSlot& node, juce::AudioBuffer<float>& buffer, double hostBpm, std::uint64_t* elapsedNs = nullptr);
  ChainSlot* findChainById(std::uint32_t chainId) noexcept;
  const ChainSlot* findChainById(std::uint32_t chainId) const noexcept;
  NodeSlot* findNodeById(ChainSlot& chain, std::uint32_t nodeId) noexcept;
  const NodeSlot* findNodeById(const ChainSlot& chain, std::uint32_t nodeId) const noexcept;
  int findChainSlotIndexById(std::uint32_t chainId) const noexcept;
  FXChainType nodeTypeFromIndex(int typeIndex) const noexcept;
  void writeInputWaveformSnapshot(int chainSlotIndex, int nodeSlotIndex, const juce::AudioBuffer<float>& buffer);
  void writeOutputWaveformSnapshot(int chainSlotIndex, int nodeSlotIndex, const juce::AudioBuffer<float>& buffer);
  void writeSignedWaveformSnapshot(int chainSlotIndex, int nodeSlotIndex, const juce::AudioBuffer<float>& buffer);
  void setNodeMotionSnapshot(int chainSlotIndex, int nodeSlotIndex, float motionValue);
  void setNodePeakSnapshot(int chainSlotIndex,
                           int nodeSlotIndex,
                           float inputPeakDb,
                           float inputPeakDbLeft,
                           float inputPeakDbRight,
                           float outputPeakDb,
                           float outputPeakDbLeft,
                           float outputPeakDbRight);
  void setChainPeakSnapshot(int chainSlotIndex,
                            float inputPeakDb,
                            float inputPeakDbLeft,
                            float inputPeakDbRight,
                            float outputPeakDb,
                            float outputPeakDbLeft,
                            float outputPeakDbRight);

  std::array<ChainSlot, kMaxChains> chainSlots_ {};
  std::array<int, kMaxChains> orderedChainSlotIndices_ {};
  std::array<ModulatorSlot, kMaxModulators> modulators_ {};
  std::array<ModulationRouteSlot, kMaxModulationRoutes> modulationRoutes_ {};

  juce::AudioBuffer<float> inputScratch_;
  juce::AudioBuffer<float> outputScratch_;
  juce::AudioBuffer<float> dryNodeScratch_;
  juce::AudioBuffer<float> structuralDryScratch_;
  std::array<juce::AudioBuffer<float>, kMaxChains> chainScratch_ {};

  double sampleRate_ {44100.0};
  int samplesPerBlock_ {0};
  int numChannels_ {0};
  bool prepared_ {false};
  float structuralWetGain_ {1.0f};
  float structuralRampStep_ {1.0f};

  float inputGainLinear_ {1.0f};
  float masterWetDry_ {1.0f};
  float outputGainLinear_ {1.0f};

  std::array<std::atomic<float>, kMaxChains> chainInputPeakDb_ {};
  std::array<std::atomic<float>, kMaxChains> chainInputPeakDbLeft_ {};
  std::array<std::atomic<float>, kMaxChains> chainInputPeakDbRight_ {};
  std::array<std::atomic<float>, kMaxChains> chainOutputPeakDb_ {};
  std::array<std::atomic<float>, kMaxChains> chainOutputPeakDbLeft_ {};
  std::array<std::atomic<float>, kMaxChains> chainOutputPeakDbRight_ {};
  std::array<std::array<std::atomic<float>, kMaxNodesPerChain>, kMaxChains> nodeInputPeakDb_ {};
  std::array<std::array<std::atomic<float>, kMaxNodesPerChain>, kMaxChains> nodeInputPeakDbLeft_ {};
  std::array<std::array<std::atomic<float>, kMaxNodesPerChain>, kMaxChains> nodeInputPeakDbRight_ {};
  std::array<std::array<std::atomic<float>, kMaxNodesPerChain>, kMaxChains> nodeOutputPeakDb_ {};
  std::array<std::array<std::atomic<float>, kMaxNodesPerChain>, kMaxChains> nodeOutputPeakDbLeft_ {};
  std::array<std::array<std::atomic<float>, kMaxNodesPerChain>, kMaxChains> nodeOutputPeakDbRight_ {};
  std::array<std::array<std::array<std::atomic<float>, kWaveformBins>, kMaxNodesPerChain>, kMaxChains> nodeInputWaveform_ {};
  std::array<std::array<std::array<std::atomic<float>, kWaveformBins>, kMaxNodesPerChain>, kMaxChains> nodeOutputWaveform_ {};
  std::array<std::array<std::array<std::atomic<float>, kWaveformBins>, kMaxNodesPerChain>, kMaxChains> nodeLeftSignedWaveform_ {};
  std::array<std::array<std::array<std::atomic<float>, kWaveformBins>, kMaxNodesPerChain>, kMaxChains> nodeRightSignedWaveform_ {};
  std::array<std::array<std::atomic<float>, kMaxNodesPerChain>, kMaxChains> nodeMotionValue_ {};
  std::array<std::atomic<bool>, kMaxChains> snapshotChainActive_ {};
  std::array<std::atomic<std::uint32_t>, kMaxChains> snapshotChainId_ {};
  std::array<std::atomic<bool>, kMaxChains> snapshotChainMuted_ {};
  std::array<std::atomic<bool>, kMaxChains> snapshotChainSolo_ {};
  std::array<std::array<std::atomic<bool>, kMaxNodesPerChain>, kMaxChains> snapshotNodeActive_ {};
  std::array<std::array<std::atomic<bool>, kMaxNodesPerChain>, kMaxChains> snapshotNodeBypassed_ {};
  std::array<std::array<std::atomic<std::uint32_t>, kMaxNodesPerChain>, kMaxChains> snapshotNodeId_ {};

  std::atomic<std::uint64_t> blocks_ {0};
  std::atomic<std::uint64_t> totalNs_ {0};
  std::atomic<std::uint64_t> convolverNs_ {0};
  std::atomic<std::uint64_t> delayNs_ {0};
  std::atomic<std::uint64_t> reverbNs_ {0};
  std::atomic<std::uint64_t> reverbPreDelayNs_ {0};
  std::atomic<std::uint64_t> reverbCoreNs_ {0};
  std::atomic<std::uint64_t> reverbMixNs_ {0};
  std::atomic<std::uint64_t> modulationNs_ {0};
  std::atomic<std::uint64_t> eqNs_ {0};
  std::atomic<std::uint64_t> gainNs_ {0};
  std::array<std::atomic<std::uint64_t>, kMaxChains> chainTotalNs_ {};
  std::atomic<std::uint64_t> convolverBypassedBlocks_ {0};
  std::atomic<std::uint64_t> delayBypassedBlocks_ {0};
  std::atomic<std::uint64_t> reverbBypassedBlocks_ {0};
  std::atomic<float> inputPeakDb_ {-120.0f};
  std::atomic<float> inputPeakDbLeft_ {-120.0f};
  std::atomic<float> inputPeakDbRight_ {-120.0f};
  std::atomic<float> convolverPeakDb_ {-120.0f};
  std::atomic<float> delayPeakDb_ {-120.0f};
  std::atomic<float> reverbPeakDb_ {-120.0f};
  std::atomic<float> modulationPeakDb_ {-120.0f};
  std::atomic<float> eqPeakDb_ {-120.0f};
  std::atomic<float> outputPeakDb_ {-120.0f};
  std::atomic<float> outputPeakDbLeft_ {-120.0f};
  std::atomic<float> outputPeakDbRight_ {-120.0f};
  std::atomic<bool> profilingEnabled_ {false};
  std::atomic<int> telemetryMode_ {static_cast<int>(TelemetryMode::off)};
  std::atomic<bool> telemetryResetRequested_ {false};
  std::atomic<bool> structuralBypassRequested_ {false};
  std::atomic<bool> structuralBypassComplete_ {false};
  std::uint32_t telemetryVisibleIntervalBlocks_ {1};
  std::uint32_t telemetryDiagnosticsIntervalBlocks_ {1};
  std::uint32_t telemetryBlockCounter_ {0};
};

}  // namespace padpilot

