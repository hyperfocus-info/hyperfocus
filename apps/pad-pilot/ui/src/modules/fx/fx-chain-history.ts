import type { FxChainState } from "./fx-chain-state";
import { cloneFxChainState, encodeFxChainStateBase64 } from "./fx-chain-state";

type HistoryState = {
  canRedo: boolean;
  canUndo: boolean;
};

export type FxChainHistory = {
  canRedo: () => boolean;
  canUndo: () => boolean;
  clear: () => void;
  pushSnapshot: (state: FxChainState) => void;
  redo: (current: FxChainState) => FxChainState | null;
  undo: (current: FxChainState) => FxChainState | null;
};

export function createFxChainHistory(limit = 50) {
  const past: FxChainState[] = [];
  const future: FxChainState[] = [];
  const status: HistoryState = {
    canRedo: false,
    canUndo: false,
  };

  const refresh = () => {
    status.canUndo = past.length > 0;
    status.canRedo = future.length > 0;
  };

  const snapshotEquals = (left: FxChainState, right: FxChainState) =>
    encodeFxChainStateBase64(left) === encodeFxChainStateBase64(right);

  return {
    canRedo: () => status.canRedo,
    canUndo: () => status.canUndo,
    clear: () => {
      past.length = 0;
      future.length = 0;
      refresh();
    },
    pushSnapshot: (state) => {
      const snapshot = cloneFxChainState(state);
      const last = past[past.length - 1];
      if (last && snapshotEquals(last, snapshot)) {
        return;
      }
      past.push(snapshot);
      if (past.length > limit) {
        past.splice(0, past.length - limit);
      }
      future.length = 0;
      refresh();
    },
    redo: (current) => {
      const next = future.pop();
      if (!next) {
        refresh();
        return null;
      }
      past.push(cloneFxChainState(current));
      refresh();
      return cloneFxChainState(next);
    },
    undo: (current) => {
      const next = past.pop();
      if (!next) {
        refresh();
        return null;
      }
      future.push(cloneFxChainState(current));
      refresh();
      return cloneFxChainState(next);
    },
  } satisfies FxChainHistory;
}
