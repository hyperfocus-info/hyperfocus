import { afterEach, describe, expect, test } from "bun:test";
import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import { SegmentedControl } from "./segmented-control";

afterEach(() => document.body.replaceChildren());

describe("SegmentedControl", () => {
  test("uses radio semantics and keyboard selection while skipping disabled options", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const [value, setValue] = createSignal<"select" | "paint" | "erase">("select");
    const dispose = render(() => (
      <SegmentedControl
        ariaLabel="Stage tool"
        value={value()}
        onValueChange={setValue}
        options={[
          { value: "select", label: "Select" },
          { value: "paint", label: "Paint", disabled: true },
          { value: "erase", label: "Erase" },
        ]}
      />
    ), host);

    const group = host.querySelector<HTMLElement>('[role="radiogroup"]')!;
    const options = host.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    expect(group.getAttribute("aria-label")).toBe("Stage tool");
    expect(options[0].getAttribute("aria-checked")).toBe("true");
    options[0].focus();
    options[0].dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowRight" }));
    expect(document.activeElement).toBe(options[2]);
    expect(value()).toBe("erase");
    expect(options[2].tabIndex).toBe(0);
    dispose();
  });
});
