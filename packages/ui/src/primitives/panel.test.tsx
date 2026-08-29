import { afterEach, describe, expect, test } from "bun:test";
import { render } from "solid-js/web";
import { EmptyState, PanelHeader, PanelSection, PanelSurface } from "./panel";

afterEach(() => document.body.replaceChildren());

describe("panel primitives", () => {
  test("compose labeled surface anatomy without imposing editor concepts", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const dispose = render(() => (
      <PanelSurface aria-label="Project assets">
        <PanelHeader
          title="Assets"
          description="Files available to the project"
          headingAs="h3"
          actions={<button type="button">Import</button>}
        />
        <PanelSection heading="Images" headingAs="h4">
          <EmptyState
            title="No images"
            description="Import an image to get started."
            actions={<button type="button">Choose image</button>}
          />
        </PanelSection>
      </PanelSurface>
    ), host);

    expect(host.querySelector('[data-panel-surface]')?.getAttribute("aria-label")).toBe("Project assets");
    expect(host.querySelector("h3")?.textContent).toBe("Assets");
    expect(host.querySelector("h4")?.textContent).toBe("Images");
    expect(host.querySelector('[data-empty-state] strong')?.textContent).toBe("No images");
    expect(host.querySelectorAll("button").length).toBe(2);
    dispose();
  });
});
