
import { type ClientCommand,type IdeFileRead,type ServerEvent } from "@hyperfocus/ai-core/protocol";

export const command = (requestId: string): ClientCommand => ({ type: "notifications.mark-all-read", requestId });

export function filePayload(projectId: string, path: string, content: string): IdeFileRead {
  return {
    projectId,
    path,
    name: path.split("/").at(-1) ?? path,
    language: "TypeScript",
    encoding: "UTF-8",
    sizeBytes: content.length,
    lineCount: content.split("\n").length,
    isBinary: false,
    tooLarge: false,
    content
  };
}

export const reject = (requestId: string): Extract<ServerEvent, { type: "command.rejected" }> => ({
    type: "command.rejected", requestId, payload: { message: "Temporary failure" }
  });

export const rejected = (requestId: string): Extract<ServerEvent, { type: "command.rejected" }> => ({ type: "command.rejected",
    requestId, payload: { message: "Expired", code: "invalid-cursor" } });

export function getCommandType(value: unknown) {
  if (!value || typeof value !== "object" || !("type" in value) || typeof value.type !== "string") {
    return undefined;
  }
  return value.type;
}
