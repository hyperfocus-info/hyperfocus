import { Show, createEffect, createSignal, createUniqueId, onCleanup, untrack } from "solid-js";
import { modeDraftJournal } from "../store/modes/mode-drafts";
import { Disclosure } from "@hyperfocus/ui";
import * as stylex from "@stylexjs/stylex";
import { ClipboardList, FolderOpen, Play, RefreshCcw } from "lucide-solid";
import type { ModeDefinition } from "@hyperfocus/ai-core/protocol";
import { ActionButton } from "./action-button";
import { DropdownControl, type DropdownOption } from "./primitives/dropdown";
import { Input } from "@hyperfocus/ui";
import { Dialog } from "./primitives/dialog";
import { Textarea } from "./primitives/textarea";
import { miscellaneousSurfaceStyles as styles } from "./miscellaneous-surfaces.styles";

type ModeEditorPanelProps = {
  title: string;
  scope: "workspace" | "project";
  modes: ModeDefinition[];
  draftOwner?: object;
  draftKey?: string;
  onSave: (mode: Omit<ModeDefinition, "scope"> & { scope: "workspace" | "project" }) => Promise<void>;
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
  const journal = props.draftOwner ? modeDraftJournal(props.draftOwner) : undefined;
  const journalKey = `${props.scope}:${props.draftKey ?? "workspace"}`;
  const retained = journal?.get(journalKey);
  const [selectedModeId, setSelectedModeId] = createSignal<string>();
  const [draft, setDraft] = createSignal<ModeDraft>(EMPTY_MODE_DRAFT);
  const [creating, setCreating] = createSignal(false);
  const [submitted, setSubmitted] = createSignal(false);
  const [deleteOpen, setDeleteOpen] = createSignal(false);
  const [pendingModeId, setPendingModeId] = createSignal<string>();
  const [dirty, setDirty] = createSignal(false);
  const [saving, setSaving] = createSignal(false);
  const [saveError, setSaveError] = createSignal("");
  const [saved, setSaved] = createSignal(false);
  const [transition, setTransition] = createSignal<{ label: string; run: () => void }>();
  const [resumed, setResumed] = createSignal(Boolean(retained));
  const [removed, setRemoved] = createSignal(false);
  let pendingSave: Promise<void> | undefined;
  if (retained) { setDraft(retained.draft); setSelectedModeId(retained.selectedModeId); setCreating(retained.creating); setDirty(true); }
  const retain = () => {
    if (!journal) return;
    if (dirty() || saving()) journal.set(journalKey, { draft: draft(), selectedModeId: selectedModeId(), creating: creating(), pending: pendingSave });
    else journal.delete(journalKey);
  };
  createEffect(retain);
  const beforeUnload = (event: BeforeUnloadEvent) => { if (dirty() || saving()) { event.preventDefault(); event.returnValue = ""; } };
  window.addEventListener("beforeunload", beforeUnload);
  onCleanup(() => { retain(); window.removeEventListener("beforeunload", beforeUnload); });
  const errorId = createUniqueId();
  let panel: HTMLElement | undefined;
  const requiredFields = ["id", "label", "description", "plannerPrompt", "executionPrompt"] as const;
  const invalid = (key: typeof requiredFields[number]) => submitted() && !draft()[key].trim();
  const errorProps = (key: typeof requiredFields[number]) => ({ "aria-invalid": invalid(key) || undefined, "aria-describedby": invalid(key) ? errorId : undefined });

  createEffect(() => {
    if (creating()) return;
    const modes = props.modes.filter(mode => mode.scope === props.scope);
    if (selectedModeId() && !modes.some(mode => mode.id === selectedModeId()) && !pendingModeId()) {
      setRemoved(true);
      return;
    }
    setRemoved(false);
    if (untrack(dirty) || untrack(saving)) return;
    if (pendingModeId() && !modes.some(mode => mode.id === pendingModeId())) return;
    if (pendingModeId()) setPendingModeId(undefined);
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
    if (saving()) return;
    setDirty(true);
    setSaved(false);
    setDraft({
      ...draft(),
      [key]: value
    });
  };

  const customModes = () => props.modes.filter((mode): mode is ModeDefinition & { scope: "workspace" | "project" } => mode.scope === props.scope);
  const requestTransition = (label: string, run: () => void) => {
    if (saving()) return;
    if (dirty()) setTransition({ label, run }); else run();
  };
  const resetStatus = () => { setDirty(false); setSaved(false); setSaveError(""); setSubmitted(false); setResumed(false); setRemoved(false); journal?.delete(journalKey); };
  const selectMode = (id: string) => {
    resetStatus(); setPendingModeId(undefined); setCreating(false); setSelectedModeId(id);
    const mode = customModes().find(item => item.id === id);
    if (mode) setDraft(modeDraftFromDefinition(mode));
  };
  const handleNewMode = () => {
    resetStatus();
    const slugBase = props.scope === "workspace" ? "workspace-mode" : "project-mode";
    const nextId = `${slugBase}-${Date.now().toString(36)}`;
    setCreating(true);
    setPendingModeId(undefined);
    setSubmitted(false);
    setSelectedModeId(undefined);
    setDraft({
      ...EMPTY_MODE_DRAFT,
      id: nextId
    });
    panel?.querySelector<HTMLInputElement>('input[data-test-mode-label]')?.focus();
  };

  const handleSave = async () => {
    if (saving()) return;
    const next = draft();
    setSubmitted(true);
    if (!next.id.trim() || !next.label.trim() || !next.description.trim() || !next.plannerPrompt.trim() || !next.executionPrompt.trim()) {
      panel?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      return;
    }

    setSaving(true); setSaveError(""); setSaved(false);
    try {
    pendingSave = props.onSave({
      ...next,
      id: next.id.trim(),
      label: next.label.trim(),
      description: next.description.trim(),
      plannerPrompt: next.plannerPrompt.trim(),
      executionPrompt: next.executionPrompt.trim(),
      scope: props.scope,
      updatedAt: new Date().toISOString()
    });
    retain();
    await pendingSave;
    setDirty(false);
    setPendingModeId(next.id.trim());
    setSelectedModeId(next.id.trim());
    setCreating(false);
    setSubmitted(false);
    setSaved(true);
    } catch (error) { setSaveError(error instanceof Error ? error.message : "Mode could not be saved."); }
    finally { pendingSave = undefined; setSaving(false); retain(); }
  };

  if (retained?.pending) {
    setSaving(true); pendingSave = retained.pending;
    void retained.pending.then(() => { setDirty(false); setSaved(true); setResumed(false); }, error => setSaveError(error instanceof Error ? error.message : "Mode could not be saved.")).finally(() => { pendingSave = undefined; setSaving(false); retain(); });
  }

  const handleDelete = () => {
    const modeId = customModes().find(mode => mode.id === selectedModeId())?.id;
    if (!modeId) {
      return;
    }

    props.onDelete(modeId);
    setDeleteOpen(false);
    setSelectedModeId(undefined);
    setDraft(EMPTY_MODE_DRAFT);
  };

  return (
    <section ref={panel} {...stylex.attrs(styles.modePanel)}>
      <div {...stylex.attrs(styles.modeHeader)}>
        <div>
          <div {...stylex.attrs(styles.sectionEyebrow)}>{props.title}</div>
          <div {...stylex.attrs(styles.modeDescription)}>
            Custom modes override built-ins inside {props.scope} scope.
          </div>
        </div>
        <div {...stylex.attrs(styles.inlineActions)}>
          <ActionButton tooltip={`Create new ${props.scope} mode`} disabled={saving()} variant="secondary" size="sm" onClick={() => requestTransition("Create a new mode", handleNewMode)}>
            New mode
          </ActionButton>
          <ActionButton
            tooltip={`Delete selected ${props.scope} mode`}
            disabled={!selectedModeId() || saving() || removed()}
            disabledReason={`Select ${props.scope} mode first`}
            variant="secondary"
            size="sm"
            onClick={() => setDeleteOpen(true)}
          >
            Delete
          </ActionButton>
          <ActionButton tooltip={`Save ${props.scope} mode`} disabled={saving() || removed()} ariaBusy={saving()} size="sm" onClick={handleSave}>
            {saving() ? "Saving…" : saveError() ? "Retry save" : "Save mode"}
          </ActionButton>
          <Show when={dirty() && selectedModeId() && !removed() && !resumed()}><ActionButton tooltip="Discard changes and reload saved mode" variant="secondary" size="sm" disabled={saving()} onClick={() => requestTransition("Reload the saved mode", () => selectMode(selectedModeId()!))}>Discard changes</ActionButton></Show>
        </div>
      </div>

      <Show when={resumed() && !removed()}><p role="status" {...stylex.attrs(styles.modeDescription)}>Your unsaved draft was restored for this {props.scope}. Save it or discard it when ready.</p><ActionButton tooltip="Discard retained draft" variant="secondary" disabled={saving()} onClick={() => requestTransition("Discard the retained draft", () => { resetStatus(); setCreating(false); setSelectedModeId(undefined); setDraft(EMPTY_MODE_DRAFT); const first = customModes()[0]; if (first) selectMode(first.id); })}>Discard retained draft</ActionButton></Show>
      <Show when={removed()}><p role="alert" {...stylex.attrs(styles.modeError)}>This mode was removed elsewhere. Your text is retained. Recreate it explicitly or discard this draft.</p><ActionButton tooltip="Recreate removed mode" variant="secondary" disabled={saving()} onClick={() => { setCreating(true); setSelectedModeId(undefined); setRemoved(false); setDirty(true); }}>Recreate removed mode</ActionButton><ActionButton tooltip="Discard removed mode draft" variant="secondary" disabled={saving()} onClick={() => requestTransition("Discard the removed mode draft", () => { resetStatus(); setSelectedModeId(undefined); setCreating(false); setDraft(EMPTY_MODE_DRAFT); })}>Discard draft</ActionButton></Show>

      <div {...stylex.attrs(styles.blockField)}>
        <Show when={customModes().length} fallback={<Show when={!removed()}><p {...stylex.attrs(styles.modeDescription)}>No saved modes in this {props.scope}. Create a mode with a name and both prompts.</p></Show>}>
          <DropdownControl kind="select" disabled={saving()} icon={<ClipboardList {...stylex.attrs(styles.iconSm)} />} ariaLabel="Select saved mode" value={selectedModeId() ?? ""} options={customModes().map(mode => ({ value: mode.id, label: mode.label, description: mode.description }))} onChange={id => requestTransition(`Open ${customModes().find(mode => mode.id === id)?.label ?? "saved mode"}`, () => selectMode(id))} />
        </Show>
        <Show when={submitted() && requiredFields.some(key => invalid(key))}><p id={errorId} role="alert" {...stylex.attrs(styles.modeError)}>Complete the mode ID, label, description and both prompts before saving. Your draft is retained.</p></Show>
      </div>

      <Show when={saving() || saved() || (dirty() && !resumed() && !removed())}><p role="status" {...stylex.attrs(styles.modeDescription)}>{saving() ? "Saving mode. Waiting for workspace confirmation…" : saved() ? "Mode saved." : journal ? "Unsaved changes. Your draft stays with this workspace or project while you navigate." : "Unsaved changes. Your draft is retained while this editor stays open."}</p></Show>
      <Show when={saveError()}><p role="alert" {...stylex.attrs(styles.modeError)}>{saveError()} Your draft is retained. Retry save when ready.</p></Show>

      <fieldset disabled={saving()} aria-label="Mode fields" {...stylex.attrs(styles.modeFields)}>
      <div {...stylex.attrs(styles.fieldGridTwo)}>
        <label {...stylex.attrs(styles.field)}>
          <span {...stylex.attrs(styles.sectionEyebrow)}>Mode id</span>
          <Input {...errorProps("id")} value={draft().id} onInput={(event) => updateDraft("id", event.currentTarget.value)} />
        </label>
        <label {...stylex.attrs(styles.field)}>
          <span {...stylex.attrs(styles.sectionEyebrow)}>Label</span>
          <Input data-test-mode-label {...errorProps("label")} value={draft().label} onInput={(event) => updateDraft("label", event.currentTarget.value)} />
        </label>
      </div>

      <label {...stylex.attrs(styles.blockField)}>
        <span {...stylex.attrs(styles.sectionEyebrow)}>Description</span>
        <Input {...errorProps("description")} value={draft().description} onInput={(event) => updateDraft("description", event.currentTarget.value)} />
      </label>

      <div {...stylex.attrs(styles.fieldGridTwoCompact)}>
        <label {...stylex.attrs(styles.field)}>
          <span {...stylex.attrs(styles.sectionEyebrow)}>Planner prompt</span>
          <Textarea {...errorProps("plannerPrompt")} rows="5" value={draft().plannerPrompt} onInput={(event) => updateDraft("plannerPrompt", event.currentTarget.value)} />
        </label>
        <label {...stylex.attrs(styles.field)}>
          <span {...stylex.attrs(styles.sectionEyebrow)}>Execution prompt</span>
          <Textarea {...errorProps("executionPrompt")} rows="5" value={draft().executionPrompt} onInput={(event) => updateDraft("executionPrompt", event.currentTarget.value)} />
        </label>
      </div>

      <Disclosure title="Execution policy">
      <p {...stylex.attrs(styles.modeDescription)}>Review tool access and approval before saving. These defaults apply when this mode is selected.</p>
      <div {...stylex.attrs(styles.fieldGridTwoCompact)}>
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
      </Disclosure>
      </fieldset>
      <Dialog open={() => Boolean(transition())} title="Discard unsaved changes?" description={transition()?.label} onClose={() => setTransition(undefined)} footer={<><ActionButton tooltip="Keep editing this mode" variant="secondary" onClick={() => setTransition(undefined)}>Keep editing</ActionButton><ActionButton tooltip="Discard draft and continue" onClick={() => { const next = transition(); setTransition(undefined); next?.run(); }}>Discard and continue</ActionButton></>}><p>Your changes have not been saved. Continue only if you want to discard this draft.</p></Dialog>
      <Dialog open={deleteOpen} title="Delete saved mode?" description={`Remove ${customModes().find(mode => mode.id === selectedModeId())?.label ?? "this mode"} from ${props.scope} modes.`} onClose={() => setDeleteOpen(false)} footer={<><ActionButton tooltip="Keep saved mode" variant="secondary" onClick={() => setDeleteOpen(false)}>Cancel</ActionButton><ActionButton tooltip="Confirm mode deletion" onClick={handleDelete}>Delete mode</ActionButton></>}><p>Built-in modes remain available. This does not delete project files or conversation history.</p></Dialog>
    </section>
  );
}
