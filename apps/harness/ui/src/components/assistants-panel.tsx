import * as stylex from "@stylexjs/stylex";
import { Plus } from "lucide-solid";
import { Show } from "solid-js";
import { normalizeAppHotkeyPreferences } from "../lib/app-hotkeys";
import { cn } from "../lib/utils";
import { ActionButton } from "./action-button";
import { assistantUtilityStyles } from "./assistants-panel.styles";
import { AssistantDetailHeader } from "./assistants/assistant-detail-header";
import { AssistantDetailPageControl } from "./assistants/assistant-detail-page-control";
import {
AssistantConfigTab,
AssistantDetailNavigation,
AssistantLogTab,
AssistantQuestionsTab,
} from "./assistants/assistant-detail-secondary-tabs";
import { detailStyles } from "./assistants/assistant-detail.styles";
import { AssistantJobsTab } from "./assistants/assistant-jobs-tab";
import {
tooltipWithPrimaryHotkey,
} from "./assistants/assistant-panel-model";
import { AssistantCircuitBreakerDialog } from "./assistants/assistant-recovery-dialog";
import { AssistantTodosTab } from "./assistants/assistant-todos-tab";
import { AssistantsPanelProvider,useAssistantsPanel } from "./assistants/state/panel-context";
import { ContextMenu } from "./primitives/context-menu";
import { DetailEmptyState,LeftPaneHeader,LeftPaneShell } from "./primitives/left-pane";
export type { AssistantsPanelController } from "./assistants/assistant-panel-controller";
export { assistantWorkloadEmptyMessage } from "./assistants/assistant-panel-model";


import { AssistantChatTab } from "./assistants/assistant-chat-tab";













import { createAssistantsPanelController,type AssistantsPanelProps } from "./assistants/assistant-panel-controller";

export function AssistantsPanel(props?: AssistantsPanelProps) {
  const controller = createAssistantsPanelController(props);
  return <AssistantsPanelProvider value={controller}><AssistantsPanelView /></AssistantsPanelProvider>;
}

function AssistantsPanelView() {
  const controller = useAssistantsPanel();
  const {
    contextMenu, createLabel, createScope, openCreateAssistant, setContextMenu, showDetail,
    showRoster, state,
  } = controller;
  return (
    <LeftPaneShell
      data-test-assistants-panel=""
      kind="assistants"
      padding="comfortable"
    >
      <AssistantCircuitBreakerDialog />
      <Show when={showRoster()}>
        <LeftPaneHeader
          title="Assistants"
          help="Named operators with chat, todo list, questions inbox, learnings, jobs, and deep logs."
          actions={
            <ActionButton
              tooltip={tooltipWithPrimaryHotkey(
                createLabel(),
                normalizeAppHotkeyPreferences(state.appHotkeyPreferences)
                  .createAssistant[0],
              )}
              icon={
                <Plus
                  class={
                    stylex.attrs(
                      assistantUtilityStyles.h4,
                      assistantUtilityStyles.w4,
                    ).class
                  }
                />
              }
              size="icon"
              variant="ghost"
              ariaLabel={createLabel()}
              onClick={() => openCreateAssistant(createScope())}
            />
          }
        />
      </Show>

      <div
        class={cn(
          stylex.attrs(
            assistantUtilityStyles.grid,
            assistantUtilityStyles.minH0,
            assistantUtilityStyles.minW0,
            assistantUtilityStyles.maxWFull,
            assistantUtilityStyles.flex1,
            assistantUtilityStyles.gap4,
          ).class,
          showRoster() && showDetail()
            ? stylex.attrs(assistantUtilityStyles.xlGridColsRoster).class
            : undefined,
        )}
      >
        <AssistantRosterPane />

        <AssistantDetailPane />
      </div>
      <Show when={contextMenu()}>
        {(menu) => (
          <ContextMenu
            open={true}
            x={menu().x}
            y={menu().y}
            ariaLabel={menu().label}
            actions={menu().actions}
            onClose={() => setContextMenu(undefined)}
          />
        )}
      </Show>
    </LeftPaneShell>
  );
}
function AssistantDetailPane() {
  const controller = useAssistantsPanel();
  const {
    detailCollectionLabel, requestMoreAssistantDetail, selectedAssistant, selectedDetailCollection,
    selectedDetailPage, showDetail, state,
  } = controller;
  return (
    <Show when={showDetail()}>
      <section
        class={
          stylex.attrs(
            assistantUtilityStyles.flex,
            assistantUtilityStyles.minH0,
            assistantUtilityStyles.minW0,
            assistantUtilityStyles.maxWFull,
            assistantUtilityStyles.flex1,
            assistantUtilityStyles.flexCol,
            detailStyles.scroll,
          ).class
        }
      >
        <Show
          when={selectedAssistant()}
          fallback={
            <DetailEmptyState>
              Select assistant to inspect config, chat, todos, and logs.
            </DetailEmptyState>
          }
        >
          {(assistant) => (
            <div
              class={
                stylex.attrs(
                  assistantUtilityStyles.flex,
                  assistantUtilityStyles.hFull,
                  assistantUtilityStyles.minH0,
                  assistantUtilityStyles.flexCol,
                  assistantUtilityStyles.gap4,
                  detailStyles.content,
                ).class
              }
            >
              <AssistantDetailHeader assistant={assistant} />

              <AssistantDetailNavigation />

              <AssistantChatTab />

              <AssistantTodosTab />

              <AssistantQuestionsTab />

              <AssistantJobsTab />

              <AssistantLogTab />

              <AssistantConfigTab />

              <AssistantLearningsTab />
              <Show when={selectedDetailPage()}>
                {(page) => <AssistantDetailPageControl page={page()} label={detailCollectionLabel()}
                  messages={selectedDetailCollection() === "messages"} searching={!!state.assistants.detailSearch.trim()}
                  onLoadMore={requestMoreAssistantDetail} />}
              </Show>
            </div>
          )}
        </Show>
      </section>
    </Show>
  );
}














import { AssistantLearningsTab } from "./assistants/assistant-learnings-tab";








import { AssistantRosterPane } from "./assistants/assistant-roster-pane";
