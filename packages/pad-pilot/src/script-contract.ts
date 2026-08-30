export const PADPILOT_SCRIPT_AUDIO_COMMANDS = [
  "setConvolverWetDry",
  "setDelayWetDry",
  "setDelayTimeBeats",
  "setDelayTimeHz",
  "setDelaySyncEnabled",
  "setDelayFeedback",
  "setDelayLowCutHz",
  "setDelayHighCutHz",
  "setDelayWidth",
  "setReverbWetDry",
  "setReverbPreDelayMs",
  "setReverbDecaySeconds",
  "setReverbSize",
  "setReverbDampening",
  "setReverbWidth",
  "setModulationRateHz",
  "setModulationDepth",
  "setModulationFeedback",
  "setModulationMix",
  "setModulationStereoPhase",
  "setModulationMode",
  "setEqBandCount",
  "setEqBandType",
  "setEqBandFrequency",
  "setEqBandGainDb",
  "setEqBandQ",
  "setEqBandEnabled",
  "setFxChainEnabled",
  "setFxChainMix",
  "setFxChainGainDb",
  "setFxChainOrder",
  "setFxChainMuted",
  "setFxChainSolo",
  "setFxNodeBypassed",
  "setFxNodeMix",
  "setFxNodeParamFloat",
  "setMasterInputGainDb",
  "setMasterWetDry",
  "setOutputGainDb",
] as const;

export type PadPilotScriptAudioCommandName = typeof PADPILOT_SCRIPT_AUDIO_COMMANDS[number];

export type PadPilotScriptInputEvent = {
  controlId: number;
  deviceSlot: number;
  frameIndex: number;
  mappedControlActive: boolean;
  mappedControlId: number;
  mappedType: "axis" | "button";
  type: "axis" | "button";
  value: number;
};

export type PadPilotScriptAction =
  | {
      type: "keystroke";
      keyCode: number;
      isKeyDown: boolean;
    }
  | {
      type: "audioCommand";
      command: PadPilotScriptAudioCommandName;
      parameterId?: number;
      value?: number;
      valueB?: number;
      boolValue?: boolean;
      text?: string;
    };

export type PadPilotScriptModule = {
  healthCheck: () => boolean;
  moduleApiVersion: string;
  onInput: (event: PadPilotScriptInputEvent) => PadPilotScriptAction | null;
  upgradeState?: (stateJson: string, fromSchemaVersion: number, toSchemaVersion: number) => string;
};

export function registerPadPilotScriptModule(options: {
  module: PadPilotScriptModule;
  target?: object;
}) {
  const target = options.target ?? globalThis;
  Object.defineProperties(target, {
    padpilotGetModuleManifest: {
      configurable: true,
      value: () => ({ moduleApiVersion: options.module.moduleApiVersion }),
    },
    padpilotHealthCheck: {
      configurable: true,
      value: options.module.healthCheck,
    },
    padpilotOnInput: {
      configurable: true,
      value: options.module.onInput,
    },
    ...(options.module.upgradeState
      ? {
          padpilotOnUpgradeState: {
            configurable: true,
            value: options.module.upgradeState,
          },
        }
      : {}),
  });
  return target;
}
