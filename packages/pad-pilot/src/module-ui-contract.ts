import type { PadPilotModuleManifest } from "./module-manifest";

export type PadPilotInstalledModuleSummary = {
  capabilities?: string[];
  expectedModuleVersion?: string;
  id: string;
  loadErrorMessage?: string;
  loadStatus?: string;
  name: string;
  resolvedModuleVersion?: string;
  scriptEntryPath?: string;
  uiEntryPath?: string;
  version?: string;
};

export type PadPilotModuleStateCodec<T> = {
  decode: (bytes: Uint8Array) => T;
  encode: (value: T) => Uint8Array;
};

export type PadPilotModuleRegistrationContext = {
  module: PadPilotInstalledModuleSummary;
  registerModuleStateCodec: <T>(
    moduleId: string,
    codec: PadPilotModuleStateCodec<T>,
  ) => void;
};

export type PadPilotModuleDefinition<Component = unknown> = {
  Component: Component;
  manifest: PadPilotModuleManifest;
  register?: (context: PadPilotModuleRegistrationContext) => void;
};

export function definePadPilotModule<const Component>(
  definition: PadPilotModuleDefinition<Component>,
) {
  return definition;
}
