import { editorSelect } from "../components/editor-select-controls";
import type { EditorEntityData, EditorProject } from "@hyperfocus/engine/project";
import { applyChoreographyRecipe2D, type ChoreographyRecipeId } from "./choreography-recipes.ts";

type AtlasClip = { id: string; name: string; sequence: string[]; fps: number; loop: boolean };

export type TimelineAuthoringPanelContext = {
  getTimeline(): EditorProject["timeline"];
  setTimeline(timeline: EditorProject["timeline"]): void;
  getFrame(): number;
  getSelectedEntity(): EditorEntityData | undefined;
  getSceneEntities(): readonly EditorEntityData[];
  getAtlasClips(): readonly AtlasClip[];
  getAtlasSourceAssetId(): string | undefined;
  enablePreview(frame?: number): void;
  clearKeySelection(): void;
  renderTimeline(): void;
  renderPreviews(): void;
  commit(label: string): void;
  formatTimecode(frame: number): string;
  log(message: string): void;
};

export function createTimelineAuthoringPanels(context: TimelineAuthoringPanelContext) {
  const clipName = (clipId: string) => context.getAtlasClips().find((clip) => clip.id === clipId)?.name ?? clipId;
  const clipTrack = (id?: string) => context.getTimeline().clipTracks?.find((track) => track.id === id);
  const selectedAtlasSprite = () => {
    const entity = context.getSelectedEntity();
    const sprite = entity?.components?.find((component) => component.enabled && component.type === "sprite");
    const assetId = sprite?.values.assetId ?? sprite?.values.asset;
    return entity && typeof assetId === "string" && assetId === context.getAtlasSourceAssetId() ? entity : undefined;
  };
  const nearestEntity = (primary: EditorEntityData) => context.getSceneEntities()
    .filter((entity) => entity.id !== primary.id && (entity.kind === "actor" || entity.kind === "hostile"))
    .sort((left, right) => Math.hypot(left.x - primary.x, left.y - primary.y) - Math.hypot(right.x - primary.x, right.y - primary.y))[0];

  const renderChoreographyPanel = (message?: string) => {
    const target = context.getSelectedEntity();
    const secondary = target ? nearestEntity(target) : undefined;
    setText("#choreography-target", target ? `TARGET · ${target.label}` : "SELECT AN ENTITY");
    setText("#choreography-status", message ?? (target ? secondary ? `Ready · contact partner ${secondary.label}` : "Ready · add another entity for Bite exchange" : "Select an entity on Stage or in the project tree."));
    document.querySelectorAll<HTMLButtonElement>("[data-choreography-recipe]").forEach((button) => { button.disabled = !target || (button.dataset.choreographyRecipe === "bite" && !secondary); });
  };

  const renderClipCuePanel = (message?: string) => {
    const select = editorSelect("#clip-cue-select");
    const button = required<HTMLButtonElement>("#set-clip-cue");
    const selected = selectedAtlasSprite();
    const clips = context.getAtlasClips();
    const previous = select.value;
    select.setOptions(clips.map(clip => ({ value: clip.id, label: `${clip.name} · ${clip.sequence.length} frames · ${clip.fps} fps` })));
    const cue = selected ? context.getTimeline().clipTracks?.find((track) => track.targetId === selected.id)?.keyframes.find((key) => key.frame === Math.round(context.getFrame())) : undefined;
    if (cue && clips.some((clip) => clip.id === cue.clipId)) select.value = cue.clipId;
    else if (clips.some((clip) => clip.id === previous)) select.value = previous;
    setText("#clip-cue-target", selected ? `TARGET · ${selected.label}` : "SELECT A SPRITE");
    select.disabled = !selected || !clips.length;
    button.disabled = select.disabled;
    setText("#clip-cue-status", message ?? (selected ? clips.length ? `Ready · frame ${Math.round(context.getFrame())}${cue ? ` currently ${clipName(cue.clipId)}` : " · component default until first cue"}` : "Create named clips in Atlas first." : "Select an entity whose sprite uses the current Atlas source."));
  };

  const setClipCueAtPlayhead = () => {
    const selected = selectedAtlasSprite();
    const clip = context.getAtlasClips().find((candidate) => candidate.id === editorSelect("#clip-cue-select").value);
    if (!selected || !clip) { renderClipCuePanel("Choose an Atlas sprite and named clip first."); return; }
    const timeline = context.getTimeline();
    timeline.clipTracks ??= [];
    let track = timeline.clipTracks.find((candidate) => candidate.targetId === selected.id);
    if (track?.locked) { renderClipCuePanel(`${track.label} is locked. Unlock it in Tracks first.`); return; }
    if (!track) { track = { id: `clip-${selected.id}-${Date.now().toString(36)}`, targetId: selected.id, label: `${selected.label} animation`, muted: false, locked: false, keyframes: [] }; timeline.clipTracks.push(track); }
    const frame = Math.round(context.getFrame());
    const existing = track.keyframes.find((key) => key.frame === frame);
    if (existing) existing.clipId = clip.id;
    else track.keyframes.push({ id: `clip-key-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, frame, clipId: clip.id });
    track.keyframes.sort((left, right) => left.frame - right.frame);
    context.enablePreview(); context.renderTimeline(); context.renderPreviews(); context.commit(`${existing ? "Change" : "Set"} sprite clip cue`);
    renderClipCuePanel(`${existing ? "Changed" : "Set"} ${clip.name} at ${context.formatTimecode(frame)} · holds until next cue.`);
  };

  const deleteClipKey = (trackId?: string, keyId?: string) => {
    const track = clipTrack(trackId);
    if (!track || track.locked || !track.keyframes.some((candidate) => candidate.id === keyId)) return;
    track.keyframes = track.keyframes.filter((candidate) => candidate.id !== keyId);
    context.renderTimeline(); context.commit("Delete sprite clip cue");
  };

  const applySelectedChoreographyRecipe = (recipe: ChoreographyRecipeId) => {
    const primary = context.getSelectedEntity();
    if (!primary) { renderChoreographyPanel("Select an entity before applying micro-motion."); return; }
    const secondary = recipe === "bite" ? nearestEntity(primary) : undefined;
    if (recipe === "bite" && !secondary) { renderChoreographyPanel("Bite exchange needs a second actor or hostile in this scene."); return; }
    try {
      const result = applyChoreographyRecipe2D({ timeline: context.getTimeline(), recipe, frame: Math.round(context.getFrame()), primary, secondary, id: `${recipe}-${Date.now().toString(36)}` });
      context.setTimeline({ ...context.getTimeline(), ...result.timeline }); context.enablePreview(result.contactFrame); context.clearKeySelection(); context.renderTimeline(); context.renderPreviews(); context.commit(`Apply ${recipe} choreography`);
      renderChoreographyPanel(`${recipe.toUpperCase()} · ${result.changedTrackIds.length} editable tracks · ${result.effectIds.length} effects · contact ${context.formatTimecode(result.contactFrame)}`);
      context.log(`choreography → ${recipe} · ${primary.label}${secondary ? ` → ${secondary.label}` : ""} · contact frame ${result.contactFrame}`);
    } catch (cause) { renderChoreographyPanel(cause instanceof Error ? cause.message : String(cause)); }
  };

  return { applySelectedChoreographyRecipe, clipName, clipTrack, deleteClipKey, renderChoreographyPanel, renderClipCuePanel, setClipCueAtPlayhead };
}

export type { ChoreographyRecipeId };

function required<T extends Element>(selector: string) {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Timeline authoring markup is missing ${selector}`);
  return element;
}

function setText(selector: string, value: string) { required<HTMLElement>(selector).textContent = value; }
