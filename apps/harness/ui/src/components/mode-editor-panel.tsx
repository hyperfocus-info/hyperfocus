import { For, createEffect, createSignal } from "solid-js";
import * as stylex from "@stylexjs/stylex";
import { ClipboardList, FolderOpen, Play, RefreshCcw } from "lucide-solid";
import type { ModeDefinition } from "@hyperfocus/ai-core/protocol";
import { ActionButton } from "./action-button";
import { DropdownControl, type DropdownOption } from "./primitives/dropdown";
import { Input } from "./primitives/input";
import { Textarea } from "./primitives/textarea";
import { miscellaneousSurfaceStyles as styles } from "./miscellaneous-surfaces.styles";

type ModeEditorPanelProps = {
  title: string;
  scope: "workspace" | "project";
  modes: ModeDefinition[];
  onSave: (mode: Omit<ModeDefinition, "scope"> & { scope: "workspace" | "project" }) => void;
  onDelete: (modeId: string) => void;
};

type ModeDraft = Pick<
  ModeDefinition,
  | "id"
  | "label"
  | "description"
  | "plannerPrompt"
  | "executionPrompt"
  | "toolPolicy"
  | "executionAccess"
  | "planExecutionModeDefault"
  | "subagentWorktreeStrategyDefault"
  | "correctnessIterationModeDefault"
>;

const EMPTY_MODE_DRAFT: ModeDraft = {
  id: "",
  label: "",
  description: "",
  plannerPrompt: "",
  executionPrompt: "",
  toolPolicy: "full-access",
  executionAccess: "workspace-write",
  planExecutionModeDefault: "countdown",
  subagentWorktreeStrategyDefault: "same-worktree",
  correctnessIterationModeDefault: "ask-before-iterate"
};

const modePillClass = stylex.attrs(styles.modePill).class ?? "";
const selectedModePillClass = stylex.attrs(styles.modePillSelected).class ?? "";
const idleModePillClass = stylex.attrs(styles.modePillIdle).class ?? "";

function modeDraftFromDefinition(mode: ModeDefinition): ModeDraft {
  return {
    id: mode.id,
    label: mode.label,
    description: mode.description,
    plannerPrompt: mode.plannerPrompt,
    executionPrompt: mode.executionPrompt,
    toolPolicy: mode.toolPolicy,
    executionAccess: mode.executionAccess,
    planExecutionModeDefault: mode.planExecutionModeDefault ?? "countdown",
    subagentWorktreeStrategyDefault: mode.subagentWorktreeStrategyDefault ?? "same-worktree",
    correctnessIterationModeDefault: mode.correctnessIterationModeDefault ?? "ask-before-iterate"
  };
}

function toolPolicyOptions(): DropdownOption<ModeDraft["toolPolicy"]>[] {
  return [
    { value: "full-access", label: "Full access", description: "Allow full implementation and broader tool use." },
    { value: "read-heavy", label: "Read heavy", description: "Bias toward reading, analysis, and lighter changes." },
    { value: "review-only", label: "Review only", description: "Focus on findings and review instead of edits." }
  ];
}

function executionAccessOptions(): DropdownOption<ModeDraft["executionAccess"]>[] {
  return [
    { value: "workspace-write", label: "Workspace write", description: "Mode may edit files in current workspace." },
    { value: "read-only", label: "Read only", description: "Mode may inspect but should avoid editing files." }
  ];
}

function planGateOptions(): DropdownOption<NonNullable<ModeDraft["planExecutionModeDefault"]>>[] {
  return [
    { value: "countdown", label: "Countdown", description: "Pause briefly before execution begins." },
    { value: "approve", label: "Approve first", description: "Require explicit approval before execution begins." },
    { value: "immediate", label: "Immediate", description: "Start execution immediately after planning." }
  ];
}

function correctnessOptions(): DropdownOption<NonNullable<ModeDraft["correctnessIterationModeDefault"]>>[] {
  return [
    { value: "ask-before-iterate", label: "Ask before iterate", description: "Pause before any automatic follow-up pass." },
    { value: "auto-once", label: "Auto once", description: "Run one automatic correctness follow-up pass." },
    { value: "auto-until-clean", label: "Auto until clean", description: "Keep iterating until correctness issues clear." }
  ];
}

export function ModeEditorPanel(props: ModeEditorPanelProps) {
  const [selectedModeId, setSelectedModeId] = createSignal<string>();
  const [draft, setDraft] = createSignal<ModeDraft>(EMPTY_MODE_DRAFT);

  createEffect(() => {
    const modes = props.modes;
    const selected = modes.find((mode) => mode.id === selectedModeId()) ?? modes[0];
    if (!selected) {
      setDraft(EMPTY_MODE_DRAFT);
      setSelectedModeId(undefined);
      return;
    }

    setSelectedModeId(selected.id);
    setDraft(modeDraftFromDefinition(selected));
  });

  const updateDraft = <K extends keyof ModeDraft>(key: K, value: ModeDraft[K]) => {
    setDraft({
      ...draft(),
      [key]: value
    });
  };

  const customModes = () => props.modes.filter((mode): mode is ModeDefinition & { scope: "workspace" | "project" } => mode.scope === props.scope);
  const handleNewMode = () => {
    const slugBase = props.scope === "workspace" ? "workspace-mode" : "project-mode";
    const nextId = `${slugBase}-${Date.now().toString(36)}`;
    setSelectedModeId(undefined);
    setDraft({
      ...EMPTY_MODE_DRAFT,
      id: nextId
    });
  };

  const handleSave = () => {
    const next = draft();
    if (!next.id.trim() || !next.label.trim() || !next.description.trim() || !next.plannerPrompt.trim() || !next.executionPrompt.trim()) {
      return;
    }

    props.onSave({
      ...next,
      id: next.id.trim(),
      label: next.label.trim(),
      description: next.description.trim(),
      plannerPrompt: next.plannerPrompt.trim(),
      executionPrompt: next.executionPrompt.trim(),
      scope: props.scope,
      updatedAt: new Date().toISOString()
    });
    setSelectedModeId(next.id.trim());
  };

  const handleDelete = () => {
    const modeId = selectedModeId() ?? draft().id.trim();
    if (!modeId) {
      return;
    }

    props.onDelete(modeId);
    setSelectedModeId(undefined);
    setDraft(EMPTY_MODE_DRAFT);
  };

  return (
    <section {...stylex.attrs(styles.modePanel)}>
      <div {...stylex.attrs(styles.modeHeader)}>
        <div>
          <div {...stylex.attrs(styles.sectionEyebrow)}>{props.title}</div>
          <div {...stylex.attrs(styles.modeDescription)}>
            Custom modes override built-ins inside {props.scope} scope.
          </div>
        </div>
        <div {...stylex.attrs(styles.inlineActions)}>
          <ActionButton tooltip={`Create new ${props.scope} mode`} variant="secondary" size="sm" onClick={handleNewMode}>
            New mode
          </ActionButton>
          <ActionButton
            tooltip={`Delete selected ${props.scope} mode`}
            disabled={!selectedModeId()}
            disabledReason={`Select ${props.scope} mode first`}
            variant="secondary"
            size="sm"
            onClick={handleDelete}
          >
            Delete
          </ActionButton>
          <ActionButton tooltip={`Save ${props.scope} mode`} size="sm" onClick={handleSave}>
            Save mode
          </ActionButton>
        </div>
      </div>

      <div {...stylex.attrs(styles.modePills)}>
        <For each={customModes()}>
          {(mode) => (
            <button
              class={`${modePillClass} ${selectedModeId() === mode.id ? selectedModePillClass : idleModePillClass}`}
              type="button"
              onClick={() => setSelectedModeId(mode.id)}
            >
              {mode.label}
            </button>
          )}
        </For>
      </div>

      <div {...stylex.attrs(styles.fieldGridTwo)}>
        <label {...stylex.attrs(styles.field)}>
          <span {...stylex.attrs(styles.sectionEyebrow)}>Mode id</span>
          <Input value={draft().id} onInput={(event) => updateDraft("id", event.currentTarget.value)} />
        </label>
        <label {...stylex.attrs(styles.field)}>
          <span {...stylex.attrs(styles.sectionEyebrow)}>Label</span>
          <Input value={draft().label} onInput={(event) => updateDraft("label", event.currentTarget.value)} />
        </label>
      </div>

      <label {...stylex.attrs(styles.blockField)}>
        <span {...stylex.attrs(styles.sectionEyebrow)}>Description</span>
        <Input value={draft().description} onInput={(event) => updateDraft("description", event.currentTarget.value)} />
      </label>

      <div {...stylex.attrs(styles.fieldGridTwoCompact)}>
        <label {...stylex.attrs(styles.field)}>
          <span {...stylex.attrs(styles.sectionEyebrow)}>Planner prompt</span>
          <Textarea rows="5" value={draft().plannerPrompt} onInput={(event) => updateDraft("plannerPrompt", event.currentTarget.value)} />
        </label>
        <label {...stylex.attrs(styles.field)}>
          <span {...stylex.attrs(styles.sectionEyebrow)}>Execution prompt</span>
          <Textarea rows="5" value={draft().executionPrompt} onInput={(event) => updateDraft("executionPrompt", event.currentTarget.value)} />
        </label>
      </div>

      <div {...stylex.attrs(styles.fieldGridFour)}>
        <label {...stylex.attrs(styles.field)}>
          <span {...stylex.attrs(styles.sectionEyebrow)}>Tool policy</span>
          <DropdownControl
            kind="select"
            ariaLabel="Select tool policy"
            icon={<ClipboardList {...stylex.attrs(styles.iconSm)} />}
            size="md"
            class={stylex.attrs(styles.fullWidth).class}
            value={draft().toolPolicy}
            options={toolPolicyOptions()}
            onChange={(value) => updateDraft("toolPolicy", value)}
          />
        </label>
        <label {...stylex.attrs(styles.field)}>
          <span {...stylex.attrs(styles.sectionEyebrow)}>Execution access</span>
          <DropdownControl
            kind="select"
            ariaLabel="Select execution access"
            icon={<FolderOpen {...stylex.attrs(styles.iconSm)} />}
            size="md"
            class={stylex.attrs(styles.fullWidth).class}
            value={draft().executionAccess}
            options={executionAccessOptions()}
            onChange={(value) => updateDraft("executionAccess", value)}
          />
        </label>
        <label {...stylex.attrs(styles.field)}>
          <span {...stylex.attrs(styles.sectionEyebrow)}>Plan gate</span>
          <DropdownControl
            kind="select"
            ariaLabel="Select mode plan gate"
            icon={<Play {...stylex.attrs(styles.iconSm)} />}
            size="md"
            class={stylex.attrs(styles.fullWidth).class}
            value={draft().planExecutionModeDefault ?? "countdown"}
            options={planGateOptions()}
            onChange={(value) => updateDraft("planExecutionModeDefault", value)}
          />
        </label>
        <label {...stylex.attrs(styles.field)}>
          <span {...stylex.attrs(styles.sectionEyebrow)}>Correctness</span>
          <DropdownControl
            kind="select"
            ariaLabel="Select correctness iteration"
            icon={<RefreshCcw {...stylex.attrs(styles.iconSm)} />}
            size="md"
            class={stylex.attrs(styles.fullWidth).class}
            value={draft().correctnessIterationModeDefault ?? "ask-before-iterate"}
            options={correctnessOptions()}
            onChange={(value) => updateDraft("correctnessIterationModeDefault", value)}
          />
        </label>
      </div>
    </section>
  );
}
