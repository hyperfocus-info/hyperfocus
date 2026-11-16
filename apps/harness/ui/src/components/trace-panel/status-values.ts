

export function toneForRisk(risk: string): "neutral" | "success" | "warning" | "danger" | "info" {
  if (risk === "unsafe") {
    return "danger";
  }
  if (risk === "slightly-unsafe") {
    return "warning";
  }
  return "success";
}

export function toneForStatus(status: string): "neutral" | "success" | "warning" | "danger" | "info" {
  if (status.includes("failed") || status.includes("cancelled") || status.includes("error") || status.includes("open")) {
    return "danger";
  }
  if (status.includes("partial-complete")) {
    return "warning";
  }
  if (status.includes("running") || status.includes("queued") || status.includes("awaiting") || status.includes("pending") || status.includes("due")) {
    return "warning";
  }
  if (status.includes("succeeded") || status.includes("completed") || status.includes("enabled") || status.includes("active") || status.includes("closed")) {
    return "success";
  }
  if (status.includes("paused") || status.includes("idle")) {
    return "info";
  }
  return "neutral";
}

export function isAttentionStatus(status: string) {
  return status.includes("failed") || status.includes("cancelled") || status.includes("approval") || status.includes("running") || status.includes("queued");
}

export type AssistantJobStatusState = "running" | "successful" | "error" | "idle";

export function getAssistantJobStatusState(status: string | undefined): AssistantJobStatusState {
  if (status === "queued" || status === "awaiting-approval" || status === "awaiting-user-input" || status === "running") {
    return "running";
  }
  if (status === "succeeded") {
    return "successful";
  }
  if (status === "failed" || status === "cancelled") {
    return "error";
  }
  return "idle";
}
