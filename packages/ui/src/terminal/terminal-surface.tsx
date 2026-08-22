import "@xterm/xterm/css/xterm.css";
import * as stylex from "@stylexjs/stylex";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal, type ITerminalOptions } from "@xterm/xterm";
import { onCleanup, onMount } from "solid-js";
import { tokens } from "../theme/tokens.stylex";

export function TerminalSurface(props: { options?: ITerminalOptions; onData?: (data: string) => void; terminalRef?: (terminal: Terminal) => void }) {
  let host: HTMLDivElement | undefined;
  onMount(() => {
    if (!host) return;
    const terminal = new Terminal({ convertEol: true, cursorBlink: true, fontFamily: '"Cascadia Code", Consolas, monospace', fontSize: 13, theme: { background: "#071014", foreground: "#e9f5f4", cursor: "#30d6c8" }, ...props.options });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(host);
    fit.fit();
    props.terminalRef?.(terminal);
    const data = props.onData ? terminal.onData(props.onData) : undefined;
    const observer = new ResizeObserver(() => fit.fit());
    observer.observe(host);
    onCleanup(() => { observer.disconnect(); data?.dispose(); terminal.dispose(); });
  });
  return <div ref={host} {...stylex.attrs(styles.root)} data-test-terminal-surface="" />;
}

const styles = stylex.create({
  root: { padding: "0.4rem", overflow: "hidden", backgroundColor: tokens.background, height: "100%", minHeight: "8rem", width: "100%", }
});

