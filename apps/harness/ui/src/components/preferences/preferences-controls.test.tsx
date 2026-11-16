/** @jsxImportSource solid-js */
import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { AdvancedDisclosure, PreferenceRow, SegmentedControl } from "./preferences-controls";
import { requireDetails } from "../../utils/tests/test-harness";

afterEach(cleanup);

test("segmented preference keyboard selection preserves numeric option values", () => {
  let selected: number | undefined;
  render(() => <SegmentedControl ariaLabel="Limit" value={1} options={[{ value: 1, label: "One" }, { value: 2, label: "Two" }]} onChange={value => { selected = value; }} />);
  const first = screen.getByRole("radio", { name: "One" });
  first.focus();
  fireEvent.keyDown(first, { key: "ArrowRight" });
  expect(selected).toBe(2);
  expect(document.activeElement).toBe(screen.getByRole("radio", { name: "Two" }));
});

describe("AdvancedDisclosure", () => {
  test("removes advanced controls from navigation until expanded", async () => {
    render(() => <AdvancedDisclosure title="Advanced guard"><label>Limit<input aria-label="Limit" /></label></AdvancedDisclosure>);
    const button = screen.getByRole("button", { name: /Advanced guard/i });
    const details = requireDetails(button.closest("details"));
    expect(details.open).toBe(false);
    fireEvent.click(button);
    expect(details.open).toBe(true);
    expect(await screen.findByLabelText("Limit")).not.toBeNull();
  });
});

describe("PreferenceRow", () => {
  test("wraps explanatory copy instead of hiding it behind an ellipsis", () => {
    render(() => (
      <PreferenceRow title="Provider API keys" description="Keys stay local to this machine and connection tests do not save drafts.">
        <input aria-label="API key" />
      </PreferenceRow>
    ));

    const description = screen.getByText(/Keys stay local/);
    expect(description.classList.contains("wrapText")).toBe(true);
    expect(description.classList.contains("truncate")).toBe(false);
    const heading = screen.getByRole("heading", { name: "Provider API keys" });
    expect(heading.classList.contains("truncate")).toBe(false);
    expect(heading.closest("section")?.classList.contains("overflowHidden")).toBe(false);
  });
});
