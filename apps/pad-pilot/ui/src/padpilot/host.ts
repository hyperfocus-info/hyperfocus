import { getLatestHostState } from "../bridge";
import { moduleSdk } from "../module-sdk";
import { textToBase64 } from "../proto/base64";
import { clampInteger } from "../utils/math";
import { createCapabilityHandle, resolveSelectedCapabilityModuleId } from "@hyperfocus/pad-pilot/module-identity";

function clampBpm(value: number) {
  return Number.isFinite(value) ? clampInteger(value, 20, 320) : 120;
}

export const host = {
  setTempo(bpm: number) {
    const hostState = getLatestHostState();
    const moduleId = resolveSelectedCapabilityModuleId(hostState, "host-tempo");
    const handle = createCapabilityHandle("host-tempo", moduleId);
    if (!handle) {
      return false;
    }
    moduleSdk.sendCapabilityIntent(
      "host-tempo",
      handle,
      "set",
      textToBase64(String(clampBpm(bpm))),
    );
    return true;
  },
  getProjectBpm() {
    return clampBpm(getLatestHostState().projectBpm ?? 120);
  },
};
