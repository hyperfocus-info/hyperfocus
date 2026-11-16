/** @jsxImportSource solid-js */
import { beforeEach, expect, it } from "bun:test";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { createUiTest } from "../../utils/tests/test-harness";
import { clearBrowserStateForTests, seedHarnessStoreForTests } from "../../utils/tests/store-test-utils";
import { createHarnessStateFixture } from "../../utils/tests/test-fixtures";
import { harnessStore } from "../../harness-store";
import { ModelSelect } from "./model-select";

createUiTest("ModelSelect", () => {
  beforeEach(() => { clearBrowserStateForTests(); localStorage.removeItem("harness.favorite-models"); seedHarnessStoreForTests(createHarnessStateFixture()); });

  it("shares and persists favorites without changing the selected model", () => {
    const changes: string[] = [];
    const options = [{ value: "model-a", label: "Model A" }, { value: "model-b", label: "Model B" }];
    render(() => <><ModelSelect ariaLabel="Chat model" options={options} value="model-b" onChange={value => changes.push(value)} /><ModelSelect ariaLabel="Assistant model" options={options} value="model-b" onChange={value => changes.push(value)} /></>);
    fireEvent.click(screen.getByRole("button", { name: "Chat model" }));
    fireEvent.click(screen.getByRole("button", { name: "Favorite Model B" }));
    expect(screen.getByRole("button", { name: "Unfavorite Model B" })).not.toBeNull();
    expect(JSON.parse(localStorage.getItem("harness.favorite-models")!)).toEqual(["model-b"]);
    expect(changes).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Favorites" }));
    expect(screen.getAllByRole("row")).toHaveLength(1);
    expect(screen.getAllByRole("row")[0]?.textContent).toContain("Model B");
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Assistant model" }));
    expect(screen.getByRole("button", { name: "Unfavorite Model B" })).not.toBeNull();
  });

  it("filters models using actual capability metadata", () => {
    const model = harnessStore.state.capabilities.flatMap(provider => provider.models).find(model => model.tags.length > 0)!;
    render(() => <ModelSelect ariaLabel="Model" options={[{ value: model.modelId, label: "Known model" }, { value: "unknown-model", label: "Unknown model" }]} value={model.modelId} onChange={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Model" }));
    fireEvent.click(screen.getByRole("button", { name: model.tags[0]! }));
    expect(screen.getByRole("button", { name: "Known model" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Unknown model" })).toBeNull();
  });
});
