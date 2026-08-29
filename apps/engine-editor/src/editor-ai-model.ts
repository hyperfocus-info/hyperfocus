import type { HarnessClientSnapshot, ServerEvent } from "@hyperfocus/ai-core";
import type { TranscriptMessage } from "@hyperfocus/ui";
import { validateCommandPlan, type EditorCommandPlan, type EditorCommandSnapshot } from "./editor-command-session.ts";

export type EditorAiViewContext = {
  workspace?: string;
  selectedEntityId?: string;
  activeSourcePath?: string;
};

export function transcriptFromSnapshot(snapshot: HarnessClientSnapshot): TranscriptMessage[] {
  const project = snapshot.workspace?.projects.find((candidate) => candidate.id === snapshot.workspace?.activeProjectId);
  return (project?.session.messages ?? []).map((message) => ({ id: message.id, role: message.role, content: visibleEditorMessageContent(message.content) }));
}

export function reduceTranscript(messages: readonly TranscriptMessage[], event: ServerEvent): TranscriptMessage[] {
  if (event.type === "chat.message-appended" || event.type === "thread.message-appended") {
    const message = event.payload.message;
    const reconciled = message.role === "user"
      ? messages.filter((candidate) => candidate.id !== `local-${event.requestId}`)
      : messages;
    return upsert(reconciled, { id: message.id, role: message.role, content: visibleEditorMessageContent(message.content) });
  }
  if (event.type === "chat.message-updated" || event.type === "thread.message-updated") {
    const message = event.payload.message;
    return upsert(messages, { id: message.id, role: message.role, content: visibleEditorMessageContent(message.content) });
  }
  if (event.type === "chat.delta") {
    const id = `stream-${event.requestId}`;
    const previous = messages.find((message) => message.id === id);
    return upsert(messages, { id, role: "assistant", content: `${previous?.content ?? ""}${event.payload.delta}`, pending: true });
  }
  if (event.type === "chat.complete") {
    const withoutStreams = messages.filter((message) => !message.id.startsWith("stream-"));
    const message = event.payload.assistantMessage;
    return upsert(withoutStreams, { id: message.id, role: message.role, content: message.content });
  }
  return [...messages];
}

export function visibleEditorMessageContent(content: string): string {
  const marker = "\n\nUser request: ";
  const index = content.lastIndexOf(marker);
  return content.startsWith("You are assisting inside the Hyperfocus editor.") && index >= 0 ? content.slice(index + marker.length) : content;
}

export function projectAwareEditorPrompt(content: string, snapshot?: EditorCommandSnapshot, view: EditorAiViewContext = {}): string {
  if (!snapshot) return content;
  const project = snapshot.project;
  let remainingEntities = 120;
  const scenes = project.scenes.slice(0, 16).map((scene) => {
    const entities = scene.entities.slice(0, remainingEntities).map((entity) => ({
      id: entity.id,
      label: entity.label,
      parentId: entity.parentId,
      kind: entity.kind,
      components: entity.components.slice(0, 16).map((component) => ({
        id: component.id,
        type: component.type,
        enabled: component.enabled,
        values: Object.fromEntries(Object.entries(component.values).slice(0, 32).map(([key, value]) => [key, typeof value === "string" ? value.slice(0, 512) : value])),
      })),
    }));
    remainingEntities -= entities.length;
    return { id: scene.id, name: scene.name, entities, omittedEntities: Math.max(0, scene.entities.length - entities.length) };
  });
  const context = {
    schema: "hyperfocus-editor-ai-context-v1",
    revision: snapshot.revision,
    dirty: snapshot.dirty,
    editor: {
      workspace: boundedText(view.workspace, 64),
      selectedEntityId: boundedText(view.selectedEntityId, 128),
      activeSourcePath: boundedText(view.activeSourcePath, 512),
    },
    project: {
      id: project.id,
      name: project.name,
      activeSceneId: project.activeSceneId,
      settings: { ...project.settings, input: project.settings.input.slice(0, 64).map((mapping) => ({ action: mapping.action, bindings: mapping.bindings.slice(0, 16) })) },
      assets: project.assets.slice(0, 100).map(({ id, name, kind, mimeType, size }) => ({ id, name, kind, mimeType, size })),
      scenes,
      omitted: { assets: Math.max(0, project.assets.length - 100), scenes: Math.max(0, project.scenes.length - 16), entities: Math.max(0, project.scenes.reduce((total, scene) => total + scene.entities.length, 0) - 120) },
      tilemap: { columns: project.tilemap.columns, rows: project.tilemap.rows, tileSize: project.tilemap.tileSize, solidValues: project.tilemap.solidValues },
      atlas: { sourceAssetId: project.atlas.sourceAssetId, frames: project.atlas.frames.slice(0, 100), sequence: project.atlas.sequence.slice(0, 200) },
      postProcessing: project.postProcessing,
      timeline: {
        fps: project.timeline.fps,
        durationFrames: project.timeline.durationFrames,
        loopStart: project.timeline.loopStart,
        loopEnd: project.timeline.loopEnd,
        tracks: project.timeline.tracks.slice(0, 64).map((track) => ({ ...track, keyframes: track.keyframes.slice(0, 256) })),
        events: project.timeline.events.slice(0, 256),
        omitted: { tracks: Math.max(0, project.timeline.tracks.length - 64), events: Math.max(0, project.timeline.events.length - 256) },
      },
      source: boundedProjectSource(project.extensions, view.activeSourcePath),
      extensions: project.extensions ? Object.keys(project.extensions) : [],
    },
  };
  return [
    "You are assisting inside the Hyperfocus editor. Treat the following bounded snapshot as read-only current context.",
    JSON.stringify(context),
    "If the user requests an editor change, you may propose only validated project.patch commands. Return them in one fenced `hyperfocus-command-plan` JSON block. Include `test` operations for values you depend on; never propose asset, starter, replace, history, or session commands. The user must explicitly Apply the proposal in the editor.",
    `User request: ${content}`,
  ].join("\n\n");
}

export function extractEditorPatchProposal(content: string): EditorCommandPlan | undefined {
  const source = content.match(/```hyperfocus-command-plan\s*([\s\S]*?)```/i)?.[1];
  if (!source) return undefined;
  let plan: unknown;
  try { plan = JSON.parse(source); }
  catch { return undefined; }
  try { validateCommandPlan(plan); }
  catch { return undefined; }
  if (!plan.commands.length || plan.commands.some((command) => {
    if (command.type !== "project.patch") return true;
    const hasMutation = command.operations.some((operation) => operation.op !== "test");
    const hasPrecondition = command.operations.some((operation) => operation.op === "test");
    return !hasMutation || !hasPrecondition;
  })) return undefined;
  return plan;
}

export function summarizeEditorPatchProposal(plan: EditorCommandPlan, maximum = 8): string[] {
  return plan.commands.flatMap((command) => command.type === "project.patch" ? command.operations.filter((operation) => operation.op !== "test").map((operation) => {
    if (operation.op === "remove") return `Remove ${operation.path}`;
    const serialized = JSON.stringify(operation.value);
    const preview = serialized.length > 96 ? `${serialized.slice(0, 93)}…` : serialized;
    return `${operation.op === "add" ? "Add" : "Change"} ${operation.path} → ${preview}`;
  }) : []).slice(0, Math.max(1, maximum));
}

function upsert(messages: readonly TranscriptMessage[], next: TranscriptMessage) {
  const index = messages.findIndex((message) => message.id === next.id);
  if (index < 0) return [...messages, next];
  return messages.map((message, messageIndex) => messageIndex === index ? next : message);
}

function boundedText(value: string | undefined, maximum: number) {
  return value ? value.slice(0, maximum) : undefined;
}

function boundedProjectSource(extensions: EditorCommandSnapshot["project"]["extensions"], requestedPath?: string) {
  const scripts = extensions?.hyperfocusScripts;
  if (!scripts || typeof scripts !== "object" || Array.isArray(scripts)) return undefined;
  const files = "files" in scripts && Array.isArray(scripts.files) ? scripts.files : [];
  const activePath = requestedPath || ("activePath" in scripts && typeof scripts.activePath === "string" ? scripts.activePath : undefined);
  const selected = files.find((file) => file && typeof file === "object" && !Array.isArray(file) && "path" in file && file.path === activePath);
  if (!selected || !("path" in selected) || !("source" in selected) || typeof selected.path !== "string" || typeof selected.source !== "string") return activePath ? { path: activePath, unavailable: true } : undefined;
  return { path: selected.path.slice(0, 512), source: selected.source.slice(0, 32_768), truncated: selected.source.length > 32_768 };
}
