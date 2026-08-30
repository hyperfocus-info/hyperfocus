import { ParentProps, createContext, onCleanup, onMount, useContext } from "solid-js";
import { createStore, type SetStoreFunction } from "solid-js/store";
import { getPadPilotRuntimeInfo, restartAndApplyPluginUpdate, stagePluginUpdate, type PadPilotRuntimeInfo } from "../bridge";
import { openMarketplaceSignIn, ensureMarketplaceServerSession, signOutMarketplace } from "../marketplace/clerk";
import {
  fetchLatestPluginUpdate,
  type LatestPluginUpdateResponse,
  type MarketplaceBootstrap,
  type MarketplaceCatalogModule,
  type MarketplaceCheckoutKind,
  MarketplaceApiError,
  type PluginUpdateChannel,
  createMarketplaceCheckoutSession,
  type MarketplaceModuleDetail,
  createMarketplaceModule,
  deleteMarketplaceModule,
  fetchMarketplaceBootstrap,
  fetchMarketplaceModuleDetail,
  resolveMarketplaceApiUrl,
  publishMarketplaceModule,
  resolveMarketplaceDownloadUrl,
  uploadMarketplaceModuleVersion,
} from "../marketplace/api";

type MarketplaceRequestPhase = "error" | "idle" | "loading" | "success";

type MarketplaceRequestStatus = {
  auth: MarketplaceRequestPhase;
  bootstrap: MarketplaceRequestPhase;
  detail: MarketplaceRequestPhase;
  message: string | null;
  upload: MarketplaceRequestPhase;
};

type MarketplaceView = "browse" | "details" | "upload";

type MarketplaceAuthState = MarketplaceBootstrap["auth"];

type MarketplaceUploadDraft = {
  bundle: File | null;
  changelog: string;
  description: string;
  name: string;
  priceCents: string;
  publish: boolean;
  slug: string;
  version: string;
};

type UpdaterCheckStatus =
  | "checking"
  | "downloading"
  | "error"
  | "idle"
  | "staged"
  | "up-to-date"
  | "update-available";

type UpdaterState = {
  availableRelease: LatestPluginUpdateResponse | null;
  channel: PluginUpdateChannel;
  checkStatus: UpdaterCheckStatus;
  currentVersion: string;
  downloadProgress: string | null;
  hostMode: PadPilotRuntimeInfo["hostMode"];
  installPath: string | null;
  lastError: string | null;
  modalOpen: boolean;
  platform: string;
  stagedUpdate: {
    logPath: string;
    message: string;
    targetVersion: string;
  } | null;
};

type MarketplaceState = {
  auth: MarketplaceAuthState;
  browseQuery: string;
  catalog: MarketplaceCatalogModule[];
  checkoutKey: string | null;
  details: Record<string, MarketplaceModuleDetail>;
  guestMode: boolean;
  isMarketplaceOpen: boolean;
  requestStatus: MarketplaceRequestStatus;
  selectedModuleId: string | null;
  toastQueue: Array<{ id: string; message: string; tone: "error" }>;
  updater: UpdaterState;
  uploadDraft: MarketplaceUploadDraft;
  view: MarketplaceView;
};

const defaultUploadDraft = () => ({
  bundle: null,
  changelog: "",
  description: "",
  name: "",
  priceCents: "0",
  publish: true,
  slug: "",
  version: "1.0.0",
});

const initialAuthState: MarketplaceAuthState = {
  authenticated: false,
  configured: {
    clerk: false,
    stripe: false,
  },
  entitlements: {
    firstClass: null,
    padpilotAccess: null,
  },
  pilotTokenBalance: 0,
  pricing: {
    firstClassDiscountPercent: 20,
    padpilotFinancingMonthlyPriceCents: 1000,
    padpilotLifetimePriceCents: 6000,
  },
  publishableKey: null,
  subscriptionStatus: "guest",
  user: null,
};

const UPDATE_CHANNEL_STORAGE_KEY = "padpilot.update-channel";

const loadUpdateChannel = () => {
  try {
    const stored = window.localStorage.getItem(UPDATE_CHANNEL_STORAGE_KEY);
    return stored === "beta" ? "beta" : "stable";
  } catch {
    return "stable";
  }
};

const saveUpdateChannel = (channel: PluginUpdateChannel) => {
  try {
    window.localStorage.setItem(UPDATE_CHANNEL_STORAGE_KEY, channel);
  } catch {
    // Ignore storage restrictions.
  }
};

function createMarketplaceUpdater(options: {
  pushToast: (message: string) => void;
  setState: SetStoreFunction<MarketplaceState>;
  state: MarketplaceState;
}) {
  const { pushToast, setState, state } = options;
  let checkRequestId = 0;
  let restartRequestId = 0;
  let stageRequestId = 0;
  let disposed = false;

  const setError = (message: string, context: string, error?: unknown) => {
    console.error(context, error ?? message);
    setState("updater", "checkStatus", "error");
    setState("updater", "lastError", message);
    setState("updater", "downloadProgress", null);
    pushToast(message);
  };

  const checkForUpdates = async (options?: { openModalOnAvailable?: boolean }) => {
    const requestId = ++checkRequestId;
    ++stageRequestId;
    const channel = state.updater.channel;
    setState("updater", "checkStatus", "checking");
    setState("updater", "lastError", null);
    setState("updater", "downloadProgress", null);
    try {
      const runtime = await getPadPilotRuntimeInfo();
      if (disposed || requestId !== checkRequestId) return;
      setState("updater", "currentVersion", runtime.currentVersion);
      setState("updater", "hostMode", runtime.hostMode);
      setState("updater", "installPath", runtime.installPath ?? runtime.defaultInstallPath);
      setState("updater", "platform", runtime.platform);
      const latest = await fetchLatestPluginUpdate({
        arch: runtime.arch,
        channel,
        platform: runtime.platform,
        version: runtime.currentVersion,
      });
      if (disposed || requestId !== checkRequestId) return;
      setState("updater", "availableRelease", latest.updateAvailable ? latest : null);
      setState("updater", "modalOpen", Boolean(options?.openModalOnAvailable && latest.updateAvailable));
      setState("updater", "checkStatus", latest.updateAvailable ? "update-available" : "up-to-date");
    } catch (error) {
      if (disposed || requestId !== checkRequestId) return;
      setError(
        error instanceof Error ? error.message : "Failed to check for PadPilot updates.",
        "PadPilot update check failed.",
        error
      );
    }
  };

  const restartAndApplyUpdate = async () => {
    if (disposed) return;
    const requestId = ++restartRequestId;
    try {
      await restartAndApplyPluginUpdate();
    } catch (error) {
      if (disposed || requestId !== restartRequestId) return;
      setError(
        error instanceof Error ? error.message : "Unable to restart PadPilot and apply the staged update.",
        "PadPilot restart-and-apply failed.",
        error
      );
    }
  };

  const stageAvailableUpdate = async () => {
    const release = state.updater.availableRelease;
    if (!release?.updateAvailable || !release.downloadUrl || !release.manifestUrl || !release.artifactChecksumSha256 || !release.manifestChecksumSha256 || !release.latestVersion) {
      setError("No update payload is available to download yet.", "PadPilot update staging was requested without an available release.");
      return;
    }
    const requestId = ++stageRequestId;
    ++checkRequestId;
    setState("updater", "checkStatus", "downloading");
    setState("updater", "downloadProgress", "Downloading and staging update...");
    setState("updater", "lastError", null);
    try {
      const staged = await stagePluginUpdate({
        artifactChecksumSha256: release.artifactChecksumSha256,
        artifactUrl: resolveMarketplaceApiUrl(release.downloadUrl),
        currentVersion: state.updater.currentVersion,
        manifestChecksumSha256: release.manifestChecksumSha256,
        manifestSignature: release.signature,
        manifestUrl: resolveMarketplaceApiUrl(release.manifestUrl),
        releaseNotes: release.releaseNotes,
        targetVersion: release.latestVersion,
      });
      if (disposed || requestId !== stageRequestId) return;
      setState("updater", "stagedUpdate", {
        logPath: staged.logPath,
        message: staged.message,
        targetVersion: staged.targetVersion,
      });
      setState("updater", "checkStatus", "staged");
      setState("updater", "downloadProgress", null);
      setState("updater", "modalOpen", true);
    } catch (error) {
      if (disposed || requestId !== stageRequestId) return;
      setError(
        error instanceof Error ? error.message : "Unable to stage the PadPilot update.",
        "PadPilot update staging failed.",
        error
      );
    }
  };

  return {
    checkForUpdates,
    dispose: () => {
      disposed = true;
      ++checkRequestId;
      ++restartRequestId;
      ++stageRequestId;
    },
    restartAndApplyUpdate,
    setUpdateChannel: async (channel: PluginUpdateChannel) => {
      setState("updater", "channel", channel);
      saveUpdateChannel(channel);
      await checkForUpdates();
    },
    stageAvailableUpdate,
  };
}

function createMarketplaceStore() {
  const [state, setState] = createStore<MarketplaceState>({
    auth: initialAuthState,
    browseQuery: "",
    catalog: [],
    checkoutKey: null,
    details: {},
    guestMode: false,
    isMarketplaceOpen: false,
    requestStatus: {
      auth: "idle",
      bootstrap: "idle",
      detail: "idle",
      message: null,
      upload: "idle",
    },
    selectedModuleId: null,
    toastQueue: [],
    updater: {
      availableRelease: null,
      channel: loadUpdateChannel(),
      checkStatus: "idle",
      currentVersion: "unknown",
      downloadProgress: null,
      hostMode: "standalone",
      installPath: null,
      lastError: null,
      modalOpen: false,
      platform: "windows",
      stagedUpdate: null,
    },
    uploadDraft: defaultUploadDraft(),
    view: "browse",
  });
  let toastIdCounter = 0;
  let authRequestId = 0;
  let bootstrapRequestId = 0;
  let checkoutRequestId = 0;
  let detailRequestId = 0;
  let uploadRequestId = 0;
  let disposed = false;
  const toastTimeouts = new Map<string, number>();

  const applyBootstrap = (bootstrap: MarketplaceBootstrap) => {
    setState("auth", bootstrap.auth);
    setState("catalog", bootstrap.marketplace.modules);
    if (bootstrap.auth.authenticated) {
      setState("guestMode", false);
    }
  };

  const dismissToast = (toastId: string) => {
    const timeoutId = toastTimeouts.get(toastId);
    if (typeof timeoutId === "number") {
      window.clearTimeout(timeoutId);
      toastTimeouts.delete(toastId);
    }
    setState("toastQueue", (queue) => queue.filter((toast) => toast.id !== toastId));
  };

  const pushToast = (message: string) => {
    const toastId = `marketplace-toast-${Date.now()}-${++toastIdCounter}`;
    setState("toastQueue", (queue) => [{ id: toastId, message, tone: "error" as const }, ...queue].slice(0, 4));
    const timeoutId = window.setTimeout(() => dismissToast(toastId), 4200);
    toastTimeouts.set(toastId, timeoutId);
  };

  const setError = (
    phase: Exclude<keyof MarketplaceRequestStatus, "message">,
    message: string,
    context?: string,
    error?: unknown,
  ) => {
    if (context) {
      console.error(context, error ?? message);
    }
    setState("requestStatus", phase, "error");
    setState("requestStatus", "message", message);
    pushToast(message);
  };

  const updater = createMarketplaceUpdater({ pushToast, setState, state });

  const dispose = () => {
    disposed = true;
    ++authRequestId;
    ++bootstrapRequestId;
    ++checkoutRequestId;
    ++detailRequestId;
    updater.dispose();
    for (const timeoutId of toastTimeouts.values()) {
      window.clearTimeout(timeoutId);
    }
    toastTimeouts.clear();
  };

  const refreshMarketplace = async () => {
    const requestId = ++bootstrapRequestId;
    setState("requestStatus", "bootstrap", "loading");
    setState("requestStatus", "message", null);
    try {
      const bootstrap = await fetchMarketplaceBootstrap();
      if (disposed || requestId !== bootstrapRequestId) {
        return;
      }
      applyBootstrap(bootstrap);

      if (!bootstrap.auth.authenticated && bootstrap.auth.configured.clerk) {
        const exchanged = await ensureMarketplaceServerSession(bootstrap.auth.publishableKey);
        if (disposed || requestId !== bootstrapRequestId) {
          return;
        }
        if (exchanged) {
          const refreshed = await fetchMarketplaceBootstrap();
          if (disposed || requestId !== bootstrapRequestId) {
            return;
          }
          applyBootstrap(refreshed);
        }
      }

      setState("requestStatus", "bootstrap", "success");
      updater.checkForUpdates({ openModalOnAvailable: true });
    } catch (error) {
      if (disposed || requestId !== bootstrapRequestId) {
        return;
      }
      setError("bootstrap", error instanceof Error ? error.message : "Failed to load marketplace.", "Marketplace bootstrap failed.", error);
    }
  };

  const viewModule = async (moduleId: string) => {
    const requestId = ++detailRequestId;
    setState("selectedModuleId", moduleId);
    setState("view", "details");
    setState("requestStatus", "detail", "loading");
    setState("requestStatus", "message", null);
    try {
      const detail = await fetchMarketplaceModuleDetail(moduleId);
      if (disposed || requestId !== detailRequestId || state.selectedModuleId !== moduleId) {
        return;
      }
      setState("details", moduleId, detail.module);
      setState("requestStatus", "detail", "success");
    } catch (error) {
      if (disposed || requestId !== detailRequestId || state.selectedModuleId !== moduleId) {
        return;
      }
      setError("detail", error instanceof Error ? error.message : "Failed to load module details.", `Marketplace detail load failed for ${moduleId}.`, error);
    }
  };

  const downloadModule = (downloadUrl: string | null) => {
    if (!downloadUrl) {
      setError("detail", "This module does not have a downloadable bundle yet.");
      return;
    }

    let resolvedUrl = "";
    try {
      resolvedUrl = resolveMarketplaceDownloadUrl(downloadUrl);
    } catch (error) {
      setError(
        "detail",
        error instanceof Error ? error.message : "The module download URL is invalid.",
        "Marketplace download URL validation failed.",
        error,
      );
      return;
    }
    const link = document.createElement("a");
    link.href = resolvedUrl;
    link.rel = "noopener";
    link.download = "";
    document.body.append(link);
    link.click();
    link.remove();
  };

  const uploadModule = async () => {
    if (state.requestStatus.upload === "loading") {
      return;
    }
    if (!state.auth.authenticated) {
      setError("upload", "Sign in before uploading a module.");
      return;
    }

    const draft = { ...state.uploadDraft };
    if (!draft.bundle) {
      setError("upload", "Choose a .zip bundle before uploading.");
      return;
    }

    const requestId = ++uploadRequestId;
    let createdModuleId: string | null = null;
    let moduleWriteCommitted = false;
    setState("requestStatus", "upload", "loading");
    setState("requestStatus", "message", null);
    try {
      const created = await createMarketplaceModule({
        description: draft.description.trim(),
        name: draft.name.trim(),
        priceCents: Math.max(0, Math.round(Number(draft.priceCents) || 0)),
        slug: draft.slug.trim() || undefined,
      });
      createdModuleId = created.module.id;
      await uploadMarketplaceModuleVersion({
        bundle: draft.bundle,
        changelog: draft.changelog.trim(),
        moduleId: created.module.id,
        version: draft.version.trim(),
      });

      if (draft.publish) {
        await publishMarketplaceModule(created.module.id);
      }
      moduleWriteCommitted = true;

      if (disposed || requestId !== uploadRequestId) {
        return;
      }

      setState("uploadDraft", defaultUploadDraft());
      await refreshMarketplace();
      await viewModule(created.module.id);
      setState("requestStatus", "upload", "success");
    } catch (error) {
      let cleanupError: unknown = null;
      let publishConfirmedDuringCleanup = false;
      if (createdModuleId && !moduleWriteCommitted) {
        try {
          await deleteMarketplaceModule(createdModuleId);
        } catch (caughtCleanupError) {
          if (caughtCleanupError instanceof MarketplaceApiError && caughtCleanupError.code === "module_published") {
            moduleWriteCommitted = true;
            publishConfirmedDuringCleanup = true;
          } else {
            cleanupError = caughtCleanupError;
            console.error(`Marketplace draft cleanup failed for ${createdModuleId}.`, caughtCleanupError);
          }
        }
      }
      if (disposed || requestId !== uploadRequestId) {
        return;
      }
      if (publishConfirmedDuringCleanup && createdModuleId) {
        setState("uploadDraft", defaultUploadDraft());
        await refreshMarketplace();
        await viewModule(createdModuleId);
        setState("requestStatus", "upload", "success");
        return;
      }
      const message = error instanceof Error ? error.message : "Failed to upload module.";
      const cleanupSuffix = cleanupError instanceof Error
        ? ` Draft cleanup also failed: ${cleanupError.message}`
        : cleanupError
          ? " Draft cleanup also failed."
          : "";
      setError("upload", `${message}${cleanupSuffix}`, "Marketplace upload failed.", error);
    }
  };

  const startCheckout = async (checkoutKind: MarketplaceCheckoutKind, moduleId?: string) => {
    if (state.checkoutKey) {
      return;
    }
    if (!state.auth.authenticated) {
      setError("auth", "Sign in before starting checkout.");
      return;
    }

    const checkoutKey = moduleId ?? checkoutKind;
    const requestId = ++checkoutRequestId;
    setState("checkoutKey", checkoutKey);
    setState("requestStatus", "auth", "loading");
    setState("requestStatus", "message", null);
    try {
      const checkout = await createMarketplaceCheckoutSession(checkoutKind, moduleId);
      if (disposed || requestId !== checkoutRequestId) {
        return;
      }
      setState("requestStatus", "auth", "success");
      window.location.href = checkout.checkoutUrl;
    } catch (error) {
      if (disposed || requestId !== checkoutRequestId) {
        return;
      }
      setError("auth", error instanceof Error ? error.message : "Unable to start checkout.", `Marketplace checkout start failed for ${checkoutKey}.`, error);
    } finally {
      if (!disposed && requestId === checkoutRequestId) {
        setState("checkoutKey", null);
      }
    }
  };

  const actions = {
    checkForUpdates: updater.checkForUpdates,
    continueAsGuest: () => {
      setState("guestMode", true);
      setState("requestStatus", "message", null);
    },
    closeMarketplace: () => {
      setState("isMarketplaceOpen", false);
    },
    dismissUpdateModal: () => {
      setState("updater", "modalOpen", false);
    },
    dismissToast,
    leaveGuestMode: () => {
      setState("guestMode", false);
    },
    downloadSelectedModule: () => {
      if (!state.selectedModuleId) {
        setError("detail", "Select a module first.");
        return;
      }

      downloadModule(state.details[state.selectedModuleId]?.downloadUrl ?? null);
    },
    downloadModule,
    openMarketplace: () => {
      setState("isMarketplaceOpen", true);
      refreshMarketplace();
    },
    restartAndApplyUpdate: updater.restartAndApplyUpdate,
    purchaseModule: (moduleId: string) => startCheckout("module_purchase", moduleId),
    refreshMarketplace,
    setUpdateChannel: updater.setUpdateChannel,
    stageAvailableUpdate: updater.stageAvailableUpdate,
    setBrowseView: () => {
      ++detailRequestId;
      setState("view", "browse");
      setState("selectedModuleId", null);
      setState("requestStatus", "message", null);
    },
    setBrowseQuery: (value: string) => setState("browseQuery", value),
    setUploadDraft: (patch: Partial<MarketplaceUploadDraft>) => {
      setState("uploadDraft", (draft) => ({ ...draft, ...patch }));
    },
    setUploadView: () => {
      setState("view", "upload");
      setState("requestStatus", "message", null);
    },
    signIn: async () => {
      if (disposed) {
        return;
      }
      const requestId = ++authRequestId;
      setState("requestStatus", "auth", "loading");
      try {
        await openMarketplaceSignIn(state.auth.publishableKey);
        if (disposed || requestId !== authRequestId) {
          return;
        }
        setState("requestStatus", "auth", "success");
      } catch (error) {
        if (disposed || requestId !== authRequestId) {
          return;
        }
        setError("auth", error instanceof Error ? error.message : "Unable to open Clerk sign-in.", "Marketplace sign-in failed.", error);
      }
    },
    signOut: async () => {
      if (disposed) {
        return;
      }
      const requestId = ++authRequestId;
      setState("requestStatus", "auth", "loading");
      try {
        await signOutMarketplace(state.auth.publishableKey);
        if (disposed || requestId !== authRequestId) {
          return;
        }
        await refreshMarketplace();
        if (disposed || requestId !== authRequestId) {
          return;
        }
        setState("requestStatus", "auth", "success");
      } catch (error) {
        if (disposed || requestId !== authRequestId) {
          return;
        }
        setError("auth", error instanceof Error ? error.message : "Unable to sign out.", "Marketplace sign-out failed.", error);
      }
    },
    startCheckout,
    uploadModule,
    viewModule,
  };

  return { state, actions, dispose };
}

type MarketplaceStore = Pick<ReturnType<typeof createMarketplaceStore>, "state" | "actions">;

const MarketplaceStoreContext = createContext<MarketplaceStore>();

export function MarketplaceStoreProvider(props: ParentProps) {
  const { state, actions, dispose } = createMarketplaceStore();
  onCleanup(dispose);
  onMount(() => {
    actions.refreshMarketplace();
  });

  return <MarketplaceStoreContext.Provider value={{ actions, state }}>{props.children}</MarketplaceStoreContext.Provider>;
}

export function useMarketplaceStore() {
  const value = useContext(MarketplaceStoreContext);
  if (!value) {
    throw new Error("useMarketplaceStore must be used inside MarketplaceStoreProvider.");
  }

  return value;
}
