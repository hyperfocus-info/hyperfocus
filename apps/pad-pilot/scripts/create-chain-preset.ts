import path from "node:path";
import { FxChainStateSchema } from "../ui/src/proto/generated/fx-chain-pb";
import { requireArg, parseJsonArg, binaryFromProtoJson, slugify, validatePresetId, validatePresetName, writePresetFile } from "./preset-utils";

type ChainPresetJson = {
  name?: string;
  selected_preset_id?: string;
  selectedPresetId?: string;
};

async function main() {
  const payloadArg = requireArg(Bun.argv.slice(2).join(" "), "Usage: bun run create-chain-preset '<payload-json>'");
  const payload = parseJsonArg<ChainPresetJson>(payloadArg);
  const presetId = validatePresetId(payload.selected_preset_id ?? payload.selectedPresetId ?? slugify(payload.name ?? "chain-preset"));
  const presetName = validatePresetName(payload.name ?? presetId);
  const fileName = `${presetId}.preset`;
  const outDir = path.join(path.resolve(import.meta.dir, ".."), "ui", "public", "fx", "chains", "presets");
  const bytes = binaryFromProtoJson(FxChainStateSchema, payload);

  await writePresetFile(outDir, fileName, bytes, {
    file: fileName,
    id: presetId,
    name: presetName,
  });

  console.log(`Wrote chain preset ${fileName} (${bytes.length} bytes)`);
}

if (import.meta.main) {
  await main();
}
