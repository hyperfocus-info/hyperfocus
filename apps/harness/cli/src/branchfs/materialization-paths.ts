export const PASSTHROUGH_DIRECTORIES = ["node_modules", "dist", ".bun"];

export function isExcludedMaterializationPath(relativePath: string) {
  return (
    relativePath === ".git" ||
    relativePath.startsWith(".git/") ||
    relativePath === ".local" ||
    relativePath.startsWith(".local/") ||
    isGeneratedOrPassthroughPath(relativePath)
  );
}

function isGeneratedOrPassthroughPath(relativePath: string) {
  const segments = relativePath.replace(/\\/g, "/").split("/");
  return segments.some((segment) => PASSTHROUGH_DIRECTORIES.includes(segment));
}
