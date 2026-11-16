import { isRecord } from "@hyperfocus/utilities/records";
import { truncateUtf8 } from "@hyperfocus/engine/core";

export function cleanName(value: unknown): string {
  if (typeof value !== "string") return `Player ${Math.floor(Math.random() * 900 + 100)}`;
  const cleaned = truncateUtf8(value.trim().replace(/\s+/g, " "), 32);
  return cleaned || `Player ${Math.floor(Math.random() * 900 + 100)}`;
}

export function cleanRoomId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32);
  return cleaned || null;
}

export function cleanProgressionId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48);
  return cleaned || null;
}

export function cleanEffectIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const entry of value.slice(0, 8)) {
    const id = cleanProgressionId(entry);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

export function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return fallback;
  return Math.max(min, Math.min(max, numberValue));
}

export function boolFrom(value: unknown): boolean {
  return value === true || value === 1 || value === "true" || value === "1";
}

export function objectFrom(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}
