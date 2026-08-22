import type { JSX } from "solid-js";
import * as stylex from "@stylexjs/stylex";
import { cn } from "../../lib/utils";
import { submitOnEnter } from "../../textarea-submit";
import { Textarea } from "./textarea";

type ChatComposerProps = {
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

export function ChatComposer(props: ChatComposerProps) {
  return (
    <div data-test-chat-composer="" data-tour-id={props.dataTourId} class={cn(stylex.attrs(styles.root).class, props.class)}>
      <Textarea
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
        class={cn(stylex.attrs(styles.textarea).class, props.textareaClass)}
        onKeyDown={(event) => {
          if (typeof props.onKeyDown === "function") {
            props.onKeyDown(event);
            if (event.defaultPrevented) {
              return;
            }
          }
          submitOnEnter(props.onSubmit)(event);
        }}
        onKeyUp={props.onKeyUp}
        onInput={(event) => props.onInput(event.currentTarget.value)}
        onClick={props.onClick}
        onSelect={props.onSelect}
        onFocus={props.onFocus}
      />
      <div {...stylex.attrs(styles.actions)}>{props.rightActions}</div>
      <div {...stylex.attrs(styles.controls)}>{props.leftControls}</div>
    </div>
  );
}

const styles = stylex.create({
  root: { position: "relative" },
  textarea: { borderRadius: "0.75rem", paddingBottom: "3rem", paddingRight: "3.5rem", resize: "none", width: "100%" },
  actions: { alignItems: "center", bottom: "0.5rem", display: "flex", gap: "0.375rem", pointerEvents: "none", position: "absolute", right: "0.5rem" },
  controls: { bottom: "0.5rem", left: "0.5rem", position: "absolute" }
});
