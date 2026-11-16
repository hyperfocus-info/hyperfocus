import {    type JSX } from "solid-js";
import * as stylex from "@stylexjs/stylex";
import { ArrowDown, Bot, Calendar, CirclePause, CirclePlay, Folder, Globe, ListFilter, ListChecks, Trash2 } from "lucide-solid";
import {  toProperCase } from "../../lib/utils";
import {    type AssistantRosterSort, harnessStore } from "../../harness-store";
import {     type LeftPaneSearchMenuItem } from "../primitives/left-pane";
import {  assistantUtilityStyles } from "../assistants-panel.styles";

function assistantScopeMenuItem(
  state: typeof harnessStore.state,
): LeftPaneSearchMenuItem {
  return {
    kind: "submenu",
    label: "Scope",
    value: formatAssistantScopeFilterLabel(state.assistants.scopeFilter),
    icon:
      state.assistants.scopeFilter === "global" ? (
        <Globe
          class={
            stylex.attrs(
              assistantUtilityStyles.h35,
              assistantUtilityStyles.w35,
            ).class
          }
        />
      ) : (
        <Folder
          class={
            stylex.attrs(
              assistantUtilityStyles.h35,
              assistantUtilityStyles.w35,
            ).class
          }
        />
      ),
    items: [
      {
        kind: "option",
        label: "All",
        icon: (
          <ListFilter
            class={
              stylex.attrs(
                assistantUtilityStyles.h35,
                assistantUtilityStyles.w35,
              ).class
            }
          />
        ),
        selected: state.assistants.scopeFilter === "all",
        onSelect: () => harnessStore.setAssistantScopeFilter("all"),
      },
      {
        kind: "option",
        label: "Current project",
        icon: (
          <Folder
            class={
              stylex.attrs(
                assistantUtilityStyles.h35,
                assistantUtilityStyles.w35,
              ).class
            }
          />
        ),
        selected: state.assistants.scopeFilter === "project",
        onSelect: () => harnessStore.setAssistantScopeFilter("project"),
      },
      {
        kind: "option",
        label: "Global",
        icon: (
          <Globe
            class={
              stylex.attrs(
                assistantUtilityStyles.h35,
                assistantUtilityStyles.w35,
              ).class
            }
          />
        ),
        selected: state.assistants.scopeFilter === "global",
        onSelect: () => harnessStore.setAssistantScopeFilter("global"),
      },
    ],
  };
}

function assistantRosterIcon(kind: "bot" | "folder" | "filter" | "checks") {
  const className = stylex.attrs(
    assistantUtilityStyles.h35,
    assistantUtilityStyles.w35,
  ).class;
  if (kind === "bot") return <Bot class={className} />;
  if (kind === "folder") return <Folder class={className} />;
  if (kind === "checks") return <ListChecks class={className} />;
  return <ListFilter class={className} />;
}

function assistantBootstrapMenuItem(
  state: typeof harnessStore.state,
): LeftPaneSearchMenuItem {
  const setFilters = harnessStore.setAssistantPaneFilters;
  return {
    kind: "submenu",
    label: "Bootstrap",
    value: state.assistants.bootstrapStateFilter
      ? toProperCase(state.assistants.bootstrapStateFilter)
      : "All",
    icon: assistantRosterIcon("checks"),
    active: Boolean(state.assistants.bootstrapStateFilter),
    items: [
      {
        kind: "option",
        label: "All bootstrap",
        icon: assistantRosterIcon("filter"),
        selected: !state.assistants.bootstrapStateFilter,
        onSelect: () => setFilters({ bootstrapStateFilter: undefined }),
      },
      ...(["pending", "running", "completed", "failed"] as const).map(
        (value) => ({
          kind: "option" as const,
          label: toProperCase(value),
          icon: assistantRosterIcon("checks"),
          selected: state.assistants.bootstrapStateFilter === value,
          active: state.assistants.bootstrapStateFilter === value,
          onSelect: () => setFilters({ bootstrapStateFilter: value }),
        }),
      ),
    ],
  };
}

function assistantProviderMenuItem(
  state: typeof harnessStore.state,
): LeftPaneSearchMenuItem {
  const setFilters = harnessStore.setAssistantPaneFilters;
  return {
    kind: "submenu",
    label: "Provider",
    value: state.assistants.providerBrandFilter
      ? toProperCase(state.assistants.providerBrandFilter)
      : "All",
    icon: assistantRosterIcon("bot"),
    active: Boolean(state.assistants.providerBrandFilter),
    items: [
      {
        kind: "option",
        label: "All providers",
        icon: assistantRosterIcon("bot"),
        selected: !state.assistants.providerBrandFilter,
        onSelect: () => setFilters({ providerBrandFilter: undefined }),
      },
      ...(["gpt", "gemini", "claude"] as const).map((value) => ({
        kind: "option" as const,
        label: toProperCase(value),
        icon: assistantRosterIcon("bot"),
        selected: state.assistants.providerBrandFilter === value,
        active: state.assistants.providerBrandFilter === value,
        onSelect: () => setFilters({ providerBrandFilter: value }),
      })),
    ],
  };
}

function assistantProjectMenuItem(
  state: typeof harnessStore.state,
): LeftPaneSearchMenuItem {
  const setFilters = harnessStore.setAssistantPaneFilters;
  return {
    kind: "submenu",
    label: "Project",
    value:
      state.workspace.projects.find(
        (project) => project.id === state.assistants.projectIdFilter,
      )?.name ?? "All",
    icon: assistantRosterIcon("folder"),
    active: Boolean(state.assistants.projectIdFilter),
    items: [
      {
        kind: "option",
        label: "All projects",
        icon: assistantRosterIcon("folder"),
        selected: !state.assistants.projectIdFilter,
        onSelect: () => setFilters({ projectIdFilter: undefined }),
      },
      ...state.workspace.projects.map((project) => ({
        kind: "option" as const,
        label: project.name,
        icon: assistantRosterIcon("folder"),
        selected: state.assistants.projectIdFilter === project.id,
        active: state.assistants.projectIdFilter === project.id,
        onSelect: () => setFilters({ projectIdFilter: project.id }),
      })),
    ],
  };
}

export function assistantRosterMenuItems(
  state: typeof harnessStore.state,
): LeftPaneSearchMenuItem[] {
  const setFilters = harnessStore.setAssistantPaneFilters;
  const sortOption = (
    label: string,
    value: AssistantRosterSort,
    icon: JSX.Element,
  ): Extract<LeftPaneSearchMenuItem, { kind: "option" }> => ({
    kind: "option",
    label,
    icon,
    selected: state.assistants.rosterSort === value,
    onSelect: () => setFilters({ rosterSort: value }),
  });

  return [
    assistantScopeMenuItem(state),
    {
      kind: "submenu",
      label: "Sort assistants",
      value: formatAssistantRosterSortLabel(state.assistants.rosterSort),
      icon: (
        <ListFilter
          class={
            stylex.attrs(assistantUtilityStyles.h35, assistantUtilityStyles.w35)
              .class
          }
        />
      ),
      items: [
        sortOption(
          "Updated",
          "updated",
          <ArrowDown
            class={
              stylex.attrs(
                assistantUtilityStyles.h35,
                assistantUtilityStyles.w35,
              ).class
            }
          />,
        ),
        sortOption(
          "Created",
          "created",
          <Calendar
            class={
              stylex.attrs(
                assistantUtilityStyles.h35,
                assistantUtilityStyles.w35,
              ).class
            }
          />,
        ),
        sortOption(
          "Name",
          "name",
          <ListFilter
            class={
              stylex.attrs(
                assistantUtilityStyles.h35,
                assistantUtilityStyles.w35,
              ).class
            }
          />,
        ),
        sortOption(
          "Run state",
          "run-state",
          <CirclePlay
            class={
              stylex.attrs(
                assistantUtilityStyles.h35,
                assistantUtilityStyles.w35,
              ).class
            }
          />,
        ),
        sortOption(
          "Bootstrap state",
          "bootstrap-state",
          <ListChecks
            class={
              stylex.attrs(
                assistantUtilityStyles.h35,
                assistantUtilityStyles.w35,
              ).class
            }
          />,
        ),
      ],
    },
    {
      kind: "submenu",
      label: "Run state",
      value: state.assistants.runStateFilter ?? "All",
      icon: (
        <CirclePlay
          class={
            stylex.attrs(assistantUtilityStyles.h35, assistantUtilityStyles.w35)
              .class
          }
        />
      ),
      active: Boolean(state.assistants.runStateFilter),
      items: [
        {
          kind: "option",
          label: "All run states",
          icon: (
            <ListFilter
              class={
                stylex.attrs(
                  assistantUtilityStyles.h35,
                  assistantUtilityStyles.w35,
                ).class
              }
            />
          ),
          selected: !state.assistants.runStateFilter,
          onSelect: () => setFilters({ runStateFilter: undefined }),
        },
        {
          kind: "option",
          label: "Active",
          icon: (
            <CirclePlay
              class={
                stylex.attrs(
                  assistantUtilityStyles.h35,
                  assistantUtilityStyles.w35,
                ).class
              }
            />
          ),
          selected: state.assistants.runStateFilter === "active",
          active: state.assistants.runStateFilter === "active",
          onSelect: () => setFilters({ runStateFilter: "active" }),
        },
        {
          kind: "option",
          label: "Paused",
          icon: (
            <CirclePause
              class={
                stylex.attrs(
                  assistantUtilityStyles.h35,
                  assistantUtilityStyles.w35,
                ).class
              }
            />
          ),
          selected: state.assistants.runStateFilter === "paused",
          active: state.assistants.runStateFilter === "paused",
          onSelect: () => setFilters({ runStateFilter: "paused" }),
        },
      ],
    },
    assistantBootstrapMenuItem(state),
    assistantProviderMenuItem(state),
    assistantProjectMenuItem(state),
    { kind: "separator" },
    {
      kind: "option",
      label: "Clear search and filters",
      icon: (
        <Trash2
          class={
            stylex.attrs(assistantUtilityStyles.h35, assistantUtilityStyles.w35)
              .class
          }
        />
      ),
      onSelect: () =>
        setFilters({
          rosterSearch: "",
          runStateFilter: undefined,
          bootstrapStateFilter: undefined,
          providerBrandFilter: undefined,
          projectIdFilter: undefined,
        }),
    },
  ];
}

export function activeAssistantRosterFilterCount(state: typeof harnessStore.state) {
  return [
    state.assistants.runStateFilter,
    state.assistants.bootstrapStateFilter,
    state.assistants.providerBrandFilter,
    state.assistants.projectIdFilter,
  ].filter(Boolean).length;
}

export function formatAssistantScopeFilterLabel(
  scopeFilter: typeof harnessStore.state.assistants.scopeFilter,
) {
  if (scopeFilter === "all") {
    return "All";
  }
  if (scopeFilter === "global") {
    return "Global";
  }
  return "Current";
}

export function formatAssistantRosterSortLabel(sort: AssistantRosterSort) {
  if (sort === "created") {
    return "Created";
  }
  if (sort === "name") {
    return "Name";
  }
  if (sort === "run-state") {
    return "Run state";
  }
  if (sort === "bootstrap-state") {
    return "Bootstrap";
  }
  return "Updated";
}

