import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import {
  HYPERFOCUS_ASSETS_FILENAME,
  HYPERFOCUS_DIRECTORY,
  HYPERFOCUS_PROJECT_FILENAME,
  createHyperfocusProjectFiles,
  openHyperfocusProjectFiles,
  type HyperfocusAssetInput,
} from "../src/project/index.ts";
import { auditPlayableProject, type PlayableProject2D } from "../src/project/runtime-2d.ts";
import { createHyperfocus3DRuntime, hasHyperfocus3DProject } from "../src/project/runtime-3d.ts";
import { EDITOR_PROJECT_VERSION, validateProject, type EditorComponent, type EditorEntityData, type EditorProject } from "../../apps/engine-editor/src/project.ts";

const MAX_PROJECT_BYTES = 10 * 1024 * 1024;
const MAX_ARCHIVE_BYTES = 256 * 1024 * 1024;

export const PROJECT_STARTERS = ["top-down", "grid", "platformer", "narrative-rpg", "authoritative-room", "3d-action"] as const;
export type ProjectStarter = (typeof PROJECT_STARTERS)[number];

export const PROJECT_STARTER_DESCRIPTIONS: Readonly<Record<ProjectStarter, string>> = Object.freeze({
  "top-down": "Four-direction player, solid boundary, camera, and a built-in patrol.",
  grid: "Compact tile maze with four-direction input and grid-sized authored geometry.",
  platformer: "Gravity, buffered/coyote jump, swept solid platforms, camera, and a moving hazard.",
  "narrative-rpg": "Localized branching dialogue, quest actions, deterministic story snapshots, and browser saves.",
  "authoritative-room": "Portable room client plus neutral authoritative room settings in project.json.",
  "3d-action": "Lit, textured glTF level with rigid collision, movement, audio, follow camera, saves, and deterministic animation.",
});

export type CreateProjectStarterOptions = {
  template: ProjectStarter;
  outputDirectory: string;
  name?: string;
};

export type CreatedProjectStarter = {
  template: ProjectStarter;
  projectRoot: string;
  files: [string, string];
  canonicalFileCount: 2;
};

export type ProjectStarterInspection = {
  ok: true;
  projectRoot: string;
  name: string;
  template: ProjectStarter | "unknown";
  sceneCount: number;
  entityCount: number;
  importedAssetCount: number;
  canonicalFiles: [string, string];
  diagnostics: string[];
};

/** Creates one self-contained starter with no source wrappers or dependency manifest. */
export async function createProjectStarter(options: CreateProjectStarterOptions): Promise<CreatedProjectStarter> {
  assertStarter(options.template);
  const projectRoot = resolve(options.outputDirectory);
  if (existsSync(projectRoot)) throw new Error(`Destination already exists: ${projectRoot}. Choose a new directory so no files can be overwritten.`);
  const parent = dirname(projectRoot);
  const staging = join(parent, `.${basename(projectRoot)}.hyperfocus-staging-${process.pid}-${crypto.randomUUID()}`);
  if (dirname(resolve(staging)) !== resolve(parent)) throw new Error("Starter staging directory escaped its destination parent.");
  const name = cleanProjectName(options.name ?? title(options.template));
  const project = createStarterProject(options.template, name);
  const starterAssets = options.template === "3d-action" ? create3DStarterAssets() : [];
  const unpackedBytes = starterAssets.reduce((total, asset) => total + asset.bytes.byteLength, 0);
  const files = await createHyperfocusProjectFiles(project, starterAssets, { maxAssets: starterAssets.length, maxUnpackedBytes: unpackedBytes });
  const canonicalDirectory = join(staging, HYPERFOCUS_DIRECTORY);
  try {
    await mkdir(canonicalDirectory, { recursive: true });
    await Promise.all([
      writeFile(join(canonicalDirectory, HYPERFOCUS_PROJECT_FILENAME), files.projectJson, { flag: "wx" }),
      writeFile(join(canonicalDirectory, HYPERFOCUS_ASSETS_FILENAME), files.assetsArchive, { flag: "wx" }),
    ]);
    await rename(staging, projectRoot);
  } catch (cause) {
    await rm(staging, { recursive: true, force: true }).catch(() => undefined);
    throw cause;
  }
  const canonicalFiles: [string, string] = [
    join(projectRoot, HYPERFOCUS_DIRECTORY, HYPERFOCUS_PROJECT_FILENAME),
    join(projectRoot, HYPERFOCUS_DIRECTORY, HYPERFOCUS_ASSETS_FILENAME),
  ];
  return { template: options.template, projectRoot, files: canonicalFiles, canonicalFileCount: 2 };
}

/** Validates the exact two-file contract, archive integrity, editor shape, and runtime support. */
export async function inspectProjectStarter(projectDirectory: string): Promise<ProjectStarterInspection> {
  const projectRoot = resolve(projectDirectory);
  const canonicalDirectory = join(projectRoot, HYPERFOCUS_DIRECTORY);
  const entries = await readdir(canonicalDirectory, { withFileTypes: true }).catch((cause) => {
    throw new Error(`Cannot read ${canonicalDirectory}: ${errorMessage(cause)}`);
  });
  const names = entries.map((entry) => entry.name).sort(compareText);
  const expected = [HYPERFOCUS_ASSETS_FILENAME, HYPERFOCUS_PROJECT_FILENAME].sort(compareText);
  if (entries.some((entry) => !entry.isFile()) || names.length !== 2 || names.some((name, index) => name !== expected[index])) {
    throw new Error(`${HYPERFOCUS_DIRECTORY} must contain exactly ${HYPERFOCUS_PROJECT_FILENAME} and ${HYPERFOCUS_ASSETS_FILENAME}; found ${names.join(", ") || "nothing"}.`);
  }
  const projectPath = join(canonicalDirectory, HYPERFOCUS_PROJECT_FILENAME);
  const archivePath = join(canonicalDirectory, HYPERFOCUS_ASSETS_FILENAME);
  const [projectBuffer, archiveBuffer] = await Promise.all([readFile(projectPath), readFile(archivePath)]);
  if (projectBuffer.byteLength > MAX_PROJECT_BYTES) throw new Error(`${HYPERFOCUS_PROJECT_FILENAME} exceeds ${MAX_PROJECT_BYTES} bytes.`);
  if (archiveBuffer.byteLength > MAX_ARCHIVE_BYTES) throw new Error(`${HYPERFOCUS_ASSETS_FILENAME} exceeds ${MAX_ARCHIVE_BYTES} bytes.`);
  const opened = await openHyperfocusProjectFiles<EditorProject & StarterExtensions>(
    new Uint8Array(projectBuffer),
    new Uint8Array(archiveBuffer),
    { maxArchiveBytes: MAX_ARCHIVE_BYTES, maxAssets: 5_000, maxUnpackedBytes: MAX_ARCHIVE_BYTES },
  );
  validateProject(opened.project);
  if (hasHyperfocus3DProject(opened.project)) await createHyperfocus3DRuntime(opened.project, opened.assets);
  const runtimeDiagnostics = hasHyperfocus3DProject(opened.project) ? [] : auditPlayableProject(opened.project as PlayableProject2D);
  if (runtimeDiagnostics.length) {
    throw new Error(`Starter runtime preflight failed:\n${runtimeDiagnostics.map((item) => `- ${item.message}`).join("\n")}`);
  }
  const template = opened.project.extensions?.hyperfocusStarter?.template;
  return {
    ok: true,
    projectRoot,
    name: opened.project.name,
    template: isStarter(template) ? template : "unknown",
    sceneCount: opened.project.scenes.length,
    entityCount: opened.project.scenes.reduce((total, scene) => total + scene.entities.length, 0),
    importedAssetCount: opened.project.assets.filter((asset) => asset.source === "imported").length,
    canonicalFiles: [projectPath, archivePath],
    diagnostics: [],
  };
}

type StarterExtensions = {
  extensions?: {
    hyperfocusStarter?: { template?: string; notes?: string[] };
    hyperfocusSave?: {
      schema: "portable-world-snapshot-v1";
      dataVersion: number;
      slotPolicy: "single";
      slots: string[];
      defaultSlot: string;
      restoreOnBoot: boolean;
      editorPlay: "reset" | "restore";
      maxBytes: number;
    };
    hyperfocusStory?: unknown;
    hyperfocus3D?: unknown;
    authoritativeRoom?: { roomType: string; tickRate: number; maxPlayers: number; replication: string };
  };
};

export function createStarterProject(template: ProjectStarter, name: string, createdAt = new Date().toISOString()): EditorProject & StarterExtensions {
  assertStarter(template);
  const safeName = cleanProjectName(name);
  if (!Number.isFinite(Date.parse(createdAt))) throw new Error("Starter creation timestamp must be an ISO-compatible date.");
  const columns = template === "platformer" ? 20 : template === "grid" ? 13 : 16;
  const rows = template === "platformer" ? 10 : template === "grid" ? 13 : 10;
  const tileSize = template === "grid" ? 32 : 48;
  const input = template === "platformer"
    ? [mapping("move-left", "KeyA", "ArrowLeft"), mapping("move-right", "KeyD", "ArrowRight"), mapping("jump", "Space", "KeyW", "ArrowUp")]
    : [
        mapping("move-left", "KeyA", "ArrowLeft"),
        mapping("move-right", "KeyD", "ArrowRight"),
        mapping("move-up", "KeyW", "ArrowUp"),
        mapping("move-down", "KeyS", "ArrowDown"),
        mapping("interact", "KeyE", "Enter"),
        ...(template === "narrative-rpg" ? [
          mapping("choose-accept", "Digit1"),
          mapping("choose-decline", "Digit2"),
          mapping("quest-accept", "KeyQ"),
          mapping("quest-complete", "KeyR"),
        ] : []),
      ];
  const entities = starterEntities(template, tileSize, rows);
  const project: EditorProject & StarterExtensions = {
    format: "catalog-engine-editor-project",
    version: EDITOR_PROJECT_VERSION,
    id: `starter-${slug(safeName)}`,
    name: safeName,
    createdAt,
    updatedAt: createdAt,
    activeSceneId: "scene-main",
    scenes: [{ id: "scene-main", name: title(template), entities }],
    assets: template === "3d-action" ? [
      { id: "level-gltf", name: "starter-level.gltf", kind: "data", mimeType: "model/gltf+json", size: 0, lastModified: Date.parse(createdAt), source: "imported" },
      { id: "checker-rgba", name: "starter-checker.rgba8", kind: "data", mimeType: "application/octet-stream", size: 0, lastModified: Date.parse(createdAt), source: "imported" },
      { id: "step-wav", name: "starter-step.wav", kind: "audio", mimeType: "audio/wav", size: 0, lastModified: Date.parse(createdAt), source: "imported" },
    ] : [],
    tilemap: {
      id: "tilemap-main",
      name: `${title(template)} Tiles`,
      columns,
      rows,
      tileSize,
      values: starterTiles(template, columns, rows),
      solidValues: [1],
    },
    atlas: {
      id: "atlas-colors",
      name: "Color Shapes",
      frameWidth: tileSize,
      frameHeight: tileSize,
      playbackSpeed: 1,
      frames: [{ id: "frame-player", name: "player", x: 0, y: 0, width: tileSize, height: tileSize, color: "#42cfc5" }],
      sequence: ["frame-player"],
    },
    postProcessing: { effects: [], frameBudgetMs: 16.67, allocationMs: 0 },
    timeline: {
      fps: 30,
      durationFrames: 300,
      bpm: 120,
      beatsPerBar: 4,
      loopStart: 0,
      loopEnd: 300,
      playbackSpeed: 1,
      tracks: [],
      audioTracks: [],
      events: [],
    },
    production: {
      export: { width: 1920, height: 1080, fps: 30, codec: "vp8", preset: "YouTube 1080p" },
      reactiveBindings: [],
      midiMappings: [],
      logicGraph: { nodes: [], edges: [] },
      spriteRig: { bones: [], poses: [] },
      annotations: [],
    },
    settings: {
      targetProfile: "desktop",
      locale: "en-US",
      uiScale: 1,
      reducedMotion: false,
      masterVolume: 0.8,
      input,
    },
    layout: { sidebarWidth: 244, sidebarCollapsed: false },
    extensions: {
      hyperfocusStarter: {
        template,
        notes: template === "platformer"
          ? ["The first-party deterministic platformer controller owns horizontal motion, gravity, grounded state, coyote time, and jump buffering."]
          : template === "narrative-rpg"
            ? ["Press E to advance, 1/2 to choose, Q to accept the quest, and R to complete the starter quest event."]
          : template === "authoritative-room"
            ? ["The portable browser build is the room client; server configuration is neutral metadata until deployment is selected."]
          : [],
      },
      hyperfocusSave: {
        schema: "portable-world-snapshot-v1",
        dataVersion: 0,
        slotPolicy: "single",
        slots: ["auto"],
        defaultSlot: "auto",
        restoreOnBoot: true,
        editorPlay: "reset",
        maxBytes: 262_144,
      },
      ...(template === "narrative-rpg" ? { hyperfocusStory: narrativeStoryExtension() } : {}),
      ...(template === "authoritative-room" ? {
        authoritativeRoom: { roomType: "starter-room", tickRate: 20, maxPlayers: 32, replication: "interest-grid" },
      } : {}),
      ...(template === "3d-action" ? { hyperfocus3D: create3DStarterDeclaration() } : {}),
    },
  };
  validateProject(project);
  return project;
}

function create3DStarterDeclaration() {
  return {
    version: 1,
    activeSceneId: "level-3d",
    budgets: { meshes: 4, vertices: 10_000, indices: 30_000, textures: 4, textureBytes: 1_048_576, materials: 4, lights: 8, entities: 64 },
    meshes: [{ id: "cube", assetId: "level-gltf", primitive: 0, buffers: [] }],
    textures: [{ id: "checker", assetId: "checker-rgba", width: 2, height: 2, filter: "nearest", wrap: "repeat", flipY: false }],
    materials: [
      { id: "level", shading: "lit", baseColor: [0.9, 0.95, 1, 1], textureId: "checker", metallic: 0, roughness: 0.85, doubleSided: false },
      { id: "actor", shading: "lit", baseColor: [0.2, 0.9, 0.72, 1], metallic: 0, roughness: 0.55, doubleSided: false },
    ],
    scenes: [{
      id: "level-3d",
      camera: { position: [0, 5, 8], target: [0, 0, 0], up: [0, 1, 0], fovYRadians: 0.9, near: 0.1, far: 100, followEntityId: "actor", followOffset: [0, 5, 8] },
      lights: [
        { id: "ambient", kind: "ambient", color: [0.35, 0.45, 0.65], intensity: 0.65 },
        { id: "sun", kind: "directional", color: [1, 0.88, 0.72], intensity: 1.15, direction: [-1, -2, -1] },
      ],
      entities: [
        { id: "floor", meshId: "cube", materialId: "level", position: [0, -0.6, 0], scale: [6, 0.25, 6], rotationY: 0, physics: { type: "static", shape: "box", gravityScale: 0, continuous: false } },
        { id: "actor", meshId: "cube", materialId: "actor", position: [0, 0.25, 0], scale: [0.55, 0.55, 0.55], rotationY: 0, controller: { speed: 3.5 }, physics: { type: "dynamic", shape: "box", gravityScale: 1, continuous: false } },
        { id: "spinner", meshId: "cube", materialId: "level", position: [2.5, 0.25, -1.5], scale: [0.7, 1.1, 0.7], rotationY: 0, animation: { kind: "rotate-y", radiansPerSecond: 0.8 } },
        { id: "pillar-left", meshId: "cube", materialId: "level", position: [-3, 0.75, -3], scale: [0.5, 1.5, 0.5], rotationY: 0, physics: { type: "static", shape: "box", gravityScale: 0, continuous: false } },
        { id: "pillar-right", meshId: "cube", materialId: "level", position: [3, 0.75, -3], scale: [0.5, 1.5, 0.5], rotationY: 0, physics: { type: "static", shape: "box", gravityScale: 0, continuous: false } },
      ],
    }],
    audio: { policy: "gesture-unlock", cues: ["step-wav"] },
    save: { restoreOnBoot: true, slot: "auto", maxBytes: 262_144 },
  };
}

function create3DStarterAssets(): HyperfocusAssetInput[] {
  const positions: number[] = [], normals: number[] = [], uvs: number[] = [], indices: number[] = [];
  const faces = [
    { n: [1, 0, 0], v: [[1, -1, -1], [1, -1, 1], [1, 1, 1], [1, 1, -1]] },
    { n: [-1, 0, 0], v: [[-1, -1, 1], [-1, -1, -1], [-1, 1, -1], [-1, 1, 1]] },
    { n: [0, 1, 0], v: [[-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1]] },
    { n: [0, -1, 0], v: [[-1, -1, 1], [1, -1, 1], [1, -1, -1], [-1, -1, -1]] },
    { n: [0, 0, 1], v: [[1, -1, 1], [-1, -1, 1], [-1, 1, 1], [1, 1, 1]] },
    { n: [0, 0, -1], v: [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1]] },
  ];
  for (const face of faces) {
    const base = positions.length / 3;
    for (let index = 0; index < 4; index += 1) { positions.push(...face.v[index]); normals.push(...face.n); uvs.push(...([[0, 0], [1, 0], [1, 1], [0, 1]][index])); }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const streams = [new Uint8Array(new Float32Array(positions).buffer), new Uint8Array(new Float32Array(normals).buffer), new Uint8Array(new Float32Array(uvs).buffer), new Uint8Array(new Uint16Array(indices).buffer)];
  const offsets: number[] = []; let byteLength = 0;
  for (const stream of streams) { offsets.push(byteLength); byteLength += stream.byteLength; }
  const binary = new Uint8Array(byteLength); streams.forEach((stream, index) => binary.set(stream, offsets[index]));
  const uri = `data:application/octet-stream;base64,${Buffer.from(binary).toString("base64")}`;
  const gltf = { asset: { version: "2.0", generator: "Hyperfocus 3D action starter" }, buffers: [{ uri, byteLength }], bufferViews: streams.map((stream, index) => ({ buffer: 0, byteOffset: offsets[index], byteLength: stream.byteLength })), accessors: [{ bufferView: 0, componentType: 5126, count: 24, type: "VEC3", min: [-1, -1, -1], max: [1, 1, 1] }, { bufferView: 1, componentType: 5126, count: 24, type: "VEC3" }, { bufferView: 2, componentType: 5126, count: 24, type: "VEC2" }, { bufferView: 3, componentType: 5123, count: 36, type: "SCALAR" }], meshes: [{ name: "Starter Cube", primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3, mode: 4 }] }] };
  return [
    { id: "level-gltf", name: "starter-level.gltf", mimeType: "model/gltf+json", bytes: new TextEncoder().encode(JSON.stringify(gltf)) },
    { id: "checker-rgba", name: "starter-checker.rgba8", mimeType: "application/octet-stream", bytes: new Uint8Array([30, 67, 87, 255, 235, 151, 68, 255, 235, 151, 68, 255, 30, 67, 87, 255]) },
    { id: "step-wav", name: "starter-step.wav", mimeType: "audio/wav", bytes: createStarterToneWav() },
  ];
}

function createStarterToneWav(): Uint8Array {
  const sampleRate = 8_000, sampleCount = 640, bytes = new Uint8Array(44 + sampleCount), view = new DataView(bytes.buffer);
  const text = (offset: number, value: string) => { for (let index = 0; index < value.length; index += 1) bytes[offset + index] = value.charCodeAt(index); };
  text(0, "RIFF"); view.setUint32(4, 36 + sampleCount, true); text(8, "WAVE"); text(12, "fmt "); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate, true);
  view.setUint16(32, 1, true); view.setUint16(34, 8, true); text(36, "data"); view.setUint32(40, sampleCount, true);
  for (let index = 0; index < sampleCount; index += 1) {
    const fade = 1 - index / sampleCount;
    bytes[44 + index] = Math.round(128 + Math.sin(index * Math.PI * 2 * 220 / sampleRate) * 34 * fade);
  }
  return bytes;
}

function starterEntities(template: ProjectStarter, tileSize: number, rows: number): EditorEntityData[] {
  const playerControls = template === "platformer" ? [
    component("player-platformer", "behavior", { module: "builtin:platformer", export: "update", runSpeed: 220, gravity: 1800, jumpSpeed: 650, maxFallSpeed: 900, coyoteMs: 100, jumpBufferMs: 100, jumpCutMultiplier: 0.5, groundProbe: 0.05 }),
    component("player-collider", "collider", { shape: "box", solid: true }),
    component("player-camera", "camera", { follow: true, smoothing: 0.12 }),
  ] : [
    component("player-input", "input", { mapping: "player", speed: template === "grid" ? 160 : 220 }),
    component("player-behavior", "behavior", { module: "builtin:player", export: "update" }),
    component("player-collider", "collider", { shape: "box", solid: true }),
    component("player-camera", "camera", { follow: true, smoothing: 0.12 }),
  ];
  const player = entity("player", "Player", tileSize * 2.5, template === "platformer" ? tileSize * (rows - 2.5) : tileSize * 2.5, 30, 38, "actor", "#42cfc5", "#b9fff5", playerControls);
  if (template === "grid") {
    return [player, entity("goal", "Goal", tileSize * 10.5, tileSize * 10.5, 24, 24, "prop", "#ee9e4d", "#ffe5a8")];
  }
  if (template === "platformer") {
    return [
      player,
      entity("moving-hazard", "Moving Hazard", tileSize * 10, tileSize * 7.5, 34, 28, "hostile", "#e7596e", "#ffafbb", [
        component("hazard-patrol", "behavior", { module: "builtin:patrol", export: "update", axis: "x", speed: 54, distance: 120 }),
        component("hazard-collider", "collider", { shape: "box", solid: true }),
      ]),
    ];
  }
  if (template === "narrative-rpg") {
    return [
      player,
      entity("archivist", "Archivist", tileSize * 8, tileSize * 4, 34, 42, "actor", "#8b73df", "#d8caff"),
      entity("lost-relic", "Lost Relic", tileSize * 12, tileSize * 6, 24, 24, "prop", "#ee9e4d", "#fff0ad"),
    ];
  }
  const patrol = entity("patrol", template === "authoritative-room" ? "Remote Avatar Stand-in" : "Patrol", tileSize * 9, tileSize * 5, 32, 38, "hostile", "#e7596e", "#ffafbb", [
    component("patrol-behavior", "behavior", { module: "builtin:patrol", export: "update", axis: "x", speed: 54, distance: 96 }),
    component("patrol-collider", "collider", { shape: "box", solid: true }),
  ]);
  return [player, patrol];
}

function starterTiles(template: ProjectStarter, columns: number, rows: number): number[] {
  return Array.from({ length: columns * rows }, (_, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    if (row === 0 || row === rows - 1 || column === 0 || column === columns - 1) return 1;
    if (template === "grid" && ((column === 4 && row < 10) || (row === 7 && column > 4 && column < 11))) return 1;
    if (template === "platformer" && (row === rows - 2 || (row === 6 && column >= 4 && column <= 8) || (row === 4 && column >= 12 && column <= 16))) return 1;
    if (template !== "platformer" && template !== "grid" && ((column === 6 && row >= 3 && row <= 6) || (row === 6 && column >= 10 && column <= 13))) return 1;
    return 0;
  });
}

function entity(
  id: string,
  label: string,
  x: number,
  y: number,
  width: number,
  height: number,
  kind: EditorEntityData["kind"],
  color: string,
  accent: string,
  extra: EditorComponent[] = [],
): EditorEntityData {
  return {
    id, label, x, y, width, height, scale: 1, layer: kind === "prop" ? 1 : 2, color, accent, kind,
    components: [
      component(`${id}-transform`, "transform", { x, y, scale: 1 }),
      component(`${id}-sprite`, "sprite", { asset: "generated", tint: color }),
      ...extra,
    ],
  };
}

function component(id: string, type: EditorComponent["type"], values: EditorComponent["values"]): EditorComponent {
  return { id, type, enabled: true, values };
}

function mapping(action: string, ...bindings: string[]) {
  return { action, bindings };
}

function narrativeStoryExtension() {
  return {
    version: 1,
    source: {
      defaultLocale: "en",
      locales: [
        { locale: "en", messages: { greeting: "Welcome, {name}. The archive has lost a relic.", accept: "I will recover it.", decline: "Not yet." } },
        { locale: "es", messages: { greeting: "Bienvenida, {name}. El archivo perdió una reliquia.", decline: "Todavía no." } },
      ],
      dialogues: [{
        id: "archivist", start: "greeting", nodes: [
          { id: "greeting", type: "line", textKey: "greeting", speaker: "Archivist", next: "offer" },
          { id: "offer", type: "choice", options: [
            { id: "accept", textKey: "accept", next: "grant" },
            { id: "decline", textKey: "decline", next: "end" },
          ] },
          { id: "grant", type: "action", command: { type: "quest.offer", data: { questId: "lost-relic" } }, next: "end" },
          { id: "end", type: "end" },
        ],
      }],
      quests: [{ id: "lost-relic", start: "offered", states: [
        { id: "offered", transitions: [{ event: "accepted", target: "searching" }] },
        { id: "searching", transitions: [{ event: "relic-found", target: "complete", commands: [{ type: "inventory.add", data: { relics: 1 } }] }] },
        { id: "complete", terminal: true },
      ] }],
    },
    locale: "es",
    variables: { name: "Mara" },
    flags: {},
    entryDialogue: "archivist",
    activeQuests: ["lost-relic"],
    advanceAction: "interact",
    choiceActions: [
      { dialogueId: "archivist", nodeId: "offer", choiceId: "accept", action: "choose-accept" },
      { dialogueId: "archivist", nodeId: "offer", choiceId: "decline", action: "choose-decline" },
    ],
    questEventActions: [
      { questId: "lost-relic", event: "accepted", action: "quest-accept" },
      { questId: "lost-relic", event: "relic-found", action: "quest-complete" },
    ],
  };
}

function cleanProjectName(value: string): string {
  const clean = value.trim().replace(/[\u0000-\u001f\u007f]/g, "");
  if (!clean || clean.length > 120) throw new Error("Project name must contain 1-120 visible characters.");
  return clean;
}

function slug(value: string): string {
  return value.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "game";
}

function title(value: string): string {
  return value.split("-").map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`).join(" ");
}

function isStarter(value: unknown): value is ProjectStarter {
  return typeof value === "string" && (PROJECT_STARTERS as readonly string[]).includes(value);
}

function assertStarter(value: unknown): asserts value is ProjectStarter {
  if (!isStarter(value)) throw new Error(`Unknown starter ${String(value)}. Choose one of: ${PROJECT_STARTERS.join(", ")}.`);
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function errorMessage(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}

export function projectCliHelp(): string {
  return [
    "Hyperfocus project starters",
    "",
    "Usage:",
    "  bun run create:project -- <template> <directory> [--name <name>]",
    "  bun run create:project -- create --template <template> --out <directory> [--name <name>]",
    "  bun run create:project -- check <directory> [--json]",
    "  bun run create:project -- list",
    "",
    "Templates:",
    ...PROJECT_STARTERS.map((starter) => `  ${starter.padEnd(20)} ${PROJECT_STARTER_DESCRIPTIONS[starter]}`),
    "",
    `Creation writes only ${HYPERFOCUS_DIRECTORY}/${HYPERFOCUS_PROJECT_FILENAME} and ${HYPERFOCUS_DIRECTORY}/${HYPERFOCUS_ASSETS_FILENAME}.`,
    "Build with: bun run build:game -- --project <directory>",
  ].join("\n");
}

function option(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1];
  const prefixed = args.find((value) => value.startsWith(`${name}=`));
  return prefixed?.slice(name.length + 1);
}

export async function runProjectCli(args: readonly string[]): Promise<number> {
  const command = args[0];
  if (!command || command === "help" || command === "--help" || command === "-h") {
    console.log(projectCliHelp());
    return 0;
  }
  if (command === "list") {
    for (const starter of PROJECT_STARTERS) console.log(`${starter}\t${PROJECT_STARTER_DESCRIPTIONS[starter]}`);
    return 0;
  }
  if (command === "check") {
    const directory = args[1] ?? option(args, "--project");
    if (!directory) throw new Error("check requires a project directory.");
    const inspection = await inspectProjectStarter(directory);
    if (args.includes("--json")) console.log(JSON.stringify(inspection));
    else console.log(`OK ${inspection.name}: ${inspection.sceneCount} scene(s), ${inspection.entityCount} entities, exactly 2 canonical files.`);
    return 0;
  }
  const explicitCreate = command === "create";
  const template = explicitCreate ? option(args, "--template") : command;
  const outputDirectory = explicitCreate ? option(args, "--out") : args[1];
  if (!isStarter(template)) throw new Error(`Unknown or missing starter ${String(template)}. Choose one of: ${PROJECT_STARTERS.join(", ")}.`);
  if (!outputDirectory) throw new Error("Project creation requires an output directory.");
  const created = await createProjectStarter({ template, outputDirectory, name: option(args, "--name") });
  console.log(`Created ${created.template} starter with exactly 2 canonical files at ${created.projectRoot}`);
  console.log(`Next: bun run build:game -- --project ${JSON.stringify(created.projectRoot)}`);
  return 0;
}

if (import.meta.main) {
  try {
    process.exitCode = await runProjectCli(process.argv.slice(2));
  } catch (cause) {
    console.error(`Project CLI error: ${errorMessage(cause)}`);
    console.error("Run with --help for templates and examples.");
    process.exitCode = 1;
  }
}
