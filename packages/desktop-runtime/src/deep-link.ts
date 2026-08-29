import path from "node:path";

export type DesktopTargetFileSystem = {
  stat: (filePath: string) => Promise<{ isFile: () => boolean; isDirectory: () => boolean }>;
};

/** Parses an `ide://` argument without letting URL host rules corrupt Windows drive paths. */
export function parseDesktopProtocolTarget(value: string, scheme = "ide") {
  const prefix = `${scheme.toLowerCase()}://`;
  if (!value.toLowerCase().startsWith(prefix)) {
    throw new Error(`Expected a ${scheme}:// URL`);
  }

  let encodedPath = value.slice(prefix.length);
  const suffixStart = encodedPath.search(/[?#]/);
  if (suffixStart >= 0) {
    encodedPath = encodedPath.slice(0, suffixStart);
  }
  try {
    encodedPath = decodeURIComponent(encodedPath);
  } catch {
    throw new Error(`Invalid percent-encoding in ${scheme} URL`);
  }

  // Accept both ide://C:/work and the RFC-shaped ide:///C:/work form.
  if (/^\/[A-Za-z]:[\\/]/.test(encodedPath)) {
    encodedPath = encodedPath.slice(1);
  }
  if (!encodedPath.trim()) {
    throw new Error(`${scheme} URL does not contain a path`);
  }
  return encodedPath;
}

/** Resolves a launch target and reuses the deepest already-open project that owns a file. */
export async function resolveDesktopTarget(input: {
  target: string;
  projectRoots?: readonly string[];
  fileSystem: DesktopTargetFileSystem;
}) {
  const absolutePath = path.resolve(input.target);
  const stats = await input.fileSystem.stat(absolutePath);
  if (stats.isDirectory()) {
    return {
      absolutePath,
      kind: "folder",
      projectRoot: absolutePath
    } as const;
  }
  if (!stats.isFile()) {
    throw new Error("IDE target is neither a file nor a folder");
  }

  const owningRoot = [...(input.projectRoots ?? [])]
    .map((candidate) => path.resolve(candidate))
    .filter((candidate) => isInsidePath(absolutePath, candidate))
    .sort((left, right) => right.length - left.length)[0];
  const projectRoot = owningRoot ?? path.dirname(absolutePath);
  return {
    absolutePath,
    kind: "file",
    projectRoot,
    filePath: toProtocolPath(path.relative(projectRoot, absolutePath))
  } as const;
}

export type ResolvedDesktopTarget = Awaited<ReturnType<typeof resolveDesktopTarget>>;
export type FileSystemEntryKind = ResolvedDesktopTarget["kind"];

function isInsidePath(candidate: string, root: string) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function toProtocolPath(value: string) {
  return value.replaceAll("\\", "/");
}
