import { describe, expect, it } from "bun:test";
import { createDefaultFxChainState } from "./fx-chain-state";
import { createFxChainHistory } from "./fx-chain-history";

describe("Fx chain history", () => {
  it("dedupes snapshots, clears redo on push, and enforces the limit", () => {
    const history = createFxChainHistory(2);
    const a = createDefaultFxChainState();
    const b = createDefaultFxChainState();
    b.revision = 2n;
    const c = createDefaultFxChainState();
    c.revision = 3n;

    history.pushSnapshot(a);
    history.pushSnapshot(a);
    history.pushSnapshot(b);
    history.pushSnapshot(c);

    expect(history.canUndo()).toBe(true);
    const undo = history.undo(c);
    expect(undo?.revision).toBe(3n);
    expect(history.canRedo()).toBe(true);
  });
});
