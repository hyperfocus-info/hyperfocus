import { formatPercent } from "@hyperfocus/utilities/text";
export function percent(score: number | null) {
  return score === null ? "N/A" : formatPercent(score);
}

export function clockTime(seconds: number) {
  const whole = Math.max(0, Math.round(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

export function friendlyName(id: string) {
  return id.replace(/([a-z0-9])([A-Z])/g, "$1 $2").split(/[._-]/).filter(Boolean).map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" ");
}

export function commaTags(value: string) {
  return value.split(",").map((tag) => tag.trim()).filter(Boolean);
}

export function algorithmVersionParts(fingerprint: string) {
  const match = fingerprint.match(/(?:^|[-_])v(\d+(?:\.\d+)*)$/i);
  return match?.[1]?.split(".").map(Number) ?? null;
}
