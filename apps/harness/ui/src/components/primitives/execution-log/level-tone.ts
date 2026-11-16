

export function executionLogLevelTone(level: string): "error" | "warningBorder" | "success" | "running" | "neutralBorder" {
  const normalized = level.toLowerCase();
  if (normalized.includes("fail") || normalized.includes("error") || normalized.includes("cancel")) {
    return "error";
  }
  if (normalized.includes("warn") || normalized.includes("approval") || normalized.includes("input")) {
    return "warningBorder";
  }
  if (normalized.includes("done") || normalized.includes("complete") || normalized.includes("success")) {
    return "success";
  }
  if (normalized.includes("run") || normalized.includes("exec")) {
    return "running";
  }
  return "neutralBorder";
}
