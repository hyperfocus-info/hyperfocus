import { describe, expect, it } from "bun:test";
import { createRoot } from "solid-js";
import { createStore } from "solid-js/store";
import { updateStore } from "./store";

describe("updateStore", () => {
  it("applies nested mutations through produce", () => {
    createRoot((dispose) => {
      const [state, setState] = createStore({
        nested: { count: 1, enabled: false },
        values: [1, 2],
      });

      updateStore(setState, (draft) => {
        draft.nested.count = 4;
        draft.nested.enabled = true;
        draft.values.push(3);
      });

      expect(state.nested.count).toBe(4);
      expect(state.nested.enabled).toBe(true);
      expect(state.values).toEqual([1, 2, 3]);
      dispose();
    });
  });
});
