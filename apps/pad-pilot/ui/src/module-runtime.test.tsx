import { afterAll, afterEach, expect, it, jest, mock } from "bun:test";
import { render, screen } from "@solidjs/testing-library";
import { createUiTest } from "../../utils/tests/test-harness";

const externalRegisterCalls: unknown[] = [];
const originalUnsafeExternalModuleUi = process.env.PADPILOT_ALLOW_UNSAFE_EXTERNAL_MODULE_UI;
process.env.PADPILOT_ALLOW_UNSAFE_EXTERNAL_MODULE_UI = "true";

mock.module("@tests/padpilot-external-module", () => ({
  default: {
    manifest: {
      id: "external-module",
      name: "External Module",
      version: "2.0.0",
      moduleApiVersion: "0.2.0",
      uiEntry: "@tests/padpilot-external-module",
      stateSchemaVersion: 3,
      capabilities: ["module-state"],
      minHostVersion: "0.2.0",
      assets: { icon: "/icon.svg" },
      migrations: ["migrate-v2"],
    },
    register(context: unknown) {
      externalRegisterCalls.push(context);
    },
    Component() {
      return <div>External module body</div>;
    },
  },
}));

mock.module("@tests/padpilot-spoofed-module", () => ({
  default: {
    manifest: {
      id: "fx",
      name: "Spoofed Module",
      version: "1.0.0",
      moduleApiVersion: "0.1.0",
      uiEntry: "@tests/padpilot-spoofed-module",
      stateSchemaVersion: 1,
      capabilities: ["module-state"],
      minHostVersion: "0.1.0",
    },
    Component() {
      return <div>Spoofed module</div>;
    },
  },
}));

mock.module("@tests/padpilot-cross-register-module", () => ({
  default: {
    manifest: {
      id: "cross-register",
      name: "Cross Register",
      version: "1.0.0",
      moduleApiVersion: "0.1.0",
      uiEntry: "@tests/padpilot-cross-register-module",
      stateSchemaVersion: 1,
      capabilities: ["module-state"],
      minHostVersion: "0.1.0",
    },
    register(context: { registerModuleStateCodec: (moduleId: string, codec: unknown) => void }) {
      context.registerModuleStateCodec("fx", { decode() {}, encode() {} });
    },
    Component() {
      return <div>Cross register module</div>;
    },
  },
}));

const { MissingModuleView, ModuleRuntimeView, loadPadPilotModule } = await import("./module-runtime");

afterEach(() => {
  externalRegisterCalls.length = 0;
});

afterAll(() => {
  if (originalUnsafeExternalModuleUi === undefined) {
    delete process.env.PADPILOT_ALLOW_UNSAFE_EXTERNAL_MODULE_UI;
  } else {
    process.env.PADPILOT_ALLOW_UNSAFE_EXTERNAL_MODULE_UI = originalUnsafeExternalModuleUi;
  }
  jest.restoreAllMocks();
});

createUiTest("ModuleRuntime", () => {
  it("renders missing module states and sanitized error details", () => {
    render(() => (
      <MissingModuleView
        module={{
          id: "recut",
          name: "Recut",
          loadStatus: "incompatible-host",
          expectedModuleVersion: "2.0.0",
          resolvedModuleVersion: "1.0.0",
          uiEntryPath: "file:///bundles/recut/index.js",
          loadErrorMessage: "  exploded  ",
        }}
      />
    ));

    expect(screen.getByText("Module recut requires a newer PadPilot host.")).toBeTruthy();
    expect(screen.getByText("Expected 2.0.0; resolved 1.0.0.")).toBeTruthy();
    expect(screen.getByText("Entry: file:///bundles/recut/index.js")).toBeTruthy();
    expect(screen.getByText("exploded")).toBeTruthy();
  });

  it("renders provided runtime definition component", () => {
    render(() => (
      <ModuleRuntimeView
        definition={{
          manifest: {
            id: "test",
            name: "Test",
            version: "1.0.0",
            moduleApiVersion: "0.1.0",
            uiEntry: "builtin://test",
            stateSchemaVersion: 1,
            capabilities: [],
            minHostVersion: "0.1.0",
          },
          Component: () => <div>Runtime body</div>,
        }}
      />
    ));

    expect(screen.getByText("Runtime body")).toBeTruthy();
  });

  it("loads starter modules with default manifest fields", async () => {
    const loaded = await loadPadPilotModule({
      id: "starter-runtime",
      name: "Starter Runtime",
      version: "0.9.0",
      uiEntryPath: "builtin://starter/runtime",
    });

    expect(loaded.manifest).toMatchObject({
      id: "starter-runtime",
      name: "Starter Runtime",
      version: "0.9.0",
      moduleApiVersion: "0.1.0",
      uiEntry: "builtin://starter/runtime",
      capabilities: ["module-state", "script-runtime"],
      minHostVersion: "0.1.0",
    });
    expect(typeof loaded.Component).toBe("function");
  });

  it("normalizes external module manifests and only runs register once per entry", async () => {
    const first = await loadPadPilotModule({
      id: "external-module",
      name: "External Module",
      uiEntryPath: "@tests/padpilot-external-module",
      capabilities: ["module-state"],
    });
    const second = await loadPadPilotModule({
      id: "external-module",
      name: "External Module",
      uiEntryPath: "@tests/padpilot-external-module",
      capabilities: ["module-state"],
    });

    expect(first.manifest).toMatchObject({
      id: "external-module",
      name: "External Module",
      version: "2.0.0",
      moduleApiVersion: "0.2.0",
      uiEntry: "@tests/padpilot-external-module",
      stateSchemaVersion: 3,
      capabilities: ["module-state"],
      minHostVersion: "0.2.0",
      assets: { icon: "/icon.svg" },
      migrations: ["migrate-v2"],
    });
    expect(second.manifest).toEqual(first.manifest);
    expect(externalRegisterCalls).toHaveLength(1);
    expect(externalRegisterCalls[0]).toMatchObject({
      module: {
        id: "external-module",
        name: "External Module",
        uiEntryPath: "@tests/padpilot-external-module",
      },
    });
  });

  it("fails closed for external UI bundles without an explicit unsafe development opt-in", async () => {
    process.env.PADPILOT_ALLOW_UNSAFE_EXTERNAL_MODULE_UI = "false";
    try {
      await expect(loadPadPilotModule({
        id: "external-module",
        name: "External Module",
        uiEntryPath: "@tests/padpilot-external-module",
        capabilities: ["module-state"],
      })).rejects.toThrow("disabled until it can run in a sandboxed Module realm");
    } finally {
      process.env.PADPILOT_ALLOW_UNSAFE_EXTERNAL_MODULE_UI = "true";
    }
  });

  it("fails fast when module entry path missing", async () => {
    await expect(
      loadPadPilotModule({
        id: "broken-module",
        name: "Broken Module",
      }),
    ).rejects.toThrow('Module "broken-module" is missing a bundle entry.');
  });

  it("rejects bundle identity spoofing and cross-module state registration", async () => {
    await expect(loadPadPilotModule({
      id: "spoofed-module",
      name: "Spoofed Module",
      version: "1.0.0",
      capabilities: ["module-state"],
      uiEntryPath: "@tests/padpilot-spoofed-module",
    })).rejects.toThrow('tried to register as "fx"');

    await expect(loadPadPilotModule({
      id: "cross-register",
      name: "Cross Register",
      version: "1.0.0",
      capabilities: ["module-state"],
      uiEntryPath: "@tests/padpilot-cross-register-module",
    })).rejects.toThrow('cannot register state for "fx"');
  });
});
