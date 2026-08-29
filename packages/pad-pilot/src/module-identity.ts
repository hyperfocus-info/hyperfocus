type ModuleIdentityState = {
  activeModuleId?: string;
  modules?: readonly {
    capabilities?: readonly string[];
    id: string;
    loadStatus?: string;
  }[];
  selectedModuleId?: string;
};

export const MAX_CAPABILITY_HANDLE_BYTES = 512;
export const MAX_CAPABILITY_ID_BYTES = 64;
export const MAX_MODULE_ID_BYTES = 128;

const CAPABILITY_ID_PATTERN = /^[a-z0-9-]+$/;
const MODULE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidCapabilityId(capability: string) {
  return capability.length <= MAX_CAPABILITY_ID_BYTES && CAPABILITY_ID_PATTERN.test(capability);
}

export function isValidModuleId(moduleId: string) {
  return moduleId.length <= MAX_MODULE_ID_BYTES && MODULE_ID_PATTERN.test(moduleId);
}

export function parseCapabilityHandle(handle: string) {
  const segments = handle.split("::");
  const [moduleInstanceId = "", capability = "", slot = ""] = segments;
  return {
    capability,
    moduleInstanceId,
    slot,
    valid: segments.length === 3 &&
      segments.every((segment) => segment.length > 0) &&
      isValidModuleId(moduleInstanceId) &&
      isValidCapabilityId(capability) &&
      new TextEncoder().encode(handle).length <= MAX_CAPABILITY_HANDLE_BYTES,
  };
}

export function canonicalModuleId(moduleId: string) {
  return moduleId === "reverb" ? "fx" : moduleId;
}

export function moduleIdAliases(moduleId: string) {
  const canonical = canonicalModuleId(moduleId);
  return canonical === "fx" ? ["fx", "reverb"] : [canonical];
}

export function createCapabilityHandle(capability: string, moduleId: string, slot = "primary") {
  const canonicalId = canonicalModuleId(moduleId);
  const handle = `${canonicalId}::${capability}::${slot}`;
  return parseCapabilityHandle(handle).valid ? handle : "";
}

export function resolveSelectedCapabilityModuleId(
  state: ModuleIdentityState,
  capabilities: string | readonly string[],
) {
  const selectedModuleId = canonicalModuleId(
    state.selectedModuleId ?? state.activeModuleId ?? "",
  );
  if (!selectedModuleId || !state.modules || state.modules.length === 0) {
    return "";
  }
  const selectedModule = state.modules.find(
    (moduleItem) => canonicalModuleId(moduleItem.id) === selectedModuleId,
  );
  if (!selectedModule || selectedModule.loadStatus !== "ready") {
    return "";
  }
  const required = typeof capabilities === "string" ? [capabilities] : capabilities;
  return required.some((capability) => selectedModule.capabilities?.includes(capability))
    ? selectedModuleId
    : "";
}
