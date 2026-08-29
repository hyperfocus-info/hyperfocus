import type {
  Assistant,
  AssistantLearning,
  BulkOperationAction,
  ComposerReasoningStrength,
} from "@hyperfocus/ai-core/protocol";
import type { AssistantWorkloadCollectionState } from "../../assistant-workload-state";
import {
  DEFAULT_COMPOSER_REASONING_STRENGTH,
  harnessStore,
  type AssistantRosterSort,
} from "../../harness-store";
import type { StatusChipTone } from "../primitives/status-chip";
import { formatForDisplay } from "@tanstack/solid-hotkeys";

export function formatHotkeyHint(hotkey: string) {
  return formatForDisplay(hotkey).split("+").map((part) => part.trim()).filter(Boolean).join(" + ");
}

export function tooltipWithPrimaryHotkey(label: string, hotkey: string | undefined) {
  return hotkey ? `${label} (${formatHotkeyHint(hotkey)})` : label;
}

export function assistantWorkloadEmptyMessage(label: string, emptyLabel: string, state: AssistantWorkloadCollectionState | undefined, hasSearch: boolean, hasItems: boolean) {
  if (state?.status === "error") return `Could not load ${label}.`;
  if (hasSearch && (hasItems || state?.status === "loaded")) return `No matching ${label} in the loaded results${state?.nextCursor ? "; load more to continue searching." : "."}`;
  if (state?.status === "loaded") return state.nextCursor ? `No ${label} in this page; load more to continue.` : emptyLabel;
  return state?.status === "stale" ? `Refreshing ${label}...` : `Loading ${label}...`;
}

export function toggleAssistantSelectionId(ids: string[], id: string) {
  return ids.includes(id) ? ids.filter((entry) => entry !== id) : [...ids, id];
}

export function mergeAssistantRangeSelection(
  ids: string[],
  visibleIds: string[],
  anchorId: string,
  targetId: string,
) {
  const anchorIndex = visibleIds.indexOf(anchorId);
  const targetIndex = visibleIds.indexOf(targetId);
  if (anchorIndex === -1 || targetIndex === -1) {
    return ids.includes(targetId) ? ids : [...ids, targetId];
  }
  const start = Math.min(anchorIndex, targetIndex);
  const end = Math.max(anchorIndex, targetIndex);
  return [...new Set([...ids, ...visibleIds.slice(start, end + 1)])];
}

export function formatAssistantBulkActionLabel(action: BulkOperationAction) {
  return action === "bootstrap-retry" ? "bootstrap retry" : action;
}

export function compareAssistantLearnings(
  left: AssistantLearning,
  right: AssistantLearning,
) {
  if (left.sortOrder !== undefined || right.sortOrder !== undefined) {
    if (left.sortOrder === undefined) {
      return 1;
    }
    if (right.sortOrder === undefined) {
      return -1;
    }
    return left.sortOrder - right.sortOrder;
  }
  const leftSummary = (left.kind ?? "fact") === "summary" ? 1 : 0;
  const rightSummary = (right.kind ?? "fact") === "summary" ? 1 : 0;
  return (
    rightSummary - leftSummary || right.createdAt.localeCompare(left.createdAt)
  );
}

export function splitAssistantStreamingText(input: string) {
  const text = input.trim();
  if (!text) {
    return [];
  }
  const chunks: string[] = [];
  let buffer = "";
  for (const part of text.split(/(?<=[.!?])\s+|\n\n+/)) {
    const next = buffer ? `${buffer} ${part}` : part;
    if (next.length < 700) {
      buffer = next;
      continue;
    }
    if (buffer) {
      chunks.push(buffer);
    }
    buffer = part;
  }
  if (buffer) {
    chunks.push(buffer);
  }
  return chunks.length ? chunks : [text];
}

export function getReasoningStrengthDescription(strength: ComposerReasoningStrength) {
  switch (strength) {
    case "low":
      return "Fastest pass with minimal internal deliberation.";
    case "medium":
      return "Balanced depth for routine implementation and review.";
    case "high":
      return "Default stronger reasoning for most coding work.";
    case "extra-high":
      return "Heaviest reasoning budget for hard debugging and planning.";
  }
}

export function formatReasoningStrengthLabel(strength: ComposerReasoningStrength) {
  switch (strength) {
    case "extra-high":
      return "Extra High";
    case "medium":
      return "Medium";
    case "low":
      return "Low";
    case "high":
    default:
      return "High";
  }
}

export function formatReasoningOptionLabel(strength: ComposerReasoningStrength) {
  const label = formatReasoningStrengthLabel(strength);
  return strength === DEFAULT_COMPOSER_REASONING_STRENGTH
    ? `${label} (default)`
    : label;
}

export function assistantRunStateTone(
  runState: Assistant["runState"],
): StatusChipTone {
  return runState === "active" ? "success" : "warning";
}

export function matchesAssistantFilters(
  assistant: Assistant,
  state: typeof harnessStore.state,
) {
  const filters = state.assistants;
  if (filters.runStateFilter && assistant.runState !== filters.runStateFilter) {
    return false;
  }
  if (
    filters.bootstrapStateFilter &&
    assistant.bootstrapState !== filters.bootstrapStateFilter
  ) {
    return false;
  }
  if (
    filters.providerBrandFilter &&
    assistant.providerBrand !== filters.providerBrandFilter
  ) {
    return false;
  }
  if (
    filters.projectIdFilter &&
    assistant.projectId !== filters.projectIdFilter
  ) {
    return false;
  }
  return true;
}

export function compareAssistants(
  left: Assistant,
  right: Assistant,
  sort: AssistantRosterSort,
) {
  if (sort === "name") {
    return (
      left.name.localeCompare(right.name) ||
      right.updatedAt.localeCompare(left.updatedAt)
    );
  }
  if (sort === "created") {
    return right.createdAt.localeCompare(left.createdAt);
  }
  if (sort === "run-state") {
    return (
      left.runState.localeCompare(right.runState) ||
      right.updatedAt.localeCompare(left.updatedAt)
    );
  }
  if (sort === "bootstrap-state") {
    return (
      left.bootstrapState.localeCompare(right.bootstrapState) ||
      right.updatedAt.localeCompare(left.updatedAt)
    );
  }
  return right.updatedAt.localeCompare(left.updatedAt);
}

export function assistantSearchHaystack(
  assistant: Assistant,
  state: typeof harnessStore.state,
) {
  const project = state.workspace.projects.find(
    (entry) => entry.id === assistant.projectId,
  );
  return [
    assistant.name,
    assistant.description,
    assistant.personalityPrompt,
    assistant.jobPrompt,
    assistant.scope,
    assistant.runState,
    assistant.bootstrapState,
    assistant.providerBrand,
    project?.name,
    project?.rootPath,
  ]
    .filter(Boolean)
    .join(" ");
}

export function fuzzyMatches(haystack: string, query: string) {
  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
  if (tokens.length === 0) {
    return true;
  }
  const normalized = haystack.toLowerCase();
  return tokens.every((token) => normalized.includes(token));
}

export function summarizePrompt(prompt: string, maxLength = 120) {
  return prompt.replace(/\s+/g, " ").trim().slice(0, maxLength);
}
