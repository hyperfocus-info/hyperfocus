import type { JSX } from "solid-js";
import * as stylex from "@stylexjs/stylex";
import { tokens } from "../theme/tokens.stylex";

export type ProjectChatComposerProps = {
  ariaLabel?: string;
  value: string;
  placeholder: string;
  rows?: number | string;
  disabled?: boolean;
  disabledReason?: string;
  onInput: (value: string) => void;
  onSubmit: () => void;
  onKeyDown?: JSX.EventHandlerUnion<HTMLTextAreaElement, KeyboardEvent>;
  onKeyUp?: JSX.EventHandlerUnion<HTMLTextAreaElement, KeyboardEvent>;
  onClick?: JSX.EventHandlerUnion<HTMLTextAreaElement, MouseEvent>;
  onSelect?: JSX.EventHandlerUnion<HTMLTextAreaElement, Event>;
  onFocus?: JSX.EventHandlerUnion<HTMLTextAreaElement, FocusEvent>;
  leftControls?: JSX.Element;
  rightActions?: JSX.Element;
  textareaRef?: (element: HTMLTextAreaElement) => void;
  class?: string;
  textareaClass?: string;
  dataTourId?: string;
  ariaControls?: string;
  ariaExpanded?: boolean;
  ariaActiveDescendant?: string;
};

const styles = stylex.create({
  root: { borderColor: tokens.border, borderRadius: "0.75rem", borderStyle: "solid", borderWidth: 1, backgroundColor: tokens.panel, position: "relative", minWidth: 0, },
  textarea: { borderRadius: "0.75rem", borderWidth: 0, outline: 'none', paddingBlock: '0.625rem', paddingInline: '0.75rem', backgroundColor: tokens.panel, boxShadow: { default: '0 1px 2px rgb(0 0 0 / 0.05)', ':focus-visible': `0 0 0 2px ${tokens.focus}` }, boxSizing: 'border-box', color: tokens.foreground, display: 'flex', fontFamily: tokens.fontUi, fontSize: tokens.fontControl, fontWeight: 400, lineHeight: 1.5, opacity: { default: 1, ':disabled': 0.5 }, resize: "none", maxWidth: '100%', minHeight: '4.2rem', minWidth: 0, width: "100%", '::placeholder': { color: tokens.muted, opacity: 1 }, },
  footer: { padding: "0.5rem", gap: "0.5rem", alignItems: "center", display: "flex", flexWrap: "wrap", minWidth: 0, },
  actions: { gap: "0.375rem", alignItems: "center", display: "flex", flexShrink: 0, marginLeft: "auto" },
  controls: { maxWidth: "100%", minWidth: 0, }
});

export function ProjectChatComposer(props: ProjectChatComposerProps) {
  return (
    <div data-test-chat-composer="" data-tour-id={props.dataTourId} class={`${stylex.attrs(styles.root).class} ${props.class ?? ""}`}>
      <textarea aria-label={props.ariaLabel ?? "Message"} data-test-textarea=""
        ref={props.textareaRef}
        rows={props.rows ?? 2}
        value={props.value}
        placeholder={props.placeholder}
        disabled={props.disabled}
        aria-description={props.disabled && props.disabledReason ? props.disabledReason : undefined}
        aria-autocomplete="list"
        attr:aria-controls={props.ariaControls}
        attr:aria-expanded={props.ariaExpanded === undefined ? undefined : props.ariaExpanded ? "true" : "false"}
        attr:aria-activedescendant={props.ariaActiveDescendant}
        class={`${stylex.attrs(styles.textarea).class} ${props.textareaClass ?? ""}`}
        onKeyDown={(event) => {
          if (props.disabled) return;
          const handler = props.onKeyDown;
          if (typeof handler === "function") handler(event);
          else if (handler) handler[0](handler[1], event);
          if (event.defaultPrevented) return;
          if (event.key === "Enter" && !event.shiftKey && !event.isComposing) { event.preventDefault(); props.onSubmit(); }
        }}
        onKeyUp={props.onKeyUp}
        onInput={(event) => props.onInput(event.currentTarget.value)}
        onClick={props.onClick}
        onSelect={props.onSelect}
        onFocus={props.onFocus}
      />
      <div {...stylex.attrs(styles.footer)}>
        <div {...stylex.attrs(styles.controls)}>{props.leftControls}</div>
        <div {...stylex.attrs(styles.actions)}>{props.rightActions}</div>
      </div>
    </div>
  );
}
