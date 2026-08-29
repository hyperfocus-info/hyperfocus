import { expect, it } from "bun:test";
import {
  canonicalModuleId,
  createCapabilityHandle,
  moduleIdAliases,
  parseCapabilityHandle,
  resolveSelectedCapabilityModuleId,
} from "@hyperfocus/pad-pilot/module-identity";

it("centralizes module aliases and capability handles", () => {
  expect(canonicalModuleId("reverb")).toBe("fx");
  expect(moduleIdAliases("reverb")).toEqual(["fx", "reverb"]);
  expect(createCapabilityHandle("fx-graph", "reverb")).toBe("fx::fx-graph::primary");
  expect(createCapabilityHandle("", "fx")).toBe("");
  expect(createCapabilityHandle("fx::graph", "fx")).toBe("");
  expect(createCapabilityHandle("midi_output", "fx")).toBe("");
  expect(createCapabilityHandle("midi-output", "Bad_Module")).toBe("");
  expect(parseCapabilityHandle("fx::fx-graph::primary")).toMatchObject({
    capability: "fx-graph",
    moduleInstanceId: "fx",
    slot: "primary",
    valid: true,
  });
  expect(parseCapabilityHandle("fx::fx-graph::primary::extra").valid).toBe(false);
});

it("resolves only ready selected modules with declared capabilities", () => {
  const readyFx = {
    modules: [{
      capabilities: ["fx-graph"],
      id: "fx",
      loadStatus: "ready",
    }],
    selectedModuleId: "reverb",
  };
  expect(resolveSelectedCapabilityModuleId(readyFx, "fx-graph")).toBe("fx");
  expect(resolveSelectedCapabilityModuleId(readyFx, "midi-export")).toBe("");
  expect(resolveSelectedCapabilityModuleId({ selectedModuleId: "fx" }, "fx-graph")).toBe("");
  expect(resolveSelectedCapabilityModuleId({
    ...readyFx,
    modules: [{ ...readyFx.modules[0]!, loadStatus: "error" }],
  }, "fx-graph")).toBe("");
});
