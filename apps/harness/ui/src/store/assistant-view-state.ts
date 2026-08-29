import type { Assistant, AssistantsState } from "@hyperfocus/ai-core/protocol";
import type { AssistantDetailRequestState } from "./assistant-detail-state";
import type { AssistantRosterPageState } from "./assistant-roster-state";
import type { AssistantWorkloadState } from "./assistant-workload-pages";

export type AssistantDetailTab = "chat" | "todos" | "questions" | "jobs" | "log" | "config" | "learnings";
export type AssistantScopeFilter = "all" | "global" | "project";
export type AssistantRosterSort = "updated" | "created" | "name" | "run-state" | "bootstrap-state";

export type ViewAssistantsState = AssistantsState & AssistantWorkloadState & AssistantDetailRequestState & {
  selectedAssistantId?: string;
  selectedTab: AssistantDetailTab;
  selectedLogDetailsId?: string;
  scopeFilter: AssistantScopeFilter;
  rosterSearch: string;
  detailSearch: string;
  runStateFilter?: Assistant["runState"];
  bootstrapStateFilter?: Assistant["bootstrapState"];
  providerBrandFilter?: Assistant["providerBrand"];
  projectIdFilter?: string;
  rosterSort: AssistantRosterSort;
  streamingByAssistantId: Record<string, string>;
  provisionalReconnectAssistantIds: string[];
  rosterPage: AssistantRosterPageState;
};
