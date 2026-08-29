import { createRequestId, type ClientCommand } from "@hyperfocus/ai-core/protocol";

export type IdeLaunchRequest = {
  projectId: string;
  filePath?: string;
};

export function parseIdeLaunchRequest(urlValue: string): IdeLaunchRequest | undefined {
  const url = new URL(urlValue);
  const projectId = url.searchParams.get("ideProject")?.trim();
  if (!projectId) return undefined;
  const filePath = url.searchParams.get("ideFile")?.trim();
  return {
    projectId,
    filePath: filePath || undefined
  };
}

/** Applies one desktop launch intent after connection.ready has hydrated the matching workspace. */
export function consumeIdeLaunchRequest(input: {
  url: string;
  activeProjectId?: string;
  sendCommand: (command: ClientCommand) => void;
  openIde: () => void;
  openFile: (filePath: string) => void;
  replaceUrl?: (url: string) => void;
}) {
  const request = parseIdeLaunchRequest(input.url);
  if (!request) return false;
  input.openIde();
  if (input.activeProjectId !== request.projectId) {
    input.sendCommand({
      type: "project.activate",
      requestId: createRequestId(),
      payload: { projectId: request.projectId }
    });
  }
  if (request.filePath) {
    input.openFile(request.filePath);
  }
  const cleanUrl = new URL(input.url);
  cleanUrl.searchParams.delete("ideProject");
  cleanUrl.searchParams.delete("ideFile");
  input.replaceUrl?.(`${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
  return true;
}
