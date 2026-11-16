import { createMemo, onCleanup } from "solid-js";
import * as stylex from "@stylexjs/stylex";
import { VirtualList } from "../../components/primitives/virtual-list";
import { resolveTerminalKeyboardAction } from "../terminal-keybindings";
import { closeTerminalSearch, toggleTerminalSearch } from "../terminal-search-actions";
import { terminalStore } from "../terminal-store";
import { terminalStyles as styles, terminalUtilities as utilities } from "../terminal.styles";

export function SolidTerminalRendererPrototype(props: {
  output: string;
  readOnly?: boolean;
  backspaceInput?: string;
  onInput?: (input: string | Uint8Array) => void;
}) {
  let disposed = false;
  onCleanup(() => { disposed = true; });
  const rows = createMemo(() => props.output.split(/\r?\n/).map((line, index) => ({ id: `${index}`, line })));
  const sendInput = (input: string) => {
    if (disposed || props.readOnly) {
      return;
    }
    props.onInput?.(input);
  };
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape" && terminalStore.state.searchOpen) {
      consumeTerminalShortcut(event);
      closeTerminalSearch();
      return;
    }
    const action = resolveTerminalKeyboardAction(event);
    if (action === "toggle-search") {
      consumeTerminalShortcut(event);
      toggleTerminalSearch();
      return;
    }
    if (action === "send-interrupt") {
      consumeTerminalShortcut(event);
      sendInput("\x03");
      return;
    }
    if (action === "paste") {
      consumeTerminalShortcut(event);
      if (!props.readOnly) {
        void navigator.clipboard?.readText?.().then((text) => {
          if (text) sendInput(text);
        }).catch(() => undefined);
      }
      return;
    }
    if (action === "copy" || action === "select-all") {
      return;
    }
    const input = resolveSolidTerminalInput(event, props.backspaceInput);
    if (!input) {
      return;
    }
    consumeTerminalShortcut(event);
    sendInput(input);
  };

  return (
    <div
      tabIndex={0}
      role="textbox"
      aria-label="Terminal output"
      aria-readonly={props.readOnly ? "true" : "false"}
      data-test-solid-terminal-input=""
      class={stylex.attrs(utilities.hFull, utilities.minH0, utilities.focusOutlineNone).class}
      onKeyDown={handleKeyDown}
      onMouseDown={(event) => event.currentTarget.focus()}
    >
      <VirtualList
        items={rows()}
        estimateSize={20}
        pagination={{ kind: "all" }}
        getKey={(row) => row.id}
        class={stylex.attrs(styles.surface, utilities.hFull, utilities.px3, utilities.py2).class}
        contentClass={stylex.attrs(utilities.fontMono, utilities.trackingNormal).class}
        dataTest="solid-terminal-prototype"
      >
        {(row) => <div class={stylex.attrs(styles.solidRow, utilities.whitespacePre, utilities.text076, utilities.leading5, styles.foreground).class}>{row.line || " "}</div>}
      </VirtualList>
    </div>
  );
}

function resolveSolidTerminalInput(event: KeyboardEvent, backspaceInput = "\x7f") {
  if (event.ctrlKey || event.metaKey || event.altKey) {
    return undefined;
  }
  if (event.key.length === 1) {
    return event.key;
  }
  switch (event.key) {
    case "Backspace":
      return backspaceInput;
    case "Enter":
      return "\r";
    case "Tab":
      return "\t";
    case "Escape":
      return "\x1b";
    case "ArrowUp":
      return "\x1b[A";
    case "ArrowDown":
      return "\x1b[B";
    case "ArrowRight":
      return "\x1b[C";
    case "ArrowLeft":
      return "\x1b[D";
    case "Home":
      return "\x1b[H";
    case "End":
      return "\x1b[F";
    case "Delete":
      return "\x1b[3~";
    case "PageUp":
      return "\x1b[5~";
    case "PageDown":
      return "\x1b[6~";
    default:
      return undefined;
  }
}

function consumeTerminalShortcut(event: KeyboardEvent) {
  event.preventDefault();
  event.stopPropagation();
}
