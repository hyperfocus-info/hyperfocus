import { For, Show, createMemo, createSignal } from "solid-js";
import * as stylex from "@stylexjs/stylex";
import { Bolt, ChevronDown, ChevronRight, Pencil, Square, TerminalSquare, X } from "lucide-solid";
import { ActionButton } from "../components/action-button";
import { Input } from "@hyperfocus/ui";
import { terminalStyles as styles, terminalUtilities as utilities } from "./terminal.styles";
import { terminalControlStyles as controls } from './terminal-controls.styles';

export type TerminalTabItem = {
  id: string;
  name: string;
  status: string;
  renamable?: boolean;
  category?: "terminal" | "spawned";
};

export function TerminalTabs(props: {
  sessions: TerminalTabItem[];
  activeSessionId?: string;
  onSelect: (sessionId: string) => void;
  onRename: (sessionId: string, name: string) => void;
  onClose: (sessionId: string) => void;
}) {
  let navigation: HTMLElement | undefined;
  const focusSession = (id: string) => queueMicrotask(() => {
    const target = [...(navigation?.querySelectorAll<HTMLButtonElement>('[data-terminal-select]') ?? [])]
      .find(button => button.dataset.terminalSelect === id);
    target?.focus();
  });
  const [editingId, setEditingId] = createSignal<string>();
  const [draft, setDraft] = createSignal("");
  const [collapsed, setCollapsed] = createSignal<Record<"terminal" | "spawned", boolean>>({
    terminal: false,
    spawned: false
  });
  const groups = createMemo(() => [
    {
      id: "terminal" as const,
      title: "Terminals",
      subtitle: "user-created",
      sessions: props.sessions.filter((session) => (session.category ?? "terminal") === "terminal")
    },
    {
      id: "spawned" as const,
      title: "Spawned",
      subtitle: "agent/CLI-created",
      sessions: props.sessions.filter((session) => session.category === "spawned")
    }
  ]);

  const commit = (session: TerminalTabItem) => {
    if (editingId() !== session.id) return;
    const name = draft().trim();
    if (session.renamable !== false && name && name !== session.name) {
      props.onRename(session.id, name);
    }
    setEditingId(undefined);
  };

  const toggleGroup = (groupId: "terminal" | "spawned") => {
    setCollapsed((current) => ({ ...current, [groupId]: !current[groupId] }));
  };

  return (
    <nav ref={navigation} class={stylex.attrs(utilities.flex, utilities.minH0, utilities.flex1, utilities.flexCol, utilities.gap3).class} aria-label="Terminal sessions">
      <For each={groups()}>
        {(group) => (
          <section class={stylex.attrs(utilities.grid, utilities.gap1).class}>
            <button
              type="button"
              class={stylex.attrs(styles.hoverSurface, utilities.flex, utilities.cursorPointer, utilities.itemsCenter, utilities.gap2, utilities.roundedMd, utilities.px15, utilities.py1, utilities.textLeft, utilities.transition, controls.select).class}
              aria-expanded={!collapsed()[group.id]}
              aria-label={`${collapsed()[group.id] ? "Expand" : "Collapse"} ${group.title} (${group.subtitle})`}
              onClick={() => toggleGroup(group.id)}
            >
              <Show when={collapsed()[group.id]} fallback={<ChevronDown class={stylex.attrs(utilities.h35, utilities.w35, styles.muted).class} />}>
                <ChevronRight class={stylex.attrs(utilities.h35, utilities.w35, styles.muted).class} />
              </Show>
              <span class={stylex.attrs(utilities.minW0).class}>
                <span class={stylex.attrs(utilities.block, utilities.truncate, utilities.text078, utilities.fontSemibold, utilities.leading4, styles.foreground).class}>{group.title}</span>
                <span class={stylex.attrs(utilities.block, utilities.truncate, utilities.text064, utilities.leading3, styles.muted).class}>{group.subtitle}</span>
              </span>
            </button>
            <Show when={!collapsed()[group.id]}>
              <div class={stylex.attrs(utilities.grid, utilities.gap1, utilities.pl5).class}>
                <Show
                  when={group.sessions.length > 0}
                  fallback={<div class={stylex.attrs(utilities.roundedMd, utilities.px2, utilities.py15, utilities.text068, styles.muted).class}>No sessions</div>}
                >
                  <For each={group.sessions}>
                    {(session) => (
                      <div
                        data-terminal-session-row=""
                        class={props.activeSessionId === session.id
                          ? stylex.attrs(styles.selectionSurface, utilities.flex, utilities.minH9, utilities.minW0, utilities.itemsCenter, utilities.gap1, utilities.roundedMd, utilities.border, utilities.text074, utilities.transition, controls.row).class
                          : stylex.attrs(styles.idleSession, utilities.flex, utilities.minH9, utilities.minW0, utilities.itemsCenter, utilities.gap1, utilities.roundedMd, utilities.border, utilities.text074, utilities.transition, controls.row).class}
                      >
                        <Show
                          when={editingId() === session.id}
                          fallback={
                            <button
                              type="button"
                              data-terminal-select={session.id}
                              aria-pressed={props.activeSessionId === session.id}
                              class={stylex.attrs(utilities.flex, utilities.minW0, utilities.cursorPointer, utilities.itemsCenter, utilities.gap2, utilities.bgTransparent, utilities.px2, utilities.py15, utilities.textLeft, controls.select).class}
                              onClick={() => props.onSelect(session.id)}
                              onDblClick={() => {
                                if (session.renamable === false) {
                                  return;
                                }
                                setEditingId(session.id);
                                setDraft(session.name);
                              }}
                            >
                              <ActivityIcon category={session.category ?? "terminal"} status={session.status} />
                              <span class={stylex.attrs(utilities.minW0, utilities.flex1).class}>
                                <span class={stylex.attrs(utilities.block, utilities.fontMedium, styles.foreground, controls.name).class}>{session.name}</span>
                                <span class={stylex.attrs(utilities.block, styles.muted, controls.metadata).class}>{session.status}</span>
                              </span>
                              <TerminalStatusDot status={session.status} />
                            </button>
                          }
                        >
                          <div class={stylex.attrs(utilities.flex, utilities.minW0, utilities.flex1, utilities.itemsCenter, utilities.gap2, utilities.px2, utilities.py15).class}>
                            <ActivityIcon category={session.category ?? "terminal"} status={session.status} />
                            <Input
                              ref={element => queueMicrotask(() => { element.focus(); element.select(); })}
                              aria-label="Rename terminal"
                              class={stylex.attrs(styles.input, controls.input).class}
                              value={draft()}
                              onInput={(event) => setDraft(event.currentTarget.value)}
                              onBlur={() => commit(session)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  commit(session);
                                  focusSession(session.id);
                                }
                                if (event.key === "Escape") {
                                  setEditingId(undefined);
                                  focusSession(session.id);
                                }
                              }}
                            />
                          </div>
                        </Show>
                        <div {...stylex.attrs(controls.controls)}>
                        <Show when={session.renamable !== false}>
                          <ActionButton tooltip={`Rename ${session.name}`} variant="ghost" size="icon" class={stylex.attrs(styles.action, controls.target).class}
                            icon={<Pencil class={stylex.attrs(utilities.h35, utilities.w35).class} />}
                            onClick={() => { setEditingId(session.id); setDraft(session.name); }} />
                        </Show>
                        <ActionButton
                          tooltip={`Close ${session.name}`}
                          ariaLabel={`Close ${session.name}`}
                          variant="ghost"
                          size="icon"
                          class={stylex.attrs(styles.action, controls.target).class}
                          icon={<X class={stylex.attrs(utilities.h3, utilities.w3).class} />}
                          onClick={(event) => {
                            event.stopPropagation();
                            props.onClose(session.id);
                          }}
                        />
                        </div>
                      </div>
                    )}
                  </For>
                </Show>
              </div>
            </Show>
          </section>
        )}
      </For>
    </nav>
  );
}

function ActivityIcon(props: { category: "terminal" | "spawned"; status: string }) {
  const normalized = () => props.status.toLowerCase();
  const iconTone = () => {
    if (normalized() === "failed" || normalized() === "cancelled") {
      return "danger" as const;
    }
    if (props.category === "spawned" && (normalized() === "running" || normalized() === "starting" || normalized() === "queued")) {
      return "warning" as const;
    }
    if (props.category === "terminal" && normalized() === "running") {
      return "success" as const;
    }
    return "muted" as const;
  };
  const iconContainerClass = () => iconTone() === "danger"
    ? stylex.attrs(utilities.inlineFlex, utilities.h4, utilities.w4, utilities.shrink0, utilities.itemsCenter, utilities.justifyCenter, styles.dangerText).class
    : iconTone() === "warning"
      ? stylex.attrs(utilities.inlineFlex, utilities.h4, utilities.w4, utilities.shrink0, utilities.itemsCenter, utilities.justifyCenter, styles.warningText).class
      : iconTone() === "success"
        ? stylex.attrs(utilities.inlineFlex, utilities.h4, utilities.w4, utilities.shrink0, utilities.itemsCenter, utilities.justifyCenter, styles.successText).class
        : stylex.attrs(utilities.inlineFlex, utilities.h4, utilities.w4, utilities.shrink0, utilities.itemsCenter, utilities.justifyCenter, styles.muted).class;

  return (
    <span class={iconContainerClass()}>
      <Show when={props.category === "spawned"} fallback={<TerminalSquare class={stylex.attrs(utilities.h35, utilities.w35).class} />}>
        <Show when={normalized() === "failed" || normalized() === "cancelled"} fallback={<Bolt class={stylex.attrs(utilities.h35, utilities.w35).class} />}>
          <Square class={stylex.attrs(utilities.h35, utilities.w35, utilities.fillCurrent).class} />
        </Show>
      </Show>
    </span>
  );
}

function TerminalStatusDot(props: { status: string }) {
  const normalized = () => props.status.toLowerCase();
  const dotTone = () => {
    if (normalized() === "running" || normalized() === "succeeded") {
      return "success" as const;
    }
    if (normalized() === "starting" || normalized() === "queued") {
      return "warning" as const;
    }
    if (normalized() === "failed" || normalized() === "cancelled") {
      return "danger" as const;
    }
    return "muted" as const;
  };

  return (
    <span
      class={dotTone() === "success"
        ? stylex.attrs(utilities.h2, utilities.w2, utilities.shrink0, utilities.roundedFull, styles.successDot).class
        : dotTone() === "warning"
          ? stylex.attrs(utilities.h2, utilities.w2, utilities.shrink0, utilities.roundedFull, styles.warningDot).class
          : dotTone() === "danger"
            ? stylex.attrs(utilities.h2, utilities.w2, utilities.shrink0, utilities.roundedFull, styles.dangerDot).class
            : stylex.attrs(utilities.h2, utilities.w2, utilities.shrink0, utilities.roundedFull, styles.mutedDot).class}
      aria-label={`Status ${props.status}`}
    />
  );
}
