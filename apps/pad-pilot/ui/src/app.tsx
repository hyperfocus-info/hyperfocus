import { For, Show, createMemo, createResource, createSignal } from "solid-js";
import { createEffect, onCleanup, onMount } from "solid-js";
import { Dynamic } from "solid-js/web";
import { subscribeHostState } from "./bridge";
import { MarketplaceModal } from "./components/marketplace-modal";
import { UpdateModal } from "./components/update-modal";
import { DevHostPanel } from "./components/dev-host-panel";
import { DiagnosticsModal } from "./components/diagnostics-modal";
import { ControllerPreferencesModal } from "./components/controller-preferences-modal";
import { CreateModuleModal } from "./components/create-module-modal";
import { GlobalSettingsDrawer } from "./components/global-settings-drawer";
import marketplaceToastStyles from "./components/marketplace-toast-viewport.stylex";
import { decodeFxChainStateBase64 } from "./modules/fx/fx-chain-state";
import { loadPadPilotModule, MissingModuleView } from "./module-runtime";
import { fxGraph } from "./padpilot/fx-capabilities";
import {
  ModuleSurface,
  PadPilot,
  PadPilotProvider,
  useEditorViewState,
} from "./padpilot/index";
import {
  MarketplaceStoreProvider,
  useMarketplaceStore,
} from "./state/marketplace-store";
import {
  PadPilotStoreProvider,
  usePadPilotStore,
} from "./state/pad-pilot-store";
import { isPadPilotDevtoolsEnabled } from "./runtime-flags";
import { resolveMarketplaceWebSocketUrl } from "../../utils/marketplace-runtime";
import "./styles/app.css";
import { HatGlasses, LogIn, Plus, Settings2, SquareChevronLeft, SquareChevronRight, Star, Store } from "lucide-solid";

const createDebouncedCallback = (func: () => void, delay: number) => {
  let timeoutId: number | null = null;
  return {
    cancel() {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
        timeoutId = null;
      }
    },
    invoke() {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
      timeoutId = window.setTimeout(() => {
        timeoutId = null;
        func();
      }, delay);
    },
  };
};

function DevtoolsBridge() {
  onMount(() => {
    if (!isPadPilotDevtoolsEnabled()) {
      return;
    }

    const debouncedReload = createDebouncedCallback(() => {
      window.location.reload();
    }, 500);
    const handshakeDetails = process.env.HANDSHAKE_DETAILS;
    if (handshakeDetails) {
      console.debug(handshakeDetails);
    }
    const ws = new WebSocket(resolveMarketplaceWebSocketUrl());
    ws.onmessage = (event) => {
      if (event.data === "ui-update") {
        debouncedReload.invoke();
      }
    };
    ws.onerror = () => {
      // Optional devtools channel must not break the embedded UI when unavailable.
    };
    onCleanup(() => {
      debouncedReload.cancel();
      ws.close();
    });
  });

  return null;
}

function MarketplaceToasts() {
  const marketplace = useMarketplaceStore();

  return (
    <div class={marketplaceToastStyles.viewport} aria-live="polite">
      <For each={marketplace.state.toastQueue}>
        {(toast) => <PadPilot.Toast message={toast.message} onDismiss={() => marketplace.actions.dismissToast(toast.id)} tone={toast.tone} />}
      </For>
    </div>
  );
}

function PadPilotToasts() {
  const { state, actions } = usePadPilotStore();

  return (
    <div class={marketplaceToastStyles.viewport} aria-live="polite">
      <For each={state.toastQueue}>
        {(toast) => <PadPilot.Toast message={toast.message} onDismiss={() => actions.dismissToast(toast.id)} tone={toast.tone} />}
      </For>
    </div>
  );
}

function ActiveModule() {
  const { state } = usePadPilotStore();
  const moduleId = () => state.activeModuleId;
  const activeModule = createMemo(() =>
    state.modules.find((moduleItem) => moduleItem.id === moduleId()),
  );
  const blockedLoadStatus = createMemo(() => {
    const loadStatus = activeModule()?.loadStatus ?? "ready";
    return loadStatus === "ready" ? null : loadStatus;
  });
  const [definition] = createResource(activeModule, async (moduleItem) => {
    if (!moduleItem) {
      return null;
    }
    if (moduleItem.loadStatus && moduleItem.loadStatus !== "ready") {
      return null;
    }
    return loadPadPilotModule(moduleItem);
  });

  return (
    <ModuleSurface scopeId={moduleId()} class="module-surface">
      <Show when={definition.loading && !blockedLoadStatus()}>
        <section class="module-runtime-loading">
          <p>Loading module...</p>
        </section>
      </Show>
      {blockedLoadStatus() && activeModule() ? <MissingModuleView module={activeModule()!} /> : null}
      {definition.error && activeModule()
        ? (
            <MissingModuleView
              module={{
                ...activeModule()!,
                loadStatus: "load-error",
                loadErrorMessage: definition.error instanceof Error ? definition.error.message : undefined,
              }}
              error={definition.error}
            />
          )
        : null}
      {definition() && !blockedLoadStatus() ? <Dynamic component={definition()!.Component} /> : null}
    </ModuleSurface>
  );
}

function AppShell() {
  const { state, actions } = usePadPilotStore();
  const marketplace = useMarketplaceStore();
  const [sidebarPeek, setSidebarPeek] = createSignal(false);
  const [globalSettingsOpen, setGlobalSettingsOpen] = createSignal(false);
  const [controllerPreferencesOpen, setControllerPreferencesOpen] = createSignal(false);
  const [chromeViewState, setChromeViewState] = useEditorViewState(
    "app-shell",
    {
      favoriteIds: {} as Record<string, true>,
      sidebarCollapsed: false,
    }
  );
  const [moduleFilter, setModuleFilter] = createSignal("");
  const [favoritesOnly, setFavoritesOnly] = createSignal(false);

  const sidebarCollapsed = createMemo(() => chromeViewState().sidebarCollapsed);
  const favoriteIds = createMemo(() => chromeViewState().favoriteIds);
  const isFavorite = (moduleId: string) => Boolean(favoriteIds()[moduleId]);
  const toggleFavorite = (moduleId: string) => {
    const current = favoriteIds();
    const next = { ...current };
    if (next[moduleId]) {
      delete next[moduleId];
    } else {
      next[moduleId] = true;
    }
    setChromeViewState({ favoriteIds: next });
  };

  const visibleModules = createMemo(() => {
    const query = moduleFilter().trim().toLowerCase();
    const filtered = state.modules.filter((moduleItem) => {
      if (favoritesOnly() && !isFavorite(moduleItem.id)) {
        return false;
      }
      if (!query) return true;
      return moduleItem.name.toLowerCase().includes(query);
    });

    return [...filtered].sort((left, right) => {
      const leftFav = isFavorite(left.id) ? 1 : 0;
      const rightFav = isFavorite(right.id) ? 1 : 0;
      if (leftFav !== rightFav) return rightFav - leftFav;
      return left.name.localeCompare(right.name);
    });
  });

  const showMarketplaceButton = () =>
    window.location.protocol === "http:" ||
    window.location.protocol === "https:";

  return (
    <main
      class="padpilot-shell main-container"
      classList={{ "sidebar-collapsed": sidebarCollapsed() }}
    >
      <aside
        class="padpilot-sidebar"
        classList={{ "is-collapsed": sidebarCollapsed() }}
        onMouseLeave={() => setSidebarPeek(false)}
      >
        <Show when={!sidebarCollapsed()}>
          <PadPilot.Button
            class="bar-tab"
            variant="toolbar"
            size="sm"
            aria-expanded={!sidebarCollapsed()}
            tooltip="Collapse modules menu"
            onClick={() => setChromeViewState({ sidebarCollapsed: true })}
            icon={<SquareChevronLeft size={14} />}
          />
        </Show>

        <div
          class="padpilot-sidebar-content"
          classList={{ "is-hidden": sidebarCollapsed() }}
        >
          <img
            class="padpilot-logo"
            src="./pad-pilot-logo.png"
            alt="Pad Pilot logo"
          />
          <h2>Modules</h2>
          <div class="padpilot-module-toolbar">
            <PadPilot.TextField
              type="text"
              class="padpilot-module-filter text-selectable"
              value={moduleFilter()}
              onInput={(event) => setModuleFilter(event.currentTarget.value)}
              placeholder="Filter modules..."
            />
            <PadPilot.ToggleButton
              class="padpilot-toolbar-button"
              variant="toolbar"
              size="sm"
              classList={{ "is-active": favoritesOnly() }}
              value={favoritesOnly()}
              onClick={() => setFavoritesOnly((current) => !current)}
              tooltip={
                favoritesOnly() ? "Show all modules" : "Show favorites only"
              }
              icon={<Star size={14} />}
            />
            <PadPilot.Button
              class="padpilot-toolbar-button"
              variant="toolbar"
              size="sm"
              onClick={actions.openCreateModule}
              tooltip="Add module"
              icon={<Plus size={14} />}
            />
            <Show when={showMarketplaceButton()}>
              <PadPilot.Button
                class="padpilot-toolbar-button"
                variant="toolbar"
                size="sm"
                onClick={marketplace.actions.openMarketplace}
                tooltip="Open marketplace"
                icon={<Store size={14} />}
              />
            </Show>
            <PadPilot.Button
              class="padpilot-toolbar-button"
              variant="toolbar"
              size="sm"
              onClick={() => setGlobalSettingsOpen(true)}
              tooltip="Open settings"
              icon={<Settings2 size={14} />}
            />
          </div>
          <div class="padpilot-module-list">
            <For each={visibleModules()}>
              {(moduleItem) => (
                <div class="padpilot-module-row">
                  <PadPilot.Button
                    class="padpilot-module-item"
                    variant="toolbar"
                    size="sm"
                    classList={{
                      "is-active": state.activeModuleId === moduleItem.id,
                    }}
                    onClick={() => actions.setActiveModuleId(moduleItem.id)}
                  >
                    {moduleItem.name}
                  </PadPilot.Button>
                  <PadPilot.ToggleButton
                    class="padpilot-favorite-button"
                    variant="toolbar"
                    size="sm"
                    classList={{ "is-active": isFavorite(moduleItem.id) }}
                    value={isFavorite(moduleItem.id)}
                    onClick={() => toggleFavorite(moduleItem.id)}
                    tooltip={
                      isFavorite(moduleItem.id)
                        ? "Remove favorite"
                        : "Add favorite"
                    }
                    icon={<Star size={14} />}
                  />
                </div>
              )}
            </For>
          </div>
        </div>
      </aside>
      <Show when={sidebarCollapsed()}>
        <div
          class="padpilot-sidebar-trigger-zone"
          onMouseEnter={() => setSidebarPeek(true)}
          onMouseLeave={() => setSidebarPeek(false)}
        >
          <PadPilot.Button
            class="padpilot-sidebar-trigger-button"
            variant="toolbar"
            size="sm"
            classList={{ "is-visible": sidebarPeek() }}
            tooltip="Expand modules menu"
            onClick={() => {
              setChromeViewState({ sidebarCollapsed: false });
              setSidebarPeek(false);
            }}
            icon={<SquareChevronRight size={14} />}
          />
        </div>
      </Show>
      <section class="padpilot-workspace">
        <ActiveModule />
      </section>
      <Show when={isPadPilotDevtoolsEnabled()}>
        <div style={{ display: "flex", gap: ".5rem", "position": "fixed", "bottom": "1rem", "right": "2rem", "z-index": "4" }}>
          <DiagnosticsModal />
          <DevHostPanel />
        </div>
      </Show>
      <MarketplaceModal />
      <UpdateModal />
      <GlobalSettingsDrawer
        open={globalSettingsOpen()}
        onOpenChange={setGlobalSettingsOpen}
        onOpenControllerPreferences={() => setControllerPreferencesOpen(true)}
      />
      <ControllerPreferencesModal
        open={controllerPreferencesOpen()}
        onClose={() => setControllerPreferencesOpen(false)}
      />
      <CreateModuleModal
        open={state.isCreateModuleOpen}
        onClose={actions.closeCreateModule}
        onCreate={actions.addModule}
      />
    </main>
  );
}

function AppEntryGate() {
  const marketplace = useMarketplaceStore();
  const isLoading = createMemo(
    () =>
      marketplace.state.requestStatus.bootstrap === "loading" ||
      marketplace.state.requestStatus.bootstrap === "idle"
  );
  const canEnterApp = createMemo(
    () => marketplace.state.auth.authenticated || marketplace.state.guestMode
  );

  return (
    <Show
      when={canEnterApp()}
      fallback={
        <main class="padpilot-shell main-container">
          <section
            class="padpilot-workspace"
            style={{
              "align-items": "center",
              display: "flex",
              "justify-content": "center",
              padding: "2rem",
              width: "100vw",
            }}
          >
            <div
              style={{
                display: "grid",
                gap: "1rem",
                "max-width": "28rem",
                padding: "2rem",
                border: "1px solid rgba(255,255,255,0.1)",
                "border-radius": "1rem",
                background: "rgba(0,0,0,0.35)",
                "place-items": "center",
              }}
            >
              <img src="pad-pilot-logo.png" width="300px" />
              <Show
                when={isLoading()}
                fallback={
                  <p>
                    Sign in to restore your account, or continue in guest mode.
                  </p>
                }
              >
                <p>Checking your PadPilot session...</p>
              </Show>
              <Show when={!isLoading()}>
                <Show when={marketplace.state.auth.configured.clerk}>
                  <PadPilot.Button onClick={marketplace.actions.signIn} icon={LogIn} variant="primary">
                    Sign in
                  </PadPilot.Button>
                </Show>
                <PadPilot.Button onClick={marketplace.actions.continueAsGuest} icon={HatGlasses} variant="secondary">
                  Continue as guest
                </PadPilot.Button>
              </Show>
            </div>
          </section>
        </main>
      }
    >
      <AppShell />
    </Show>
  );
}

function GuestModeEnforcer() {
  const marketplace = useMarketplaceStore();
  const [fxModuleActive, setFxModuleActive] = createSignal(false);
  let observedWetDry = 1;
  const guestSeed = Math.floor(Date.now() / 1000);

  onMount(() => {
    const unsubscribe = subscribeHostState((hostState) => {
      const activeModuleId = hostState.activeModuleId ?? hostState.selectedModuleId ?? "";
      const isFxModule = activeModuleId === "fx" || activeModuleId === "reverb";
      setFxModuleActive(isFxModule);
      const payload = hostState.activeModuleStateBase64;
      if (!payload || !isFxModule || marketplace.state.guestMode) {
        return;
      }
      try {
        observedWetDry =
          decodeFxChainStateBase64(payload).master?.wetDry ?? observedWetDry;
      } catch {
        observedWetDry = observedWetDry;
      }
    });
    onCleanup(unsubscribe);
  });

  createEffect(() => {
    const isFxModule = fxModuleActive();
    if (!marketplace.state.guestMode) {
      if (isFxModule) {
        fxGraph.setMasterWetDry(observedWetDry);
      }
      return;
    }

    const barsPerCycle = 16;
    const muteBars = 2;
    const beatsPerBar = 4;
    const bpm = 120;
    const barDurationMs = (60_000 / bpm) * beatsPerBar;
    const cycleDurationMs = barsPerCycle * barDurationMs;
    const muteDurationMs = muteBars * barDurationMs;
    const interval = window.setInterval(() => {
      const cycleIndex = Math.floor(Date.now() / cycleDurationMs);
      const cycleStart = cycleIndex * cycleDurationMs;
      const muteOffsetBar =
        (Math.abs(Math.sin((cycleIndex + 1) * guestSeed)) *
          (barsPerCycle - muteBars)) |
        0;
      const muteStart = cycleStart + muteOffsetBar * barDurationMs;
      const muteEnd = muteStart + muteDurationMs;
      const muted = Date.now() >= muteStart && Date.now() < muteEnd;
      fxGraph.setMasterWetDry(muted ? 0 : observedWetDry);
    }, 400);

    onCleanup(() => {
      window.clearInterval(interval);
      fxGraph.setMasterWetDry(observedWetDry);
    });
  });

  return null;
}

export default function App() {
  return (
    <PadPilotStoreProvider>
      <MarketplaceStoreProvider>
        <PadPilotProvider>
          <DevtoolsBridge />
          <GuestModeEnforcer />
          <PadPilot.OverlayRoot />
          <AppEntryGate />
          <MarketplaceToasts />
          <PadPilotToasts />
        </PadPilotProvider>
      </MarketplaceStoreProvider>
    </PadPilotStoreProvider>
  );
}





