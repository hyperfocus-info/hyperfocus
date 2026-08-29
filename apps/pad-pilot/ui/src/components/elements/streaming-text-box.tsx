import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount, splitProps, type JSX } from "solid-js";
import { ArrowDownToLine, Copy } from "lucide-solid";
import { Button } from "./button";
import styles from "./streaming-text-box.stylex";

export type StreamingTextBoxProps = JSX.HTMLAttributes<HTMLDivElement> & {
  autoScroll?: boolean;
  copyButton?: boolean;
  lines: readonly string[];
  scrollButton?: boolean;
};

function isScrolledToBottom(element: HTMLElement) {
  return element.scrollHeight - element.scrollTop - element.clientHeight <= 2;
}

export function StreamingTextBox(props: StreamingTextBoxProps) {
  const [local, others] = splitProps(props, ["autoScroll", "class", "copyButton", "lines", "scrollButton"]);
  const [atBottom, setAtBottom] = createSignal(true);
  const text = createMemo(() => local.lines.join("\n"));
  let pinnedToBottom = true;
  let viewport: HTMLDivElement | undefined;

  const updateBottomState = () => {
    if (!viewport) {
      return;
    }
    pinnedToBottom = isScrolledToBottom(viewport);
    setAtBottom(pinnedToBottom);
  };

  const scrollToBottom = () => {
    if (!viewport) {
      return;
    }
    viewport.scrollTop = viewport.scrollHeight;
    updateBottomState();
  };

  const copyText = () => {
    navigator.clipboard?.writeText(text()).catch(() => {});
  };

  onMount(() => {
    scrollToBottom();
  });

  createEffect(() => {
    const lines = local.lines;
    if (!local.autoScroll || !pinnedToBottom) {
      return lines.length;
    }
    scrollToBottom();
    return lines.length;
  });

  createEffect(() => {
    const element = viewport;
    if (!element) {
      return;
    }
    element.addEventListener("scroll", updateBottomState, { passive: true });
    updateBottomState();
    onCleanup(() => element.removeEventListener("scroll", updateBottomState));
  });

  return (
    <div {...others} class={`${styles.root} ${local.class ?? ""}`.trim()}>
      <div ref={viewport} class={styles.viewport} aria-live="polite">
        <For each={local.lines}>
          {(line) => <span class={styles.line}>{line}</span>}
        </For>
      </div>
      <div class={styles.tools}>
        <Show when={local.copyButton}>
          <Button
            class={styles["tool-button"]}
            icon={Copy}
            onClick={copyText}
            size="sm"
            tooltip="Copy terminal output"
            variant="ghost"
          />
        </Show>
        <Show when={(local.scrollButton ?? true) && !atBottom()}>
          <Button
            class={styles["tool-button"]}
            icon={ArrowDownToLine}
            onClick={scrollToBottom}
            size="sm"
            tooltip="Scroll to bottom"
            variant="ghost"
          />
        </Show>
      </div>
    </div>
  );
}
