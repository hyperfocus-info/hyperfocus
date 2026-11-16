import { requireElement } from "./utils/require-element";
import { afterEach, expect, it } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { createUiTest } from "../../utils/tests/test-harness";
import App from "./app";
import { getDevHostRuntime } from "./dev-host/runtime";

const originalFetch = globalThis.fetch;
const originalPrompt = window.prompt;
const originalWebSocket = globalThis.WebSocket;
const originalDevtoolsEnv = process.env.PADPILOT_DEVTOOLS_ENABLED;

function createBootstrapResponse() {
  return {
    auth: {
      authenticated: false,
      configured: { clerk: false, stripe: false },
      entitlements: { firstClass: null, padpilotAccess: null },
      pilotTokenBalance: 0,
      pricing: {
        firstClassDiscountPercent: 20,
        padpilotFinancingMonthlyPriceCents: 1000,
        padpilotLifetimePriceCents: 6000,
      },
      publishableKey: null,
      subscriptionStatus: "guest",
      user: null,
    },
    capabilities: {
      browserDownloadsOnly: true,
      nativeModuleInstallation: false,
    },
    marketplace: {
      modules: [],
    },
    updates: {
      latest: null,
    },
  };
}

createUiTest("App", () => {
  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
    window.prompt = originalPrompt;
    globalThis.WebSocket = originalWebSocket;
    if (originalDevtoolsEnv === undefined) {
      delete process.env.PADPILOT_DEVTOOLS_ENABLED;
    } else {
      process.env.PADPILOT_DEVTOOLS_ENABLED = originalDevtoolsEnv;
    }
    getDevHostRuntime().reset();
    window.__JUCE__ = undefined;
  });

  it("switches into recut without locking the app shell", async () => {
    process.env.PADPILOT_DEVTOOLS_ENABLED = "false";
    globalThis.fetch = Object.assign(async () => new Response(JSON.stringify(createBootstrapResponse())), { preconnect: globalThis.fetch.preconnect });
    let webSocketCreations = 0;
    function MockWebSocket() { webSocketCreations += 1;
return { onerror: null,
onmessage: null,
close() {} }; }
    Object.defineProperty(globalThis, "WebSocket", { configurable: true, writable: true, value: MockWebSocket });

    getDevHostRuntime().reset();

    render(() => <App />);
    expect(webSocketCreations).toBe(0);

    fireEvent.click(await screen.findByRole("button", { name: "Continue as guest" }));

    const recutButton = await screen.findByRole("button", { name: "Recut" });
    fireEvent.click(recutButton);

    await waitFor(() => {
      expect(screen.getByText("RECUT")).toBeTruthy();
      expect(screen.getByText("Sample slicer")).toBeTruthy();
      expect(webSocketCreations).toBe(0);
    });
  });

  it("moves model selection into the global settings drawer and links controller preferences from settings", async () => {
    process.env.PADPILOT_DEVTOOLS_ENABLED = "false";
    globalThis.fetch = Object.assign(async () => new Response(JSON.stringify(createBootstrapResponse())), { preconnect: globalThis.fetch.preconnect });
    function MockWebSocket() {
return { close() {} }; }
    Object.defineProperty(globalThis, "WebSocket", { configurable: true, writable: true, value: MockWebSocket });

    render(() => <App />);
    fireEvent.click(await screen.findByRole("button", { name: "Continue as guest" }));

    fireEvent.click(await screen.findByRole("button", { name: "Open settings" }));

    expect(await screen.findByText("Agent")).toBeTruthy();
    expect((requireElement(screen.getByLabelText("AI Provider"), HTMLInputElement)).value).toBe("Cursor");
    expect((requireElement(screen.getByLabelText("Model"), HTMLInputElement)).value).toBe("5.5 low fast");

    fireEvent.click(screen.getByRole("button", { name: "Controller Preferences" }));

    expect(await screen.findByText("Controller Routing")).toBeTruthy();
  });

  it("creates modules through the non-blocking shared modal", async () => {
    process.env.PADPILOT_DEVTOOLS_ENABLED = "false";
    globalThis.fetch = Object.assign(async () => new Response(JSON.stringify(createBootstrapResponse())), { preconnect: globalThis.fetch.preconnect });
    function MockWebSocket() {
return { close() {} }; }
    Object.defineProperty(globalThis, "WebSocket", { configurable: true, writable: true, value: MockWebSocket });
    window.prompt = () => {
      throw new Error("Blocking prompts must not be used.");
    };

    render(() => <App />);
    fireEvent.click(await screen.findByRole("button", { name: "Continue as guest" }));
    fireEvent.click(await screen.findByRole("button", { name: "Add module" }));

    expect(await screen.findByRole("dialog", { name: "Create New Module" })).toBeTruthy();
    fireEvent.input(screen.getByRole("textbox", { name: "Module name" }), { target: { value: "Custom Synth" } });
    fireEvent.click(screen.getByRole("button", { name: "Create module" }));

    expect(await screen.findByRole("button", { name: "Custom Synth" })).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "Create New Module" })).toBeNull();
  });
});
