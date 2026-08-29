import { expect, it } from "bun:test";
import { render, screen } from "@solidjs/testing-library";
import { createUiTest } from "../../../../utils/tests/test-harness";
import { PreferencePanel } from "./preference-panel";

createUiTest("PreferencePanel", () => {
  it("renders header copy and section content", () => {
    render(() => (
      <PreferencePanel title="Preferences" description="Adjust your workflow" data-testid="panel-root">
        <PreferencePanel.Section title="Audio" description="Device and routing">
          <button type="button">Open audio settings</button>
        </PreferencePanel.Section>
      </PreferencePanel>
    ));

    expect(screen.getByTestId("panel-root")).not.toBeNull();
    expect(screen.getByText("Preferences")).not.toBeNull();
    expect(screen.getByText("Adjust your workflow")).not.toBeNull();
    expect(screen.getByText("Audio")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Open audio settings" })).not.toBeNull();
  });
});
