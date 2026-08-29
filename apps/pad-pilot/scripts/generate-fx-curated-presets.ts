import path from "node:path";
import { toBinary } from "@bufbuild/protobuf";
import { slugify } from "./preset-utils";
import { FxChainStateSchema } from "../ui/src/proto/generated/fx-chain-pb";

type GeneratedManifestEntry = {
  category: string;
  description: string;
  era?: string;
  file: string;
  genres?: string[];
  id: string;
  intensity: string;
  jobs: string[];
  name: string;
  researchBasis?: string[];
  sources: string[];
  tags: string[];
  useCases?: string[];
};

async function main() {
  const { createDefaultFxChainState } = await import("../ui/src/modules/fx/fx-chain-state");
  const { FX_IDEA_RECIPES, generateFxRecipe } = await import("../ui/src/modules/fx/fx-idea-generator");
  const { FX_ERA_GENRE_RECIPES } = await import("../ui/src/modules/fx/fx-era-genre-presets");
  const { FX_UTILITY_PRESET_RECIPES } = await import("../ui/src/modules/fx/fx-utility-presets");
  const outDir = path.join(path.resolve(import.meta.dir, ".."), "ui", "public", "fx", "chains", "presets");
  const entries: GeneratedManifestEntry[] = [
    {
      id: "pad_pilot_init_default",
      name: "Lush Foundation",
      file: "pad-pilot-init-default.preset",
      description: "Creative | broad tone, glue, and hall | full mix",
      category: "creative",
      tags: ["creative", "lush", "glue", "hall", "full mix"],
      sources: ["full mix", "instrument bus"],
      jobs: ["add broad polish", "add spacious glue"],
      intensity: "medium",
    },
    {
      id: "pad_pilot_empty",
      name: "Blank State",
      file: "pad-pilot-empty.preset",
      description: "System | empty chain",
      category: "system",
      tags: ["system", "blank", "empty", "reset"],
      sources: [],
      jobs: ["start from an empty graph"],
      intensity: "none",
    },
  ];

  for (const recipe of FX_UTILITY_PRESET_RECIPES) {
    const id = `utility-${slugify(recipe.name)}`;
    const generated = generateFxRecipe(createDefaultFxChainState(), 1, recipe);
    generated.state.selectedPresetId = id;
    const file = `${id}.preset`;
    await Bun.write(path.join(outDir, file), toBinary(FxChainStateSchema, generated.state));
    entries.push({
      id,
      name: recipe.name,
      file,
      description: `${recipe.jobs.join(", ")} | ${recipe.sources.join(", ")}`,
      category: "utility",
      tags: [...recipe.tags],
      sources: [...recipe.sources],
      jobs: [...recipe.jobs],
      intensity: recipe.intensity,
    });
  }

  for (const recipe of FX_IDEA_RECIPES) {
    const id = `curated-${slugify(recipe.name)}`;
    const generated = generateFxRecipe(createDefaultFxChainState(), 1, recipe);
    generated.state.selectedPresetId = id;
    const file = `${id}.preset`;
    await Bun.write(path.join(outDir, file), toBinary(FxChainStateSchema, generated.state));
    entries.push({
      id,
      name: recipe.name,
      file,
      description: `${recipe.tags.join(", ")} | Creative chain`,
      category: "creative",
      tags: [...recipe.tags],
      sources: [],
      jobs: ["creative sound design"],
      intensity: "creative",
    });
  }

  for (const recipe of FX_ERA_GENRE_RECIPES) {
    const id = `curated-${slugify(recipe.name)}`;
    const generated = generateFxRecipe(createDefaultFxChainState(), 1, recipe);
    generated.state.selectedPresetId = id;
    const file = `${id}.preset`;
    await Bun.write(path.join(outDir, file), toBinary(FxChainStateSchema, generated.state));
    entries.push({
      id,
      name: recipe.name,
      file,
      description: `${recipe.genres.join(", ")} | ${recipe.useCases.join(", ")}`,
      category: "era",
      tags: [...recipe.tags],
      sources: [...recipe.useCases],
      jobs: ["era and genre coloration"],
      intensity: "creative",
      era: recipe.era,
      genres: [...recipe.genres],
      useCases: [...recipe.useCases],
      researchBasis: [...recipe.researchBasis],
    });
  }

  await Bun.write(path.join(outDir, "index.json"), `${JSON.stringify({ presets: entries }, null, 2)}\n`);
  console.log(`Wrote ${entries.length} bundled FX presets.`);
}

if (import.meta.main) await main();
