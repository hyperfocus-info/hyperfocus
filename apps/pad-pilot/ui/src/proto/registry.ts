import { canonicalModuleId } from "@hyperfocus/pad-pilot/module-identity";
import type { PadPilotModuleStateCodec, PadPilotStateReader } from "@hyperfocus/pad-pilot/module-ui-contract";
import { createPadPilotModuleStateIdentity } from "@hyperfocus/pad-pilot/module-ui-contract";

export type ModuleStateCodec<T> = PadPilotModuleStateCodec<T>;

const codecs = new Map<string, ModuleStateCodec<unknown>>();

export function registerModuleStateCodec<T>(moduleId: string, codec: ModuleStateCodec<T>, read: PadPilotStateReader<T>) {
  const identity = createPadPilotModuleStateIdentity({ moduleId, codec, read });
  codecs.set(identity.moduleId, identity.unknownCodec);
  return identity;
}

export function getModuleStateCodec(moduleId: string) {
  return codecs.get(canonicalModuleId(moduleId));
}
