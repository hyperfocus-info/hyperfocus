/** @jsxImportSource solid-js */
import { beforeEach, expect, it } from "bun:test";
import { fireEvent, render } from "@solidjs/testing-library";
import { harnessStore } from "../harness-store";
import { clearBrowserStateForTests } from "../utils/tests/store-test-utils";
import { createUiTest } from "../utils/tests/test-harness";
import { ConnectionBanner } from "./connection-banner";
import type { ClientCommand } from "@hyperfocus/ai-core/protocol";

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
    expect(container.querySelector("[data-test-connection-error]")?.textContent).toContain("Harness is unavailable");
  });

  it("keeps runtime resync failure visible with a manual retry action", () => {
    harnessStore.setConnectionState("error", "Active project runtime resync unavailable; retry connection");
    const { container } = render(() => <ConnectionBanner />);
    expect(container.querySelector("[data-test-connection-error]")?.textContent).toContain("runtime resync unavailable");
    expect(container.querySelector("[aria-label='Retry connection']")).not.toBeNull();
  });

  it("keeps oversized hydration gaps visible and retryable after the toast lifecycle", () => {
    const commands: ClientCommand[] = [];
    harnessStore.resetForTests({ pagingUnavailableItems: [
      { collection: "runs", id: "oversized-run", reason: "item-too-large" },
      { collection: "jobs", id: "oversized-job", reason: "item-too-large" }] });
    harnessStore.actions.setCommandDispatcher((command) => commands.push(command));
    const { container } = render(() => <ConnectionBanner />);
    expect(container.querySelector("[data-test-paging-unavailable]")?.textContent).toContain("oversized-run");
    fireEvent.click(container.querySelector("[aria-label='Retry unavailable items']")!);
    expect(commands).toEqual([{ type: "background-jobs.page.list", requestId: expect.any(String), payload: {
      jobs: { limit: 16 }, runs: { limit: 16 } } }]);
  });
});
