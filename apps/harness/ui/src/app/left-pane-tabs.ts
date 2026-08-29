import type { Component } from "solid-js";
import { Bot, BriefcaseBusiness, Clock3, Cog, FolderKanban } from "lucide-solid";
import type { HarnessLeftTab } from "../harness-store";
import type { AppHotkeyId } from "../lib/app-hotkeys";

export type LeftPaneTabDefinition = {
  id: HarnessLeftTab;
  label: string;
  tooltip: string;
  icon: Component<{ class?: string }>;
  hotkeyId?: AppHotkeyId;
};

export const leftPaneTabs: LeftPaneTabDefinition[] = [
  {
    id: "projects",
    label: "Projects",
    tooltip: "Show project roots and threads",
    icon: FolderKanban,
    hotkeyId: "openProjects"
  },
  {
    id: "assistants",
    label: "Assistants",
    tooltip: "Show assistant roster",
    icon: Bot,
    hotkeyId: "openAssistants"
  },
  {
    id: "jobs",
    label: "Jobs",
    tooltip: "Show scheduled background jobs",
    icon: BriefcaseBusiness,
    hotkeyId: "openJobs"
  },
  {
    id: "runs",
    label: "Runs",
    tooltip: "Show active run info",
    icon: Clock3,
    hotkeyId: "openRuns"
  },
  {
    id: "preferences",
    label: "Settings",
    tooltip: "Show workspace settings",
    icon: Cog,
    hotkeyId: "openPreferences"
  },
];

