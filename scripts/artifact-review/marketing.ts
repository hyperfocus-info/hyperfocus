import { resolve } from "node:path";
import { artifactManifestSchema } from "@hyperfocus/artifact-review/schema";

/** Marketing review shows rendered videos; concepts and soundtrack sources stay in production. */
export async function createMarketingReview(options: { sourcePath: string }) {
  const source = await Bun.file(options.sourcePath).json();
  const root = resolve(options.sourcePath, "..");
  const dimensions = ["Hook", "Pace", "Product clarity", "Proof", "Sound", "Desire to try"].map(title => ({ id: title.toLowerCase().replaceAll(" ", "-"), title, min: 1, max: 5 }));
  const candidates = source.candidates.filter((item: { video?: string }) => typeof item.video === "string" && /\.(mp4|webm|mov)$/i.test(item.video)).map((item: { id: string; version: number; sha256: string; title: string; description: string; limitation: string; evidence: string; video: string }) => ({
    id: item.id, version: item.version, sha256: item.sha256, title: item.title,
    description: item.description, kind: "video", media: resolve(root, item.video), dimensions,
    text: item.limitation,
    sections: [{ id: "opening", title: "Opening", startSeconds: 0, endSeconds: 2 }, { id: "proof", title: "Evidence", text: item.evidence }, { id: "limitations", title: "Capture limits", text: item.limitation }],
  }));
  return artifactManifestSchema.parse({ schemaVersion: 1, id: "hyperfocus-creative-v3", title: "Marketing cuts", items: candidates });
}

if (import.meta.main) {
  const [sourcePath = ".local/marketing-launch/v2/review-data.json", outputPath = ".local/marketing-launch/v3/manifest.json"] = Bun.argv.slice(2);
  const manifest = await createMarketingReview({ sourcePath });
  await Bun.write(outputPath, JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify({ outputPath: resolve(outputPath), items: manifest.items.length }));
}
