import { uniqueId, type EditorComponent, type EditorEntityData, type EditorProject } from "@hyperfocus/engine/project";

export type Editor2DShape = "rect" | "ellipse" | "triangle";
/** [shape, offset x/y, width/height, clockwise radians, palette slot] */
export type Editor2DShapePart = [Editor2DShape, number, number, number, number, number, number];

export type Editor2DLookPreset = Readonly<{
  id: string;
  label: string;
  family: string;
  tags: readonly string[];
  fills: readonly [string, string, string, string];
  strokes: readonly [string, string, string, string];
  outlineWidth: number;
  shadowBlur: number;
}>;

export const EDITOR_2D_LOOK_PRESETS: readonly Editor2DLookPreset[] = [
  { id: "blocking", label: "Blocking colors", family: "utility", tags: ["clear", "temporary", "readable"], fills: ["#41d7d0", "#b9fff5", "#216b78", "#f5a65b"], strokes: ["#b9fff5", "#ffffff", "#102f38", "#ffe0aa"], outlineWidth: 2, shadowBlur: 6 },
  { id: "soft-toon", label: "Soft toon", family: "toon", tags: ["friendly", "rounded", "pastel"], fills: ["#78a7ff", "#dbe8ff", "#4f6db3", "#ffc978"], strokes: ["#26385f", "#53658c", "#26385f", "#6e4d25"], outlineWidth: 3, shadowBlur: 3 },
  { id: "natural", label: "Natural character", family: "painted", tags: ["animal", "fur", "earth", "organic"], fills: ["#9b6b43", "#d9b98f", "#5b3a27", "#eee0c8"], strokes: ["#38251c", "#5b3a27", "#241813", "#6b5540"], outlineWidth: 2, shadowBlur: 4 },
  { id: "storybook", label: "Warm storybook", family: "painted", tags: ["warm", "whimsical", "paper", "soft"], fills: ["#cf765f", "#f2c99c", "#6f7f62", "#f2e8cf"], strokes: ["#553a38", "#6b5143", "#344338", "#756b5a"], outlineWidth: 2, shadowBlur: 2 },
  { id: "graphic-ink", label: "Graphic ink", family: "graphic", tags: ["bold", "comic", "ink", "contrast"], fills: ["#f4efe1", "#17191f", "#db3f39", "#f4bd42"], strokes: ["#17191f", "#f4efe1", "#17191f", "#17191f"], outlineWidth: 5, shadowBlur: 0 },
  { id: "pixel-retro", label: "Pixel retro", family: "retro", tags: ["pixel", "limited", "arcade", "crisp"], fills: ["#65c7a6", "#f7e9a0", "#324f75", "#e66b5b"], strokes: ["#18283c", "#59463b", "#18283c", "#682f3a"], outlineWidth: 3, shadowBlur: 0 },
  { id: "neon", label: "Neon glow", family: "effects", tags: ["neon", "glow", "night", "electric"], fills: ["#18e0ff", "#ff56c8", "#765cff", "#f5ff6a"], strokes: ["#d8fbff", "#ffe2f7", "#e2ddff", "#ffffd2"], outlineWidth: 2, shadowBlur: 14 },
] as const;

export type Editor2DShapeSource = Readonly<{
  entityId: string;
  label: string;
  partEntityIds: readonly string[];
  lookPreset: string;
  parts: readonly Editor2DShapePart[];
}>;

type ShapeCharacterLibrary = {
  version: 1;
  characters: Array<{ entityId: string; label: string; partEntityIds: string[]; lookPreset: string }>;
};

export function createEditor2DStandIn(project: EditorProject, options: { shape: "rect" | "ellipse"; role: "character" | "prop"; id?: string }) {
  const scene = activeScene(project);
  const entityId = options.id ?? uniqueId(options.role);
  if (scene.entities.some((entity) => entity.id === entityId)) throw new Error(`2D entity already exists: ${entityId}`);
  scene.entities.push({
    id: entityId,
    label: options.role === "character" ? "Character stand-in" : "Prop stand-in",
    x: 380,
    y: 240,
    width: 40,
    height: 56,
    scale: 1,
    layer: 1,
    color: "#41d7d0",
    accent: "#b9fff5",
    kind: options.role === "character" ? "actor" : "prop",
    components: [
      transformComponent(entityId, 380, 240, 1, 0),
      { id: `${entityId}-sprite`, type: "sprite", enabled: true, values: { asset: "generated", tint: "#41d7d0", visible: false } },
    ],
  });
  enhanceEditor2DShapes(project, { entityId, label: `${options.role} ${options.shape} stand-in`, parts: [[options.shape, 0, 0, 40, 56, 0, 0]] });
  return { entityId };
}

export function makeEditor2DCharacter(project: EditorProject, entityId: string) {
  const entity = requireEntity(project, entityId);
  entity.kind = "actor";
  if (!entity.components.some((component) => component.type === "sprite")) {
    entity.components.push({ id: uniqueComponentId(entity, `${entityId}-sprite`), type: "sprite", enabled: true, values: { asset: "generated", tint: entity.color } });
  }
  return {
    entityId,
    playerControlled: entity.components.some((component) => component.enabled && component.type === "behavior" && component.values.module === "builtin:player"),
  };
}

export function enhanceEditor2DShapes(project: EditorProject, options: { entityId: string; label: string; parts: readonly Editor2DShapePart[] }) {
  validateParts(options.parts);
  const scene = activeScene(project);
  const root = requireEntity(project, options.entityId);
  const library = libraryForWrite(project);
  const existing = library.characters.find((candidate) => candidate.entityId === root.id);
  const lookPreset = editor2DLookPreset(existing?.lookPreset ?? "blocking");
  const previousIds = existing?.partEntityIds ?? [];
  const nextIds: string[] = [];
  const knownIds = new Set(scene.entities.map((entity) => entity.id));

  root.components = root.components.map((component) => component.type === "sprite"
    ? { ...component, enabled: true, values: { ...component.values, visible: false } }
    : component);
  if (!root.components.some((component) => component.type === "sprite")) {
    root.components.push({ id: uniqueComponentId(root, `${root.id}-sprite`), type: "sprite", enabled: true, values: { asset: "generated", tint: root.color, visible: false } });
  }

  for (let index = 0; index < options.parts.length; index += 1) {
    const part = options.parts[index]!;
    const id = previousIds[index] ?? availablePartId(root.id, index, knownIds);
    knownIds.add(id);
    nextIds.push(id);
    const current = scene.entities.find((entity) => entity.id === id);
    const next = shapeEntity(root, id, index, part, lookPreset, current);
    if (current) Object.assign(current, next); else scene.entities.push(next);
  }

  const removed = new Set(previousIds.filter((id) => !nextIds.includes(id)));
  if (removed.size) {
    scene.entities = scene.entities.filter((entity) => !removed.has(entity.id));
    project.timeline.tracks = project.timeline.tracks.filter((track) => !removed.has(track.targetId));
  }
  const record = { entityId: root.id, label: options.label, partEntityIds: nextIds, lookPreset: lookPreset.id };
  const recordIndex = library.characters.findIndex((candidate) => candidate.entityId === root.id);
  if (recordIndex < 0) library.characters.push(record); else library.characters[recordIndex] = record;
  project.extensions!.hyperfocus2DShapeCharacters = library;
  return { entityId: root.id, partEntityIds: nextIds, removedPartEntityIds: [...removed] };
}

export function applyEditor2DLookPreset(project: EditorProject, entityId: string, presetId: string) {
  const preset = editor2DLookPreset(presetId);
  const library = libraryForWrite(project);
  const source = library.characters.find((candidate) => candidate.entityId === entityId);
  if (!source) throw new Error(`2D entity has no generated shape group: ${entityId}`);
  const scene = activeScene(project);
  for (let index = 0; index < source.partEntityIds.length; index += 1) {
    const part = scene.entities.find((entity) => entity.id === source.partEntityIds[index]);
    if (!part) continue;
    const sprite = part.components.find((component) => component.type === "sprite");
    const slot = paletteSlot(sprite?.values.paletteSlot, index);
    part.color = preset.fills[slot];
    part.accent = preset.strokes[slot];
    if (sprite) sprite.values = { ...sprite.values, tint: part.color, stroke: part.accent, outlineWidth: preset.outlineWidth, shadowBlur: preset.shadowBlur };
  }
  source.lookPreset = preset.id;
  project.extensions!.hyperfocus2DShapeCharacters = library;
  return { entityId, preset: preset.id, partEntityIds: [...source.partEntityIds] };
}

export function replaceEditor2DSprite(project: EditorProject, entityId: string, assetId: string) {
  const asset = project.assets.find((candidate) => candidate.id === assetId && candidate.kind === "image");
  if (!asset) throw new Error(`2D sprite replacement requires a project image: ${assetId}`);
  const scene = activeScene(project);
  const root = requireEntity(project, entityId);
  const library = libraryForWrite(project);
  const sourceIndex = library.characters.findIndex((candidate) => candidate.entityId === entityId);
  const removedIds = new Set(sourceIndex < 0 ? [] : library.characters[sourceIndex]!.partEntityIds);
  if (removedIds.size) {
    scene.entities = scene.entities.filter((entity) => !removedIds.has(entity.id));
    project.timeline.tracks = project.timeline.tracks.filter((track) => !removedIds.has(track.targetId));
    library.characters.splice(sourceIndex, 1);
  }
  let sprite = root.components.find((component) => component.type === "sprite");
  if (!sprite) {
    sprite = { id: uniqueComponentId(root, `${root.id}-sprite`), type: "sprite", enabled: true, values: {} };
    root.components.push(sprite);
  }
  sprite.enabled = true;
  sprite.values = { asset: assetId, tint: "#ffffff", visible: true };
  project.extensions!.hyperfocus2DShapeCharacters = library;
  return { entityId, assetId, removedPartEntityIds: [...removedIds] };
}

export function editor2DShapeSourceForEntity(project: EditorProject, entityId: string): Editor2DShapeSource | undefined {
  const scene = project.scenes.find((candidate) => candidate.id === project.activeSceneId);
  const root = scene?.entities.find((candidate) => candidate.id === entityId);
  const record = readLibrary(project.extensions?.hyperfocus2DShapeCharacters)?.characters.find((candidate) => candidate.entityId === entityId);
  if (!scene || !root || !record) return undefined;
  const parts: Editor2DShapePart[] = [];
  for (let index = 0; index < record.partEntityIds.length; index += 1) {
    const entity = scene.entities.find((candidate) => candidate.id === record.partEntityIds[index]);
    const sprite = entity?.components.find((component) => component.type === "sprite");
    if (!entity || !sprite) return undefined;
    const shape = editor2DShape(sprite.values.shape);
    if (!shape) return undefined;
    parts.push([shape, entity.x - root.x, entity.y - root.y, entity.width, entity.height, entity.rotation ?? 0, paletteSlot(sprite.values.paletteSlot, index)]);
  }
  return { ...record, parts };
}

export function editor2DShapeRootForPart(project: EditorProject, partEntityId: string): string | undefined {
  return readLibrary(project.extensions?.hyperfocus2DShapeCharacters)?.characters.find((candidate) => candidate.partEntityIds.includes(partEntityId))?.entityId;
}

export function editor2DLookPreset(id: string): Editor2DLookPreset {
  const preset = EDITOR_2D_LOOK_PRESETS.find((candidate) => candidate.id === id);
  if (!preset) throw new Error(`Unknown 2D look preset: ${id}`);
  return preset;
}

export function drawEditor2DGeneratedShape(
  context: Pick<CanvasRenderingContext2D, "fillStyle" | "strokeStyle" | "lineWidth" | "shadowColor" | "shadowBlur" | "beginPath" | "ellipse" | "moveTo" | "lineTo" | "closePath" | "fill" | "stroke" | "fillRect" | "strokeRect">,
  width: number,
  height: number,
  sprite: { values: Record<string, unknown> } | undefined,
  fallbackFill: string,
  fallbackStroke: string,
) {
  const shape = editor2DShape(sprite?.values.shape) ?? "rect";
  context.fillStyle = textStyle(sprite?.values.tint, fallbackFill);
  context.strokeStyle = textStyle(sprite?.values.stroke, fallbackStroke);
  context.lineWidth = boundedNumber(sprite?.values.outlineWidth, 0, 24, 2);
  context.shadowColor = context.fillStyle;
  context.shadowBlur = boundedNumber(sprite?.values.shadowBlur, 0, 64, 0);
  if (shape === "rect") {
    context.fillRect(-width / 2, -height / 2, width, height);
    if (context.lineWidth > 0) context.strokeRect(-width / 2, -height / 2, width, height);
    return;
  }
  context.beginPath();
  if (shape === "ellipse") context.ellipse(0, 0, width / 2, height / 2, 0, 0, Math.PI * 2);
  else {
    context.moveTo(0, -height / 2);
    context.lineTo(width / 2, height / 2);
    context.lineTo(-width / 2, height / 2);
    context.closePath();
  }
  context.fill();
  if (context.lineWidth > 0) context.stroke();
}

function shapeEntity(root: EditorEntityData, id: string, index: number, part: Editor2DShapePart, look: Editor2DLookPreset, current?: EditorEntityData): EditorEntityData {
  const [shape, offsetX, offsetY, width, height, rotation, requestedSlot] = part;
  const slot = paletteSlot(requestedSlot, index);
  const x = root.x + offsetX, y = root.y + offsetY;
  const transform = current?.components.find((component) => component.type === "transform") ?? transformComponent(id, x, y, 1, rotation);
  transform.enabled = true;
  transform.values = { ...transform.values, x, y, scale: 1, rotation };
  const sprite = current?.components.find((component) => component.type === "sprite") ?? { id: `${id}-sprite`, type: "sprite" as const, enabled: true, values: {} };
  sprite.enabled = true;
  sprite.values = { ...sprite.values, asset: "generated", visible: true, shape, paletteSlot: slot, tint: look.fills[slot], stroke: look.strokes[slot], outlineWidth: look.outlineWidth, shadowBlur: look.shadowBlur };
  const others = current?.components.filter((component) => component.type !== "transform" && component.type !== "sprite") ?? [];
  return { id, parentId: root.id, label: `${root.label} shape ${index + 1}`, x, y, width, height, scale: 1, rotation, opacity: current?.opacity ?? 1, layer: root.layer + 1, color: look.fills[slot], accent: look.strokes[slot], kind: "prop", components: [transform, sprite, ...others] };
}

function transformComponent(id: string, x: number, y: number, scale: number, rotation: number): EditorComponent {
  return { id: `${id}-transform`, type: "transform", enabled: true, values: { x, y, scale, rotation } };
}

function activeScene(project: EditorProject) {
  const scene = project.scenes.find((candidate) => candidate.id === project.activeSceneId);
  if (!scene) throw new Error(`Active 2D scene does not exist: ${project.activeSceneId}`);
  return scene;
}

function requireEntity(project: EditorProject, entityId: string) {
  const entity = activeScene(project).entities.find((candidate) => candidate.id === entityId);
  if (!entity) throw new Error(`2D entity does not exist in the active scene: ${entityId}`);
  return entity;
}

function libraryForWrite(project: EditorProject): ShapeCharacterLibrary {
  project.extensions ??= {};
  return readLibrary(project.extensions.hyperfocus2DShapeCharacters) ?? { version: 1, characters: [] };
}

function readLibrary(value: unknown): ShapeCharacterLibrary | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = Object.fromEntries(Object.entries(value));
  if (record.version !== 1 || !Array.isArray(record.characters)) return undefined;
  const characters: ShapeCharacterLibrary["characters"] = [];
  for (const value of record.characters) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const candidate = Object.fromEntries(Object.entries(value));
    if (typeof candidate.entityId !== "string" || typeof candidate.label !== "string" || typeof candidate.lookPreset !== "string" || !Array.isArray(candidate.partEntityIds) || !candidate.partEntityIds.every((id) => typeof id === "string")) continue;
    characters.push({ entityId: candidate.entityId, label: candidate.label, lookPreset: candidate.lookPreset, partEntityIds: [...candidate.partEntityIds] });
  }
  return { version: 1, characters };
}

function validateParts(parts: readonly Editor2DShapePart[]) {
  if (!parts.length || parts.length > 64) throw new Error("2D shape enhancement needs 1 through 64 parts.");
  for (const part of parts) {
    if (!Array.isArray(part) || part.length !== 7 || !editor2DShape(part[0])) throw new Error("2D shape part is invalid.");
    if (!part.slice(1).every((value) => typeof value === "number" && Number.isFinite(value))) throw new Error("2D shape part values must be finite.");
    if (Math.abs(part[1]) > 10_000 || Math.abs(part[2]) > 10_000 || part[3] <= 0 || part[3] > 4096 || part[4] <= 0 || part[4] > 4096 || Math.abs(part[5]) > 100 || !Number.isSafeInteger(part[6]) || part[6] < 0 || part[6] > 3) throw new Error("2D shape part exceeds portable bounds.");
  }
}

function editor2DShape(value: unknown): Editor2DShape | undefined {
  return value === "rect" || value === "ellipse" || value === "triangle" ? value : undefined;
}

function paletteSlot(value: unknown, fallback: number) {
  return Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= 3 ? paletteIndex(Number(value)) : paletteIndex(Math.abs(fallback) % 4);
}

function availablePartId(rootId: string, index: number, known: ReadonlySet<string>) {
  const base = `${rootId}-shape-${index + 1}`;
  if (!known.has(base)) return base;
  let suffix = 2;
  while (known.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

function uniqueComponentId(entity: EditorEntityData, base: string) {
  const known = new Set(entity.components.map((component) => component.id));
  if (!known.has(base)) return base;
  let suffix = 2;
  while (known.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

function textStyle(value: unknown, fallback: string) { return typeof value === "string" && value ? value : fallback; }
function boundedNumber(value: unknown, minimum: number, maximum: number, fallback: number) { return typeof value === "number" && Number.isFinite(value) ? Math.max(minimum, Math.min(maximum, value)) : fallback; }

function paletteIndex(value: number): 0 | 1 | 2 | 3 { if (value === 0 || value === 1 || value === 2 || value === 3) return value; throw new RangeError("Palette index must be 0 through 3."); }
