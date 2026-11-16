export function formatSourceLabel(path: string) {
  const trimmed = path.trim();
  if (!trimmed) {
    return "Drop sample or click to browse";
  }
  const parts = trimmed.split(/[\\/]/);
  return parts[parts.length - 1] || trimmed;
}
