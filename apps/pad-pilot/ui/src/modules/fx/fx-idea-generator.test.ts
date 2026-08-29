import { expect, test } from "bun:test";
import { FxNodeType, createDefaultFxChainState } from "./fx-chain-state";
import { generateFxIdea, selectFxIdeaRecipe } from "./fx-idea-generator";

test("tag matching selects strongest human-curated FX recipe", () => {
  expect(selectFxIdeaRecipe(["reverse"], () => 0).name).toBe("Reverse Bloom");
});

test("generator replaces selected chain with valid ordered nodes", () => {
  const generated = generateFxIdea(createDefaultFxChainState(), 1, ["reverse"], () => 0);
  expect(generated.name).toBe("Reverse Bloom");
  expect(generated.state.chains[0]?.nodes.map((node) => node.type)).toEqual([
    FxNodeType.REVERSE,
    FxNodeType.REVERB,
    FxNodeType.PITCH_DRIFT,
  ]);
  expect(generated.state.chains[0]?.nodes.map((node) => node.order)).toEqual([0, 1, 2]);
});
