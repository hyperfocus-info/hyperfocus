import { afterEach, expect, it } from "bun:test";
import { render } from "@solidjs/testing-library";
import { createUiTest } from "../../../../utils/tests/test-harness";
import { FloatingLayer } from "./floating-layer";

const originalRequestAnimationFrame = window.requestAnimationFrame.bind(window);
const originalCancelAnimationFrame = window.cancelAnimationFrame.bind(window);

createUiTest("FloatingLayer", () => {
  afterEach(() => {
    window.requestAnimationFrame = originalRequestAnimationFrame;
    window.cancelAnimationFrame = originalCancelAnimationFrame;
  });

  it("does not schedule deferred layout after unmount", async () => {
    let requestedFrames = 0;
    window.requestAnimationFrame = () => {
      requestedFrames += 1;
      return requestedFrames;
    };
    window.cancelAnimationFrame = () => undefined;
    const anchor = document.createElement("button");
    document.body.append(anchor);
    const result = render(() => (
      <FloatingLayer open anchorRef={() => anchor}>
        Content
      </FloatingLayer>
    ));

    result.unmount();
    await Promise.resolve();

    expect(requestedFrames).toBe(0);
    anchor.remove();
  });

  it("positions from a virtual anchor without adding layout geometry", async () => {
    window.requestAnimationFrame = (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    };
    window.cancelAnimationFrame = () => undefined;

    render(() => (
      <FloatingLayer
        open
        anchorRect={() => new DOMRect(120, 80, 2, 2)}
        class="virtual-layer"
      >
        Cursor value
      </FloatingLayer>
    ));

    await Promise.resolve();

    const layer = document.body.querySelector<HTMLDivElement>(".virtual-layer");
    expect(layer?.textContent).toBe("Cursor value");
    if (!layer) throw new Error("Virtual-anchor layer was not portaled.");
    expect(layer.closest("#padpilot-overlay-root")).not.toBeNull();
    expect(layer.style.position).toBe("fixed");
    expect(layer.style.left).not.toBe("-10000px");
  });
});
