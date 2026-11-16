/** @jsxImportSource solid-js */
import { createSignal, Show } from "solid-js";
import * as stylex from "@stylexjs/stylex";
import { Button, Input, typography } from "@hyperfocus/ui";
import { providerStyles as styles } from "./providers.styles";

export function ProviderCredential(props: {
  provider: string;
  label: string;
  value: string;
  placeholder: string;
  stored: boolean;
  available?: boolean;
  test: { status: "idle" | "pending" | "ready" | "failed"; message?: string };
  onInput: (value: string) => void;
  onTest: () => void;
  onSave: () => void;
}) {
  const [visible, setVisible] = createSignal(false);
  const hasDraft = () => props.value.trim().length > 0;
  const inputId = `provider-${props.provider}-key`;
  const statusId = `${inputId}-status`;
  const resultId = `${inputId}-result`;
  return (
    <div data-test-provider-credential={props.provider} {...stylex.attrs(styles.credential)}>
      <div {...stylex.attrs(styles.heading)}>
        <label for={inputId} {...stylex.attrs(typography.emphasis, styles.label)}>{props.label}</label>
        <span id={statusId} {...stylex.attrs(typography.caption, styles.status, hasDraft() && styles.pending)}>
          {hasDraft() ? (props.stored ? "Replacement not saved" : "Key not saved") : props.stored ? "Key saved on this machine" : props.available ? "Key available to runtime" : "No key saved"}
        </span>
      </div>
      <div {...stylex.attrs(styles.controls)}>
        <div {...stylex.attrs(styles.inputGroup)}>
          <Input id={inputId} type={visible() ? "text" : "password"} value={props.value} placeholder={props.placeholder}
            autocomplete="off" spellcheck={false} aria-describedby={`${statusId} ${resultId}`}
            onInput={(event) => props.onInput(event.currentTarget.value)} />
          <Button variant="ghost" aria-label={`${visible() ? "Hide" : "Show"} ${props.label}`} aria-pressed={visible()}
            justificationForNoTooltip="The text labels the reveal action; its accessible name identifies the provider."
            onClick={() => setVisible(!visible())}>{visible() ? "Hide" : "Show"}</Button>
        </div>
        <div {...stylex.attrs(styles.actions)}>
          <Button variant="secondary" disabled={props.test.status === "pending" || (!hasDraft() && !props.stored && !props.available)}
            aria-label={`Test ${props.label}`} aria-busy={props.test.status === "pending"}
            justificationForNoTooltip="Section guidance explains that Test checks access without saving."
            onClick={props.onTest}>{props.test.status === "pending" ? "Testing..." : props.test.status === "failed" ? "Retry test" : "Test"}</Button>
          <Button variant={hasDraft() ? "primary" : "secondary"} disabled={!hasDraft() || props.test.status === "pending"} aria-label={`Save ${props.label}`}
            justificationForNoTooltip="Save key is an explicit action for the labeled provider."
            onClick={props.onSave}>Save key</Button>
        </div>
      </div>
      <div id={resultId} role="status" aria-live="polite" data-provider-test-message={props.provider}
        {...stylex.attrs(typography.caption, styles.status, props.test.status === "ready" && styles.success, props.test.status === "failed" && styles.error)}>
        <Show when={props.test.status !== "idle"}>
          <span>{props.test.status === "pending" ? "Checking model access..." : props.test.message}</span>
          <Show when={props.test.status === "failed"}> Check the key and connection, then retry.</Show>
          <Show when={props.test.status === "ready" && hasDraft()}> Test passed. Save key to keep this draft.</Show>
        </Show>
      </div>
    </div>
  );
}
