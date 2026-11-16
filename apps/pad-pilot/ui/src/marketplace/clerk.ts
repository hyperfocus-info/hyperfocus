import { Clerk } from "@clerk/clerk-js";
import { ui } from "@clerk/ui";
import { exchangeMarketplaceSession, logoutMarketplaceSession } from "./api";

type ClerkLoadOptions = Parameters<Clerk["load"]>[0];
type ClerkLoadUi = NonNullable<ClerkLoadOptions>["ui"];
const bundledClerkUi: ClerkLoadUi = ui;

export function createClerkLoader(): (publishableKey: string) => Promise<Clerk>;
export function createClerkLoader<T extends Pick<Clerk, "load">>(createInstance: (publishableKey: string) => T): (publishableKey: string) => Promise<T>;
export function createClerkLoader(createInstance: (publishableKey: string) => Pick<Clerk, "load"> = (publishableKey) => new Clerk(publishableKey)) {
  let activeLoad: { publishableKey: string; promise: Promise<Pick<Clerk, "load">> } | null = null;

  return async (publishableKey: string) => {
    if (activeLoad?.publishableKey === publishableKey) {
      return await activeLoad.promise;
    }

    const instance = createInstance(publishableKey);
    let loadPromise: Promise<Pick<Clerk, "load">>;
    loadPromise = instance.load({
      standardBrowser: true,
      ui: bundledClerkUi,
    }).then(() => instance).catch((error) => {
      if (activeLoad?.promise === loadPromise) {
        activeLoad = null;
      }
      throw error;
    });
    activeLoad = { publishableKey, promise: loadPromise };
    return await loadPromise;
  };
}

const getClerk = createClerkLoader();

export async function ensureMarketplaceServerSession(publishableKey: string | null) {
  if (!publishableKey) {
    return false;
  }

  try {
    const clerk = await getClerk(publishableKey);
    const token = await clerk.session?.getToken();
    if (!token) {
      return false;
    }

    await exchangeMarketplaceSession(token);
    return true;
  } catch (error) {
    console.error("Failed to exchange Clerk session with marketplace backend:", error);
    throw new Error("Unable to restore your account session. Please sign in again.");
  }
}

export async function openMarketplaceSignIn(publishableKey: string | null) {
  if (!publishableKey) {
    throw new Error("Clerk is not configured for this environment.");
  }

  try {
    const clerk = await getClerk(publishableKey);
    clerk.openSignIn({
      fallbackRedirectUrl: window.location.href,
      forceRedirectUrl: window.location.href,
    });
  } catch (error) {
    console.error("Failed to open Clerk sign-in:", error);
    throw new Error("Failed to open sign-in. Please try again.");
  }
}

export async function signOutMarketplace(publishableKey: string | null) {
  try {
    if (publishableKey) {
      const clerk = await getClerk(publishableKey);
      await clerk.signOut();
    }

    await logoutMarketplaceSession();
  } catch (error) {
    console.error("Failed to sign out of marketplace:", error);
    throw new Error("Unable to sign out right now. Please try again.");
  }
}
