import { canonicalModuleId } from "@hyperfocus/pad-pilot/module-identity";

export type ModuleStateCodec<T> = {
  decode: (bytes: Uint8Array) => T;
  encode: (value: T) => Uint8Array;
};

const codecs = new Map<string, ModuleStateCodec<unknown>>();

export function registerModuleStateCodec<T>(moduleId: string, codec: ModuleStateCodec<T>) {
  codecs.set(canonicalModuleId(moduleId), codec as ModuleStateCodec<unknown>);
}

export function getModuleStateCodec<T>(moduleId: string) {
  return codecs.get(canonicalModuleId(moduleId)) as ModuleStateCodec<T> | undefined;
}
