import { expect, test } from "bun:test";
import type { PadPilotServiceHostSurface } from "@hyperfocus/pad-pilot/host-surface";
import type { PadPilotControllerConfigState } from "./controller-config";
import type { SampleEditorFrame } from "./sample-capabilities";
import type { FxChainState, VisualizerFrame } from "../modules/fx/fx-chain-state";
import { PadPilot } from "./index";

const publicServiceSurface: PadPilotServiceHostSurface<
  File | string,
  AbortSignal,
  PadPilotControllerConfigState,
  FxChainState,
  VisualizerFrame,
  SampleEditorFrame,
  "cursor",
  "dev-agent" | "remote-agent"
> = PadPilot;

test("the injected PadPilot services conform to the public package contract", () => {
  expect(publicServiceSurface.hooks.useModuleState).toBe(PadPilot.hooks.useModuleState);
  expect(publicServiceSurface.createProducerActions).toBe(PadPilot.createProducerActions);
  expect(publicServiceSurface.capabilities.fxGraph).toBe(PadPilot.capabilities.fxGraph);
});
