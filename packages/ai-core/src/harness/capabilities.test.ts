import { describe, expect, test } from "bun:test";
import { defaultProviderCapabilities } from "./capabilities";

describe("default provider capabilities", () => {
  test("describes the GPT-5.6 family including Luna", () => {
    const gpt = defaultProviderCapabilities.find((capability) => capability.providerBrand === "gpt");
    const luna = gpt?.models.find((model) => model.modelId === "openai/gpt-5.6-luna");

    expect(gpt?.defaultSubagentModelId).toBe("openai/gpt-5.4-nano");
    expect(luna).toMatchObject({
      label: "GPT-5.6 Luna",
      contextWindow: 1_050_000,
      supportedReasoningStrengths: ["low", "medium", "high", "extra-high"],
      supportsFastMode: true
    });
  });
});
