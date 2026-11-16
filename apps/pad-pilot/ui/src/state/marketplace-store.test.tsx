import { z } from "zod";
import { afterEach, describe, expect, it, mock } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { resetBridgeStateForTests } from "../bridge";
import { MarketplaceStoreProvider, useMarketplaceStore } from "./marketplace-store";

const originalFetch = globalThis.fetch;
const originalConsoleError = console.error;
const originalHandshakeDetails = process.env.HANDSHAKE_DETAILS;

const noUpdateResponse = () => ({
  arch: "x64",
  artifactChecksumSha256: null,
  artifactKind: null,
  artifactSizeBytes: 0,
  baseVersionRange: null,
  channel: "stable",
  currentVersion: "0.1.0-dev",
  downloadUrl: null,
  latestVersion: null,
  manifestChecksumSha256: null,
  manifestUrl: null,
  platform: "windows",
  publishedAt: null,
  releaseNotes: "",
  requiresRestart: true,
  signature: null,
  updateAvailable: false,
});

const moduleDetailResponse = (id: string, name = "Draft") => ({
  actions: { canDownload: false, canPublish: true, canUploadVersion: true },
  currency: "usd",
  description: "",
  downloadUrl: null,
  id,
  isOwner: true,
  latestAccessibleVersion: null,
  latestPublishedVersion: null,
  name,
  owner: "Tester",
  priceCents: 0,
  slug: id,
  visibility: "draft",
});

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  console.error = originalConsoleError;
  process.env.HANDSHAKE_DETAILS = originalHandshakeDetails;
  window.localStorage.removeItem("padpilot.update-channel");
  resetBridgeStateForTests();
  window.__JUCE__ = undefined;
});

function TestHarness() {
  const { actions, state } = useMarketplaceStore();

  return (
    <>
      <button type="button" onClick={() => actions.signIn()}>
        Sign in
      </button>
      <button type="button" onClick={() => actions.signOut()}>Sign out</button>
      <button type="button" onClick={() => actions.restartAndApplyUpdate()}>Restart</button>
      <button type="button" onClick={() => actions.setUpdateChannel("beta")}>Beta</button>
      <button type="button" onClick={() => actions.setUpdateChannel("stable")}>Stable</button>
      <button
        type="button"
        onClick={() => actions.setUploadDraft({
          bundle: new File(["bundle"], "fixture.zip", { type: "application/zip" }),
          name: "Rollback Fixture",
          publish: false,
          version: "1.0.0",
        })}
      >
        Prepare upload
      </button>
      <button
        type="button"
        onClick={() => actions.setUploadDraft({
          bundle: new File(["bundle"], "fixture.zip", { type: "application/zip" }),
          name: "Publish Recovery Fixture",
          publish: true,
          version: "1.0.0",
        })}
      >
        Prepare publish
      </button>
      <button type="button" onClick={() => actions.uploadModule()}>Upload</button>
      <span data-testid="auth-state">{state.auth.authenticated ? "signed-in" : "guest"}</span>
      <span data-testid="upload-state">{state.requestStatus.upload}</span>
      <span data-testid="update-version">{state.updater.availableRelease?.latestVersion ?? ""}</span>
      <span data-testid="update-status">{state.updater.checkStatus}</span>
      <span data-testid="toast-message">{state.toastQueue[0]?.message ?? ""}</span>
    </>
  );
}

describe("MarketplaceStoreProvider", () => {
  it("logs and toasts sign-in failures gracefully", async () => {
    const errorSpy = mock(() => undefined);
    console.error = errorSpy;
    globalThis.fetch = Object.assign(async () =>
      new Response(JSON.stringify({
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
      })), { preconnect: globalThis.fetch.preconnect });

    render(() => (
      <MarketplaceStoreProvider>
        <TestHarness />
      </MarketplaceStoreProvider>
    ));

    await fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(screen.getByTestId("toast-message").textContent).toBe("Clerk is not configured for this environment.");
    });
    expect(errorSpy).toHaveBeenCalled();
  });

  it("ignores a deferred sign-in failure after unmount", async () => {
    const errorSpy = mock(() => undefined);
    console.error = errorSpy;
    globalThis.fetch = Object.assign(async (input: RequestInfo | URL) => {
      const url = new URL(input.toString());
      if (url.pathname.includes("/api/updates/vst3/latest")) {
        return new Response(JSON.stringify(noUpdateResponse()));
      }
      return new Response(JSON.stringify({
        auth: {
          authenticated: false,
          configured: { clerk: false, stripe: false },
          entitlements: { firstClass: null, padpilotAccess: null },
          pilotTokenBalance: 0,
          pricing: { firstClassDiscountPercent: 20, padpilotFinancingMonthlyPriceCents: 1000, padpilotLifetimePriceCents: 6000 },
          publishableKey: null,
          subscriptionStatus: "guest",
          user: null,
        },
        capabilities: { browserDownloadsOnly: true, nativeModuleInstallation: false },
        marketplace: { modules: [] },
        updates: { latest: null },
      }));
    }, { preconnect: globalThis.fetch.preconnect });

    const view = render(() => <MarketplaceStoreProvider><TestHarness /></MarketplaceStoreProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    view.unmount();
    await new Promise((resolve) => window.setTimeout(resolve, 0));

    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("does not refresh marketplace after a deferred sign-out completes post-unmount", async () => {
    let bootstrapCalls = 0;
    let resolveLogout: ((response: Response) => void) | undefined;
    globalThis.fetch = Object.assign(async (input: RequestInfo | URL) => {
      const url = new URL(input.toString());
      if (url.pathname === "/api/auth/logout") {
        return new Promise<Response>((resolve) => {
          resolveLogout = resolve;
        });
      }
      if (url.pathname.includes("/api/updates/vst3/latest")) {
        return new Response(JSON.stringify(noUpdateResponse()));
      }
      bootstrapCalls += 1;
      return new Response(JSON.stringify({
        auth: {
          authenticated: false,
          configured: { clerk: false, stripe: false },
          entitlements: { firstClass: null, padpilotAccess: null },
          pilotTokenBalance: 0,
          pricing: { firstClassDiscountPercent: 20, padpilotFinancingMonthlyPriceCents: 1000, padpilotLifetimePriceCents: 6000 },
          publishableKey: null,
          subscriptionStatus: "guest",
          user: null,
        },
        capabilities: { browserDownloadsOnly: true, nativeModuleInstallation: false },
        marketplace: { modules: [] },
        updates: { latest: null },
      }));
    }, { preconnect: globalThis.fetch.preconnect });

    const view = render(() => <MarketplaceStoreProvider><TestHarness /></MarketplaceStoreProvider>);
    await waitFor(() => expect(bootstrapCalls).toBe(1));
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(resolveLogout).toBeDefined());
    view.unmount();
    resolveLogout!(new Response(JSON.stringify({ ok: true })));
    await new Promise((resolve) => window.setTimeout(resolve, 0));

    expect(bootstrapCalls).toBe(1);
  });

  it("ignores a deferred restart failure after unmount", async () => {
    const errorSpy = mock(() => undefined);
    console.error = errorSpy;
    let completionListener: ((payload: unknown) => void) | undefined;
    let restartRequest: { resultId: number } | undefined;
    window.__JUCE__ = {
      backend: {
        addEventListener: (_eventId, listener) => {
          completionListener = listener;
          return 0;
        },
        emitEvent: (eventId, payload) => {
          if (eventId === "__juce__invoke") {
            restartRequest = z.object({resultId:z.number()}).passthrough().parse(payload);
          }
        },
      },
      initializationData: {
        __juce__functions: ["padpilotRestartAndApplyPluginUpdate"],
      },
    };
    globalThis.fetch = Object.assign(async () => new Response(JSON.stringify({
      auth: {
        authenticated: false,
        configured: { clerk: false, stripe: false },
        entitlements: { firstClass: null, padpilotAccess: null },
        pilotTokenBalance: 0,
        pricing: { firstClassDiscountPercent: 20, padpilotFinancingMonthlyPriceCents: 1000, padpilotLifetimePriceCents: 6000 },
        publishableKey: null,
        subscriptionStatus: "guest",
        user: null,
      },
      capabilities: { browserDownloadsOnly: true, nativeModuleInstallation: false },
      marketplace: { modules: [] },
      updates: { latest: null },
    })), { preconnect: globalThis.fetch.preconnect });

    const view = render(() => <MarketplaceStoreProvider><TestHarness /></MarketplaceStoreProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Restart" }));
    await waitFor(() => expect(restartRequest).toBeDefined());
    view.unmount();
    completionListener?.({ promiseId: restartRequest!.resultId, result: "error:restart failed" });
    await new Promise((resolve) => window.setTimeout(resolve, 0));

    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("checks for updates during startup and exposes the available release", async () => {
    process.env.HANDSHAKE_DETAILS = JSON.stringify({ MARKETPLACE_URL: "http://localhost:3000", version: 1 });
    globalThis.fetch = Object.assign(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/updates/vst3/latest")) {
        return new Response(JSON.stringify({
          arch: "x64",
          artifactChecksumSha256: "artifact-sha",
          artifactKind: "directory_patch",
          artifactSizeBytes: 1024,
          baseVersionRange: { max: "0.1.0-dev", min: "0.1.0-dev" },
          channel: "stable",
          currentVersion: "0.1.0-dev",
          downloadUrl: "/api/updates/vst3/download/release-1",
          latestVersion: "0.1.1",
          manifestChecksumSha256: "manifest-sha",
          manifestUrl: "/api/updates/vst3/manifest/release-1",
          platform: "windows",
          publishedAt: "2026-03-24T00:00:00.000Z",
          releaseNotes: "Patch notes",
          requiresRestart: true,
          signature: "sig",
          updateAvailable: true,
        }));
      }

      return new Response(JSON.stringify({
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
      }));
    }, { preconnect: globalThis.fetch.preconnect });

    render(() => (
      <MarketplaceStoreProvider>
        <TestHarness />
      </MarketplaceStoreProvider>
    ));

    await waitFor(() => {
      expect(screen.getByTestId("update-version").textContent).toBe("0.1.1");
      expect(screen.getByTestId("update-status").textContent).toBe("update-available");
    });
  });

  it("keeps the newest update-channel response when requests finish out of order", async () => {
    process.env.HANDSHAKE_DETAILS = JSON.stringify({ MARKETPLACE_URL: "http://localhost:3000", version: 1 });
    let updateCalls = 0;
    let resolveBeta: ((response: Response) => void) | null = null;
    let resolveStable: ((response: Response) => void) | null = null;
    const release = (channel: "beta" | "stable", latestVersion: string) => new Response(JSON.stringify({
      arch: "x64",
      artifactChecksumSha256: "artifact-sha",
      artifactKind: "directory_patch",
      artifactSizeBytes: 1024,
      baseVersionRange: { max: "0.1.0-dev", min: "0.1.0-dev" },
      channel,
      currentVersion: "0.1.0-dev",
      downloadUrl: "/api/updates/vst3/download/release-1",
      latestVersion,
      manifestChecksumSha256: "manifest-sha",
      manifestUrl: "/api/updates/vst3/manifest/release-1",
      platform: "windows",
      publishedAt: "2026-03-24T00:00:00.000Z",
      releaseNotes: "Patch notes",
      requiresRestart: true,
      signature: "sig",
      updateAvailable: true,
    }));
    globalThis.fetch = Object.assign(async (input: RequestInfo | URL) => {
      const url = new URL(input.toString());
      if (url.pathname.includes("/api/updates/vst3/latest")) {
        updateCalls += 1;
        if (updateCalls === 1) {
          return release("stable", "1.0.0");
        }
        if (url.searchParams.get("channel") === "beta") {
          return new Promise<Response>((resolve) => {
            resolveBeta = resolve;
          });
        }
        return new Promise<Response>((resolve) => {
          resolveStable = resolve;
        });
      }
      return new Response(JSON.stringify({
        auth: {
          authenticated: false,
          configured: { clerk: false, stripe: false },
          entitlements: { firstClass: null, padpilotAccess: null },
          pilotTokenBalance: 0,
          pricing: { firstClassDiscountPercent: 20, padpilotFinancingMonthlyPriceCents: 1000, padpilotLifetimePriceCents: 6000 },
          publishableKey: null,
          subscriptionStatus: "guest",
          user: null,
        },
        capabilities: { browserDownloadsOnly: true, nativeModuleInstallation: false },
        marketplace: { modules: [] },
        updates: { latest: null },
      }));
    }, { preconnect: globalThis.fetch.preconnect });

    render(() => <MarketplaceStoreProvider><TestHarness /></MarketplaceStoreProvider>);
    await waitFor(() => expect(screen.getByTestId("update-version").textContent).toBe("1.0.0"));
    await fireEvent.click(screen.getByRole("button", { name: "Beta" }));
    await waitFor(() => expect(resolveBeta).not.toBeNull());
    await fireEvent.click(screen.getByRole("button", { name: "Stable" }));
    await waitFor(() => expect(resolveStable).not.toBeNull());
    resolveStable!(release("stable", "2.0.0"));
    await waitFor(() => expect(screen.getByTestId("update-version").textContent).toBe("2.0.0"));
    resolveBeta!(release("beta", "9.0.0"));
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    expect(screen.getByTestId("update-version").textContent).toBe("2.0.0");
  });

  it("removes a newly created draft when its bundle upload fails", async () => {
    process.env.HANDSHAKE_DETAILS = JSON.stringify({ MARKETPLACE_URL: "http://localhost:3000", version: 1 });
    console.error = mock(() => undefined);
    const requests: Array<{ method: string; pathname: string }> = [];
    globalThis.fetch = Object.assign(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input.toString());
      const method = init?.method ?? "GET";
      requests.push({ method, pathname: url.pathname });
      if (url.pathname === "/api/bootstrap") {
        return new Response(JSON.stringify({
          auth: {
            authenticated: true,
            configured: { clerk: false, stripe: true },
            entitlements: { firstClass: null, padpilotAccess: null },
            pilotTokenBalance: 0,
            pricing: { firstClassDiscountPercent: 20, padpilotFinancingMonthlyPriceCents: 1000, padpilotLifetimePriceCents: 6000 },
            publishableKey: null,
            subscriptionStatus: "active",
            user: { clerkUserId: "clerk-1", displayName: "Tester", email: null, id: "user-1", username: null },
          },
          capabilities: { browserDownloadsOnly: true, nativeModuleInstallation: false },
          marketplace: { modules: [] },
          updates: { latest: null },
        }));
      }
      if (url.pathname === "/api/updates/vst3/latest") {
        return new Response(JSON.stringify(noUpdateResponse()));
      }
      if (url.pathname === "/api/modules" && method === "POST") {
        return new Response(JSON.stringify({ module: moduleDetailResponse("draft-1") }));
      }
      if (url.pathname === "/api/modules/draft-1/versions" && method === "POST") {
        return new Response(JSON.stringify({ error: { message: "Bundle validation failed." } }), { status: 400 });
      }
      if (url.pathname === "/api/modules/draft-1" && method === "DELETE") {
        return new Response(JSON.stringify({ ok: true }));
      }
      return new Response("Not found", { status: 404 });
    }, { preconnect: globalThis.fetch.preconnect });

    render(() => <MarketplaceStoreProvider><TestHarness /></MarketplaceStoreProvider>);
    await waitFor(() => expect(screen.getByTestId("auth-state").textContent).toBe("signed-in"));
    await fireEvent.click(screen.getByRole("button", { name: "Prepare upload" }));
    await fireEvent.click(screen.getByRole("button", { name: "Upload" }));

    await waitFor(() => expect(screen.getByTestId("upload-state").textContent).toBe("error"));
    expect(requests).toContainEqual({ method: "DELETE", pathname: "/api/modules/draft-1" });
    expect(screen.getByTestId("toast-message").textContent).toBe("Bundle validation failed.");
  });

  it("treats a published rollback conflict as a successful lost publish response", async () => {
    process.env.HANDSHAKE_DETAILS = JSON.stringify({ MARKETPLACE_URL: "http://localhost:3000", version: 1 });
    console.error = mock(() => undefined);
    const requests: Array<{ method: string; pathname: string }> = [];
    const bootstrap = {
      auth: {
        authenticated: true,
        configured: { clerk: false, stripe: true },
        entitlements: { firstClass: null, padpilotAccess: null },
        pilotTokenBalance: 0,
        pricing: { firstClassDiscountPercent: 20, padpilotFinancingMonthlyPriceCents: 1000, padpilotLifetimePriceCents: 6000 },
        publishableKey: null,
        subscriptionStatus: "active",
        user: { clerkUserId: "clerk-1", displayName: "Tester", email: null, id: "user-1", username: null },
      },
      capabilities: { browserDownloadsOnly: true, nativeModuleInstallation: false },
      marketplace: { modules: [] },
      updates: { latest: null },
    };
    globalThis.fetch = Object.assign(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input.toString());
      const method = init?.method ?? "GET";
      requests.push({ method, pathname: url.pathname });
      if (url.pathname === "/api/bootstrap") {
        return new Response(JSON.stringify(bootstrap));
      }
      if (url.pathname === "/api/updates/vst3/latest") {
        return new Response(JSON.stringify(noUpdateResponse()));
      }
      if (url.pathname === "/api/modules" && method === "POST") {
        return new Response(JSON.stringify({ module: moduleDetailResponse("draft-2") }));
      }
      if (url.pathname === "/api/modules/draft-2/versions" && method === "POST") {
        return new Response(JSON.stringify({ ok: true }));
      }
      if (url.pathname === "/api/modules/draft-2/publish" && method === "POST") {
        return new Response("Publish response was lost.", { status: 502 });
      }
      if (url.pathname === "/api/modules/draft-2" && method === "DELETE") {
        return new Response(JSON.stringify({ error: { code: "module_published", message: "Published modules cannot be deleted." } }), { status: 409 });
      }
      if (url.pathname === "/api/modules/draft-2" && method === "GET") {
        return new Response(JSON.stringify({ module: moduleDetailResponse("draft-2", "Recovered") }));
      }
      return new Response("Not found", { status: 404 });
    }, { preconnect: globalThis.fetch.preconnect });

    render(() => <MarketplaceStoreProvider><TestHarness /></MarketplaceStoreProvider>);
    await waitFor(() => expect(screen.getByTestId("auth-state").textContent).toBe("signed-in"));
    await fireEvent.click(screen.getByRole("button", { name: "Prepare publish" }));
    await fireEvent.click(screen.getByRole("button", { name: "Upload" }));

    await waitFor(() => expect(screen.getByTestId("upload-state").textContent).toBe("success"));
    expect(requests).toContainEqual({ method: "DELETE", pathname: "/api/modules/draft-2" });
    expect(screen.getByTestId("toast-message").textContent).toBe("");
  });
});
