import { Button } from "../components/elements/button";
import { ButtonGroup } from "../components/elements/button-group/button-group";
import { Dropdown } from "../components/elements/dropdown";
import { DraggableCard } from "../components/elements/draggable-card";
import { Drawer } from "../components/elements/drawer";
import { EnvelopeVisualizer } from "../components/elements/envelope-visualizer";
import { CheckboxField } from "../components/elements/checkbox-field";
import { FileUploadDropzone, FileUploadInput } from "../components/elements/file-upload-dropzone";
import { HotkeyMacroField } from "../components/elements/hotkey-macro-field";
import { Knob } from "../components/elements/knob";
import { Meter } from "../components/elements/meter";
import { MidiExport } from "../components/elements/midi-export";
import { Modal } from "../components/elements/modal";
import { NoteHeatmap } from "../components/elements/note-heatmap";
import { OverlayRoot } from "../components/elements/overlay-root";
import { PreferencePanel } from "../components/elements/preference-panel";
import { SearchableCombobox } from "../components/elements/searchable-combobox";
import { Slider } from "../components/elements/slider";
import { StreamingTextBox } from "../components/elements/streaming-text-box";
import { Style } from "../components/elements/style";
import { Tab, TabList } from "../components/elements/tab";
import { TextAreaField } from "../components/elements/text-area-field";
import { TextField } from "../components/elements/text-field";
import { Toggle } from "../components/elements/toggle";
import { ToggleButton } from "../components/elements/toggle-button";
import { Toast } from "../components/elements/toast";
import { WaveformView } from "../components/elements/waveform-view";
import { analyzer, useAnalyzerFeed } from "./analyzer";
import { askAgent } from "./agent";
import { host } from "./host";
import { midi } from "./midi";
import { HostBpmButton, MidiDragBlock } from "./primitives";
import { getLatestHostState, installHostModuleBundle } from "../bridge";
import { fxGraph, fxVisualizer } from "./fx-capabilities";
import { hotkeys } from "./hotkeys";
import { createProducerActions } from "./producer-actions";
import { publicSampleCapabilities, sampleCapabilities } from "./sample-capabilities";
import { registerModuleStateCodec } from "../proto/registry";
import {
  IO,
  ModuleSurface,
  PadPilotProvider,
  useControllerConfig,
  useEditorViewState,
  useGamepad,
  useInputDevices,
  useMidi,
  useModuleInteraction,
  useModuleState,
  useProfile,
} from "./provider";

export {
  askAgent,
  analyzer,
  host,
  hotkeys,
  HostBpmButton,
  MidiDragBlock,
  sampleCapabilities,
  IO,
  ModuleSurface,
  PadPilotProvider,
  useControllerConfig,
  useEditorViewState,
  useGamepad,
  useInputDevices,
  useMidi,
  useModuleInteraction,
  useModuleState,
  useProfile,
  registerModuleStateCodec,
  fxGraph,
  fxVisualizer,
  midi,
  createProducerActions,
};

const moduleRuntime = {
  getActiveModule() {
    const latest = getLatestHostState();
    const activeModuleId = latest.selectedModuleId ?? latest.activeModuleId ?? "";
    return (latest.modules ?? []).find((moduleItem) => moduleItem.id === activeModuleId) ?? null;
  },
  listInstalled() {
    return [...(getLatestHostState().modules ?? [])];
  },
  async installBundle(bundlePath?: string) {
    const resolvedBundlePath = bundlePath ?? (await IO.pickFile({
      patterns: "*.zip;*.padpilot-module.zip",
      title: "Select PadPilot module bundle",
    }));
    if (!resolvedBundlePath) {
      return null;
    }
    try {
      const installedModule = await installHostModuleBundle(resolvedBundlePath);
      window.dispatchEvent(new CustomEvent("padpilot-module-install-result", {
        detail: {
          module: installedModule,
          path: resolvedBundlePath,
          success: true,
        },
      }));
      return installedModule;
    } catch (error) {
      window.dispatchEvent(new CustomEvent("padpilot-module-install-result", {
        detail: {
          error: error instanceof Error ? error.message : "Unknown install error.",
          path: resolvedBundlePath,
          success: false,
        },
      }));
      throw error;
    }
  },
};

// Shared PadPilot elements own button semantics; module code should consume them
// instead of inventing private tooltip/accessibility conventions.
export const PadPilot = {
  Knob,
  Slider,
  StreamingTextBox,
  Dropdown,
  DraggableCard,
  Drawer,
  CheckboxField,
  Button,
  ButtonGroup,
  Toggle,
  ToggleButton,
  Toast,
  Meter,
  MidiExport,
  Modal,
  NoteHeatmap,
  OverlayRoot,
  PreferencePanel,
  SearchableCombobox,
  Style,
  Tab,
  TabList,
  TextAreaField,
  TextField,
  EnvelopeVisualizer,
  FileUploadDropzone,
  FileUploadInput,
  HotkeyMacroField,
  WaveformView,
  HostBpmButton,
  MidiDragBlock,
  IO,
  agent: {
    ask: askAgent,
  },
  askAgent,
  analyzer,
  host,
  hotkeys,
  midi,
  createProducerActions,
  modules: moduleRuntime,
  registerModuleStateCodec,
  sampleCapabilities,
  capabilities: {
    ...publicSampleCapabilities,
    fxGraph,
    fxVisualizer,
    sample: sampleCapabilities,
  },
  hooks: {
    useMidi,
    useGamepad,
    useInputDevices,
    useControllerConfig,
    useModuleInteraction,
    useModuleState,
    useEditorViewState,
    useProfile,
    useAnalyzerFeed,
  },
};

declare global {
  interface Window {
    PadPilot?: typeof PadPilot;
  }
}

if (typeof window !== "undefined") {
  window.PadPilot = PadPilot;
}
