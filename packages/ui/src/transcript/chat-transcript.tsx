import * as stylex from "@stylexjs/stylex";
import { For } from "solid-js";
import { SolidMarkdown } from "solid-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { tokens } from "../theme/tokens.stylex";

export type TranscriptMessage = {
  id: string;
  role: "system" | "user" | "assistant";
  content: string;
  pending?: boolean;
};

export function ChatTranscript(props: { messages: readonly TranscriptMessage[]; emptyMessage?: string }) {
  return (
    <div {...stylex.attrs(styles.root)} data-test-chat-transcript="" aria-live="polite">
      <For each={props.messages} fallback={<p {...stylex.attrs(styles.empty)}>{props.emptyMessage ?? "No messages yet."}</p>}>
        {(message) => (
          <article {...stylex.attrs(styles.message, styles[message.role], message.pending && styles.pending)} data-role={message.role}>
            <header {...stylex.attrs(styles.header)}>{message.role}</header>
            <div {...stylex.attrs(styles.markdown)}>
              <SolidMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} rehypePlugins={[rehypeSanitize]} skipHtml>{message.content}</SolidMarkdown>
            </div>
          </article>
        )}
      </For>
    </div>
  );
}

const styles = stylex.create({
  root: { padding: "0.25rem", gap: "0.65rem", overflow: "auto", display: "flex", flexDirection: "column", minHeight: 0, },
  empty: { margin: "auto", padding: "2rem", color: tokens.muted, fontSize: "0.8rem", textAlign: "center", },
  message: { padding: "0.7rem", borderColor: tokens.border, borderRadius: tokens.radius, borderStyle: "solid", borderWidth: "1px", color: tokens.foreground, maxWidth: "92%", },
  assistant: { alignSelf: "flex-start", backgroundColor: tokens.panel },
  system: { alignSelf: "stretch", backgroundColor: "transparent", color: tokens.muted, maxWidth: "100%" },
  user: { alignSelf: "flex-end", backgroundColor: tokens.panelRaised },
  pending: { opacity: 0.72 },
  header: { color: tokens.muted, fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" },
  markdown: { fontSize: "0.78rem", lineHeight: 1.55, overflowWrap: "anywhere" }
});

