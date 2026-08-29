export type DevSignalProfile = "idle" | "steady-tone" | "pulsed-groove" | "noise-burst" | "sweep";

export type DevSignalSettings = {
  continuousHostSync: boolean;
  intensity: number;
  profile: DevSignalProfile;
  running: boolean;
  stereoWidth: number;
  tempo: number;
};

export type DevSignalFrame = {
  energy: number;
  leftEnergy: number;
  modulation: number;
  noise: number;
  phase: number;
  rightEnergy: number;
  spectrumTilt: number;
  spread: number;
  transient: number;
};

export type DevHostDebugState = {
  acceptedRevision: bigint;
  browserGamepadSupported: boolean;
  connectedControllerCount: number;
  continuousHostSync: boolean;
  intensity: number;
  profile: DevSignalProfile;
  running: boolean;
  selectedModuleId: string;
  selectedPresetId: string;
  sequence: bigint;
  stereoWidth: number;
  tempo: number;
};
