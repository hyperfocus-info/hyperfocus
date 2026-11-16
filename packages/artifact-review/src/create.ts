import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { artifactManifestSchema, type ArtifactItem } from "./schema";

type ArtifactInput = Omit<ArtifactItem, "sha256" | "version" | "sections"> & Partial<Pick<ArtifactItem, "version" | "sections">> & { expectedSha256?: string };

/** Build a review manifest directly from generated files or text. */
export async function createArtifactManifest(options: { id: string; title: string; items: ArtifactInput[] }) {
  const manifest = artifactManifestSchema.parse({ ...options, items: options.items.map((item) => ({ ...item, version: item.version ?? 1, sha256: item.expectedSha256 ?? "0".repeat(64) })) });
  const expected = new Map(options.items.map(item => [item.id, item.expectedSha256]));
  for (const item of manifest.items) {
    if (item.kind === "text") {
      item.sha256 = createHash("sha256").update(item.text ?? "", "utf8").digest("hex");
    } else {
      if (!item.media) throw new Error(`Missing media for ${item.id}`);
      item.media = resolve(item.media);
      const bytes = await Bun.file(item.media).arrayBuffer();
      item.sha256 = createHash("sha256").update(new Uint8Array(bytes)).digest("hex");
    }
    const locked = expected.get(item.id);
    if (locked !== undefined && item.sha256 !== locked) throw new Error(`Source bytes changed for ${item.id}; update the reference hash and version deliberately`);
  }
  return artifactManifestSchema.parse(manifest);
}

export async function createArtifactManifestFile(options: { inputPath: string; outputPath: string }) {
  const inputPath = resolve(options.inputPath), raw: unknown = await Bun.file(inputPath).json();
  if (!raw || typeof raw !== "object" || !("items" in raw) || !Array.isArray(raw.items)) throw new Error("Manifest input needs items");
  const items = raw.items.map((item: unknown) => {
    if (!item || typeof item !== "object") throw new Error("Invalid item");
    const expectedSha256 = "expectedSha256" in item ? item.expectedSha256 : undefined;
    if (expectedSha256 !== undefined && (typeof expectedSha256 !== "string" || !/^[a-f0-9]{64}$/.test(expectedSha256))) throw new Error("Expected lowercase SHA-256 lock");
    return { ...item, expectedSha256, version: "version" in item ? item.version : 1, sha256: "0".repeat(64) };
  });
  const input = artifactManifestSchema.parse({ ...raw, items });
  for (const item of input.items) if (item.media) item.media = resolve(dirname(inputPath), item.media);
  const manifest = await createArtifactManifest({ ...input, items: input.items.map((item, index) => ({ ...item, expectedSha256: items[index]?.expectedSha256 })) });
  await Bun.write(options.outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}
