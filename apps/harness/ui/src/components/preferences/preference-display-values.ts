import { formatBytes as formatByteSize } from "@hyperfocus/utilities/text";

export function formatBytes(bytes: number) {
  return formatByteSize(bytes, { maximumUnit: "GB", bytesLabel: "bytes", nanUnit: "bytes" });
}

export function formatTokenCount(value: number) {
  const normalized = Math.max(0, Math.round(value));
  return normalized.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
