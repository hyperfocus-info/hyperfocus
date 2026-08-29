import { harnessStore } from "../harness-store";

export type OpenIdeWindowInput = {
  projectId?: string;
  threadId?: string;
};

export const OPEN_IDE_WINDOW_EVENT = "pi-harness:open-ide";
export const IDE_POP_IN_EVENT = "pi-harness:ide-pop-in";

export function openIdeWindow(input: OpenIdeWindowInput = {}) {
  if (typeof window === "undefined") {
    return undefined;
  }

  window.dispatchEvent(new CustomEvent(OPEN_IDE_WINDOW_EVENT, { detail: input }));
  harnessStore.setActiveSurface("ide");
  return undefined;
}

export function readOpenIdeWindowInput(event: Event): OpenIdeWindowInput {
  if (!(event instanceof CustomEvent)) return {};
  const detail: unknown = event.detail;
  if (!detail || typeof detail !== "object") return {};
  const projectId = Reflect.get(detail, "projectId");
  const threadId = Reflect.get(detail, "threadId");
  return {
    projectId: typeof projectId === "string" ? projectId : undefined,
    threadId: typeof threadId === "string" ? threadId : undefined
  };
}

export function createIdeWindowUrl(input: OpenIdeWindowInput = {}) {
  if (typeof window === "undefined") {
    return "/ide";
  }

  const baseOrigin = window.location.origin && window.location.origin !== "null" ? window.location.origin : "http://localhost";
  const url = new URL("/ide", baseOrigin);
  if (input.projectId) {
    url.searchParams.set("projectId", input.projectId);
  }
  if (input.threadId) {
    url.searchParams.set("threadId", input.threadId);
  }
  return `${url.pathname}${url.search}`;
}
