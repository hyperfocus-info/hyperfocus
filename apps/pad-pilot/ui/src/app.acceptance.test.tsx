import { afterEach, expect, it } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { createUiTest } from "../../utils/tests/test-harness";
import App from "./app";
import { getDevHostRuntime } from "./dev-host/runtime";

const originalFetch = globalThis.fetch;
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

function createNoUpdateResponse(url: URL) {
  return {
    arch: url.searchParams.get("arch") ?? "x64",
    artifactChecksumSha256: null,
    artifactKind: null,
    artifactSizeBytes: 0,
    baseVersionRange: null,
    channel: url.searchParams.get("channel") === "beta" ? "beta" : "stable",
    currentVersion: url.searchParams.get("version") ?? "0.1.0",
    downloadUrl: null,
    latestVersion: null,
    manifestChecksumSha256: null,
    manifestUrl: null,
    platform: url.searchParams.get("platform") ?? "windows",
    publishedAt: null,
    releaseNotes: "",
    requiresRestart: false,
    signature: null,
    updateAvailable: false,
  };
}

async function renderGuestApp() {
  process.env.PADPILOT_DEVTOOLS_ENABLED = "false";
  globalThis.fetch = Object.assign(async (input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : String(input), "http://localhost");
    const payload = url.pathname === "/api/updates/vst3/latest"
      ? createNoUpdateResponse(url)
      : createBootstrapResponse();
    return new Response(JSON.stringify(payload));
  }, { preconnect: globalThis.fetch.preconnect });
  render(() => <App />);
  fireEvent.click(await screen.findByRole("button", { name: "Continue as guest" }));
}

createUiTest("AppAcceptance", () => {
  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
    if (originalDevtoolsEnv === undefined) {
      delete process.env.PADPILOT_DEVTOOLS_ENABLED;
    } else {
      process.env.PADPILOT_DEVTOOLS_ENABLED = originalDevtoolsEnv;
    }
    getDevHostRuntime().reset();
    window.__JUCE__ = undefined;
  });

  it("walks the app shell through all shipped factory modules", async () => {
    await renderGuestApp();

    fireEvent.click(await screen.findByRole("button", { name: "FX" }));
    expect(await screen.findByTestId("fx-console-shell")).toBeTruthy();
    fireEvent.click(screen.getByTestId("add-chain-tab"));
    expect(screen.getByTestId("chain-tab-2")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Recut" }));
    expect(await screen.findByText("Waiting for sample")).toBeTruthy();
    const recutDropzone = screen.getByRole("button", { name: "Upload audio file" });
    const recutFile = new File(["audio"], "amen-break.wav", { type: "audio/wav" });
    Object.defineProperty(recutFile, "path", {
      configurable: true,
      value: "C:\\samples\\amen-break.wav",
    });
    fireEvent.drop(recutDropzone, {
      dataTransfer: {
        files: [recutFile],
        getData(type: string) {
          if (type === "text/uri-list") {
            return "file:///C:/samples/amen-break.wav";
          }
          return "";
        },
      },
    });
    await waitFor(() => {
      expect(screen.getAllByText("amen-break.wav").length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByRole("button", { name: "Generator" }));
    expect(await screen.findByRole("button", { name: "Generate / Send" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Analyzer" }));
    const stopRecording = await screen.findByRole("button", { name: "Stop recording" });
    fireEvent.click(stopRecording);
    expect(await screen.findByRole("button", { name: "Start recording" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Performance" }));
    expect(await screen.findByRole("button", { name: "Root Note" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Scale" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Editor" }));
    fireEvent.click(await screen.findByRole("button", { name: "Add Binding" }));
    expect(await screen.findByText((value) => value.includes("Press controller button"))).toBeTruthy();
  });
});
