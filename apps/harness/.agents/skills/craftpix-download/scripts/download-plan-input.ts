type PlanDefaults = {
  cookieFile?: string;
  outputDir?: string;
  overwrite?: boolean;
  resolveOnly?: boolean;
  timeout?: number;
  debug?: boolean;
};

type PlanItem = {
  sourceUrl?: string;
  outputDir?: string;
  cookieFile?: string;
  filename?: string;
  subitem?: string;
  overwrite?: boolean;
  resolveOnly?: boolean;
  timeout?: number;
  debug?: boolean;
  note?: string;
};

type DownloadPlan = {
  defaults?: PlanDefaults;
  downloads?: PlanItem[];
};

function isPlanDefaults(value: unknown): value is PlanDefaults {
  return (typeof value === "object" && value !== null && !Array.isArray(value)
    && (!("cookieFile" in value) || value.cookieFile === undefined || (typeof value.cookieFile === "string"))
    && (!("outputDir" in value) || value.outputDir === undefined || (typeof value.outputDir === "string"))
    && (!("overwrite" in value) || value.overwrite === undefined || (typeof value.overwrite === "boolean"))
    && (!("resolveOnly" in value) || value.resolveOnly === undefined || (typeof value.resolveOnly === "boolean"))
    && (!("timeout" in value) || value.timeout === undefined || (typeof value.timeout === "number" && Number.isFinite(value.timeout)))
    && (!("debug" in value) || value.debug === undefined || (typeof value.debug === "boolean")));
}

function isPlanItem(value: unknown): value is PlanItem {
  return (typeof value === "object" && value !== null && !Array.isArray(value)
    && (!("sourceUrl" in value) || value.sourceUrl === undefined || (typeof value.sourceUrl === "string"))
    && (!("outputDir" in value) || value.outputDir === undefined || (typeof value.outputDir === "string"))
    && (!("cookieFile" in value) || value.cookieFile === undefined || (typeof value.cookieFile === "string"))
    && (!("filename" in value) || value.filename === undefined || (typeof value.filename === "string"))
    && (!("subitem" in value) || value.subitem === undefined || (typeof value.subitem === "string"))
    && (!("overwrite" in value) || value.overwrite === undefined || (typeof value.overwrite === "boolean"))
    && (!("resolveOnly" in value) || value.resolveOnly === undefined || (typeof value.resolveOnly === "boolean"))
    && (!("timeout" in value) || value.timeout === undefined || (typeof value.timeout === "number" && Number.isFinite(value.timeout)))
    && (!("debug" in value) || value.debug === undefined || (typeof value.debug === "boolean"))
    && (!("note" in value) || value.note === undefined || (typeof value.note === "string")));
}

function isDownloadPlan(value: unknown): value is DownloadPlan {
  return (typeof value === "object" && value !== null && !Array.isArray(value)
    && (!("defaults" in value) || value.defaults === undefined || (isPlanDefaults(value.defaults)))
    && (!("downloads" in value) || value.downloads === undefined || (Array.isArray(value.downloads) && value.downloads.every((entry: unknown) => isPlanItem(entry)))));
}

export function parseDownloadPlan(value: unknown) {
  if (!isDownloadPlan(value) || !value.downloads?.length) throw new Error("Plan file must include a non-empty downloads array with valid options.");
  return { ...value, downloads: value.downloads };
}
