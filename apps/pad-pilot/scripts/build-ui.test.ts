import { describe, expect, it } from "bun:test";

import { uiMarketplaceBuildEnv, externalModuleUiBuildFlag, parseBuildUiArguments, uiBuildOutputMode } from "./build-ui";
import { REQUIRED_UI_ENTRY_ASSETS } from "./ui-build-contract";

it("keeps the UI HTML, script, and stylesheet entry contract together", () => {
  expect(REQUIRED_UI_ENTRY_ASSETS).toEqual(["index.html", "main.js", "main.css"]);
});

describe("externalModuleUiBuildFlag", () => {
  it("fails closed unless the unsafe external Module UI flag is exactly true", () => {
    expect(externalModuleUiBuildFlag({})).toBe("false");
    expect(externalModuleUiBuildFlag({ PADPILOT_ALLOW_UNSAFE_EXTERNAL_MODULE_UI: "TRUE" })).toBe("false");
    expect(externalModuleUiBuildFlag({ PADPILOT_ALLOW_UNSAFE_EXTERNAL_MODULE_UI: "1" })).toBe("false");
    expect(externalModuleUiBuildFlag({ PADPILOT_ALLOW_UNSAFE_EXTERNAL_MODULE_UI: "true" })).toBe("true");
  });
});

describe("uiBuildOutputMode", () => {
  it("keeps interactive development debuggable", () => {
    expect(uiBuildOutputMode({ embedded: false, minify: false })).toEqual({
      minify: false,
      sourcemap: "inline",
    });
  });

  it("compacts embedded assets without changing development runtime defines", () => {
    expect(uiBuildOutputMode({ embedded: true, minify: false })).toEqual({
      minify: true,
      sourcemap: "none",
    });
  });
});

describe("parseBuildUiArguments", () => {
  it("accepts a dedicated embedded output directory", () => {
    const parsed = parseBuildUiArguments(["--embedded", "--output-directory", "build/embedded-ui"]);
    expect(parsed.embedded).toBe(true);
    expect(parsed.minify).toBe(false);
    expect(parsed.outputDirectory).toBeTruthy();
    expect(parsed.outputDirectory?.replaceAll("\\", "/")).toEndWith("/build/embedded-ui");
  });

  it("rejects missing output paths and unknown arguments", () => {
    expect(() => parseBuildUiArguments(["--output-directory"])).toThrow("requires a path");
    expect(() => parseBuildUiArguments(["--wat"])).toThrow("Unknown build-ui argument");
  });
});


it("binds development API and websocket origins to the managed server without changing production", () => {
  expect(uiMarketplaceBuildEnv({ minify: false, environment: { PADPILOT_PUBLIC_ORIGIN: 'http://127.0.0.1:43217' } }).MARKETPLACE_URL).toBe('http://127.0.0.1:43217');
  expect(uiMarketplaceBuildEnv({ minify: false, environment: {} }).MARKETPLACE_URL).toBe('http://localhost:3000');
  expect(uiMarketplaceBuildEnv({ minify: true, environment: { PADPILOT_PUBLIC_ORIGIN: 'http://127.0.0.1:43217' } }).MARKETPLACE_URL).toBe('https://padpilot.hyperfocus.info');
  expect(() => uiMarketplaceBuildEnv({ minify: false, environment: { PADPILOT_PUBLIC_ORIGIN: 'http://user:password@localhost/' } })).toThrow('origin');
});
