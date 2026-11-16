import { uniqueId, type EditorProject } from "@hyperfocus/engine/project";

type EditorAtlasFrame = EditorProject["atlas"]["frames"][number];

type AtlasPlaybackFrame = Pick<EditorAtlasFrame, "id" | "x" | "y" | "width" | "height">;
type AtlasPlaybackClip = { id: string; sequence: readonly string[]; fps: number; loop: boolean };

/** Pixel-aligned creation shared by pointer slicing and its visible coordinate form. */
export function addEditorAtlasFrame(project: EditorProject, options: { x: number; y: number; width: number; height: number; imageWidth: number; imageHeight: number }): EditorAtlasFrame {
  for (const key of ["x", "y", "width", "height"] as const) {
    if (!Number.isSafeInteger(options[key]) || options[key] < (key === "x" || key === "y" ? 0 : 1)) throw new Error("Enter whole pixel coordinates and positive frame dimensions.");
  }
  if (options.x + options.width > options.imageWidth || options.y + options.height > options.imageHeight) throw new Error("Keep the rectangle inside the source image.");
  const frame = { id: uniqueId("frame"), name: `Frame ${project.atlas.frames.length + 1}`, x: options.x, y: options.y, width: options.width, height: options.height, color: "#ffffff" };
  project.atlas.frames.push(frame);
  return frame;
}

/** Pure frame sampler shared by editor scrub/export and the standalone runtime. */
export function sampleAtlasClipFrame(options: {
  frames: readonly AtlasPlaybackFrame[];
  sequence: readonly string[];
  clips?: readonly AtlasPlaybackClip[];
  defaultClipId?: string;
  requestedClipId?: string;
  playbackSpeed?: number;
  timeSeconds: number;
}) {
  const clip = options.clips?.find((candidate) => candidate.id === options.requestedClipId)
    ?? options.clips?.find((candidate) => candidate.id === options.defaultClipId);
  const sequence = clip?.sequence.length ? clip.sequence : options.sequence;
  if (!sequence.length) return undefined;
  const rawIndex = Math.max(0, Math.floor(options.timeSeconds * (clip?.fps ?? ((options.playbackSpeed ?? 1) * 8))));
  const index = clip && !clip.loop ? Math.min(sequence.length - 1, rawIndex) : rawIndex % sequence.length;
  return options.frames.find((frame) => frame.id === sequence[index]);
}

export function sliceEditorAtlasGrid(project: EditorProject, options: { imageWidth: number; imageHeight: number; frameWidth: number; frameHeight: number; margin?: number; spacing?: number }): number {
  for (const [label, value] of Object.entries(options)) if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error(`Atlas ${label} must be a non-negative finite number.`);
  if (!Number.isInteger(options.imageWidth) || !Number.isInteger(options.imageHeight) || !Number.isInteger(options.frameWidth) || !Number.isInteger(options.frameHeight) || options.frameWidth < 1 || options.frameHeight < 1) throw new Error("Atlas image and frame dimensions must be positive integers.");
  const margin = Math.floor(options.margin ?? 0);
  const spacing = Math.floor(options.spacing ?? 0);
  const columns = Math.floor((options.imageWidth - margin * 2 + spacing) / (options.frameWidth + spacing));
  const rows = Math.floor((options.imageHeight - margin * 2 + spacing) / (options.frameHeight + spacing));
  const count = Math.max(0, columns) * Math.max(0, rows);
  if (!count) throw new Error("The selected frame size does not fit inside this image.");
  if (count > 10_000) throw new Error("Atlas slicing would create more than 10,000 frames.");
  project.atlas.frameWidth = options.frameWidth;
  project.atlas.frameHeight = options.frameHeight;
  project.atlas.frames = [];
  for (let row = 0; row < rows; row += 1) for (let column = 0; column < columns; column += 1) {
    const index = row * columns + column;
    project.atlas.frames.push({
      id: uniqueId(`frame-${index + 1}`),
      name: `Frame ${index + 1}`,
      x: margin + column * (options.frameWidth + spacing),
      y: margin + row * (options.frameHeight + spacing),
      width: options.frameWidth,
      height: options.frameHeight,
      color: "#ffffff",
    });
  }
  project.atlas.sequence = project.atlas.frames.map((frame) => frame.id);
  project.atlas.clips = [{ id: "default", name: "Default", sequence: [...project.atlas.sequence], fps: project.atlas.playbackSpeed * 8, loop: true }];
  project.atlas.defaultClipId = "default";
  return count;
}

export function reorderEditorAtlasFrame(project: EditorProject, frameId: string, targetIndex: number): void {
  if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= project.atlas.frames.length) throw new Error("Atlas frame target index is out of range.");
  const index = project.atlas.frames.findIndex((frame) => frame.id === frameId);
  if (index < 0) throw new Error(`Atlas frame does not exist: ${frameId}`);
  const [frame] = project.atlas.frames.splice(index, 1);
  project.atlas.frames.splice(targetIndex, 0, frame);
  const sequenceIndex = project.atlas.sequence.indexOf(frameId);
  if (sequenceIndex >= 0) {
    project.atlas.sequence.splice(sequenceIndex, 1);
    project.atlas.sequence.splice(Math.min(targetIndex, project.atlas.sequence.length), 0, frameId);
  }
}

export function removeEditorAtlasFrame(project: EditorProject, frameId: string): void {
  const before = project.atlas.frames.length;
  project.atlas.frames = project.atlas.frames.filter((frame) => frame.id !== frameId);
  if (project.atlas.frames.length === before) throw new Error(`Atlas frame does not exist: ${frameId}`);
  project.atlas.sequence = project.atlas.sequence.filter((id) => id !== frameId);
  for (const clip of project.atlas.clips ?? []) clip.sequence = clip.sequence.filter((id) => id !== frameId);
}

export function duplicateEditorAtlasFrame(project: EditorProject, frameId: string): EditorAtlasFrame {
  const index = project.atlas.frames.findIndex((frame) => frame.id === frameId);
  if (index < 0) throw new Error(`Atlas frame does not exist: ${frameId}`);
  const source = project.atlas.frames[index]!;
  const copy = { ...source, id: uniqueId(`${frameId}-copy`), name: `${source.name} copy` };
  project.atlas.frames.splice(index + 1, 0, copy);
  const sequenceIndex = project.atlas.sequence.indexOf(frameId);
  if (sequenceIndex >= 0) project.atlas.sequence.splice(sequenceIndex + 1, 0, copy.id);
  for (const clip of project.atlas.clips ?? []) {
    const clipIndex = clip.sequence.indexOf(frameId);
    if (clipIndex >= 0) clip.sequence.splice(clipIndex + 1, 0, copy.id);
  }
  return copy;
}

export function updateEditorAtlasFrame(
  project: EditorProject,
  frameId: string,
  patch: Partial<Pick<EditorAtlasFrame, "name" | "x" | "y" | "width" | "height" | "color">>,
): void {
  const frame = project.atlas.frames.find((candidate) => candidate.id === frameId);
  if (!frame) throw new Error(`Atlas frame does not exist: ${frameId}`);
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name || name.length > 160) throw new Error("Atlas frame name must contain 1 through 160 characters.");
    frame.name = name;
  }
  for (const property of ["x", "y", "width", "height"] as const) {
    const value = patch[property];
    if (value === undefined) continue;
    if (!Number.isSafeInteger(value) || value < (property === "width" || property === "height" ? 1 : 0) || value > 65_535) {
      throw new Error(`Atlas frame ${property} must be an integer from ${property === "width" || property === "height" ? 1 : 0} through 65535.`);
    }
    frame[property] = value;
  }
  if (patch.color !== undefined) {
    if (!/^#[\da-f]{6}$/i.test(patch.color)) throw new Error("Atlas frame color must be a six-digit hex color.");
    frame.color = patch.color;
  }
}

export function removeEditorAtlasSequenceEntry(project: EditorProject, index: number): void {
  if (!Number.isSafeInteger(index) || index < 0 || index >= project.atlas.sequence.length) throw new Error("Atlas sequence entry is out of range.");
  project.atlas.sequence.splice(index, 1);
}

export function duplicateEditorAtlasSequenceEntry(project: EditorProject, index: number): void {
  if (!Number.isSafeInteger(index) || index < 0 || index >= project.atlas.sequence.length) throw new Error("Atlas sequence entry is out of range.");
  project.atlas.sequence.splice(index + 1, 0, project.atlas.sequence[index]!);
}
