import { afterEach, describe, expect, test } from "bun:test";
import { registerOverlay } from "./overlay-stack";

afterEach(() => document.body.replaceChildren());

describe("overlay stack", () => {
  test("Escape closes only the top overlay and can restore its trigger focus", () => {
    const firstTrigger = document.createElement("button");
    const secondTrigger = document.createElement("button");
    document.body.append(firstTrigger, secondTrigger);
    const closed: string[] = [];
    let unregisterFirst: () => void = () => undefined;
    let unregisterSecond: () => void = () => undefined;
    unregisterFirst = registerOverlay({
      id: "first-menu",
      close: () => {
        closed.push("first");
        unregisterFirst();
        firstTrigger.focus();
      },
    });
    unregisterSecond = registerOverlay({
      id: "second-menu",
      close: () => {
        closed.push("second");
        unregisterSecond();
        secondTrigger.focus();
      },
    });

    document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
    expect(closed).toEqual(["second"]);
    expect(document.activeElement).toBe(secondTrigger);
    document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
    expect(closed).toEqual(["second", "first"]);
    expect(document.activeElement).toBe(firstTrigger);
  });
});
