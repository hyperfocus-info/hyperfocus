import { toId } from "./module-slug";
import { z } from "zod";
import { installedModuleResultSchema } from "../bridge-native-contracts";
import { ParentProps, createContext, onCleanup, onMount, useContext } from "solid-js";
import { createStore } from "solid-js/store";
import { subscribeHostState, type HostState } from "../bridge";
import { moduleSdk } from "../module-sdk";
import { createFactoryModuleSummary, factoryModuleCatalog } from "@hyperfocus/pad-pilot/factory-modules";
import { canonicalModuleId } from "@hyperfocus/pad-pilot/module-identity";

export type ModuleItem = {
  capabilities?: string[];
  id: string;
  loadErrorMessage?: string;
  loadStatus?: string;
  name: string;
  expectedModuleVersion?: string;
  resolvedModuleVersion?: string;
  scriptEntryPath?: string;
  uiEntryPath?: string;
  version?: string;
};

type PadPilotState = {
  modules: ModuleItem[];
  activeModuleId: string;
  isCreateModuleOpen: boolean;
  toastQueue: Array<{ id: string; message: string; tone: "error" }>;
};

const DEFAULT_MODULES: ModuleItem[] = factoryModuleCatalog.map(createFactoryModuleSummary);



function sameModuleItem(left: ModuleItem, right: ModuleItem) {
  return left.id === right.id
    && left.name === right.name
    && left.version === right.version
    && left.loadStatus === right.loadStatus
    && left.loadErrorMessage === right.loadErrorMessage
    && left.expectedModuleVersion === right.expectedModuleVersion
    && left.resolvedModuleVersion === right.resolvedModuleVersion
    && left.uiEntryPath === right.uiEntryPath
    && left.scriptEntryPath === right.scriptEntryPath
    && JSON.stringify(left.capabilities ?? []) === JSON.stringify(right.capabilities ?? []);
}

export function reconcileModuleItems(current: ModuleItem[], incoming: ModuleItem[]) {
  let changed = current.length !== incoming.length;
  const nextModules = incoming.map((incomingItem, index) => {
    const currentItem = current[index];
    if (currentItem && sameModuleItem(currentItem, incomingItem)) {
      return currentItem;
    }

    changed = true;
    const existingItem = current.find((moduleItem) => sameModuleItem(moduleItem, incomingItem));
    if (existingItem) {
      return existingItem;
    }

    return {
      id: incomingItem.id,
      name: incomingItem.name,
      version: incomingItem.version,
      capabilities: incomingItem.capabilities,
      loadStatus: incomingItem.loadStatus,
      loadErrorMessage: incomingItem.loadErrorMessage,
      expectedModuleVersion: incomingItem.expectedModuleVersion,
      resolvedModuleVersion: incomingItem.resolvedModuleVersion,
      scriptEntryPath: incomingItem.scriptEntryPath,
      uiEntryPath: incomingItem.uiEntryPath,
    };
  });

  return changed ? nextModules : current;
}

function resolveActiveModuleId(moduleId: string, modules: ModuleItem[]) {
  const normalizedModuleId = canonicalModuleId(moduleId);
  if (modules.some((moduleItem) => moduleItem.id === normalizedModuleId)) {
    return normalizedModuleId;
  }

  return modules[0]?.id ?? normalizedModuleId;
}

function createPadPilotStore() {
  const [state, setState] = createStore<PadPilotState>({
    modules: DEFAULT_MODULES,
    activeModuleId: DEFAULT_MODULES[0]?.id ?? "",
    isCreateModuleOpen: false,
    toastQueue: [],
  });
  let toastIdCounter = 0;
  const toastTimeouts = new Map<string, number>();

  const syncFromHost = (hostState: HostState) => {
    if (Array.isArray(hostState.modules) && hostState.modules.length > 0) {
      const nextModules = reconcileModuleItems(
        state.modules,
        hostState.modules.map((moduleItem) => ({
          id: moduleItem.id,
          name: moduleItem.name,
          version: moduleItem.version,
          capabilities: moduleItem.capabilities,
          loadStatus: moduleItem.loadStatus,
          loadErrorMessage: moduleItem.loadErrorMessage,
          expectedModuleVersion: moduleItem.expectedModuleVersion,
          resolvedModuleVersion: moduleItem.resolvedModuleVersion,
          scriptEntryPath: moduleItem.scriptEntryPath,
          uiEntryPath: moduleItem.uiEntryPath,
        })),
      );
      if (nextModules !== state.modules) {
        setState("modules", nextModules);
      }
    }
    if (hostState.selectedModuleId) {
      const nextActiveModuleId = resolveActiveModuleId(hostState.selectedModuleId, state.modules);
      if (state.activeModuleId !== nextActiveModuleId) {
        setState("activeModuleId", nextActiveModuleId);
      }
    }
  };

  const actions = {
    setActiveModuleId: (id: string) => {
      moduleSdk.selectModule(id);
    },
    openCreateModule: () => setState("isCreateModuleOpen", true),
    closeCreateModule: () => setState("isCreateModuleOpen", false),
    dismissToast: (toastId: string) => {
      const timeoutId = toastTimeouts.get(toastId);
      if (typeof timeoutId === "number") {
        window.clearTimeout(timeoutId);
        toastTimeouts.delete(toastId);
      }
      setState("toastQueue", (queue) => queue.filter((toast) => toast.id !== toastId));
    },
    pushToast: (message: string) => {
      const toastId = `padpilot-toast-${Date.now()}-${++toastIdCounter}`;
      const toast: PadPilotState["toastQueue"][number] = {
        id: toastId,
        message,
        tone: "error",
      };
      setState("toastQueue", (queue) => [toast, ...queue].slice(0, 4));
      const timeoutId = window.setTimeout(() => actions.dismissToast(toastId), 3600);
      toastTimeouts.set(toastId, timeoutId);
    },
    addModule: (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;

      const baseId = toId(trimmed) || "module";
      let candidate = baseId;
      let suffix = 2;
      while (state.modules.some((mod) => mod.id === candidate)) {
        candidate = `${baseId}-${suffix}`;
        suffix += 1;
      }

      setState("modules", (mods) => [...mods, {
        id: candidate,
        name: trimmed,
        version: "0.1.0",
        loadStatus: "ready",
        capabilities: ["module-state", "script-runtime"],
      }]);
      setState("isCreateModuleOpen", false);
      moduleSdk.createModule(trimmed);
    },
    dispose: () => {
      for (const timeoutId of toastTimeouts.values()) {
        window.clearTimeout(timeoutId);
      }
      toastTimeouts.clear();
    },
  };

  return { state, actions, syncFromHost };
}

type PadPilotStore = Pick<ReturnType<typeof createPadPilotStore>, "state" | "actions">;

const PadPilotStoreContext = createContext<PadPilotStore>();

export function PadPilotStoreProvider(props: ParentProps) {
  const { state, actions, syncFromHost } = createPadPilotStore();

  onMount(() => {
    const unsubscribe = subscribeHostState(syncFromHost);
    const handleInstallResult = (event: Event) => {
      if (!(event instanceof CustomEvent)) return;
      const parsed = z.object({ error: z.string().optional(), module: installedModuleResultSchema.nullish(), path: z.string().optional(), success: z.boolean() }).safeParse(event.detail);
      if (!parsed.success) return;
      const detail = parsed.data;
      if (!detail) {
        return;
      }
      if (!detail.success) {
        actions.pushToast(
          detail.path
            ? `Module install failed for ${detail.path}: ${detail.error ?? "unknown error"}.`
            : `Module install failed: ${detail.error ?? "unknown error"}.`,
        );
        return;
      }
      actions.pushToast(`Installed ${detail.module?.name ?? "module"} ${detail.module?.version ?? ""}`.trim());
    };
    window.addEventListener("padpilot-module-install-result", handleInstallResult);
    onCleanup(unsubscribe);
    onCleanup(() => {
      window.removeEventListener("padpilot-module-install-result", handleInstallResult);
    });
    onCleanup(() => {
      actions.dispose();
    });
  });

  return <PadPilotStoreContext.Provider value={{ state, actions }}>{props.children}</PadPilotStoreContext.Provider>;
}

export function usePadPilotStore() {
  const value = useContext(PadPilotStoreContext);
  if (!value) {
    throw new Error("usePadPilotStore must be used inside PadPilotStoreProvider.");
  }
  return value;
}
