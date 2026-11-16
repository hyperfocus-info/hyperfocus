
export function safeFilename(filename: string) {
  const safe = filename.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/(^-|-$)/g, "");
  if (!safe) {
    return "padpilot-generated.mid";
  }
  return safe.toLowerCase().endsWith(".mid") ? safe : `${safe}.mid`;
}
