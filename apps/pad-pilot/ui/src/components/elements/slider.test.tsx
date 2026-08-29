import { expect, it } from "bun:test";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { createUiTest } from "../../../../utils/tests/test-harness";
import { Slider } from "./slider";

createUiTest("Slider", () => {
  it("exposes orientation and supports keyboard changes", () => {
    const Demo = () => {
      const [value, setValue] = createSignal(0.5);
      return <Slider aria-label="Level" min={0} max={1} value={value()} onChange={setValue} />;
    };

    render(() => <Demo />);

    const slider = screen.getByRole("slider", { name: "Level" });
    expect(slider.getAttribute("aria-orientation")).toBe("vertical");

    fireEvent.keyDown(slider, { key: "ArrowUp" });

    expect(Number(slider.getAttribute("aria-valuenow"))).toBeGreaterThan(0.5);
  });

  it("supports wheel adjustment with Shift fine control", () => {
    const Demo = () => {
      const [value, setValue] = createSignal(50);
      return <Slider aria-label="Gain" min={0} max={100} value={value()} onChange={setValue} orientation="horizontal" />;
    };

    render(() => <Demo />);

    const slider = screen.getByRole("slider", { name: "Gain" });
    fireEvent.wheel(slider, { deltaY: -100 });
    expect(slider.getAttribute("aria-valuenow")).toBe("51");

    const shiftWheel = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: -100 });
    Object.defineProperty(shiftWheel, "shiftKey", { value: true });
    slider.dispatchEvent(shiftWheel);
    expect(slider.getAttribute("aria-valuenow")).toBe("51.2");
  });

  it("cycles discrete snap values with wheel and keyboard", () => {
    const Demo = () => {
      const [value, setValue] = createSignal(4);
      return (
        <Slider
          aria-label="Bars"
          min={2}
          max={32}
          value={value()}
          onChange={setValue}
          orientation="horizontal"
          snapValues={[2, 4, 8, 16, 32]}
        />
      );
    };

    render(() => <Demo />);

    const slider = screen.getByRole("slider", { name: "Bars" });
    fireEvent.wheel(slider, { deltaY: -100 });
    expect(slider.getAttribute("aria-valuenow")).toBe("8");

    fireEvent.keyDown(slider, { key: "ArrowLeft" });
    expect(slider.getAttribute("aria-valuenow")).toBe("4");
  });

  it("commits keyboard changes and closes an active pointer interaction on unmount", () => {
    const changes: number[] = [];
    const commits: number[] = [];
    const view = render(() => (
      <Slider
        aria-label="Automation"
        min={0}
        max={1}
        value={0.5}
        onChange={(value) => changes.push(value)}
        onCommit={(value) => commits.push(value)}
        orientation="horizontal"
      />
    ));
    const slider = screen.getByRole("slider", { name: "Automation" });
    slider.getBoundingClientRect = () => ({
      bottom: 20,
      height: 20,
      left: 0,
      right: 100,
      top: 0,
      width: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    fireEvent.keyDown(slider, { key: "ArrowRight" });
    expect(commits).toEqual([0.51]);

    fireEvent.pointerDown(slider, { clientX: 75, clientY: 10, pointerId: 1 });
    view.unmount();
    expect(commits).toEqual([0.51, 0.75]);

    const changeCount = changes.length;
    window.dispatchEvent(new PointerEvent("pointermove", { clientX: 90, clientY: 10 }));
    expect(changes.length).toBe(changeCount);
  });
});
