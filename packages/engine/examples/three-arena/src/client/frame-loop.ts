import { createFixedStepDriver } from "@hyperfocus/engine";
import { state } from "./arena-state.ts";
import { threeView } from "./boot-context.ts";
import { runtimeCallback } from "./runtime-ports.ts";
const continueOptionalModelUpgrade = runtimeCallback("modelAssets", "continueOptionalModelUpgrade");
const updateCamera = runtimeCallback("networkAndCamera", "updateCamera");
const updateGame = runtimeCallback("playerUpdate", "updateGame");
const updateFloatingTexts = runtimeCallback("rewardFeedback", "updateFloatingTexts");
const updateVisualIndicators = runtimeCallback("sceneSetup", "updateVisualIndicators");
const recordTelemetry = runtimeCallback("telemetry", "recordTelemetry");
const pollGamepad = runtimeCallback("inputAndMenu", "pollGamepad");
import { measureTelemetryPhase, telemetry } from "./telemetry-core.ts";

let frameStartedAt = 0;
let previousFrameStartedAt = 0;
let updateWorkMs = 0;

export const arenaFrameDriver = createFixedStepDriver({
  step: 1 / 60,
  maxFrame: 0.05,
  update(dt) {
    const startedAt = performance.now();
    if (state.running) updateGame(dt);
    updateWorkMs += performance.now() - startedAt;
  },
  render(_alpha, timing) {
    const updateEnd = performance.now();
    updateCamera(timing.delta);
    measureTelemetryPhase("visualIndicators", () => updateVisualIndicators(timing.delta));
    measureTelemetryPhase("floatingTexts", () => updateFloatingTexts(timing.delta));
    const cameraEnd = performance.now();
    if (!state.running) continueOptionalModelUpgrade();
    threeView.render();
    const renderEnd = performance.now();
    recordTelemetry({
      frameMs: renderEnd - frameStartedAt,
      updateMs: updateWorkMs,
      cameraMs: cameraEnd - updateEnd,
      renderMs: renderEnd - cameraEnd,
      dtMs: timing.delta * 1000,
      rawDtMs: timing.rawDelta * 1000,
      frameGapMs: previousFrameStartedAt > 0
        ? frameStartedAt - previousFrameStartedAt
        : timing.rawDelta * 1000,
    }, timing.delta);
  },
});

export function tick(timeMilliseconds = performance.now()): void {
  frameStartedAt = performance.now();
  previousFrameStartedAt = telemetry.lastFrameStart;
  telemetry.lastFrameStart = frameStartedAt;
  updateWorkMs = 0;
  measureTelemetryPhase("pollGamepad", pollGamepad);
  arenaFrameDriver.advance(timeMilliseconds);
}
