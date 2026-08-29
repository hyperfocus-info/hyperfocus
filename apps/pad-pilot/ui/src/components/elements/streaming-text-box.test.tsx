import { expect, it } from "bun:test";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { createUiTest } from "../../../../utils/tests/test-harness";
import { StreamingTextBox } from "./streaming-text-box";

function setScrollMetrics(element: HTMLElement, metrics: { clientHeight: number; scrollHeight: number; scrollTop: number }) {
  Object.defineProperty(element, "clientHeight", { configurable: true, get: () => metrics.clientHeight });
  Object.defineProperty(element, "scrollHeight", { configurable: true, get: () => metrics.scrollHeight });
  Object.defineProperty(element, "scrollTop", {
    configurable: true,
    get: () => metrics.scrollTop,
    set: (value: number) => {
      metrics.scrollTop = value;
    },
  });
}

createUiTest("StreamingTextBox", () => {
  it("copies all streamed lines with an icon-only tooltip button", () => {
    let copied = "";
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText(value: string) {
          copied = value;
          return Promise.resolve();
        },
      },
    });

    render(() => <StreamingTextBox copyButton lines={["boot", "done"]} />);

    const copy = screen.getByRole("button", { name: "Copy terminal output" });
    expect(copy.getAttribute("data-icon-only")).toBe("true");
    fireEvent.click(copy);

    expect(copied).toBe("boot\ndone");
  });

  it("shows a scroll-to-bottom button only after the user scrolls away from the bottom", () => {
    render(() => <StreamingTextBox lines={["boot", "done"]} />);
    const viewport = screen.getByText("boot").parentElement as HTMLElement;
    const metrics = { clientHeight: 100, scrollHeight: 400, scrollTop: 300 };
    setScrollMetrics(viewport, metrics);
    fireEvent.scroll(viewport);

    expect(screen.queryByRole("button", { name: "Scroll to bottom" })).toBeNull();

    metrics.scrollTop = 120;
    fireEvent.scroll(viewport);

    const scrollButton = screen.getByRole("button", { name: "Scroll to bottom" });
    fireEvent.click(scrollButton);

    expect(metrics.scrollTop).toBe(400);
  });

  it("auto-scrolls new content only when already pinned to the bottom", async () => {
    function Harness() {
      const [lines, setLines] = createSignal(["boot"]);
      return (
        <>
          <button onClick={() => setLines((value) => [...value, `line ${value.length}`])}>append</button>
          <StreamingTextBox autoScroll lines={lines()} />
        </>
      );
    }

    render(() => <Harness />);
    const viewport = screen.getByText("boot").parentElement as HTMLElement;
    const metrics = { clientHeight: 100, scrollHeight: 300, scrollTop: 200 };
    setScrollMetrics(viewport, metrics);
    fireEvent.scroll(viewport);

    metrics.scrollHeight = 460;
    fireEvent.click(screen.getByRole("button", { name: "append" }));
    await Promise.resolve();
    await Promise.resolve();

    expect(metrics.scrollTop).toBe(460);

    metrics.scrollTop = 120;
    fireEvent.scroll(viewport);
    metrics.scrollHeight = 620;
    fireEvent.click(screen.getByRole("button", { name: "append" }));
    await Promise.resolve();
    await Promise.resolve();

    expect(metrics.scrollTop).toBe(120);
  });
});
