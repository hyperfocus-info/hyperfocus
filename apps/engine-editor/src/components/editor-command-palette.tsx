import * as stylex from "@stylexjs/stylex";
import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js";
import { tokens } from "@hyperfocus/ui/tokens.stylex";

export type EditorPaletteCommand = {
  id: string;
  label: string;
  detail: string;
  shortcut?: string;
  run(): void;
};

export type EditorCommandPaletteApi = {
  open(): void;
  close(): void;
  refresh(): void;
  isOpen(): boolean;
};

const styles = stylex.create({
  backdrop: { inset: 0, alignItems: "start", backgroundColor: tokens.scrim, display: "grid", justifyItems: "center", paddingBlockStart: "12vh", position: "fixed", zIndex: 950 },
  dialog: { borderColor: tokens.border, borderRadius: tokens.radius, borderStyle: "solid", borderWidth: "1px", overflow: "hidden", backgroundColor: tokens.overlay, boxShadow: tokens.shadow, maxHeight: "72vh", width: "min(42rem, calc(100vw - 2rem))", },
});

export function EditorCommandPalette(props: {
  commands: () => readonly EditorPaletteCommand[];
  apiRef: (api: EditorCommandPaletteApi) => void;
  onOpenChange?: (open: boolean) => void;
  onRun?: (command: EditorPaletteCommand) => void;
}) {
  const [open, setOpen] = createSignal(false);
  const [query, setQuery] = createSignal("");
  const [selection, setSelection] = createSignal(0);
  const [revision, setRevision] = createSignal(0);
  let input!: HTMLInputElement;
  let dialog!: HTMLDivElement;
  let returnFocus: HTMLElement | undefined;

  const filtered = createMemo(() => {
    revision();
    return filterEditorCommands(props.commands(), query());
  });
  const activeIndex = createMemo(() => Math.max(0, Math.min(selection(), filtered().length - 1)));
  const activeId = createMemo(() => filtered().length ? `command-option-${activeIndex()}` : undefined);

  const close = () => {
    if (!open()) return;
    setOpen(false);
    props.onOpenChange?.(false);
    queueMicrotask(() => returnFocus?.focus({ preventScroll: true }));
    returnFocus = undefined;
  };
  const openPalette = () => {
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    setQuery("");
    setSelection(0);
    setRevision((value) => value + 1);
    setOpen(true);
    props.onOpenChange?.(true);
    queueMicrotask(() => input?.focus());
  };
  const run = (index = activeIndex()) => {
    const command = filtered()[index];
    if (!command) return;
    close();
    command.run();
    props.onRun?.(command);
  };
  const api: EditorCommandPaletteApi = {
    open: openPalette,
    close,
    refresh: () => setRevision((value) => value + 1),
    isOpen: open,
  };
  props.apiRef(api);

  createEffect(() => {
    const commands = filtered();
    if (selection() >= commands.length) setSelection(Math.max(0, commands.length - 1));
  });
  onCleanup(() => {
    if (open()) props.onOpenChange?.(false);
    returnFocus = undefined;
  });

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const count = filtered().length;
      if (!count) return;
      setSelection((value) => event.key === "ArrowDown" ? (value + 1) % count : (value - 1 + count) % count);
      queueMicrotask(() => dialog.querySelector<HTMLElement>(`#${activeId()}`)?.scrollIntoView({ block: "nearest" }));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      run();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...dialog.querySelectorAll<HTMLElement>('input,button:not([disabled]),[tabindex]:not([tabindex="-1"])')];
    if (!focusable.length) return;
    const index = document.activeElement instanceof HTMLElement ? focusable.indexOf(document.activeElement) : -1;
    const next = event.shiftKey ? (index <= 0 ? focusable.length - 1 : index - 1) : (index < 0 || index === focusable.length - 1 ? 0 : index + 1);
    focusable[next]?.focus();
    event.preventDefault();
  };

  return (
    <section
      {...stylex.attrs(styles.backdrop)}
      class="command-palette"
      id="command-palette"
      hidden={!open()}
      aria-hidden={!open()}
      onPointerDown={(event) => { if (event.target === event.currentTarget) close(); }}
      onKeyDown={onKeyDown}
    >
      <div {...stylex.attrs(styles.dialog)} class="command-dialog" role="dialog" aria-modal="true" aria-label="Command palette" ref={dialog}>
        <div class="command-input">
          <span aria-hidden="true">⌘</span>
          <input
            id="command-query"
            ref={input}
            role="combobox"
            aria-label="Search editor commands"
            aria-autocomplete="list"
            aria-controls="command-results"
            aria-expanded={open()}
            aria-activedescendant={activeId()}
            placeholder="Search actions, workspaces, entities…"
            autocomplete="off"
            value={query()}
            onInput={(event) => { setQuery(event.currentTarget.value); setSelection(0); }}
          />
          <kbd>ESC</kbd>
        </div>
        <div class="command-results" id="command-results" role="listbox" aria-label="Editor commands">
          <Show when={filtered().length} fallback={<div class="command-result" role="status"><i>×</i><span>No matching action<small>Try a workspace, entity ID, or effect name</small></span></div>}>
            <For each={filtered()}>{(command, index) => (
              <button
                type="button"
                classList={{ "command-result": true, "is-active": index() === activeIndex() }}
                id={`command-option-${index()}`}
                role="option"
                aria-selected={index() === activeIndex()}
                data-command-index={index()}
                onClick={() => run(index())}
              >
                <i aria-hidden="true">›</i><span>{command.label}<small>{command.detail}</small></span><kbd>{command.shortcut ?? "↵"}</kbd>
              </button>
            )}</For>
          </Show>
        </div>
        <div class="command-footer"><span>↑↓ Navigate</span><span>Enter Run</span><span>Ctrl P / Cmd K</span></div>
      </div>
    </section>
  );
}

export function filterEditorCommands(commands: readonly EditorPaletteCommand[], rawQuery: string) {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return [...commands];
  const normalizedQuery = query.replace(/[^a-z0-9]+/g, " ").trim();
  const characters = [...normalizedQuery.replace(/\s+/g, "")];
  return commands.map((command, index) => {
    const haystack = `${command.label} ${command.detail} ${command.id}`.toLowerCase();
    const normalizedHaystack = haystack.replace(/[^a-z0-9]+/g, " ");
    if (normalizedHaystack.includes(normalizedQuery)) return { command, rank: 0, index };
    let cursor = 0;
    for (const character of normalizedHaystack.replace(/\s+/g, "")) if (character === characters[cursor]) cursor += 1;
    return cursor === characters.length ? { command, rank: 1, index } : undefined;
  }).filter((candidate): candidate is { command: EditorPaletteCommand; rank: number; index: number } => Boolean(candidate))
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .map((candidate) => candidate.command);
}
