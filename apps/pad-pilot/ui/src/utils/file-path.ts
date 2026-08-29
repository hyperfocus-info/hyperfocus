export function fileNameFromPath(path: string, fallback = path) {
  const normalized = path.replace(/[\\/]+/g, "/");
  const parts = normalized.split("/");
  return parts[parts.length - 1] || fallback;
}
