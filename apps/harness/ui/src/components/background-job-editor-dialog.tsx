import { For, Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import * as stylex from "@stylexjs/stylex";
import { Bot, Brain, ClipboardList, FolderOpen, Gauge, Play, Split, UserRound } from "lucide-solid";
import { resolveModeCatalog } from "../../../shared/modes";
import {
  createBackgroundJobId,
  createRequestId,
  createThreadId,
  type BackgroundJob,
  type BackgroundJobSchedule,
  type ComposerReasoningStrength
} from "../../../shared/protocol";
import {
  COMPOSER_REASONING_STRENGTHS,
  DEFAULT_COMPOSER_REASONING_STRENGTH,
  type BackgroundJobEditorDraft,
  harnessStore
} from "../harness-store";
import { formatShortTimestamp, resolveBrowserTimezone } from "../lib/time-format";
import { pushToast } from "../toast-store";
import { Button } from "./primitives/button";
import { Dialog } from "./primitives/dialog";
import { DropdownControl } from "./primitives/dropdown";
import { getModeDropdownIcon } from "./primitives/dropdown-option-icons";
import { DialogField, DialogFormSection, DialogInlineNote } from "./primitives/form-layout";
import { Input } from "./primitives/input";
import { Textarea } from "./primitives/textarea";
import { backgroundJobsStyles as styles } from "./background-jobs.styles";

export function BackgroundJobEditorDialog() {
  const state = harnessStore.state;
  const sendCommand = harnessStore.actions.sendCommand;
  const [projectId, setProjectId] = createSignal<string>();
  const [assistantId, setAssistantId] = createSignal("");
  const [templateId, setTemplateId] = createSignal("");
  const [kind, setKind] = createSignal<BackgroundJob["kind"]>("ai-routine");
  const [lane, setLane] = createSignal<BackgroundJob["lane"]>("exclusive");
  const [name, setName] = createSignal("");
  const [description, setDescription] = createSignal("");
  const [scheduleInput, setScheduleInput] = createSignal("");
  const [timezone, setTimezone] = createSignal(resolveBrowserTimezone());
  const [aiPrompt, setAiPrompt] = createSignal("");
  const [aiModeId, setAiModeId] = createSignal("");
  const [aiExecutionModelId, setAiExecutionModelId] = createSignal("");
  const [aiReasoningStrength, setAiReasoningStrength] = createSignal<ComposerReasoningStrength>(
    DEFAULT_COMPOSER_REASONING_STRENGTH
  );
  const [aiFastMode, setAiFastMode] = createSignal(false);
  const [aiPlanExecutionMode, setAiPlanExecutionMode] = createSignal<"countdown" | "approve" | "immediate">("countdown");
  const [aiSubagentWorktreeStrategy, setAiSubagentWorktreeStrategy] = createSignal<"same-worktree" | "separate-worktrees">(
    "same-worktree"
  );
  const [shellExecutable, setShellExecutable] = createSignal("");
  const [shellArgsText, setShellArgsText] = createSignal("");
  const [shellCwd, setShellCwd] = createSignal("");
  const [shellEnvRefsText, setShellEnvRefsText] = createSignal("");
  const [shellTimeoutSeconds, setShellTimeoutSeconds] = createSignal(600);
  const [shellNetworkAccess, setShellNetworkAccess] = createSignal(false);
  const [previewRequestId, setPreviewRequestId] = createSignal<string>();

  const activeDraft = () => state.backgroundJobEditorDraft;
  const selectedTemplate = () => state.backgroundJobs.templates.find((template) => template.id === templateId());
  const schedulePreview = () => {
    const previewState = state.backgroundJobSchedulePreview;
    return previewState && previewState.requestId === previewRequestId() ? previewState.preview : undefined;
  };
  const availableModes = createMemo(() =>
    resolveModeCatalog(
      state.workspace.workspaceModes,
      state.workspace.projects.find((project) => project.id === projectId())?.projectModes ?? []
    )
  );
  const projectOptions = createMemo(() =>
    state.workspace.projects.map((project) => ({
      value: project.id,
      label: project.name,
      description: project.rootPath,
      icon: <FolderOpen class={stylex.attrs(styles.iconXs).class} />
    }))
  );
  const assistantOptions = createMemo(() => [
    { value: "", label: "Unowned", description: "Run as a project background job.", icon: <ClipboardList class={stylex.attrs(styles.iconXs).class} /> },
    ...state.assistants.assistants
      .filter((assistant) => !assistant.projectId || assistant.projectId === projectId())
      .map((assistant) => ({
        value: assistant.id,
        label: assistant.name,
        description: assistant.projectId ? "Attach to this project assistant." : "Attach to this global assistant.",
        icon: <UserRound class={stylex.attrs(styles.iconXs).class} />
      }))
  ]);
  const templateOptions = createMemo(() => [
    { value: "", label: "Custom", description: "Start from blank scheduled task definition.", icon: <ClipboardList class={stylex.attrs(styles.iconXs).class} /> },
    ...state.backgroundJobs.templates.map((template) => ({
      value: template.id,
      label: template.label,
      description: template.description,
      icon: <ClipboardList class={stylex.attrs(styles.iconXs).class} />
    }))
  ]);
  const kindOptions = () => [
    { value: "ai-routine", label: "AI routine", description: "Prompt-driven autonomous background task.", icon: <Bot class={stylex.attrs(styles.iconXs).class} /> },
    { value: "shell", label: "Shell", description: "Typed executable plus args/env background task.", icon: <ClipboardList class={stylex.attrs(styles.iconXs).class} /> }
  ];
  const laneOptions = () => [
    { value: "exclusive", label: "Exclusive", description: "Serializes file edits and assistant memory updates." },
    { value: "concurrent", label: "Concurrent", description: "For read-only observation jobs that can run elastically." }
  ];
  const modeOptions = createMemo(() => [
    { value: "", label: "Project default", description: "Use project-selected mode when job runs.", icon: <Split class={stylex.attrs(styles.iconXs).class} /> },
    ...availableModes().map((mode) => ({
      value: mode.id,
      label: mode.label,
      description: mode.description,
      icon: getModeDropdownIcon(mode.id)
    }))
  ]);
  const planGateOptions = () => [
    { value: "countdown", label: "Countdown", description: "Pause briefly before execution starts." },
    { value: "approve", label: "Approve", description: "Require explicit approval before execution starts." },
    { value: "immediate", label: "Immediate", description: "Start execution immediately after planning." }
  ];
  const reasoningOptions = () =>
    COMPOSER_REASONING_STRENGTHS.map((strength) => ({
      value: strength,
      label: formatReasoningOptionLabel(strength),
      description: getReasoningStrengthDescription(strength),
      icon: <Brain class={stylex.attrs(styles.iconXs).class} />
    }));
  const fastModeOptions = () => [
    { value: "false", label: "Off", description: "Use standard response path.", icon: <Gauge class={stylex.attrs(styles.iconXs).class} /> },
    { value: "true", label: "On", description: "Prefer lower-latency responses when supported.", icon: <Gauge class={stylex.attrs(styles.iconXs).class} /> }
  ];
  const worktreeOptions = () => [
    { value: "same-worktree", label: "Same checkout", description: "Run subagents in current working tree." },
    {
      value: "separate-worktrees",
      label: "Isolated mounts (BranchFS)",
      description: "Run subagents inside isolated BranchFS mounts."
    }
  ];

  createEffect(() => {
    const draft = activeDraft();
    if (!state.backgroundJobEditorOpen || !draft) {
      return;
    }

    seedFromDraft(draft);
    harnessStore.clearBackgroundJobSchedulePreview();
  });

  createEffect(() => {
    if (!state.backgroundJobEditorOpen) {
      return;
    }

    const selectedAssistantId = assistantId();
    if (selectedAssistantId && !assistantOptions().some((option) => option.value === selectedAssistantId)) {
      setAssistantId("");
    }
  });

  createEffect(() => {
    if (!state.backgroundJobEditorOpen) {
      return;
    }

    const input = scheduleInput().trim();
    if (!input) {
      harnessStore.clearBackgroundJobSchedulePreview();
      return;
    }

    const requestId = createRequestId();
    setPreviewRequestId(requestId);
    const timeoutId = window.setTimeout(() => {
      sendCommand({
        type: "background-job.schedule.preview",
        requestId,
        payload: {
          input,
          timezone: timezone().trim() || undefined
        }
      });
    }, 250);

    onCleanup(() => window.clearTimeout(timeoutId));
  });

  function seedFromDraft(draft: BackgroundJobEditorDraft) {
    setProjectId(draft.projectId ?? state.workspace.activeProjectId ?? state.workspace.projects[0]?.id);
    setAssistantId(draft.assistantId ?? "");
    setTemplateId(draft.templateId ?? (draft.source === "create" && draft.kind === "ai-routine" ? "scheduled-task" : ""));
    setKind(draft.kind);
    setLane(draft.lane ?? "exclusive");
    setName(draft.name);
    setDescription(draft.description);
    setScheduleInput(draft.scheduleInput);
    setTimezone(draft.timezone || resolveBrowserTimezone());
    setAiPrompt(draft.aiPrompt);
    setAiModeId(draft.aiModeId ?? "");
    setAiExecutionModelId(draft.aiExecutionModelId ?? "");
    setAiReasoningStrength(draft.aiReasoningStrength ?? DEFAULT_COMPOSER_REASONING_STRENGTH);
    setAiFastMode(Boolean(draft.aiFastMode));
    setAiPlanExecutionMode(draft.aiPlanExecutionMode ?? state.planExecutionModeDefault);
    setAiSubagentWorktreeStrategy(draft.aiSubagentWorktreeStrategy ?? state.subagentWorktreeStrategyDefault);
    setShellExecutable(draft.shellExecutable);
    setShellArgsText(draft.shellArgsText);
    setShellCwd(draft.shellCwd);
    setShellEnvRefsText(draft.shellEnvRefsText);
    setShellTimeoutSeconds(draft.shellTimeoutSeconds);
    setShellNetworkAccess(draft.shellNetworkAccess);
  }

  function applyTemplate(nextTemplateId: string) {
    setTemplateId(nextTemplateId);
    const template = state.backgroundJobs.templates.find((entry) => entry.id === nextTemplateId);
    if (!template) {
      return;
    }

    setKind(template.kind);
    if (template.definition.kind === "ai-routine") {
      setAiPrompt(template.definition.prompt);
      setAiModeId(template.definition.modeId ?? "");
      setAiExecutionModelId(template.definition.executionModelId ?? "");
      setAiReasoningStrength(template.definition.reasoningStrength ?? DEFAULT_COMPOSER_REASONING_STRENGTH);
      setAiFastMode(Boolean(template.definition.fastMode));
      setAiPlanExecutionMode(template.definition.planExecutionMode ?? state.planExecutionModeDefault);
      setAiSubagentWorktreeStrategy(template.definition.subagentWorktreeStrategy ?? state.subagentWorktreeStrategyDefault);
      return;
    }

    setShellExecutable(template.definition.executable);
    setShellArgsText(template.definition.args.join("\n"));
    setShellCwd(template.definition.cwd ?? "");
    setShellEnvRefsText((template.definition.envRefs ?? []).join("\n"));
    setShellTimeoutSeconds(template.definition.timeoutSeconds);
    setShellNetworkAccess(Boolean(template.definition.networkAccess));
  }

  function handleClose() {
    harnessStore.closeBackgroundJobEditor();
  }

  function saveDisabledReason() {
    if (!projectId()) return "Select a project";
    if (!name().trim()) return "Enter a task name";
    if (!schedulePreview()?.schedule || schedulePreview()?.error) return schedulePreview()?.error ?? "Enter a valid schedule";
    if (kind() === "ai-routine" && !aiPrompt().trim()) return "Describe what the AI routine should do";
    if (kind() === "shell" && !shellExecutable().trim()) return "Enter a shell executable";
    return undefined;
  }

  function handleSave() {
    const draft = activeDraft();
    const resolvedProjectId = projectId();
    const preview = schedulePreview();
    if (!draft || !resolvedProjectId) {
      pushToast("Project required", "Select target project before saving.", "error");
      return;
    }

    if (!preview?.schedule || preview.error) {
      pushToast("Schedule invalid", preview?.error ?? "Enter valid schedule before saving.", "error");
      return;
    }

    const trimmedName = name().trim();
    if (!trimmedName) {
      pushToast("Name required", "Background job needs short name.", "error");
      return;
    }

    const definition =
      kind() === "ai-routine"
        ? {
            kind: "ai-routine" as const,
            prompt: aiPrompt().trim(),
            modeId: aiModeId().trim() || undefined,
            executionModelId: aiExecutionModelId().trim() || undefined,
            reasoningStrength: aiReasoningStrength(),
            fastMode: aiFastMode(),
            planExecutionMode: aiPlanExecutionMode(),
            subagentWorktreeStrategy: aiSubagentWorktreeStrategy()
          }
        : {
            kind: "shell" as const,
            executable: shellExecutable().trim(),
            args: splitMultilineInput(shellArgsText()) ?? [],
            cwd: shellCwd().trim() || undefined,
            envRefs: splitMultilineInput(shellEnvRefsText()),
            timeoutSeconds: Math.max(1, Math.min(24 * 60 * 60, Math.round(shellTimeoutSeconds()))),
            networkAccess: shellNetworkAccess()
          };

    if (definition.kind === "ai-routine" && !definition.prompt) {
      pushToast("Prompt required", "AI routine needs self-contained prompt.", "error");
      return;
    }

    if (definition.kind === "shell" && !definition.executable) {
      pushToast("Executable required", "Shell job needs executable.", "error");
      return;
    }

    const now = new Date().toISOString();
    sendCommand({
      type: "background-job.save",
      requestId: createRequestId(),
      payload: {
        job: {
          id: draft.jobId ?? createBackgroundJobId(),
          projectId: resolvedProjectId,
          assistantId: assistantId().trim() || undefined,
          automationThreadId: draft.automationThreadId ?? createThreadId(),
          templateId: selectedTemplate()?.id ?? draft.templateId ?? undefined,
          createdFromRunId: draft.createdFromRunId,
          kind: definition.kind,
          lane: lane(),
          name: trimmedName,
          description: description().trim() || undefined,
          status: draft.status ?? "enabled",
          riskLevel: "unsafe",
          definition,
          schedule: preview.schedule,
          scheduleInput: scheduleInput().trim(),
          timezone: timezone().trim() || undefined,
          nextRunAt: preview.schedule.type === "one-off" ? preview.schedule.runAt : preview.schedule.nextRunAt,
          lastRunAt: draft.lastRunAt,
          lastEnqueuedAt: draft.lastEnqueuedAt,
          createdAt: draft.createdAt ?? now,
          updatedAt: now
        }
      }
    });
    handleClose();
  }

  return (
    <Dialog
      open={state.backgroundJobEditorOpen}
      onClose={handleClose}
      title={activeDraft()?.source === "edit" ? "Edit scheduled task" : "Scheduled task"}
      eyebrow="Background jobs"
      description="Save self-contained AI routines or typed shell jobs."
      class={stylex.attrs(styles.editorDialog).class}
      contentClass={stylex.attrs(styles.editorDialogContent).class}
      footer={
        <>
          <Button tooltip="Close scheduled task editor without saving" variant="ghost" onClick={handleClose}>
            Cancel
          </Button>
          <Button tooltip={saveDisabledReason() ?? "Save scheduled task"} disabled={Boolean(saveDisabledReason())} onClick={handleSave}>Save task</Button>
        </>
      }
    >
      <DialogFormSection title="Task" description="Pick where this job runs, who owns it, and what kind of work it performs.">
        <DialogField label="Name">
          <Input value={name()} onInput={(event) => setName(event.currentTarget.value)} placeholder="Nightly repo review" />
        </DialogField>

        <Show when={kind() === "ai-routine"}>
          <DialogField label="What should the AI do?">
            <Textarea rows="5" value={aiPrompt()} onInput={(event) => setAiPrompt(event.currentTarget.value)} placeholder="Inspect the repo, fix the highest-risk issue, verify it, and summarize the result." />
          </DialogField>
        </Show>

        <DialogField label="Project">
          <DropdownControl
            kind="select"
            ariaLabel="Select background job project"
            icon={<FolderOpen class={stylex.attrs(styles.iconSm).class} />}
            size="md"
            class={stylex.attrs(styles.controlFullWidth).class}
            value={projectId() ?? ""}
            options={projectOptions()}
            onChange={(value) => setProjectId(value || undefined)}
          />
        </DialogField>

        <details class={stylex.attrs(styles.advancedSettings).class}>
          <summary class={stylex.attrs(styles.advancedSummary).class}>Advanced task settings</summary>
          <div class={stylex.attrs(styles.advancedGrid).class}>
          <DialogField label="Owner">
          <DropdownControl
            kind="select"
            ariaLabel="Select background job owner assistant"
            icon={<UserRound class={stylex.attrs(styles.iconSm).class} />}
            size="md"
            class={stylex.attrs(styles.controlFullWidth).class}
            value={assistantId()}
            options={assistantOptions()}
            onChange={setAssistantId}
          />
          </DialogField>

          <DialogField label="Template">
            <DropdownControl
              kind="select"
              ariaLabel="Select background job template"
              icon={<ClipboardList class={stylex.attrs(styles.iconSm).class} />}
              size="md"
              class={stylex.attrs(styles.controlFullWidth).class}
              value={templateId()}
              options={templateOptions()}
              onChange={applyTemplate}
            />
          </DialogField>

          <DialogField label="Kind">
          <DropdownControl
            kind="select"
            ariaLabel="Select background job kind"
            icon={<Bot class={stylex.attrs(styles.iconSm).class} />}
            size="md"
            class={stylex.attrs(styles.controlFullWidth).class}
            value={kind()}
            options={kindOptions()}
            onChange={(value) => setKind(value as BackgroundJob["kind"])}
          />
          </DialogField>

          <DialogField label="Lane">
          <DropdownControl
            kind="select"
            ariaLabel="Select background job lane"
            icon={<Split class={stylex.attrs(styles.iconSm).class} />}
            size="md"
            class={stylex.attrs(styles.controlFullWidth).class}
            value={lane() ?? "exclusive"}
            options={laneOptions()}
            onChange={(value) => setLane(value === "concurrent" ? "concurrent" : "exclusive")}
          />
          </DialogField>

          <DialogField label="Description" class={stylex.attrs(styles.editorWideField).class}>
            <Textarea rows="2" value={description()} onInput={(event) => setDescription(event.currentTarget.value)} placeholder="Optional inbox summary." />
          </DialogField>
          </div>
        </details>
      </DialogFormSection>

      <DialogFormSection title="Schedule" description="Use an interval, one-off datetime, or cron expression.">
        <div class={stylex.attrs(styles.scheduleGrid).class}>
          <DialogField label="Schedule">
          <Input value={scheduleInput()} onInput={(event) => setScheduleInput(event.currentTarget.value)} placeholder="daily | 3h | 2026-04-17 09:00 | */15 * * * *" />
          </DialogField>

          <DialogField label="Timezone">
          <Input value={timezone()} onInput={(event) => setTimezone(event.currentTarget.value)} placeholder="America/New_York" />
          </DialogField>
        </div>

        <DialogInlineNote tone={schedulePreview()?.error ? "danger" : schedulePreview()?.schedule ? "success" : "neutral"}>
          <Show when={schedulePreview()} fallback={<span>Enter a schedule to see its next run in local time.</span>}>
            {(preview) => (
              <Show when={!preview().error} fallback={<span>{preview().error}</span>}>
                <span>{describeSchedulePreview(preview().schedule)}</span>
              </Show>
            )}
          </Show>
        </DialogInlineNote>
      </DialogFormSection>

      <Show when={kind() === "ai-routine"} fallback={<ShellJobFields
        executable={shellExecutable()}
        argsText={shellArgsText()}
        cwd={shellCwd()}
        envRefsText={shellEnvRefsText()}
        timeoutSeconds={shellTimeoutSeconds()}
        networkAccess={shellNetworkAccess()}
        onExecutableInput={setShellExecutable}
        onArgsInput={setShellArgsText}
        onCwdInput={setShellCwd}
        onEnvRefsInput={setShellEnvRefsText}
        onTimeoutInput={(value) => setShellTimeoutSeconds(Math.max(1, Number(value) || 1))}
        onNetworkAccessInput={setShellNetworkAccess}
      />}>
        <DialogFormSection title="AI routine" description="Prompt and execution defaults used each time the schedule fires.">
          <div class={stylex.attrs(styles.aiGrid).class}>
            <DialogField label="Mode">
              <DropdownControl
                kind="select"
                ariaLabel="Select background job mode"
                icon={<Split class={stylex.attrs(styles.iconSm).class} />}
                size="md"
                class={stylex.attrs(styles.controlFullWidth).class}
                value={aiModeId()}
                options={modeOptions()}
                onChange={setAiModeId}
              />
            </DialogField>

            <DialogField label="Execution model">
              <Input value={aiExecutionModelId()} onInput={(event) => setAiExecutionModelId(event.currentTarget.value)} placeholder="openai/gpt-5.4" />
            </DialogField>

            <DialogField label="Effort">
              <DropdownControl
                kind="select"
                ariaLabel="Select background job reasoning effort"
                icon={<Brain class={stylex.attrs(styles.iconSm).class} />}
                size="md"
                class={stylex.attrs(styles.controlFullWidth).class}
                value={aiReasoningStrength()}
                options={reasoningOptions()}
                onChange={(value) => setAiReasoningStrength(value as ComposerReasoningStrength)}
              />
            </DialogField>

            <DialogField label="Fast mode">
              <DropdownControl
                kind="select"
                ariaLabel="Select background job fast mode"
                icon={<Gauge class={stylex.attrs(styles.iconSm).class} />}
                size="md"
                class={stylex.attrs(styles.controlFullWidth).class}
                value={aiFastMode() ? "true" : "false"}
                options={fastModeOptions()}
                onChange={(value) => setAiFastMode(value === "true")}
              />
            </DialogField>

            <DialogField label="Plan gate">
              <DropdownControl
                kind="select"
                ariaLabel="Select background job plan gate"
                icon={<Play class={stylex.attrs(styles.iconSm).class} />}
                size="md"
                class={stylex.attrs(styles.controlFullWidth).class}
                value={aiPlanExecutionMode()}
                options={planGateOptions()}
                onChange={(value) => setAiPlanExecutionMode(value as "countdown" | "approve" | "immediate")}
              />
            </DialogField>

            <DialogField label="Worktree">
              <DropdownControl
                kind="select"
                ariaLabel="Select background job worktree strategy"
                icon={<FolderOpen class={stylex.attrs(styles.iconSm).class} />}
                size="md"
                class={stylex.attrs(styles.controlFullWidth).class}
                value={aiSubagentWorktreeStrategy()}
                options={worktreeOptions()}
                onChange={(value) => setAiSubagentWorktreeStrategy(value as "same-worktree" | "separate-worktrees")}
              />
            </DialogField>
          </div>
        </DialogFormSection>
      </Show>
    </Dialog>
  );
}

function ShellJobFields(props: {
  executable: string;
  argsText: string;
  cwd: string;
  envRefsText: string;
  timeoutSeconds: number;
  networkAccess: boolean;
  onExecutableInput: (value: string) => void;
  onArgsInput: (value: string) => void;
  onCwdInput: (value: string) => void;
  onEnvRefsInput: (value: string) => void;
  onTimeoutInput: (value: string) => void;
  onNetworkAccessInput: (value: boolean) => void;
}) {
  return (
    <DialogFormSection title="Shell job" description="Command, arguments, environment, and runtime limits for typed background execution.">
      <div class={stylex.attrs(styles.shellGrid).class}>
      <DialogField label="Executable">
        <Input value={props.executable} onInput={(event) => props.onExecutableInput(event.currentTarget.value)} placeholder="bun" />
      </DialogField>
      <DialogField label="Working directory">
        <Input value={props.cwd} onInput={(event) => props.onCwdInput(event.currentTarget.value)} placeholder="Project root when empty" />
      </DialogField>
      <DialogField label="Args, one per line">
        <Textarea rows="6" value={props.argsText} onInput={(event) => props.onArgsInput(event.currentTarget.value)} placeholder="run&#10;test" />
      </DialogField>
      <DialogField label="Env refs, one per line">
        <Textarea rows="6" value={props.envRefsText} onInput={(event) => props.onEnvRefsInput(event.currentTarget.value)} placeholder="OPENAI_API_KEY" />
      </DialogField>
      <DialogField label="Timeout seconds">
        <Input type="number" min="1" max={String(24 * 60 * 60)} value={String(props.timeoutSeconds)} onInput={(event) => props.onTimeoutInput(event.currentTarget.value)} />
      </DialogField>
      <label class={stylex.attrs(styles.networkLabel).class}>
        <input class={stylex.attrs(styles.marginTopXs).class} type="checkbox" checked={props.networkAccess} onInput={(event) => props.onNetworkAccessInput(event.currentTarget.checked)} />
        <div>
          <div class={stylex.attrs(styles.networkTitle).class}>Allow network access</div>
          <div class={stylex.attrs(styles.networkHelp).class}>Marks task unsafe. Leave off for repo-local commands.</div>
        </div>
      </label>
      </div>
    </DialogFormSection>
  );
}

function splitMultilineInput(value: string) {
  const entries = value
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  return entries.length > 0 ? entries : undefined;
}

function getReasoningStrengthDescription(strength: ComposerReasoningStrength) {
  switch (strength) {
    case "low":
      return "Fastest pass with minimal internal deliberation.";
    case "medium":
      return "Balanced depth for routine implementation and review.";
    case "high":
      return "Default stronger reasoning for most coding work.";
    case "extra-high":
      return "Heaviest reasoning budget for hard debugging and planning.";
  }
}

function formatReasoningStrengthLabel(strength: ComposerReasoningStrength) {
  switch (strength) {
    case "extra-high":
      return "Extra High";
    case "medium":
      return "Medium";
    case "low":
      return "Low";
    case "high":
    default:
      return "High";
  }
}

function formatReasoningOptionLabel(strength: ComposerReasoningStrength) {
  const label = formatReasoningStrengthLabel(strength);
  return strength === DEFAULT_COMPOSER_REASONING_STRENGTH ? `${label} (default)` : label;
}

function describeSchedulePreview(schedule: BackgroundJobSchedule | undefined) {
  if (!schedule) {
    return "Schedule preview waits for valid input.";
  }

  switch (schedule.type) {
    case "one-off":
      return `One-off run at ${formatShortTimestamp(schedule.runAt)}`;
    case "interval":
      return `Every ${schedule.intervalSeconds}s. Next run ${formatShortTimestamp(schedule.nextRunAt)}`;
    case "cron":
      return `Cron ${schedule.expression} in ${schedule.timezone}. Next run ${formatShortTimestamp(schedule.nextRunAt)}`;
  }
}

