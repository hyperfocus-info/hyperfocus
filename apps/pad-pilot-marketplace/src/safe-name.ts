export function toSafeNameComponent(value: string) {
  const sanitized = value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "");
  return sanitized && sanitized !== "." && sanitized !== ".." ? sanitized : "item";
}
