import { getLatestHostState } from "../bridge";
import { moduleSdk } from "../module-sdk";
import { bytesToBase64 } from "../proto/base64";
import {
  createCapabilityHandle,
  resolveSelectedCapabilityModuleId,
} from "@hyperfocus/pad-pilot/module-identity";

const MAX_MIDI_DRAG_BYTES = 2097152;

function selectedMidiExportModuleId() {
  return resolveSelectedCapabilityModuleId(getLatestHostState(), "midi-export");
}

function safeMidiFilename(filename: string) {
  const safe = filename.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/(^-|-$)/g, "");
  if (!safe) {
    return "padpilot-generated.mid";
  }
  return safe.toLowerCase().endsWith(".mid") ? safe : `${safe}.mid`;
}

export const midi = {
  beginDrag(midiData: Uint8Array, filename = "padpilot.mid") {
    const moduleId = selectedMidiExportModuleId();
    if (!moduleId || midiData.length === 0 || midiData.length > MAX_MIDI_DRAG_BYTES) {
      return false;
    }
    const payload = new TextEncoder().encode(JSON.stringify({
      filename: safeMidiFilename(filename).slice(0, 256),
      midiBase64: bytesToBase64(midiData),
    }));
    moduleSdk.sendCapabilityIntent(
      "midi-export",
      createCapabilityHandle("midi-export", moduleId),
      "begin-drag-bytes",
      bytesToBase64(payload),
    );
    return true;
  },
};
