/** @jsxImportSource solid-js */
import { beforeEach, expect, it, mock } from "bun:test";
import { fireEvent, render } from "@solidjs/testing-library";
import { resetToastStoreForTests, seedToastStoreForTests, toastStore } from "../toast-store";
import { createUiTest } from "../utils/tests/test-harness";
import { Toaster } from "./toaster";

createUiTest("Toaster", () => {
  beforeEach(() => {
    resetToastStoreForTests();
  });

  it("renders semantic tones and dismisses without activating the toast action", async () => {
    const onClick = mock(() => undefined);
    seedToastStoreForTests([
      { id: "toast-error", title: "Build failed", description: "Open the log", tone: "error", onClick }
    ]);
    const { container } = render(() => <Toaster />);
    const toast = container.querySelector("[data-test-toast]");

    expect(toast?.getAttribute("role")).toBe("alert");
    expect(toast?.getAttribute("data-toast-tone")).toBe("error");

    const dismiss = container.querySelector<HTMLButtonElement>("button[aria-label='Dismiss toast']");
    if (!dismiss) {
      throw new Error("Expected toast dismiss button");
    }
    fireEvent.click(dismiss);
    await Promise.resolve();

    expect(onClick).not.toHaveBeenCalled();
    expect(toastStore.toasts).toHaveLength(0);
  });

  it("invokes source navigation when the toast surface is clicked", () => {
    const onClick = mock(() => undefined);
    seedToastStoreForTests([{ id: "toast-info", title: "Run ready", tone: "info", onClick }]);
    const { container } = render(() => <Toaster />);
    const toast = container.querySelector<HTMLElement>("[data-test-toast]");
    if (!toast) {
      throw new Error("Expected toast surface");
    }

    fireEvent.click(toast);

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
