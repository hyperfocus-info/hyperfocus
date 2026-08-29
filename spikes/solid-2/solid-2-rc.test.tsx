/** @jsxImportSource @solidjs/web */
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { render } from "@solidjs/web";
import { createEffect, createRoot, createSignal, flush, onSettled } from "solid-js";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";

describe("Solid 2 RC migration contract", () => {
  beforeAll(() => GlobalRegistrator.register());
  afterAll(() => GlobalRegistrator.unregister());

  test("signal writes are visible only after a flush", () => {
    createRoot((dispose) => {
      const [count, setCount] = createSignal(0);
      setCount(1);
      expect(count()).toBe(0);
      flush();
      expect(count()).toBe(1);
      dispose();
    });
  });

  test("effects split tracked computation from untracked application", () => {
    createRoot((dispose) => {
      const values: number[] = [];
      const [count, setCount] = createSignal(0);
      createEffect(count, (value) => { values.push(value); });
      flush();
      setCount(1);
      flush();
      expect(values).toEqual([0, 1]);
      dispose();
    });
  });

  test("web rendering moved to @solidjs/web", () => {
    const host = document.createElement("div");
    const dispose = render(() => "Solid 2", host);
    flush();
    expect(host.textContent).toBe("Solid 2");
    dispose();
  });

  test("onSettled owns component-style cleanup", async () => {
    let cleaned = false;
    const host = document.createElement("div");
    const dispose = render(() => {
      onSettled(() => () => { cleaned = true; });
      return document.createElement("div");
    }, host);
    await Promise.resolve();
    dispose();
    expect(cleaned).toBe(true);
  });
});
