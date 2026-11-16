import * as stylex from "@stylexjs/stylex";
import { Show, type JSX } from "solid-js";
import { Button } from "../primitives/button";
import { Dialog } from "../primitives/dialog";
import { SelectControl } from "../primitives/selection/select-control";
import { tokens } from "../theme/tokens.stylex";
import { typography } from "../theme/typography";

const styles = stylex.create({
  stack: { gap: tokens.space3, display: "grid", minWidth: 0, },
  actions: { gap: tokens.space2, alignItems: "center", display: "flex", flexWrap: "wrap", minWidth: 0, },
  error: { margin: 0, color: tokens.danger, overflowWrap: "anywhere" },
  copy: { margin: 0, color: tokens.muted, overflowWrap: "anywhere" },
  page: { padding: tokens.space4, gap: tokens.space4, marginInline: "auto", alignContent: "start", boxSizing: "border-box", display: "grid", flexGrow: 1, maxWidth: 1120, minHeight: 0, minWidth: 0, overflowY: "auto", width: "100%", },
});

export function TaskReviewDialog(props: {
  open: boolean;
  presentation?: "dialog" | "page";
  title: string;
  description: string;
  onClose: () => void;
  selectedId: string;
  runs: readonly { value: string; label: string; description?: string }[];
  allowNew?: boolean;
  onSelect: (id: string) => void;
  onRefresh: () => void;
  busy?: boolean;
  error?: string;
  status?: string;
  children: JSX.Element;
}) {
  const content = () => <div {...stylex.attrs(styles.stack)} data-test-task-review-dialog="">
      <div {...stylex.attrs(styles.actions)}>
        <SelectControl ariaLabel="Task run" value={props.selectedId} options={[...(props.allowNew === false ? [] : [{ value: "", label: "New run" }]), ...props.runs]} onChange={props.onSelect} disabled={props.busy} />
        <Button variant="secondary" size="small" tooltip="Refresh provider status and preserved runs" disabled={props.busy} onClick={props.onRefresh}>Refresh</Button>
      </div>
      <Show when={props.status}><p role="status" {...stylex.attrs(styles.copy, typography.body)}>{props.status}</p></Show>
      <Show when={props.error}><p role="alert" {...stylex.attrs(styles.error, typography.body)}>{props.error}</p></Show>
      {props.children}
    </div>;
  return <Show when={props.presentation === "page"} fallback={<Dialog open={props.open} title={props.title} description={props.description} onClose={props.onClose}>{content()}</Dialog>}>
    <main {...stylex.attrs(styles.page, typography.body)} aria-label={props.title}><Show when={!props.selectedId}><h1 {...stylex.attrs(typography.section)}>{props.title}</h1><p {...stylex.attrs(styles.copy, typography.body)}>{props.description}</p></Show>{content()}</main>
  </Show>;
}
