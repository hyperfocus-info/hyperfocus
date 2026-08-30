import {
  createEffect,
  on,
  onCleanup,
  onMount,
  type Accessor,
} from "solid-js";
import type { SetStoreFunction } from "solid-js/store";
import { subscribeHostState } from "../../../bridge";
import { fxGraph, fxVisualizer } from "../../../padpilot/fx-capabilities";
import { updateStore } from "../../../utils/store";
import { loadBundledFxPresets } from "../fx-bundled-presets";
import type { FxChainState } from "../fx-chain-state";
import { sameSnapshot } from "../fx-module-state-utils";
import {
  loadFxUiPreferences,
  persistFxUiPreferences,
} from "../fx-ui-preferences";
import {
  loadFavoritePresetIds,
  persistFavoritePresetIds,
} from "../fx-storage";
import { smoothVisualizerFrame } from "../fx-visualizer-smoothing";
import type {
  FxModuleInteraction,
  FxModuleStateShape,
} from "./fx-module-store-contracts";
import type { FxModuleStoreHelpers } from "./fx-module-store-helpers";

type FxModuleEffectsOptions = {
  canonicalSnapshot: () => FxChainState;
  helpers: FxModuleStoreHelpers;
  moduleInteraction: FxModuleInteraction;
  presetItems: Accessor<readonly { id: string; label: string }[]>;
  selectedPresetId: Accessor<string>;
  setState: SetStoreFunction<FxModuleStateShape>;
  state: FxModuleStateShape;
};

export function installFxModuleEffects(options: FxModuleEffectsOptions) {
  const {
    canonicalSnapshot,
    helpers,
    moduleInteraction,
    presetItems,
    selectedPresetId,
    setState,
    state,
  } = options;
  let visualizerFrameRequest: number | null = null;
  let lastVisualizerFrameAt = 0;

  onMount(() => {
    const bundledPresetLoad = new AbortController();
    updateStore(setState, (draft) => {
      draft.favorites.presetIds = loadFavoritePresetIds();
      draft.preferences = loadFxUiPreferences();
      draft.host.storageReady = true;
    });

    loadBundledFxPresets(fetch, bundledPresetLoad.signal)
      .then((presets) => {
        if (bundledPresetLoad.signal.aborted) {
          return;
        }
        updateStore(setState, (draft) => {
          draft.host.bundledPresets = presets.map((preset) => ({
            id: preset.id,
            name: preset.name,
            description: preset.description,
          }));
          draft.host.bundledPresetPayloadById = Object.fromEntries(
            presets.map((preset) => [preset.id, preset.payloadBase64])
          );
        });
      })
      .catch(() => undefined);
    onCleanup(() => bundledPresetLoad.abort());
  });

  createEffect(() => {
    if (!state.host.storageReady) {
      return;
    }

    persistFavoritePresetIds(state.favorites.presetIds);
  });

  createEffect(() => {
    if (!state.host.storageReady) {
      return;
    }

    persistFxUiPreferences(state.preferences);
  });

  createEffect(
    on(
      () => canonicalSnapshot(),
      (next) => {
        updateStore(setState, (draft) => {
          draft.session.canonicalRevision = next.revision;
        });

        if (!sameSnapshot(next, helpers.getWorkingSnapshot())) {
          helpers.replaceWorking(next);
        }
      }
    )
  );

  createEffect(() => {
    const nextDirty = !sameSnapshot(
      canonicalSnapshot(),
      helpers.getWorkingSnapshot()
    );
    if (state.session.dirty === nextDirty) {
      return;
    }

    updateStore(setState, (draft) => {
      draft.session.dirty = nextDirty;
    });
  });

  createEffect(() => {
    const selected = presetItems().find(
      (item) => item.id === selectedPresetId()
    );
    if (!selected) {
      return;
    }

    if (
      state.ui.modulePreset.open &&
      state.ui.modulePreset.query.trim().length > 0
    ) {
      return;
    }

    if (
      state.ui.modulePreset.query === selected.label &&
      state.ui.modulePreset.draftName === selected.label
    ) {
      return;
    }

    updateStore(setState, (draft) => {
      draft.ui.modulePreset.query = selected.label;
      draft.ui.modulePreset.draftName = selected.label;
    });
  });

  onMount(() => {
    const tick = (timestamp: number) => {
      const deltaMs =
        lastVisualizerFrameAt > 0 ? timestamp - lastVisualizerFrameAt : 16;
      lastVisualizerFrameAt = timestamp;
      updateStore(setState, (draft) => {
        draft.host.displayVisualizer = smoothVisualizerFrame(
          draft.host.displayVisualizer,
          draft.host.rawVisualizer,
          deltaMs
        );
      });
      visualizerFrameRequest = window.requestAnimationFrame(tick);
    };

    visualizerFrameRequest = window.requestAnimationFrame(tick);
    onCleanup(() => {
      if (visualizerFrameRequest !== null) {
        window.cancelAnimationFrame(visualizerFrameRequest);
      }

      for (let index = 0; index < helpers.activeHostSyncHolds.size; index += 1) {
        moduleInteraction.end();
      }
      helpers.activeHostSyncHolds.clear();

      for (const parameterId of helpers.activeAutomationTouches) {
        fxGraph.endAutomationTouch(parameterId, "fx");
      }
      helpers.activeAutomationTouches.clear();

      for (const timeoutId of helpers.toastTimeouts.values()) {
        window.clearTimeout(timeoutId);
      }
      helpers.toastTimeouts.clear();
    });
  });

  onMount(() => {
    const unsubscribe = subscribeHostState((hostState) => {
      const presets = hostState.presets;
      if (!presets) {
        return;
      }
      updateStore(setState, (draft) => {
        draft.host.presets = presets;
      });
    });
    const stopVisualizer = fxVisualizer.subscribe({
      onFrame: (frame) => {
        updateStore(setState, (draft) => {
          draft.host.rawVisualizer = frame;
        });
      },
    });

    onCleanup(() => {
      fxGraph.setPreviewBypass(false, "fx");
      unsubscribe();
      stopVisualizer.close();
    });
  });
}
