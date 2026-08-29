import { FxNodeType } from "../../../proto/generated/fx-chain-pb";
import type { FxNodeFocusRenderer, FxNodeRackVisualizerRenderer, FxNodeRendererDefinition } from "./renderer-types";
import {
  renderAutoPanNodeEditor,
  renderAutoPanRackVisualizer,
  renderBitcrusherNodeEditor,
  renderBitcrusherRackVisualizer,
  renderChorusNodeEditor,
  renderChorusRackVisualizer,
  renderCompressorNodeEditor,
  renderCompressorRackVisualizer,
  renderConvolverNodeEditor,
  renderConvolverRackVisualizer,
  renderDelayNodeEditor,
  renderDelayRackVisualizer,
  renderEqNodeEditor,
  renderEqRackVisualizer,
  renderExciterNodeEditor,
  renderExciterRackVisualizer,
  renderNoiseGateNodeEditor,
  renderNoiseGateRackVisualizer,
  renderPhaserNodeEditor,
  renderPhaserRackVisualizer,
  renderPitchDriftNodeEditor,
  renderPitchDriftRackVisualizer,
  renderReverbNodeEditor,
  renderReverbRackVisualizer,
  renderRotarySpeakerNodeEditor,
  renderRotarySpeakerRackVisualizer,
  renderStandardNodeEditor,
  renderStandardRackVisualizer,
  renderStereoImagerNodeEditor,
  renderStereoImagerRackVisualizer,
  renderTapeSaturationNodeEditor,
  renderTapeSaturationRackVisualizer,
  renderTransientShaperNodeEditor,
  renderTransientShaperRackVisualizer,
} from "./renderers";

function createNodeRenderers(
  renderEditor: FxNodeFocusRenderer<any, any>,
  renderVisualizer: FxNodeRackVisualizerRenderer<any>,
) {
  return {
    renderEditor,
    renderRack: (props) => props.renderStandardRack(),
    renderVisualizer,
  } satisfies FxNodeRendererDefinition<any, any>;
}

const STANDARD_NODE_RENDERERS = createNodeRenderers(renderStandardNodeEditor, renderStandardRackVisualizer);

const FX_NODE_RENDERER_MAP = new Map<FxNodeType, FxNodeRendererDefinition<any, any>>([
  [FxNodeType.COMPRESSOR, createNodeRenderers(renderCompressorNodeEditor, renderCompressorRackVisualizer)],
  [FxNodeType.EQ, createNodeRenderers(renderEqNodeEditor, renderEqRackVisualizer)],
  [FxNodeType.TRANSIENT_SHAPER, createNodeRenderers(renderTransientShaperNodeEditor, renderTransientShaperRackVisualizer)],
  [FxNodeType.NOISE_GATE, createNodeRenderers(renderNoiseGateNodeEditor, renderNoiseGateRackVisualizer)],
  [FxNodeType.CONVOLVER, createNodeRenderers(renderConvolverNodeEditor, renderConvolverRackVisualizer)],
  [FxNodeType.DELAY, createNodeRenderers(renderDelayNodeEditor, renderDelayRackVisualizer)],
  [FxNodeType.REVERB, createNodeRenderers(renderReverbNodeEditor, renderReverbRackVisualizer)],
  [FxNodeType.TAPE_SATURATION, createNodeRenderers(renderTapeSaturationNodeEditor, renderTapeSaturationRackVisualizer)],
  [FxNodeType.BITCRUSHER, createNodeRenderers(renderBitcrusherNodeEditor, renderBitcrusherRackVisualizer)],
  [FxNodeType.EXCITER, createNodeRenderers(renderExciterNodeEditor, renderExciterRackVisualizer)],
  [FxNodeType.CHORUS, createNodeRenderers(renderChorusNodeEditor, renderChorusRackVisualizer)],
  [FxNodeType.PHASER, createNodeRenderers(renderPhaserNodeEditor, renderPhaserRackVisualizer)],
  [FxNodeType.AUTO_PAN, createNodeRenderers(renderAutoPanNodeEditor, renderAutoPanRackVisualizer)],
  [FxNodeType.ROTARY_SPEAKER, createNodeRenderers(renderRotarySpeakerNodeEditor, renderRotarySpeakerRackVisualizer)],
  [FxNodeType.STEREO_IMAGER, createNodeRenderers(renderStereoImagerNodeEditor, renderStereoImagerRackVisualizer)],
  [FxNodeType.PITCH_DRIFT, createNodeRenderers(renderPitchDriftNodeEditor, renderPitchDriftRackVisualizer)],
  [FxNodeType.REVERSE, STANDARD_NODE_RENDERERS],
  [FxNodeType.TREMOLO, STANDARD_NODE_RENDERERS],
  [FxNodeType.SATURATION, STANDARD_NODE_RENDERERS],
]);

export function getNodeRenderers(type: FxNodeType) {
  return FX_NODE_RENDERER_MAP.get(type) ?? STANDARD_NODE_RENDERERS;
}
