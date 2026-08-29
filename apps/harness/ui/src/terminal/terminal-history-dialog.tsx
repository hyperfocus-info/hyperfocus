import { For, Show } from "solid-js";
import * as stylex from "@stylexjs/stylex";
import { Clock3, ExternalLink, Terminal } from "lucide-solid";
import type { TerminalHistoryScope, TerminalSession } from "@hyperfocus/ai-core/protocol";
import { formatShortTimestamp } from "../lib/time-format";
import { ActionButton } from "../components/action-button";
import { Dialog } from "../components/primitives/dialog";
import { terminalStore } from "./terminal-store";
import { terminalStyles as styles, terminalUtilities as utilities } from "./terminal.styles";

export function TerminalHistoryDialog(props: {
  open: boolean;
  title: string;
  scope: TerminalHistoryScope | undefined;
  onClose: () => void;
}) {
  const sessions = () => terminalStore.state.history.sessions;

  return (
    <Dialog open={props.open} title={props.title} description="Terminal sessions linked to this context." onClose={props.onClose}>
      <div class={stylex.attrs(utilities.grid, utilities.gap2).class} data-test-terminal-history-dialog="">
        <Show
          when={sessions().length > 0}
          fallback={<div class={stylex.attrs(styles.muted, utilities.roundedLg, utilities.border, utilities.borderDashed, utilities.borderDefault, utilities.p4, utilities.textSm).class}>No terminal history.</div>}
        >
          <For each={sessions()}>
            {(session) => <TerminalHistoryRow session={session} />}
          </For>
        </Show>
      </div>
    </Dialog>
  );
}

function TerminalHistoryRow(props: { session: TerminalSession }) {
  const source = () => props.session.source ?? { kind: "user" as const };
  const sourceLabel = () => source().kind === "agent" ? source().label : "User terminal";
  const endedAt = () => props.session.closedAt ?? props.session.exitedAt;

  return (
    <article class={stylex.attrs(styles.surface, utilities.grid, utilities.gap2, utilities.roundedLg, utilities.border, utilities.p3, utilities.textXs).class}>
      <div class={stylex.attrs(utilities.flex, utilities.itemsStart, utilities.justifyBetween, utilities.gap3).class}>
        <div class={stylex.attrs(utilities.minW0).class}>
          <div class={stylex.attrs(utilities.flex, utilities.minW0, utilities.itemsCenter, utilities.gap2, utilities.fontSemibold, styles.foreground).class}>
            <Terminal class={stylex.attrs(utilities.h35, utilities.w35, utilities.shrink0, styles.muted).class} />
            <span class={stylex.attrs(utilities.truncate).class}>{props.session.name}</span>
          </div>
          <div class={stylex.attrs(utilities.mt1, utilities.flex, utilities.flexWrap, utilities.itemsCenter, utilities.gap2, utilities.text065, styles.muted).class}>
            <span>{sourceLabel()}</span>
            <span>{props.session.status}</span>
            <span>{props.session.cols}x{props.session.rows}</span>
          </div>
        </div>
        <Show when={!props.session.closedAt}>
          <ActionButton
            tooltip="Focus this terminal"
            ariaLabel={`Focus ${props.session.name}`}
            icon={<ExternalLink class={stylex.attrs(utilities.h35, utilities.w35).class} />}
            size="sm"
            variant="secondary"
            onClick={() => {
              terminalStore.focusSession(props.session.id);
              terminalStore.setOpen(true);
            }}
          >
            Open
          </ActionButton>
        </Show>
      </div>
      <div class={stylex.attrs(utilities.minW0, utilities.breakAll, utilities.fontMono, utilities.text065, styles.muted).class}>{props.session.cwd}</div>
      <div class={stylex.attrs(utilities.flex, utilities.flexWrap, utilities.itemsCenter, utilities.gap3, utilities.text065, styles.muted).class}>
        <span class={stylex.attrs(utilities.inlineFlex, utilities.itemsCenter, utilities.gap1).class}>
          <Clock3 class={stylex.attrs(utilities.h3, utilities.w3).class} />
          Started {formatShortTimestamp(props.session.startedAt)}
        </span>
        <Show when={endedAt()}>
          {(value) => <span>Ended {formatShortTimestamp(value())}</span>}
        </Show>
      </div>
    </article>
  );
}
