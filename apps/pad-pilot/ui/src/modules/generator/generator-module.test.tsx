import { afterEach, expect, it } from "bun:test";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { createUiTest } from "../../../../utils/tests/test-harness";
import { PadPilotProvider } from "../../padpilot/provider";
import { GeneratorModule } from "./";
import { resetBridgeStateForTests } from "../../bridge";
import { getDevHostRuntime } from "../../dev-host/runtime";

const originalFetch = globalThis.fetch;
const originalDevtoolsEnv = process.env.PADPILOT_DEVTOOLS_ENABLED;
const originalRequestAnimationFrame = window.requestAnimationFrame.bind(window);
const originalCancelAnimationFrame = window.cancelAnimationFrame.bind(window);

createUiTest("GeneratorModule", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalDevtoolsEnv === undefined) {
      delete process.env.PADPILOT_DEVTOOLS_ENABLED;
    } else {
      process.env.PADPILOT_DEVTOOLS_ENABLED = originalDevtoolsEnv;
    }
    window.requestAnimationFrame = originalRequestAnimationFrame;
    window.cancelAnimationFrame = originalCancelAnimationFrame;
    getDevHostRuntime().reset();
    resetBridgeStateForTests();
    window.__JUCE__ = undefined;
  });

  it("shows the selected key and mode in the generated MIDI output header", async () => {
    globalThis.fetch = ((async () => {
      throw new Error("offline");
    }) as unknown) as typeof fetch;

    render(() => (
      <PadPilotProvider>
        <GeneratorModule />
      </PadPilotProvider>
    ));

    fireEvent.click(screen.getByRole("button", { name: "Generate / Send" }));

    expect(await screen.findByText(/[A-G](?:#|b)? Dorian/)).toBeTruthy();
    expect(screen.queryByText(/Mode Dorian/)).toBeNull();
  });

  it("keeps generation drawer hidden until generation is needed", () => {
    render(() => (
      <PadPilotProvider>
        <GeneratorModule />
      </PadPilotProvider>
    ));

    expect(screen.queryByRole("meter", { name: "Generation progress" })).toBeNull();
    expect(screen.queryByRole("complementary", { name: "Generator status" })).toBeNull();
  });

  it("aborts generation and cancels every owned animation frame on unmount", () => {
    let nextFrameHandle = 1;
    const pendingFrames = new Map<number, FrameRequestCallback>();
    window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      const handle = nextFrameHandle;
      nextFrameHandle += 1;
      pendingFrames.set(handle, callback);
      return handle;
    }) as typeof window.requestAnimationFrame;
    window.cancelAnimationFrame = ((handle: number) => {
      pendingFrames.delete(handle);
    }) as typeof window.cancelAnimationFrame;

    const requestCapture: { signal: AbortSignal | null } = { signal: null };
    globalThis.fetch = ((async (_input: RequestInfo | URL, init?: RequestInit) => {
      requestCapture.signal = init?.signal ?? null;
      return await new Promise<Response>((_resolve, reject) => {
        requestCapture.signal?.addEventListener("abort", () => reject(requestCapture.signal?.reason), { once: true });
      });
    }) as unknown) as typeof fetch;

    const view = render(() => (
      <PadPilotProvider>
        <GeneratorModule />
      </PadPilotProvider>
    ));
    fireEvent.click(screen.getByRole("button", { name: "Generate / Send" }));

    expect(requestCapture.signal).not.toBeNull();
    expect(pendingFrames.size).toBeGreaterThan(0);
    view.unmount();

    expect(requestCapture.signal?.aborted).toBe(true);
    expect(pendingFrames.size).toBe(0);
  });

  it("fills completed generation progress to 100 percent", async () => {
    globalThis.fetch = ((async () => {
      throw new Error("offline");
    }) as unknown) as typeof fetch;

    render(() => (
      <PadPilotProvider>
        <GeneratorModule />
      </PadPilotProvider>
    ));

    fireEvent.click(screen.getByRole("button", { name: "Generate / Send" }));

    expect(await screen.findByText("Fallback ready")).toBeTruthy();
    expect(Number(screen.getByRole("meter", { name: "Generation progress" }).getAttribute("aria-valuenow"))).toBe(100);
    expect(screen.getByText(/normalizing selector\/theme\/groove tags/)).toBeTruthy();
    expect(screen.getByText(/generation complete/)).toBeTruthy();
  });

  it("shows fallback audit reason in the result panel", async () => {
    globalThis.fetch = ((async () => {
      throw new Error("offline");
    }) as unknown) as typeof fetch;

    render(() => (
      <PadPilotProvider>
        <GeneratorModule />
      </PadPilotProvider>
    ));

    fireEvent.click(screen.getByRole("button", { name: "Generate / Send" }));

    expect(await screen.findByText("Fallback: offline")).toBeTruthy();
    expect(screen.getByText("Source: fallback")).toBeTruthy();
    expect(screen.getByText(/Quality \d+ - passed/)).toBeTruthy();
  });

  it("shows dev original model MIDI for A/B comparison in dev mode", async () => {
    process.env.PADPILOT_DEVTOOLS_ENABLED = "true";
    globalThis.fetch = ((async () => new Response(JSON.stringify({
      response: "!BPM:86!\\n#TRK:Original Keys,CH:0,PG:4\\n[0,57,80,480][480,60,78,480][480,64,76,480][480,69,78,480]",
      source: "codex-cli",
    }))) as unknown) as typeof fetch;

    render(() => (
      <PadPilotProvider>
        <GeneratorModule />
      </PadPilotProvider>
    ));

    fireEvent.click(screen.getByRole("button", { name: "Generate / Send" }));

    expect(await screen.findByText("Fallback ready")).toBeTruthy();
    expect(screen.getByText("Dev Original Codex CLI MIDI")).toBeTruthy();
  });

  it("keeps run telemetry and generated MIDI artifacts out of canonical Module state", async () => {
    const nativeInvocations: Array<{ eventId: string; payload: Record<string, unknown> }> = [];
    window.__JUCE__ = {
      backend: {
        addEventListener: () => 0,
        emitEvent: (eventId, payload) => {
          nativeInvocations.push({ eventId, payload: payload as Record<string, unknown> });
        },
      },
      initializationData: {
        __juce__functions: ["padpilotBridge"],
      },
    };
    globalThis.fetch = ((async () => {
      throw new Error("offline");
    }) as unknown) as typeof fetch;

    const view = render(() => (
      <PadPilotProvider>
        <GeneratorModule />
      </PadPilotProvider>
    ));
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    window.padpilotHostReceive?.({ moduleStates: { generator: {} } });
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    fireEvent.input(screen.getByPlaceholderText("Add any extra context, references, or instructions..."), {
      currentTarget: { value: "persistence check" },
      target: { value: "persistence check" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Generate / Send" }));
    expect(await screen.findByText("Fallback ready", {}, { timeout: 5_000 })).toBeTruthy();
    await new Promise((resolve) => window.setTimeout(resolve, 30));

    const generatorStateWrites = nativeInvocations.flatMap((invocation) => {
      const params = invocation.payload.params as unknown[] | undefined;
      const intent = JSON.parse(String(params?.[0] ?? "{}")) as { moduleId?: string; payload?: string; type?: string };
      return intent.type === "setModuleState" && intent.moduleId === "generator" ? [intent] : [];
    });
    expect(generatorStateWrites.length).toBeGreaterThan(0);
    for (const write of generatorStateWrites) {
      const state = JSON.parse(write.payload ?? "{}") as Record<string, unknown>;
      expect(state).not.toHaveProperty("run");
      expect(state).not.toHaveProperty("midiDrawerOpen");
      expect(state).not.toHaveProperty("statusDrawerOpen");
      expect(state).not.toHaveProperty("template");
    }
    view.unmount();
  });
});
