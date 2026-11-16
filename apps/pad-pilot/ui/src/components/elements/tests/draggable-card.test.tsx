import { expect, it } from "bun:test";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { createUiTest } from "../../../../../utils/tests/test-harness";
import { DraggableCard } from "../draggable-card";

createUiTest("DraggableCard", () => {
  it("renders title, subtitle, actions, and drag handle", () => {
    render(() => (
      <DraggableCard title="Node A" subtitle="Subtitle" actions={<button type="button">Action</button>} dragHandle>
        <div>Body</div>
      </DraggableCard>
    ));

    expect(screen.getByText("Node A")).not.toBeNull();
    expect(screen.getByText("Subtitle")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Action" })).not.toBeNull();
    expect(document.querySelector('[data-drag-handle="true"]')).not.toBeNull();
  });

  it("forwards root props and drag activation events", () => {
    let dragged = false;
    render(() => (
      <DraggableCard data-testid="drag-card" onDragPointerDown={() => { dragged = true; }} variant="node">
        <div>Body</div>
      </DraggableCard>
    ));

    const card = screen.getByTestId("drag-card");
    expect(card.getAttribute("data-variant")).toBe("node");
    fireEvent.pointerDown(card);
    expect(dragged).toBe(true);
  });
});
