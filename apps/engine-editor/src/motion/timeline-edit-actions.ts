import type { EditorClipTrack, EditorProject, EditorTimelineTrack } from "@hyperfocus/engine/project";
import { openTimelineLocalMenu } from "./timeline-local-menu.ts";

type KeySelection = { trackId: string; keyId: string };
type Context = {
  getTimeline(): EditorProject["timeline"];
  setTimeline(timeline: EditorProject["timeline"]): void;
  track(id?: string): EditorTimelineTrack | undefined;
  clipTrack(id?: string): EditorClipTrack | undefined;
  clipName(id: string): string;
  deleteClipKey(trackId?: string, keyId?: string): void;
  selectedKeys: Map<string, KeySelection>;
  setFrame(frame: number): void;
  clampFrame(frame: number): number;
  renderTimeline(): void;
  renderClipPanel(): void;
  commit(label: string): void;
  copyKeys(): void;
  deleteKeys(): void;
  setReadout(message: string): void;
};

export function createTimelineEditActions(context: Context) {
  const editTrack = (action?: string, trackId?: string) => {
    const track = context.track(trackId);
    if (!track) return;
    const timeline = context.getTimeline();
    if (action === "rename") {
      const label = globalThis.prompt?.("Track name", track.label)?.trim();
      if (!label || label === track.label) return;
      track.label = label.slice(0, 160); context.renderTimeline(); context.commit("Rename animation track"); return;
    }
    if (action === "duplicate") {
      const index = timeline.tracks.indexOf(track); const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const copy: EditorTimelineTrack = { ...structuredClone(track), id: `${track.id}-copy-${suffix}`, label: `${track.label} copy`, keyframes: track.keyframes.map((key) => ({ ...key, id: `${key.id}-copy-${suffix}` })) };
      timeline.tracks.splice(index + 1, 0, copy); context.renderTimeline(); context.commit("Duplicate animation track"); return;
    }
    if (action === "delete" && globalThis.confirm?.(`Delete ${track.label} and its ${track.keyframes.length} key${track.keyframes.length === 1 ? "" : "s"}?`) === true) {
      timeline.tracks = timeline.tracks.filter((candidate) => candidate.id !== track.id);
      for (const [keyId, selection] of context.selectedKeys) if (selection.trackId === track.id) context.selectedKeys.delete(keyId);
      context.renderTimeline(); context.commit("Delete animation track");
    }
  };

  const openClipKeyMenu = (event: MouseEvent, trackId?: string, keyId?: string) => {
    const track = context.clipTrack(trackId); const key = track?.keyframes.find((candidate) => candidate.id === keyId);
    if (!track || !key) return;
    event.preventDefault();
    openTimelineLocalMenu(event.clientX, event.clientY, [
      { label: `Go to ${context.clipName(key.clipId)} cue`, run: () => { context.setFrame(key.frame); required<HTMLSelectElement>("#clip-cue-select").value = key.clipId; context.renderClipPanel(); } },
      { label: "Delete clip cue", danger: true, run: () => context.deleteClipKey(track.id, key.id) },
    ]);
  };

  const openEventMenu = (event: MouseEvent, eventId?: string) => {
    const timeline = context.getTimeline(); const marker = timeline.events.find((candidate) => candidate.id === eventId);
    if (!marker) return;
    event.preventDefault();
    openTimelineLocalMenu(event.clientX, event.clientY, [
      { label: "Edit event…", run: () => {
        const label = globalThis.prompt?.("Event label", marker.label)?.trim();
        if (!label) return;
        const kind = globalThis.prompt?.("Event kind: marker, audio, logic, or camera", marker.kind)?.trim().toLowerCase();
        if (kind !== "marker" && kind !== "audio" && kind !== "logic" && kind !== "camera") { context.setReadout("Event kind was not changed · choose marker, audio, logic, or camera"); return; }
        marker.label = label.slice(0, 160); marker.kind = kind; context.renderTimeline(); context.commit("Edit animation event");
      } },
      { label: "Duplicate event", run: () => { timeline.events.push({ ...marker, id: `${marker.id}-copy-${Date.now().toString(36)}`, frame: context.clampFrame(marker.frame + 1) }); context.renderTimeline(); context.commit("Duplicate animation event"); } },
      { label: "Delete event", danger: true, run: () => { timeline.events = timeline.events.filter((candidate) => candidate.id !== marker.id); context.renderTimeline(); context.commit("Delete animation event"); } },
    ]);
  };

  const openEffectMenu = (event: MouseEvent, effectId?: string) => {
    const timeline = context.getTimeline(); const effect = timeline.effects?.find((candidate) => candidate.id === effectId);
    if (!effect) return;
    event.preventDefault();
    openTimelineLocalMenu(event.clientX, event.clientY, [
      { label: "Edit timing and strength…", run: () => {
        const duration = Number(globalThis.prompt?.("Effect duration in frames", String(effect.durationFrames)));
        const intensity = Number(globalThis.prompt?.("Effect intensity", String(effect.intensity)));
        if (!Number.isFinite(duration) || duration < 1 || !Number.isFinite(intensity) || intensity < 0 || intensity > 100) { context.setReadout("Effect unchanged · duration must be at least 1 frame and intensity 0–100"); return; }
        effect.durationFrames = Math.max(1, Math.min(timeline.durationFrames, Math.round(duration))); effect.intensity = intensity;
        context.renderTimeline(); context.commit("Edit timeline effect");
      } },
      { label: "Duplicate effect", run: () => { timeline.effects ??= []; timeline.effects.push({ ...effect, id: `${effect.id}-copy-${Date.now().toString(36)}`, frame: context.clampFrame(effect.frame + 1) }); context.renderTimeline(); context.commit("Duplicate timeline effect"); } },
      { label: "Delete effect", danger: true, run: () => { timeline.effects = timeline.effects?.filter((candidate) => candidate.id !== effect.id); context.renderTimeline(); context.commit("Delete timeline effect"); } },
    ]);
  };

  const openKeyMenu = (event: MouseEvent, trackId?: string, keyId?: string) => {
    const track = context.track(trackId); const key = track?.keyframes.find((candidate) => candidate.id === keyId);
    if (!track || !key) return;
    event.preventDefault();
    if (!context.selectedKeys.has(key.id)) { context.selectedKeys.clear(); context.selectedKeys.set(key.id, { trackId: track.id, keyId: key.id }); context.renderTimeline(); }
    openTimelineLocalMenu(event.clientX, event.clientY, [
      { label: "Copy selected keys", run: context.copyKeys },
      { label: "Delete selected keys", danger: true, run: context.deleteKeys },
    ]);
  };

  return { editTrack, openClipKeyMenu, openEffectMenu, openEventMenu, openKeyMenu };
}

function required<T extends Element>(selector: string) {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Timeline edit markup is missing ${selector}`);
  return element;
}
