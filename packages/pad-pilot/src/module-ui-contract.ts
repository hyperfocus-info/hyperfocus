import type { PadPilotModuleManifest } from "./module-manifest";
import { canonicalModuleId } from "./module-identity";

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

export type PadPilotStateReader<T> = (value: unknown) => T;

export function createPadPilotModuleStateIdentity<T>(options: {
  moduleId: string;
  codec: PadPilotModuleStateCodec<T>;
  read: PadPilotStateReader<T>;
}) {
  const { codec, read } = options;
  return Object.freeze({
    moduleId: canonicalModuleId(options.moduleId), read,
    encode: (value: T) => codec.encode(value),
    decode: (bytes: Uint8Array) => read(codec.decode(bytes)),
    unknownCodec: Object.freeze({
      decode: (bytes: Uint8Array): unknown => read(codec.decode(bytes)),
      encode: (value: unknown) => codec.encode(read(value)),
    }),
  });
}

export type PadPilotModuleStateIdentity<T> = ReturnType<typeof createPadPilotModuleStateIdentity<T>>;

export type PadPilotRegisterModuleStateCodec = <T>(
  moduleId: string,
  codec: PadPilotModuleStateCodec<T>,
  read: PadPilotStateReader<T>,
) => PadPilotModuleStateIdentity<T>;

export type PadPilotModuleRegistrationContext = {
  module: PadPilotInstalledModuleSummary;
  registerModuleStateCodec: PadPilotRegisterModuleStateCodec;
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
