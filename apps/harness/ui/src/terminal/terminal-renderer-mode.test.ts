import { expect, test } from "bun:test";
import { createUiTest, setTestUrl } from "../utils/tests/test-harness";
import { shouldUseSolidTerminalRenderer } from "./terminal-renderer-mode";

createUiTest("terminal renderer mode", () => {
  test("forces solid renderer from terminal query param", () => {
    const originalUrl = window.location.href;
    try {
      setTestUrl("http://localhost/");
      expect(shouldUseSolidTerminalRenderer("xterm-webgl")).toBe(false);

      window.history.pushState({}, "", "/?terminal=solid");
      expect(shouldUseSolidTerminalRenderer("xterm-webgl")).toBe(true);
      expect(shouldUseSolidTerminalRenderer("solid-prototype")).toBe(true);
    } finally {
      setTestUrl(originalUrl);
    }
  });
});
