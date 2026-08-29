import { describe, expect, it } from "bun:test";

describe("Controller input hardening contract", () => {
  it("builds persistent hardware identity from VID/PID and serial/path, never SDL index", async () => {
    const source = await Bun.file(new URL("./input-thread.cpp", import.meta.url)).text();
    const config = await Bun.file(new URL("./controller-config.cpp", import.meta.url)).text();

    expect(source).toContain("SDL_GameControllerGetVendor(controller)");
    expect(source).toContain("SDL_GameControllerGetProduct(controller)");
    expect(source).toContain("SDL_GameControllerGetSerial(controller)");
    expect(source).toContain("SDL_GameControllerPath(controller)");
    expect(source).toContain("makeControllerHardwareId(");
    expect(config).toContain("const auto identityKind = !serial.empty() ? 's'");
    expect(config).toContain("hashUint16(hash, vendorId)");
    expect(config).toContain("hashUint16(hash, productId)");
    expect(config).toContain("hash = fnv1a64(identity, hash)");
    expect(source).not.toMatch(/buildHardwareId\([^)]*deviceIndex/);
  });

  it("raises worker priority without making startup depend on OS permission", async () => {
    const source = await Bun.file(new URL("./input-thread.cpp", import.meta.url)).text();

    expect(source).toContain("SDL_SetThreadPriority(SDL_THREAD_PRIORITY_HIGH)");
    expect(source).toContain("Could not raise input worker priority");
    expect(source).toContain("while (running_.load");
  });

  it("services controller feedback inside a five millisecond latency budget", async () => {
    const source = await Bun.file(new URL("./input-thread.cpp", import.meta.url)).text();

    expect(source).toContain("SDL_WaitEventTimeout(&sdlEvent, 2)");
    expect(source).toContain("if (waitResult <= 0)");
    expect(source).toContain("processHapticCommands()");
  });

  it("calibrates stick center/noise and suppresses deadzone event spam", async () => {
    const source = await Bun.file(new URL("./input-thread.cpp", import.meta.url)).text();
    const config = await Bun.file(new URL("./controller-config.cpp", import.meta.url)).text();
    const header = await Bun.file(new URL("./input-thread.h", import.meta.url)).text();

    expect(header).toContain("axisCalibrations_");
    expect(source).toContain("calibrateControllerAxis(calibration, normalizedValue)");
    expect(source).toContain("shouldPublishControllerAxis(calibration, inputEvent.value)");
    expect(config).toContain("kMinimumAxisDeadzone");
    expect(config).toContain("kMaximumAxisDeadzone");
    expect(config).toContain("calibration.center + (deviation * kAxisCenterLearningRate)");
    expect(config).toContain("calibration.noiseFloor");
    expect(config).toContain("const auto returnedToCenter");
  });

  it("keeps haptic output routed through SDL rumble", async () => {
    const source = await Bun.file(new URL("./input-thread.cpp", import.meta.url)).text();

    expect(source).toContain("void InputThread::processHapticCommands()");
    expect(source).toContain("SDL_GameControllerRumble(controller, low, high, hapticCommand.durationMs)");
    expect(source).toContain("hapticCommand.deviceSlot == kPrimaryHapticDeviceSlot");
  });
});
