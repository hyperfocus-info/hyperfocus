/** @jsxImportSource solid-js */
import { expect, it } from "bun:test";
import { createSignal } from "solid-js";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { createUiTest } from "../../utils/tests/test-harness";
import { GlobalSearchView } from "../global-search-view";

const result = { path: "src/recovery.ts", name: "recovery.ts", matches: [{ line: 7, column: 4, preview: "recover customer workspace" }] };
function fixture(options: { query?: string; loading?: boolean; results?: typeof result[] } = {}) {
  const [regex, setRegex] = createSignal(false);
  const opened: unknown[] = [];
  const noop = () => undefined;
  render(() => <GlobalSearchView searchQuery={options.query ?? "recover"} replaceQuery="" regexSearch={regex()} caseSensitiveSearch={false}
    wholeWordSearch={false} searchLoading={options.loading ?? false} searchResults={options.results ?? []} searchTruncated={false}
    searchInputRef={noop} onOpenPath={(...args) => opened.push(args)} onSearchQuery={noop} onReplaceQuery={noop}
    onRegexSearch={setRegex} onCaseSensitiveSearch={noop} onWholeWordSearch={noop} />);
  return opened;
}
createUiTest("Batch2 file search semantics", () => {
  it("exposes regex selection and precise result coordinates", () => {
    const opened = fixture({ results: [result] });
    const regex = screen.getByRole("button", { name: "Regex" });
    expect(regex.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(regex);
    expect(regex.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: /7:4 recover customer/ }));
    expect(opened).toEqual([["src/recovery.ts", 7, 4]]);
  });
  it("announces loading while withholding stale result actions", () => {
    fixture({ loading: true, results: [result] });
    expect(screen.getByRole("status").textContent).toContain("Searching");
    expect(screen.queryByRole("button", { name: "src/recovery.ts" })).toBeNull();
  });
  it("distinguishes an empty query from no matches", () => {
    fixture({ query: "" });
    expect(screen.getByRole("status").textContent).toBe("Enter text to search project files.");
  });
  it("withholds retained result actions after clearing the query", () => {
    fixture({ query: "", results: [result] });
    expect(screen.queryByRole("button", { name: "src/recovery.ts" })).toBeNull();
  });
});
