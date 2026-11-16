/** @jsxImportSource solid-js */
import { beforeEach, expect, it } from "bun:test";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { createUiTest } from "../../utils/tests/test-harness";
import { TerminalTabs } from "../terminal-tabs";
import { TerminalSearch } from "../terminal-search";
import { terminalStore } from "../terminal-store";

function tabs() {
  const renamed: unknown[] = [];
  render(() => <TerminalTabs sessions={[{ id: "terminal-one", name: "Recovery", status: "running" }]} activeSessionId="terminal-one"
    onSelect={() => undefined} onRename={(...args) => renamed.push(args)} onClose={() => undefined} />);
  return renamed;
}
createUiTest("Batch2 terminal controls", () => {
  beforeEach(() => terminalStore.resetForTests({ searchOpen: true, searchQuery: "recovery" }));
  it("cancels rename on Escape without a blur commit", async () => {
    const renamed = tabs();
    fireEvent.click(screen.getByRole("button", { name: "Rename Recovery" }));
    await Promise.resolve();
    const input = screen.getByRole("textbox", { name: "Rename terminal" });
    fireEvent.input(input, { target: { value: "Discard this draft" } });
    fireEvent.keyDown(input, { key: "Escape" });
    fireEvent.blur(input);
    expect(renamed).toEqual([]);
    expect(screen.queryByRole("textbox", { name: "Rename terminal" })).toBeNull();
  });
  it("commits a trimmed rename once on Enter followed by blur", async () => {
    const renamed = tabs();
    fireEvent.click(screen.getByRole("button", { name: "Rename Recovery" }));
    await Promise.resolve();
    const input = screen.getByRole("textbox", { name: "Rename terminal" });
    fireEvent.input(input, { target: { value: "  Verified  " } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.blur(input);
    expect(renamed).toEqual([["terminal-one", "Verified"]]);
  });
  it("returns keyboard focus after cancelling rename", async () => {
    tabs();
    const rename = screen.getByRole("button", { name: "Rename Recovery" });
    fireEvent.click(rename);
    await Promise.resolve();
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Rename terminal" }), { key: "Escape" });
    await Promise.resolve();
    expect(document.activeElement?.getAttribute("aria-pressed")).toBe("true");
  });
  it("supports Enter, Shift+Enter, and Escape search commands", () => {
    const actions: string[] = [];
    render(() => <TerminalSearch onNext={() => actions.push("next")} onPrevious={() => actions.push("previous")} />);
    const input = screen.getByRole("textbox", { name: "Search terminal" });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(actions).toEqual(["next", "previous"]);
    expect(terminalStore.state.searchOpen).toBe(false);
    expect(terminalStore.state.searchQuery).toBe("");
  });
});
