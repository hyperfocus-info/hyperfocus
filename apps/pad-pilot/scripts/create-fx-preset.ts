import { create, fromJson, toBinary } from "@bufbuild/protobuf";
import path from "node:path";
import { FxNodeType, NodePresetFileSchema, NodeStateSchema } from "../ui/src/proto/generated/fx-chain-pb";
import { requireArg, parseJsonArg, slugify, validatePresetId, validatePresetName, writePresetFile } from "./preset-utils";

type NodePresetJson = {
  id?: string;
  name?: string;
  order?: number;
  mix?: number;
};

const FX_CHAIN_SCHEMA_VERSION = 4;

function normalizeNodeType(value: string) {
  const raw = value.trim();
  const enumName = raw.startsWith("FX_NODE_TYPE_")
    ? raw
    : `FX_NODE_TYPE_${raw.replace(/[-\s]+/g, "_").toUpperCase()}`;
  const folderName = enumName.replace(/^FX_NODE_TYPE_/, "").toLowerCase().replace(/_/g, "-");
  if (!(enumName in FxNodeType)) {
    throw new Error(`Unknown FX node type: ${value}`);
  }
  return { enumName, folderName };
}

async function main() {
  const nodeTypeArg = requireArg(Bun.argv[2], "Usage: bun run create-fx-preset <nodeType> '<payload-json>'");
  const payloadArg = requireArg(Bun.argv.slice(3).join(" "), "Usage: bun run create-fx-preset <nodeType> '<payload-json>'");
  const payload = parseJsonArg<NodePresetJson>(payloadArg);
  const { enumName, folderName } = normalizeNodeType(nodeTypeArg);
  const presetName = validatePresetName(payload.name ?? folderName);
  const presetId = validatePresetId(payload.id ?? slugify(presetName));
  const node = fromJson(NodeStateSchema, {
    id: 1,
    order: 0,
    mix: 1,
    ...payload,
    type: enumName,
  } as never);
  const preset = create(NodePresetFileSchema, {
    id: presetId,
    name: presetName,
    node,
    nodeType: node.type,
    schemaVersion: FX_CHAIN_SCHEMA_VERSION,
  });
  const bytes = toBinary(NodePresetFileSchema, preset);
  const outDir = path.join(path.resolve(import.meta.dir, ".."), "ui", "public", "fx", "nodes", folderName, "presets");
  const fileName = `${presetId}.preset`;

  await writePresetFile(outDir, fileName, bytes, {
    file: fileName,
    id: presetId,
    name: presetName,
  });

  console.log(`Wrote FX preset ${folderName}/${fileName} (${bytes.length} bytes)`);
}

if (import.meta.main) {
  await main();
}
