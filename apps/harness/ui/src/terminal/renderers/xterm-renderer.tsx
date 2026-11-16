import "@xterm/xterm/css/xterm.css";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { SerializeAddon } from "@xterm/addon-serialize";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal } from "@xterm/xterm";
import { Show, createMemo, createEffect, onCleanup, onMount } from "solid-js";
import * as stylex from "@stylexjs/stylex";
import { resolveTerminalKeyboardAction } from "../terminal-keybindings";
import { findTerminalLinks, openTerminalLink, resolveTerminalFileTarget, type TerminalLinkTarget } from "../terminal-links";
import { closeTerminalSearch, toggleTerminalSearch } from "../terminal-search-actions";
import { terminalStore } from "../terminal-store";
import { sendTerminalInput } from "../terminal-transport";
import { readTerminalTheme } from "../terminal-theme";
import { terminalStyles as styles, terminalUtilities as utilities } from "../terminal.styles";

export type XtermRendererHandle = {
  findNext: (query: string) => boolean;
  findPrevious: (query: string) => boolean;
  serialize: () => string;
};

export type XtermRendererProps = {
  sessionId: string;
  projectId?: string;
  output: string;
  outputDelta?: string;
  outputVersion?: number;
  outputResetVersion?: number;
  searchQuery: string;
  copyOnSelect: boolean;
  ctrlCMode: "auto" | "copy" | "sigint";
  sessionCwd: string;
  projectRoot: string;
  readOnly?: boolean;
  backspaceInput?: string;
  onOpenFile: (path: string, line?: number, column?: number) => void;
  onInput?: (input: string | Uint8Array) => void;
  onReady?: (handle: XtermRendererHandle) => void;
  onResize?: (cols: number, rows: number) => void;
};

function registerTerminalKeyboardHandler(terminal: Terminal, props: XtermRendererProps, active: () => boolean) {
  terminal.attachCustomKeyEventHandler((event) => {
    if (!active()) return false;
    if (event.type === "keydown") {
      if (event.key === "Escape" && terminalStore.state.searchOpen) {
        consumeTerminalShortcut(event);
        closeTerminalSearch();
        return false;
      }
      const action = resolveTerminalKeyboardAction(event);
      if (action === "toggle-search") {
        consumeTerminalShortcut(event);
        toggleTerminalSearch();
        return false;
      }
      if (event.key === "Backspace" && props.backspaceInput) {
        consumeTerminalShortcut(event);
        if (!props.readOnly) sendRendererInput(props, props.backspaceInput);
        return false;
      }
      if (action === "send-interrupt") {
        consumeTerminalShortcut(event);
        if (!props.readOnly) sendRendererInput(props, "\x03");
        return false;
      }
      if (action === "copy") {
        consumeTerminalShortcut(event);
        const selection = terminal.getSelection();
        if (selection) void navigator.clipboard?.writeText(selection);
        return false;
      }
      if (action === "select-all") {
        consumeTerminalShortcut(event);
        terminal.selectAll();
        return false;
      }
      if (action === "paste") {
        if (!navigator.clipboard?.readText) return true;
        consumeTerminalShortcut(event);
        if (!props.readOnly) {
          void navigator.clipboard.readText()
            .then((text) => { if (active() && !props.readOnly && text) sendRendererInput(props, text); })
            .catch(() => undefined);
        }
        return false;
      }
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c" && event.type === "keydown") {
      const selection = terminal.getSelection();
      if (props.ctrlCMode === "copy" || (props.ctrlCMode === "auto" && selection)) {
        consumeTerminalShortcut(event);
        if (selection) void navigator.clipboard?.writeText(selection);
        return false;
      }
    }
    return true;
  });
}

// A renderer owns an xterm instance for exactly (projectId, sessionId). Metadata,
// including cwd, stays live within that identity; identical output/version values
// on a new identity still initialize a fresh buffer and search/selection state.
export function XtermRenderer(props: XtermRendererProps) {
  const identity = createMemo(() => JSON.stringify([props.projectId, props.sessionId]));
  return <Show keyed when={identity()}>{(key) => key && renderSession()}</Show>;

  function renderSession() {
    const projectId = props.projectId;
    const sessionId = props.sessionId;
    let disposed = false;
    const active = () => !disposed && props.projectId === projectId && props.sessionId === sessionId;

    let host: HTMLDivElement | undefined;
    let terminal: Terminal | undefined;
    let fit: FitAddon | undefined;
    let search: SearchAddon | undefined;
    let serialize: SerializeAddon | undefined;
    let written = "";
    let seenOutputVersion = -1;
    let seenResetVersion = 0;
    let copyTimer: ReturnType<typeof setTimeout> | undefined;
    let resizeFrame: number | undefined;
    let lastReportedCols = 0;
    let lastReportedRows = 0;

    onMount(() => {
      const mountedHost = host;
      if (!mountedHost) throw new Error("Xterm renderer mounted without its host element");
      const reportResize = () => {
        if (!active() || !terminal) {
          return;
        }
        if (terminal.cols === lastReportedCols && terminal.rows === lastReportedRows) {
          return;
        }
        lastReportedCols = terminal.cols;
        lastReportedRows = terminal.rows;
        props.onResize?.(terminal.cols, terminal.rows);
      };
      const fitTerminal = () => {
        resizeFrame = undefined;
        if (!active()) return;
        fit?.fit();
        reportResize();
      };
      const scheduleFit = () => {
        if (active() && resizeFrame === undefined) {
          resizeFrame = window.requestAnimationFrame(fitTerminal);
        }
      };

      terminal = new Terminal({
        allowProposedApi: true,
        cursorBlink: true,
        convertEol: true,
        fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", "SFMono-Regular", Consolas, "Liberation Mono", monospace',
        fontSize: 13,
        letterSpacing: 0,
        scrollback: 10000,
        theme: readTerminalTheme(mountedHost)
      });
      fit = new FitAddon();
      search = new SearchAddon();
      serialize = new SerializeAddon();
      terminal.loadAddon(fit);
      terminal.loadAddon(search);
      terminal.loadAddon(serialize);
      terminal.loadAddon(new WebLinksAddon((event, uri) => {
        event.preventDefault();
        if (!active()) return;
        window.open(uri, "_blank", "noopener,noreferrer");
      }));
      terminal.registerLinkProvider({
        provideLinks(bufferLineNumber, callback) {
          if (!active()) { callback(undefined); return; }
          const line = terminal?.buffer.active.getLine(bufferLineNumber - 1)?.translateToString(true);
          if (!line) {
            callback(undefined);
            return;
          }
          const links = findTerminalLinks(line)
            .map((link) => {
              const target = resolveLinkTarget(link.target, props.sessionCwd, props.projectRoot);
              if (!target) {
                return undefined;
              }
              return {
                range: {
                  start: { x: link.index + 1, y: bufferLineNumber },
                  end: { x: link.index + link.length + 1, y: bufferLineNumber }
                },
                text: line.slice(link.index, link.index + link.length),
                activate(event: MouseEvent) {
                  event.preventDefault();
                  if (!active()) return;
                  const currentTarget = resolveLinkTarget(link.target, props.sessionCwd, props.projectRoot);
                  if (currentTarget) openTerminalLink(currentTarget, props.onOpenFile);
                }
              };
            })
            .filter((link): link is NonNullable<typeof link> => Boolean(link));
          callback(links.length ? links : undefined);
        }
      });
      terminal.open(mountedHost);
      const activeTerminal = terminal;
      void import("@xterm/addon-webgl").then(({ WebglAddon }) => {
        if (active()) activeTerminal.loadAddon(new WebglAddon());
      }).catch(() => {
        // Terminal input/output remains usable without optional acceleration.
      });
      fitTerminal();
      terminal.onData((data) => {
        if (!active() || props.readOnly) {
          return;
        }
        if (props.onInput) {
          props.onInput(data);
          return;
        }
        sendTerminalInput(props.sessionId, data);
      });
      registerTerminalKeyboardHandler(terminal, props, active);
      terminal.onSelectionChange(() => {
        if (!active() || !props.copyOnSelect || !terminal) {
          return;
        }
        if (copyTimer) {
          clearTimeout(copyTimer);
        }
        copyTimer = setTimeout(() => {
          if (!active()) return;
          const selection = terminal?.getSelection();
          if (selection) {
            void navigator.clipboard?.writeText(selection);
          }
        }, 180);
      });
      const resizeObserver = new ResizeObserver(scheduleFit);
      resizeObserver.observe(mountedHost);
      props.onReady?.({
        findNext: (query) => active() && Boolean(search?.findNext(query)),
        findPrevious: (query) => active() && Boolean(search?.findPrevious(query)),
        serialize: () => active() ? serialize?.serialize() ?? "" : ""
      });
      onCleanup(() => {
        disposed = true;
        if (resizeFrame !== undefined) {
          window.cancelAnimationFrame(resizeFrame);
        }
        if (copyTimer !== undefined) clearTimeout(copyTimer);
        resizeObserver.disconnect();
        terminal?.dispose();
        terminal = undefined;
        fit = undefined;
        search = undefined;
        serialize = undefined;
      });
    });

    createEffect(() => {
      if (!terminal) {
        return;
      }
      if (typeof props.outputVersion === "number") {
        const resetVersion = props.outputResetVersion ?? 0;
        if (seenOutputVersion === -1 || resetVersion !== seenResetVersion) {
          terminal.reset();
          terminal.write(props.output);
          written = props.output;
          seenOutputVersion = props.outputVersion;
          seenResetVersion = resetVersion;
          return;
        }
        if (props.outputVersion === seenOutputVersion) {
          return;
        }
        const next = props.output.startsWith(written) ? props.output.slice(written.length) : props.outputDelta ?? "";
        if (next) {
          terminal.write(next);
        }
        written = props.output;
        seenOutputVersion = props.outputVersion;
        return;
      }
      const output = props.output;
      if (output === written) {
        return;
      }
      if (!output.startsWith(written)) {
        terminal.reset();
        terminal.write(output);
        written = output;
        return;
      }
      const next = output.slice(written.length);
      written = output;
      terminal.write(next);
    });

    createEffect(() => {
      if (terminal) {
        terminal.options.theme = readTerminalTheme(host ?? document.documentElement);
      }
    });

    createEffect(() => {
      if (props.searchQuery) {
        search?.findNext(props.searchQuery);
      }
    });

    return (
      <div class={stylex.attrs(styles.xtermShell, utilities.hFull, utilities.minH0, utilities.wFull, utilities.overflowHidden).class} data-test-xterm-renderer="">
        <div ref={host} class={stylex.attrs(utilities.hFull, utilities.minH0, utilities.wFull, utilities.overflowHidden).class} />
      </div>
    );
  }
}

function sendRendererInput(
  props: {
    sessionId: string;
    onInput?: (input: string | Uint8Array) => void;
  },
  input: string | Uint8Array
) {
  if (props.onInput) {
    props.onInput(input);
    return;
  }
  sendTerminalInput(props.sessionId, input);
}

function resolveLinkTarget(target: TerminalLinkTarget, sessionCwd: string, projectRoot: string): TerminalLinkTarget | undefined {
  if (target.kind === "url") {
    return target;
  }
  return resolveTerminalFileTarget(target, sessionCwd, projectRoot);
}

function consumeTerminalShortcut(event: KeyboardEvent) {
  event.preventDefault();
  event.stopPropagation();
}
