import { resolveModeCatalog } from "@hyperfocus/ai-core/modes";
import {
createAssistantAssetRefId,
createAssistantId,
createRequestId,
type Assistant,
type AssistantAssetRef,
type ComposerReasoningStrength,
type ProviderBrand,
} from "@hyperfocus/ai-core/protocol";
import { Input } from "@hyperfocus/ui";
import { tokens } from "@hyperfocus/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import {
Bot,
Brain,
Cpu,
FolderOpen,
Gauge,
Globe,
Split,
} from "lucide-solid";
import { Show,createEffect,createMemo,createSignal } from "solid-js";
import {
COMPOSER_REASONING_STRENGTHS,
DEFAULT_COMPOSER_REASONING_STRENGTH,
getComposerControlState,
getExecutionModelOptionsForAgent,
harnessStore,
type AssistantEditorDraft,
} from "../harness-store";
import { pushToast } from "../toast-store";
import { assistantUtilityStyles } from "./assistants-panel.styles";
import { assistantAssetKinds,isAssistantAssetKind } from "./assistants/state/asset-kinds";
import { ModelSelect } from "./models/model-select";
import { Button } from "./primitives/button";
import { Dialog } from "./primitives/dialog";
import { DropdownControl } from "./primitives/dropdown";
import {
getAgentDropdownIcon,
getModeDropdownIcon,
} from "./primitives/dropdown-option-icons";
import {
DialogField,
DialogFormSection,
DialogInlineNote,
} from "./primitives/form-layout";
import { Textarea } from "./primitives/textarea";

const editorStyles = stylex.create({
  dialog: { maxWidth: "52rem" },
  grid: { gap: tokens.space3, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 15rem), 1fr))", },
  disclosure: { borderTopColor: tokens.border, borderTopStyle: "solid", borderTopWidth: "1px", minWidth: 0, paddingTop: tokens.space3, },
  summary: { paddingBlock: tokens.space2, color: tokens.foreground, cursor: "pointer", fontSize: tokens.fontControl, fontWeight: 600, outlineColor: tokens.focus, minHeight: "2.25rem", },
});


function createAssistantEditorFields() {
  const [name, setName] = createSignal("");
  const [scope, setScope] = createSignal<Assistant["scope"]>("project");
  const [projectId, setProjectId] = createSignal<string>();
  const [description, setDescription] = createSignal("");
  const [personalityPrompt, setPersonalityPrompt] = createSignal("");
  const [jobPrompt, setJobPrompt] = createSignal("");
  const [agentId, setAgentId] = createSignal<Assistant["agentId"]>("pi");
  const [providerBrand, setProviderBrand] = createSignal<ProviderBrand>("gpt");
  const [modeId, setModeId] = createSignal("");
  const [executionModelId, setExecutionModelId] = createSignal("");
  const [reasoningStrength, setReasoningStrength] = createSignal<ComposerReasoningStrength>(DEFAULT_COMPOSER_REASONING_STRENGTH);
  const [fastMode, setFastMode] = createSignal(false);
  const [assetRefsText, setAssetRefsText] = createSignal("");
  return {
    name, setName, scope, setScope, projectId, setProjectId, description, setDescription,
    personalityPrompt, setPersonalityPrompt, jobPrompt, setJobPrompt, agentId, setAgentId,
    providerBrand, setProviderBrand, modeId, setModeId, executionModelId, setExecutionModelId,
    reasoningStrength, setReasoningStrength, fastMode, setFastMode, assetRefsText, setAssetRefsText
  };
}

function registerAssistantEditorActions(options: {
  state: typeof harnessStore.state;
  sendCommand: typeof harnessStore.actions.sendCommand;
  fields: ReturnType<typeof createAssistantEditorFields>;
}) {
  const { state, fields } = options;
  const activeDraft = () => state.assistantEditorDraft;
  const seedFromDraft = (draft: AssistantEditorDraft) => {
    fields.setName(draft.name);
    fields.setScope(draft.scope);
    fields.setProjectId(draft.projectId ?? state.workspace.activeProjectId ?? state.workspace.projects[0]?.id);
    fields.setDescription(draft.description);
    fields.setPersonalityPrompt(draft.personalityPrompt);
    fields.setJobPrompt(draft.jobPrompt);
    fields.setAgentId(draft.agentId);
    fields.setProviderBrand(draft.providerBrand ?? state.providerBrand);
    fields.setModeId(draft.modeId ?? "");
    fields.setExecutionModelId(draft.executionModelId ?? "");
    fields.setReasoningStrength(draft.reasoningStrength ?? DEFAULT_COMPOSER_REASONING_STRENGTH);
    fields.setFastMode(Boolean(draft.fastMode));
    fields.setAssetRefsText(draft.assetRefsText);
  };
  createEffect(() => {
    const draft = activeDraft();
    if (state.assistantEditorOpen && draft) seedFromDraft(draft);
  });
  const handleClose = () => harnessStore.closeAssistantEditor();
  const handleSave = () => {
    const draft = activeDraft();
    if (!draft) return;
    const trimmedName = fields.name().trim();
    if (!trimmedName) {
      pushToast("Assistant name required", "Give assistant short visible name.", "error");
      return;
    }
    if (!fields.personalityPrompt().trim() || !fields.jobPrompt().trim()) {
      pushToast("Assistant prompts required", "Fill personality and job prompts before saving.", "error");
      return;
    }
    if (fields.scope() === "project" && !fields.projectId()) {
      pushToast("Project required", "Project-scoped assistant needs target project.", "error");
      return;
    }
    const assistantId = draft.assistantId ?? createAssistantId();
    const now = new Date().toISOString();
    const parsedAssetRefs = parseAssetRefs(fields.assetRefsText(), assistantId);
    if ("error" in parsedAssetRefs) {
      pushToast("Asset refs invalid", parsedAssetRefs.error, "error");
      return;
    }
    const existingAssistant = state.assistants.assistants.find((entry) => entry.id === assistantId);
    const assistant: Assistant = {
      id: assistantId,
      name: trimmedName,
      scope: fields.scope(),
      projectId: fields.scope() === "project" ? fields.projectId() : undefined,
      description: fields.description().trim() || undefined,
      personalityPrompt: fields.personalityPrompt().trim(),
      jobPrompt: fields.jobPrompt().trim(),
      agentId: fields.agentId(),
      providerBrand: fields.providerBrand(),
      modeId: fields.modeId().trim() || undefined,
      executionModelId: fields.executionModelId().trim() || undefined,
      reasoningStrength: fields.reasoningStrength(),
      fastMode: fields.fastMode(),
      runState: existingAssistant?.runState ?? draft.runState,
      bootstrapState: existingAssistant?.bootstrapState ?? draft.bootstrapState,
      clonedFromAssistantId: existingAssistant?.clonedFromAssistantId,
      failureStreakCount: existingAssistant?.failureStreakCount ?? 0,
      circuitBreakerState: existingAssistant?.circuitBreakerState ?? "closed",
      circuitBreakerReason: existingAssistant?.circuitBreakerReason,
      deletedAt: undefined,
      latestActivityAt: existingAssistant?.latestActivityAt ?? now,
      unreadQuestionCount: existingAssistant?.unreadQuestionCount ?? 0,
      createdAt: existingAssistant?.createdAt ?? now,
      updatedAt: now,
    };
    options.sendCommand({
      type: draft.source === "edit" ? "assistant.update" : "assistant.create",
      requestId: createRequestId(),
      payload: { assistant, assetRefs: parsedAssetRefs.value },
    });
    handleClose();
  };
  return { activeDraft, handleClose, handleSave };
}

function assistantEditorIcon(kind: "brain" | "cpu" | "folder" | "globe" | "gauge" | "split") {
  const className = stylex.attrs(assistantUtilityStyles.h3, assistantUtilityStyles.w3).class;
  if (kind === "brain") return <Brain class={className} />;
  if (kind === "folder") return <FolderOpen class={className} />;
  if (kind === "globe") return <Globe class={className} />;
  if (kind === "gauge") return <Gauge class={className} />;
  if (kind === "split") return <Split class={className} />;
  return <Cpu class={className} />;
}

function createAssistantCatalogOptions(
  state: typeof harnessStore.state,
  fields: ReturnType<typeof createAssistantEditorFields>,
) {
  const availableModes = createMemo(() =>
    resolveModeCatalog(
      state.workspace.workspaceModes,
      state.workspace.projects.find((project) => project.id === fields.projectId())?.projectModes ?? [],
    ),
  );
  const agentOptions = createMemo(() => state.availableAgents.map((agent) => ({
    value: agent.id,
    label: agent.label,
    description: agent.description,
    icon: getAgentDropdownIcon(agent.id),
  })));
  const scopeOptions = () => [
    { value: "project", label: "Current project", description: "Assistant stays scoped to one project.", icon: assistantEditorIcon("folder") },
    { value: "global", label: "Global", description: "Assistant stays available across workspace.", icon: assistantEditorIcon("globe") },
  ];
  const projectOptions = createMemo(() => state.workspace.projects.map((project) => ({
    value: project.id,
    label: project.name,
    description: project.rootPath,
    icon: assistantEditorIcon("folder"),
  })));
  const providerOptions = () => [
    { value: "gpt", label: "GPT", description: "OpenAI-hosted model family.", icon: assistantEditorIcon("cpu") },
    { value: "gemini", label: "Gemini", description: "Google-hosted model family.", icon: assistantEditorIcon("cpu") },
    { value: "claude", label: "Claude", description: "Anthropic-hosted model family.", icon: assistantEditorIcon("cpu") },
  ];
  const modeOptions = createMemo(() => [
    { value: "", label: "Default", description: "Use workspace or project default mode.", icon: assistantEditorIcon("split") },
    ...availableModes().map((mode) => ({
      value: mode.id,
      label: mode.label,
      description: mode.description,
      icon: getModeDropdownIcon(mode.id),
    })),
  ]);
  return { agentOptions, scopeOptions, projectOptions, providerOptions, modeOptions };
}

function createAssistantExecutionOptions(
  state: typeof harnessStore.state,
  fields: ReturnType<typeof createAssistantEditorFields>,
) {
  const executionModelOptions = createMemo(() => {
    const options = getExecutionModelOptionsForAgent(state, fields.agentId(), fields.providerBrand());
    const currentModel = fields.executionModelId().trim();
    const knownOptions = options.map((model) => ({
      value: model.modelId,
      label: model.label,
      description: model.modelId,
      icon: assistantEditorIcon("cpu"),
    }));
    return [
      { value: "", label: "Default", description: "Use runtime default model.", icon: assistantEditorIcon("cpu") },
      ...(currentModel && !knownOptions.some((option) => option.value === currentModel)
        ? [{ value: currentModel, label: currentModel, description: "Saved custom model.", icon: assistantEditorIcon("cpu") }]
        : []),
      ...knownOptions,
    ];
  });
  const composerControlState = createMemo(() =>
    getComposerControlState(state, fields.agentId(), fields.executionModelId().trim() || undefined),
  );
  const reasoningOptions = createMemo(() => COMPOSER_REASONING_STRENGTHS.map((strength) => ({
    value: strength,
    label: formatReasoningOptionLabel(strength),
    description: getReasoningStrengthDescription(strength),
    disabled: !composerControlState().availableStrengths.includes(strength),
    icon: assistantEditorIcon("brain"),
  })));
  const fastModeOptions = createMemo(() => [
    { value: "false", label: "Off", description: "Use standard response path.", icon: assistantEditorIcon("gauge") },
    { value: "true", label: "On", description: "Prefer lower-latency responses when supported.", disabled: !composerControlState().supportsFastMode, icon: assistantEditorIcon("gauge") },
  ]);
  return { executionModelOptions, reasoningOptions, fastModeOptions };
}

function assistantEditorControlIcon(kind: "bot" | "brain" | "cpu" | "gauge" | "globe" | "folder" | "split") {
  const className = stylex.attrs(assistantUtilityStyles.h35, assistantUtilityStyles.w35).class;
  if (kind === "bot") return <Bot class={className} />;
  if (kind === "brain") return <Brain class={className} />;
  if (kind === "folder") return <FolderOpen class={className} />;
  if (kind === "gauge") return <Gauge class={className} />;
  if (kind === "globe") return <Globe class={className} />;
  if (kind === "split") return <Split class={className} />;
  return <Cpu class={className} />;
}

function AssistantCatalogFields(props: {
  fields: ReturnType<typeof createAssistantEditorFields>;
  options: ReturnType<typeof createAssistantCatalogOptions>;
}) {
  const { fields, options } = props;
  return (
    <>
      <div class={stylex.attrs(editorStyles.grid).class}>
        <DialogField label="Agent runtime">
          <DropdownControl
            kind="select"
            ariaLabel="Select assistant runtime"
            icon={assistantEditorControlIcon("bot")}
            size="md"
            class={stylex.attrs(assistantUtilityStyles.wFull).class}
            value={fields.agentId()}
            options={options.agentOptions()}
            onChange={(value) => {
              if (value === "pi" || value === "copilot-cli" || value === "codex-cli") fields.setAgentId(value);
            }}
          />
        </DialogField>
      </div>
      <div class={stylex.attrs(editorStyles.grid).class}>
        <DialogField label="Scope">
          <DropdownControl
            kind="select"
            ariaLabel="Select assistant scope"
            icon={assistantEditorControlIcon("globe")}
            size="md"
            class={stylex.attrs(assistantUtilityStyles.wFull).class}
            value={fields.scope()}
            options={options.scopeOptions()}
            onChange={(value) => {
              if (value === "project" || value === "global") fields.setScope(value);
            }}
          />
        </DialogField>
        <Show when={fields.scope() === "project"}>
          <DialogField label="Project">
            <DropdownControl
              kind="select"
              ariaLabel="Select project"
              icon={assistantEditorControlIcon("folder")}
              size="md"
              class={stylex.attrs(assistantUtilityStyles.wFull).class}
              value={fields.projectId() ?? ""}
              options={options.projectOptions()}
              onChange={(value) => fields.setProjectId(value || undefined)}
            />
          </DialogField>
        </Show>
        <DialogField label="Provider">
          <DropdownControl
            kind="select"
            ariaLabel="Select assistant provider"
            icon={assistantEditorControlIcon("cpu")}
            size="md"
            class={stylex.attrs(assistantUtilityStyles.wFull).class}
            value={fields.providerBrand()}
            options={options.providerOptions()}
            onChange={(value) => {
              if (value === "gpt" || value === "gemini" || value === "claude") fields.setProviderBrand(value);
            }}
          />
        </DialogField>
        <DialogField label="Mode">
          <DropdownControl
            kind="select"
            ariaLabel="Select assistant mode"
            icon={assistantEditorControlIcon("split")}
            size="md"
            class={stylex.attrs(assistantUtilityStyles.wFull).class}
            value={fields.modeId()}
            options={options.modeOptions()}
            onChange={fields.setModeId}
          />
        </DialogField>
      </div>
    </>
  );
}

function AssistantExecutionFields(props: {
  fields: ReturnType<typeof createAssistantEditorFields>;
  options: ReturnType<typeof createAssistantExecutionOptions>;
}) {
  const { fields, options } = props;
  return (
    <>
      <div class={stylex.attrs(editorStyles.grid).class}>
        <DialogField label="Execution model">
          <ModelSelect
            ariaLabel="Select assistant execution model"
            icon={assistantEditorControlIcon("cpu")}
            size="md"
            class={stylex.attrs(assistantUtilityStyles.wFull).class}
            value={fields.executionModelId()}
            options={options.executionModelOptions()}
            onChange={fields.setExecutionModelId}
          />
        </DialogField>
        <DialogField label="Effort">
          <DropdownControl
            kind="select"
            ariaLabel="Select assistant reasoning effort"
            icon={assistantEditorControlIcon("brain")}
            size="md"
            class={stylex.attrs(assistantUtilityStyles.wFull).class}
            value={fields.reasoningStrength()}
            options={options.reasoningOptions()}
            onChange={(value) => {
              if (value === "low" || value === "medium" || value === "high" || value === "extra-high") {
                fields.setReasoningStrength(value);
              }
            }}
          />
        </DialogField>
        <DialogField label="Fast mode">
          <DropdownControl
            kind="select"
            ariaLabel="Select assistant fast mode"
            icon={assistantEditorControlIcon("gauge")}
            size="md"
            class={stylex.attrs(assistantUtilityStyles.wFull).class}
            value={fields.fastMode() ? "true" : "false"}
            options={options.fastModeOptions()}
            onChange={(value) => fields.setFastMode(value === "true")}
          />
        </DialogField>
      </div>

    </>
  );
}

export function AssistantEditorDialog() {
  const state = harnessStore.state;
  const sendCommand = harnessStore.actions.sendCommand;
  const fields = createAssistantEditorFields();
  const {
    name, setName, scope, description, setDescription, personalityPrompt, setPersonalityPrompt,
    jobPrompt, setJobPrompt, assetRefsText, setAssetRefsText,
  } = fields;

  const catalogOptions = createAssistantCatalogOptions(state, fields);
  const executionOptions = createAssistantExecutionOptions(state, fields);
  const { activeDraft, handleClose, handleSave } = registerAssistantEditorActions({ state, sendCommand, fields });

  return (
    <Dialog
      open={state.assistantEditorOpen}
      onClose={handleClose}
      title={
        activeDraft()?.source === "edit" ? "Edit assistant" : "Create assistant"
      }
      eyebrow="Assistants"
      description="Define role, prompts, scope, and linked skills/scripts."
      class={stylex.attrs(editorStyles.dialog).class}
      contentClass={stylex.attrs(assistantUtilityStyles.gap5).class}
      footer={
        <>
          <Button
            tooltip="Close assistant editor without saving"
            variant="ghost"
            onClick={handleClose}
          >
            Cancel
          </Button>
          <Button
            tooltip={
              activeDraft()?.source === "edit"
                ? "Save assistant changes"
                : "Create assistant"
            }
            onClick={handleSave}
          >
            {activeDraft()?.source === "edit"
              ? "Save assistant"
              : "Create assistant"}
          </Button>
        </>
      }
    >
      <DialogFormSection title="Purpose" description="Name and both prompts are required. Configuration can be adjusted below.">
        <DialogField label="Name">
          <Input value={name()} onInput={event => setName(event.currentTarget.value)} placeholder="Release reviewer" required />
        </DialogField>
        <DialogField label="Description">
          <Textarea rows="2" value={description()} onInput={event => setDescription(event.currentTarget.value)} placeholder="Short purpose summary (optional)." />
        </DialogField>
      </DialogFormSection>
      <DialogFormSection
        title="Prompts"
        description="Separate communication style from recurring work instructions."
      >
        <div
          class={
            stylex.attrs(editorStyles.grid).class
          }
        >
          <DialogField label="Personality prompt">
            <Textarea
              rows="5"
              value={personalityPrompt()}
              onInput={(event) =>
                setPersonalityPrompt(event.currentTarget.value)
              }
              placeholder="Voice, temperament, communication style."
            />
          </DialogField>

          <DialogField label="Job prompt">
            <Textarea
              rows="5"
              value={jobPrompt()}
              onInput={(event) => setJobPrompt(event.currentTarget.value)}
              placeholder="Role, success criteria, research mandate, proactive work rules."
            />
          </DialogField>
        </div>
      </DialogFormSection>

      <details class={stylex.attrs(editorStyles.disclosure).class}>
        <summary class={stylex.attrs(editorStyles.summary).class}>Execution and scope Â· {scope() === "global" ? "All projects" : "Current project"}</summary>
        <DialogFormSection title="Execution and scope" description="Choose ownership, runtime and model defaults.">
          <AssistantCatalogFields fields={fields} options={catalogOptions} />
          <AssistantExecutionFields fields={fields} options={executionOptions} />
        </DialogFormSection>
      </details>
      <details class={stylex.attrs(editorStyles.disclosure).class}>
        <summary class={stylex.attrs(editorStyles.summary).class}>Linked assets (optional)</summary>
      <DialogFormSection
        title="Linked assets"
        description="Attach reusable skills, scripts, modes, or background templates."
      >
        <DialogField label="Asset refs">
          <Textarea
            rows="5"
            value={assetRefsText()}
            onInput={(event) => setAssetRefsText(event.currentTarget.value)}
            placeholder={
              "skill | grill-me | .agents/skills/grill-me/SKILL.md\nscript | bootstrap | scripts/bootstrap.ts"
            }
          />
        </DialogField>
        <DialogInlineNote>
          One ref per line. Format: <code>kind | label | value</code>. Kinds:{" "}
          {assistantAssetKinds.join(", ")}.
        </DialogInlineNote>
      </DialogFormSection>
      </details>
    </Dialog>
  );
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
  return strength === DEFAULT_COMPOSER_REASONING_STRENGTH
    ? `${label} (default)`
    : label;
}

function parseAssetRefs(input: string, assistantId: string) {
  const lines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const value: AssistantAssetRef[] = [];
  for (const [index, line] of lines.entries()) {
    const parts = line.split("|").map((part) => part.trim());
    if (parts.length !== 3) {
      return {
        error: `Line ${index + 1} must use: kind | label | value`,
      } as const;
    }

    const [kind, label, refValue] = parts;
    if (!isAssistantAssetKind(kind)) {
      return { error: `Line ${index + 1} has invalid kind: ${kind}` } as const;
    }
    if (!label || !refValue) {
      return {
        error: `Line ${index + 1} must include non-empty label and value`,
      } as const;
    }

    value.push({
      id: createAssistantAssetRefId(),
      assistantId,
      kind,
      label,
      value: refValue,
      resolutionStatus: "resolved",
      createdAt: new Date().toISOString(),
    });
  }

  return { value } as const;
}
