/** @jsxImportSource solid-js */
import type { ClientCommand } from "@hyperfocus/ai-core/protocol";
import { createEffect, createMemo, Show } from "solid-js";
import type { AssistantRosterPageState } from "../../store/assistant-roster-state";
import { ASSISTANT_ROSTER_PAGE_SIZE } from "../../store/assistant-roster-state";
import { ActionButton } from "../action-button";

type RosterPaginationControllerInput = {
  page: () => AssistantRosterPageState;
  connected: () => boolean;
  enabled: boolean;
  send: (command: ClientCommand) => boolean;
  start: (request: { id: string; cursor?: string }) => void;
  reject: (requestId: string, error: string) => void;
  createRequestId: () => string;
};

export function createAssistantRosterPaginationController(input: RosterPaginationControllerInput) {
  const request = (cursor?: string) => {
    if (input.page().status === "loading") return;
    const requestId = input.createRequestId();
    input.start({ id: requestId, cursor });
    if (!input.send({ type: "assistant.summary.list", requestId,
      payload: { cursor, limit: ASSISTANT_ROSTER_PAGE_SIZE } })) {
      input.reject(requestId, "Connection unavailable. Retry after reconnecting.");
    }
  };
  createEffect(() => {
    if (input.enabled && input.connected() && input.page().status === "idle") request();
  });
  return request;
}

export function createFilteredAssistantRoster<T>(getItems: () => T[], matchesFilters: (item: T) => boolean,
  matchesSearch: (item: T) => boolean, compare: (left: T, right: T) => number) {
  return createMemo(() => getItems().filter(matchesFilters).filter(matchesSearch).sort(compare));
}

export function AssistantRosterPagination(props: {
  page: AssistantRosterPageState;
  onRequest: (cursor?: string) => void;
}) {
  return <>
    <Show when={props.page.status === "error"}>
      <ActionButton tooltip="Retry loading assistants" size="sm" variant="secondary"
        onClick={() => props.onRequest(props.page.retryCursor)}>Retry loading assistants</ActionButton>
    </Show>
    <Show when={props.page.status === "loaded" && props.page.nextCursor}>
      <ActionButton tooltip="Load more assistants" size="sm" variant="secondary"
        onClick={() => props.onRequest(props.page.nextCursor)}>Load more assistants</ActionButton>
    </Show>
  </>;
}
