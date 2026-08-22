const WINDOWS_ABSOLUTE_PATH = /^[a-zA-Z]:[\\/]/;

/** Normalizes a workspace-relative path without touching the host filesystem. */
export function normalizeWorkspacePath(input: string) {
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

