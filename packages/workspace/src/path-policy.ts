const WINDOWS_ABSOLUTE_PATH = /^[a-zA-Z]:[\\/]/;
const WINDOWS_RESERVED_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
const MAX_WORKSPACE_PATH_LENGTH = 4096;
const MAX_WORKSPACE_SEGMENT_LENGTH = 255;

/** Normalizes a workspace-relative path without touching the host filesystem. */
export function normalizeWorkspacePath(input: string) {
  if (input.length > MAX_WORKSPACE_PATH_LENGTH) throw new Error(`Workspace paths cannot exceed ${MAX_WORKSPACE_PATH_LENGTH} characters`);
  if (input.includes("\0")) throw new Error("Workspace paths cannot contain null bytes");
  if (input.startsWith("/") || input.startsWith("\\") || WINDOWS_ABSOLUTE_PATH.test(input)) {
    throw new Error("Workspace paths must be relative");
  }

  const segments: string[] = [];
  for (const segment of input.replaceAll("\\", "/").split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (segments.length === 0) throw new Error("Workspace paths cannot escape the workspace root");
      segments.pop();
      continue;
    }
    if (segment.length > MAX_WORKSPACE_SEGMENT_LENGTH) throw new Error(`Workspace path segments cannot exceed ${MAX_WORKSPACE_SEGMENT_LENGTH} characters`);
    if (/[:\u0000-\u001f]/.test(segment)) throw new Error("Workspace path segments cannot contain colons or control characters");
    if (/[. ]$/.test(segment)) throw new Error("Workspace path segments cannot end in a dot or space");
    if (WINDOWS_RESERVED_NAME.test(segment)) throw new Error(`Workspace path segment is reserved by the host: ${segment}`);
    segments.push(segment);
  }
  return segments.join("/");
}

/** Resolves a relative path only after proving that it stays inside the root. */
export function resolveWorkspacePath(root: string, input: string) {
  const normalized = normalizeWorkspacePath(input);
  const separator = root.includes("\\") ? "\\" : "/";
  const cleanRoot = root.replace(/[\\/]+$/, "");
  return normalized ? `${cleanRoot}${separator}${normalized.replaceAll("/", separator)}` : cleanRoot;
}
