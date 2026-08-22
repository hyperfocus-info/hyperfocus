/** @jsxImportSource solid-js */
import { beforeEach, expect, it } from "bun:test";
import { render } from "@solidjs/testing-library";
import { harnessStore } from "../harness-store";
import { clearBrowserStateForTests } from "../utils/tests/store-test-utils";
import { createUiTest } from "../utils/tests/test-harness";
import { ConnectionBanner } from "./connection-banner";

createUiTest("ConnectionBanner", () => {
  beforeEach(() => {
    clearBrowserStateForTests();
  });

  it("exposes connection state and error details without legacy class state", () => {
    harnessStore.setConnectionState("error", "Harness is unavailable");
    const { container } = render(() => <ConnectionBanner />);
    const banner = container.querySelector("[data-test-connection-banner]");

    expect(banner?.getAttribute("role")).toBe("status");
    expect(banner?.getAttribute("data-connection-state")).toBe("error");
    expect(banner?.textContent).toContain("error");
    expect(container.querySelector("[data-test-connection-error]")?.textContent).toBe("Harness is unavailable");
  });
});
