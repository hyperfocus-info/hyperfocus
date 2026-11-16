import type { CapabilityKind, CapabilityStreamFrame, CoalescedCapabilityIntent, HostIntent } from "./bridge-contracts";
import { parseCapabilityHandle } from "@hyperfocus/pad-pilot/module-identity";

type CapabilityStreamListener = (frame: CapabilityStreamFrame) => void;
type CapabilityStreamRegistryEntry = {
  capability: CapabilityKind;
  handle: string;
  cachedFrame: CapabilityStreamFrame | null;
  isOpen: boolean;
  lastSequence: bigint | null;
  listeners: Set<CapabilityStreamListener>;
};

function getCapabilityStreamKey(capability: CapabilityKind, handle: string) {
  return `${capability}::${handle}`;
}

export function isValidCapabilityHandle(capability: CapabilityKind, handle: string) {
  const parsed = parseCapabilityHandle(handle);
  return parsed.valid && parsed.capability === capability;
}

export function getCoalescedCapabilityIntent(intent: HostIntent) {
  if (intent.type !== "sendCapabilityIntent" || intent.capability !== "automation" || intent.action !== "update-touch") {
    return null;
  }
  const coalescedIntent: CoalescedCapabilityIntent = {
    action: "update-touch",
    capability: "automation",
    handle: intent.handle,
    payloadBase64: intent.payloadBase64,
    type: intent.type,
  };
  return coalescedIntent;
}

export function getQueuedCapabilityIntentKey(intent: CoalescedCapabilityIntent) {
  return `capability:${intent.capability}:${intent.handle}:${intent.action}`;
}

export function createCapabilityStreamRegistry() {
  const registry = new Map<string, CapabilityStreamRegistryEntry>();

  const getEntry = (capability: CapabilityKind, handle: string) => {
    const key = getCapabilityStreamKey(capability, handle);
    let entry = registry.get(key);
    if (!entry) {
      entry = {
        capability,
        handle,
        cachedFrame: null,
        isOpen: false,
        lastSequence: null,
        listeners: new Set(),
      };
      registry.set(key, entry);
    }
    return entry;
  };

  const closeAllOpen = (send: (intent: HostIntent) => void) => {
    for (const entry of registry.values()) {
      if (entry.listeners.size === 0 || !entry.isOpen) continue;
      const { capability, handle } = entry;
      entry.isOpen = false;
      entry.cachedFrame = null;
      entry.lastSequence = null;
      send({ type: "closeCapabilityStream", capability, handle });
    }
  };

  const reopenRequested = (selectedModuleId: string, force: boolean, send: (intent: HostIntent) => void) => {
    if (!selectedModuleId) return;
    for (const entry of registry.values()) {
      if (entry.listeners.size === 0) continue;
      const { capability, handle } = entry;
      if (parseCapabilityHandle(handle).moduleInstanceId !== selectedModuleId || (!force && entry.isOpen)) continue;
      entry.cachedFrame = null;
      entry.lastSequence = null;
      entry.isOpen = true;
      send({ type: "openCapabilityStream", capability, handle });
    }
  };

  const publish = (frame: CapabilityStreamFrame, selectedModuleId: string) => {
    if (!isValidCapabilityHandle(frame.capability, frame.handle)) return;
    const entry = registry.get(getCapabilityStreamKey(frame.capability, frame.handle));
    if (
      !entry || !entry.isOpen || entry.listeners.size === 0 || !selectedModuleId ||
      parseCapabilityHandle(frame.handle).moduleInstanceId !== selectedModuleId ||
      (entry.lastSequence !== null && frame.sequence <= entry.lastSequence)
    ) return;
    entry.lastSequence = frame.sequence;
    entry.cachedFrame = frame;
    for (const listener of entry.listeners) {
      try {
        listener(frame);
      } catch {
        // Public Module listeners cannot block other stream consumers.
      }
    }
  };

  const subscribe = (
    capability: CapabilityKind,
    handle: string,
    listener: CapabilityStreamListener,
    send: (intent: HostIntent) => void,
  ) => {
    if (!isValidCapabilityHandle(capability, handle)) return () => undefined;
    const entry = getEntry(capability, handle);
    entry.listeners.add(listener);
    if (!entry.isOpen) {
      entry.cachedFrame = null;
      entry.lastSequence = null;
      entry.isOpen = true;
      send({ type: "openCapabilityStream", capability, handle });
    }
    if (entry.cachedFrame) {
      try {
        listener(entry.cachedFrame);
      } catch {
        // Public listener failure cannot break subscription setup.
      }
    }
    return () => {
      entry.listeners.delete(listener);
      if (entry.listeners.size === 0 && entry.isOpen) {
        entry.isOpen = false;
        entry.cachedFrame = null;
        entry.lastSequence = null;
        send({ type: "closeCapabilityStream", capability, handle });
      }
      if (entry.listeners.size === 0) registry.delete(getCapabilityStreamKey(capability, handle));
    };
  };

  return {
    clear: () => registry.clear(),
    closeAllOpen,
    getCached: (capability: CapabilityKind, handle: string) => isValidCapabilityHandle(capability, handle)
      ? registry.get(getCapabilityStreamKey(capability, handle))?.cachedFrame ?? null
      : null,
    publish,
    reopenRequested,
    subscribe,
  };
}
