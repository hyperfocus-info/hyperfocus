import { expect, it } from "bun:test";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { createUiTest } from "../../../../utils/tests/test-harness";
import { Knob, knobAngleFromValue, knobValueFromDrag } from "./knob";

createUiTest("Knob", () => {
  it("calculates drag and angle helpers from the public math functions", () => {
    expect(knobValueFromDrag(0.5, -70, 0, 1)).toBeCloseTo(1);
    expect(knobValueFromDrag(0.5, 70, 0, 1)).toBeCloseTo(0);
    expect(knobAngleFromValue(0.5, 0, 1)).toBeCloseTo(0);
  });

  it("renders a slider role and forwards host props", () => {
    render(() => (
      <Knob min={0} max={1} value={0.5} onChange={() => undefined} label="Mix" data-testid="mix-knob" aria-label="Mix knob" />
    ));

    const knob = screen.getByRole("slider", { name: "Mix knob" });
    expect(knob).toBe(screen.getByTestId("mix-knob"));
    expect(knob.getAttribute("aria-valuenow")).toBe("0.5");
    expect(screen.getByText("Mix")).not.toBeNull();
  });

  it("commits keyboard interaction through public callbacks", () => {
    const changes: number[] = [];
    const commits: number[] = [];

    const Demo = () => {
      const [value, setValue] = createSignal(0.5);
      return (
        <Knob
          min={0}
          max={1}
          value={value()}
          onChange={(next) => {
            changes.push(next);
            setValue(next);
          }}
          onCommit={(next) => commits.push(next)}
          aria-label="Gain knob"
        />
      );
    };

    render(() => <Demo />);

    const knob = screen.getByRole("slider", { name: "Gain knob" });
    fireEvent.keyDown(knob, { key: "ArrowUp" });

    expect(changes.length).toBe(1);
    expect(commits.length).toBe(1);
    expect(Number(knob.getAttribute("aria-valuenow"))).toBeGreaterThan(0.5);
  });

  it("commits and removes window drag listeners when unmounted mid-drag", () => {
    const changes: number[] = [];
    const commits: number[] = [];
    const view = render(() => (
      <Knob
        min={0}
        max={1}
        value={0.5}
        onChange={(value) => changes.push(value)}
        onCommit={(value) => commits.push(value)}
        aria-label="Unmount knob"
      />
    ));
    const knob = screen.getByRole("slider", { name: "Unmount knob" });

    fireEvent.pointerDown(knob, { clientY: 100, pointerId: 1 });
    window.dispatchEvent(new PointerEvent("pointermove", { clientY: 30 }));
    view.unmount();

    expect(commits).toEqual([1]);
    const changeCount = changes.length;
    window.dispatchEvent(new PointerEvent("pointermove", { clientY: 90 }));
    expect(changes.length).toBe(changeCount);
  });
});
