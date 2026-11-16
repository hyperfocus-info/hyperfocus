import type { BackgroundJob } from "@hyperfocus/ai-core/protocol";
import { ActionMenu, Button, MenuItem, typography } from "@hyperfocus/ui";
import { tokens } from "@hyperfocus/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { CheckSquare2, MoreHorizontal, Square } from "lucide-solid";
import { Show, type JSX } from "solid-js";

const styles = stylex.create({
  row: { paddingBlock: tokens.space3, borderBottomColor: tokens.border, borderBottomStyle: "solid", borderBottomWidth: tokens.borderWidth, minWidth: 0 },
  selected: { backgroundColor: tokens.selection, boxShadow: `inset 3px 0 0 ${tokens.accent}` },
  select: { padding: tokens.space2, borderWidth: 0, gap: tokens.space2, outline: { default: "none", ":focus-visible": `2px solid ${tokens.focus}` }, backgroundColor: { default: "transparent", ":hover": tokens.panelRaised }, color: tokens.foreground, cursor: "pointer", display: "grid", outlineOffset: "-2px", textAlign: "start", minHeight: tokens.controlTouch, minWidth: 0, width: "100%", },
  heading: { gap: tokens.space2, alignItems: "start", display: "flex", flexWrap: "wrap", justifyContent: "space-between", minWidth: 0, },
  name: { flex: "1", overflowWrap: "anywhere", minWidth: 0, },
  status: { color: tokens.muted, flexShrink: 0 },
  enabled: { color: tokens.success },
  meta: { color: tokens.muted, overflowWrap: "anywhere", minWidth: 0 },
  warning: { color: tokens.warning, overflowWrap: "anywhere" },
  bottom: { gap: tokens.space2, paddingInline: tokens.space2, alignItems: "center", display: "flex", flexWrap: "wrap", justifyContent: "space-between", },
  controls: { gap: tokens.space1, alignItems: "center", display: "flex", flexShrink: 0, },
  icon: { height: tokens.iconSmall, width: tokens.iconSmall, },
});

export function JobRosterRow(props: {
  job: BackgroundJob;
  selected: boolean;
  bulkSelected: boolean;
  projectName: string;
  nextRun: string;
  warning?: string;
  runDisabledReason?: string;
  onSelect: JSX.EventHandler<HTMLButtonElement, MouseEvent>;
  onPointerDown: JSX.EventHandler<HTMLElement, PointerEvent>;
  onClearPointer: () => void;
  onContextMenu: JSX.EventHandler<HTMLElement, MouseEvent>;
  onToggleBulk: () => void;
  onRun: () => void;
  onPauseResume: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onOpenAssistant: () => void;
}) {
  return <article {...stylex.attrs(styles.row, props.selected && styles.selected)} data-test-job-id={props.job.id}
    onPointerDown={props.onPointerDown} onPointerUp={props.onClearPointer} onPointerCancel={props.onClearPointer} onPointerLeave={props.onClearPointer} onContextMenu={props.onContextMenu}>
    <button type="button" {...stylex.attrs(styles.select)} aria-label={`Select ${props.job.name}`} aria-current={props.selected ? "true" : undefined} onClick={props.onSelect}>
      <span {...stylex.attrs(styles.heading)}><strong {...stylex.attrs(typography.emphasis, styles.name)}>{props.job.name}</strong><span {...stylex.attrs(typography.caption, styles.status, props.job.status === "enabled" && styles.enabled)}>{props.job.status}</span></span>
      <span {...stylex.attrs(typography.metadata, styles.meta)}>{props.projectName}</span>
      <span {...stylex.attrs(typography.caption, styles.meta)}>Next: {props.nextRun}</span>
      <Show when={props.warning}><span {...stylex.attrs(typography.caption, styles.warning)}>{props.warning}</span></Show>
    </button>
    <div {...stylex.attrs(styles.bottom)}>
      <span {...stylex.attrs(typography.caption, styles.meta)}>{props.job.kind === "shell" ? "Shell task" : "AI routine"}</span>
      <div {...stylex.attrs(styles.controls)} data-selection-ignore="">
        <Button size="icon" variant="ghost" aria-pressed={props.bulkSelected} aria-label={props.bulkSelected ? `Remove ${props.job.name} from bulk selection` : `Add ${props.job.name} to bulk selection`} tooltip={props.bulkSelected ? "Remove from bulk selection" : "Add to bulk selection"} onClick={props.onToggleBulk}>
          <Show when={props.bulkSelected} fallback={<Square {...stylex.attrs(styles.icon)} />}><CheckSquare2 {...stylex.attrs(styles.icon)} /></Show>
        </Button>
        <ActionMenu ariaLabel={`Actions for ${props.job.name}`} trigger={state =>
          <Button size="icon" variant="ghost" tooltip={`Actions for ${props.job.name}`} aria-label={`Actions for ${props.job.name}`} aria-haspopup="menu" aria-expanded={state.open()} aria-controls={state.menuId} onClick={state.toggle}><MoreHorizontal {...stylex.attrs(styles.icon)} /></Button>
        }>
          <MenuItem onSelect={props.onRun} disabled={!!props.runDisabledReason} aria-description={props.runDisabledReason}>Run now</MenuItem>
          <MenuItem onSelect={props.onPauseResume}>{props.job.status === "enabled" ? "Pause" : "Resume"}</MenuItem>
          <MenuItem onSelect={props.onEdit}>Edit</MenuItem>
          <Show when={props.job.assistantId}><MenuItem onSelect={props.onOpenAssistant}>Open assistant</MenuItem></Show>
          <MenuItem onSelect={props.onDelete} tone="danger">Delete</MenuItem>
        </ActionMenu>
      </div>
    </div>
  </article>;
}
