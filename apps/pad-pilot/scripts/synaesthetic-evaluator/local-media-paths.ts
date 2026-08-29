import { homedir } from "node:os";
import path from "node:path";

function localMediaFile(parentSegments: readonly string[], fileName: string) {
  if (!fileName || path.basename(fileName) !== fileName) {
    throw new Error("Local media filename must be one path segment.");
  }
  return path.join(homedir(), ...parentSegments, fileName);
}

export function downloadsFile(fileName: string) {
  return localMediaFile(["Downloads"], fileName);
}

export function flStudioProjectFile(fileName: string) {
  return localMediaFile(["Documents", "Image-Line", "FL Studio", "Projects"], fileName);
}
