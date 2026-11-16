export const normalizeUploadthingBaseUrl = (value: string) => {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (trimmed.endsWith("/api/uploadthing")) {
    return trimmed.slice(0, -"/api/uploadthing".length);
  }
  return trimmed;
};
