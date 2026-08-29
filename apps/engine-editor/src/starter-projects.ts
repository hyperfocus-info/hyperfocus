import { createDefaultProject, validateProject, type EditorEntityData, type EditorProject } from "@hyperfocus/engine/project";

export type EditorStarterId = "pong" | "platformer" | "blank-2d" | "3d-action" | "showcase";
export const EDITOR_STARTER_IDS: readonly EditorStarterId[] = ["pong", "platformer", "blank-2d", "3d-action", "showcase"];

export type EditorStarter = {
  project: EditorProject;
  assets: Array<{ id: string; blob: Blob }>;
};

export function createEditorStarter(id: EditorStarterId, name: string): EditorStarter {
  if (id === "showcase") return { project: createDefaultProject(cleanName(name, "Dungeon Run")), assets: [] };
  if (id === "pong") return { project: createPongProject(cleanName(name, "Neon Pong")), assets: [] };
  if (id === "platformer") return { project: createPlatformerProject(cleanName(name, "Glassline Ascent")), assets: [] };
  if (id === "blank-2d") return { project: createBlank2DProject(cleanName(name, "Untitled 2D Game")), assets: [] };
  return create3DActionProject(cleanName(name, "Starter 3D World"));
}

export function createPlatformerProject(name = "Glassline Ascent"): EditorProject {
  const project = createDefaultProject(name);
  project.scenes = [{
    id: "scene-main",
    name: "Glassline Ascent",
    entities: [
      pongEntity("player", "Runner", 120, 350, 32, 44, "actor", "#56f0c7", "#d7fff4", [
        collider("player"),
        behavior("player", "builtin:platformer", { runSpeed: 250, gravity: 1800, jumpSpeed: 650, maxFallSpeed: 900, coyoteMs: 110, jumpBufferMs: 120, jumpCutMultiplier: 0.5, groundProbe: 0.05 }),
        { id: "player-camera", type: "camera", enabled: true, values: { follow: true, smoothing: 0.12 } },
      ]),
      pongEntity("moving-hazard", "Moving Hazard", 490, 350, 38, 30, "hostile", "#ff5378", "#ffd0da", [
        collider("moving-hazard"),
        behavior("moving-hazard", "builtin:patrol", { axis: "x", speed: 58, distance: 130 }),
      ]),
      pongEntity("summit", "Summit Beacon", 792, 142, 34, 58, "prop", "#f4b860", "#fff0c7", []),
    ],
  }];
  project.activeSceneId = "scene-main";
  project.assets = [];
  project.tilemap = {
    id: "tilemap-main",
    name: "Glassline Course",
    columns: 20,
    rows: 10,
    tileSize: 48,
    values: Array.from({ length: 200 }, (_, index) => {
      const column = index % 20;
      const row = Math.floor(index / 20);
      if (row === 9 || column === 0 || column === 19) return 1;
      if (row === 7 && column >= 4 && column <= 8) return 1;
      if (row === 5 && column >= 11 && column <= 15) return 1;
      if (row === 3 && column >= 16 && column <= 18) return 1;
      return 0;
    }),
    solidValues: [1],
  };
  project.atlas = { id: "atlas-platformer", name: "Generated Runner Shapes", frameWidth: 48, frameHeight: 48, playbackSpeed: 1, frames: [{ id: "frame-runner", name: "runner", x: 0, y: 0, width: 48, height: 48, color: "#56f0c7" }], sequence: ["frame-runner"] };
  project.postProcessing.effects = [{ id: "crt", enabled: true, value: 0.08 }, { id: "shake", enabled: false, value: 2 }];
  project.timeline.tracks = [];
  project.timeline.audioTracks = [];
  project.timeline.events = [];
  project.production.reactiveBindings = [];
  project.production.midiMappings = [];
  project.production.logicGraph = { nodes: [], edges: [] };
  project.production.annotations = [];
  project.settings.input = [
    { action: "move-left", bindings: ["KeyA", "ArrowLeft"] },
    { action: "move-right", bindings: ["KeyD", "ArrowRight"] },
    { action: "jump", bindings: ["Space", "KeyW", "ArrowUp"] },
  ];
  project.extensions = {
    hyperfocusStarter: { template: "platformer", goal: "Press Play, reach the summit beacon, tune the Runner controller, then build an offline game." },
    hyperfocusScripts: { activePath: "src/gameplay.ts", files: [{ path: "src/gameplay.ts", language: "typescript", source: PLATFORMER_SCRIPT }] },
    hyperfocusSave: project.extensions?.hyperfocusSave,
  };
  validateProject(project);
  return project;
}

export function createPongProject(name = "Neon Pong"): EditorProject {
  const project = createDefaultProject(name);
  project.scenes = [{
    id: "scene-main",
    name: "Pong Arena",
    entities: [
      pongEntity("wall-top", "Top Wall", 384, 12, 768, 24, "prop", "#173442", "#4de4dc", [collider("wall-top")]),
      pongEntity("wall-bottom", "Bottom Wall", 384, 468, 768, 24, "prop", "#173442", "#4de4dc", [collider("wall-bottom")]),
      scoreEntity("score-left", "Player Score", 338, "score.left"),
      scoreEntity("score-right", "CPU Score", 430, "score.right"),
      pongEntity("player-paddle", "Player Paddle", 52, 240, 18, 104, "actor", "#45e4d5", "#c6fff9", [
        collider("player-paddle"),
        behavior("player-paddle", "builtin:pong-paddle", { upAction: "move-up", downAction: "move-down", speed: 360, minimumY: 64, maximumY: 416 }),
      ]),
      pongEntity("cpu-paddle", "CPU Paddle", 716, 240, 18, 104, "hostile", "#ff5578", "#ffc0cf", [
        collider("cpu-paddle"),
        behavior("cpu-paddle", "builtin:pong-ai", { ballId: "ball", speed: 295, deadZone: 12, minimumY: 64, maximumY: 416 }),
      ]),
      pongEntity("ball", "Ball", 384, 240, 22, 22, "actor", "#f7f2d0", "#ffffff", [
        collider("ball"),
        behavior("ball", "builtin:pong-ball", {
          velocityX: 285,
          velocityY: 185,
          maximumSpeed: 520,
          leftScoreKey: "score.left",
          rightScoreKey: "score.right",
        }),
      ]),
    ],
  }];
  project.activeSceneId = "scene-main";
  project.assets = [];
  project.tilemap = {
    id: "tilemap-main",
    name: "Pong Court",
    columns: 16,
    rows: 10,
    tileSize: 48,
    values: new Array(160).fill(0),
    solidValues: [3],
  };
  project.atlas = {
    id: "atlas-pong",
    name: "Generated Pong Shapes",
    frameWidth: 48,
    frameHeight: 48,
    playbackSpeed: 1,
    frames: [{ id: "frame-ball", name: "ball", x: 0, y: 0, width: 48, height: 48, color: "#f7f2d0" }],
    sequence: ["frame-ball"],
  };
  project.postProcessing.effects = [
    { id: "crt", enabled: true, value: 0.12 },
    { id: "shake", enabled: false, value: 2 },
  ];
  project.timeline.tracks = [];
  project.timeline.audioTracks = [];
  project.timeline.events = [];
  project.production.reactiveBindings = [];
  project.production.midiMappings = [];
  project.production.logicGraph = { nodes: [], edges: [] };
  project.production.annotations = [];
  project.settings.input = [
    { action: "move-up", bindings: ["KeyW", "ArrowUp"] },
    { action: "move-down", bindings: ["KeyS", "ArrowDown"] },
    { action: "serve", bindings: ["Space"] },
  ];
  project.extensions = {
    hyperfocusStarter: {
      template: "pong",
      goal: "Press Play, move with W/S or arrows, score a point, then tune the Ball behavior's public fields before building.",
    },
    hyperfocusScripts: {
      activePath: "src/gameplay.ts",
      files: [{
        path: "src/gameplay.ts",
        language: "typescript",
        source: PONG_SCRIPT,
      }],
    },
    hyperfocusSave: project.extensions?.hyperfocusSave,
  };
  validateProject(project);
  return project;
}

function createBlank2DProject(name: string): EditorProject {
  const project = createDefaultProject(name);
  project.scenes = [{ id: "scene-main", name: "Main", entities: [] }];
  project.activeSceneId = "scene-main";
  project.assets = [];
  project.tilemap = { id: "tilemap-main", name: "Main Tilemap", columns: 16, rows: 10, tileSize: 48, values: new Array(160).fill(0), solidValues: [1] };
  project.atlas.sourceAssetId = undefined;
  project.atlas.frames = [];
  project.atlas.sequence = [];
  project.atlas.clips = [];
  project.atlas.defaultClipId = undefined;
  project.postProcessing.effects = [];
  project.timeline.tracks = [];
  project.timeline.audioTracks = [];
  project.timeline.events = [];
  project.production.reactiveBindings = [];
  project.production.midiMappings = [];
  project.production.logicGraph = { nodes: [], edges: [] };
  project.production.spriteRig = { bones: [], poses: [] };
  project.production.annotations = [];
  project.extensions = {
    hyperfocusStarter: { template: "blank-2d" },
    hyperfocusScripts: { activePath: "src/game.ts", files: [{ path: "src/game.ts", language: "typescript", source: BLANK_SCRIPT }] },
    hyperfocusSave: project.extensions?.hyperfocusSave,
  };
  validateProject(project);
  return project;
}

function create3DActionProject(name: string): EditorStarter {
  const project = createDefaultProject(name);
  const generated = create3DStarterAssets();
  project.scenes = [{ id: "scene-main", name: "3D Project Data", entities: [] }];
  project.activeSceneId = "scene-main";
  project.assets = generated.map((asset) => ({
    id: asset.id,
    name: asset.name,
    kind: asset.kind,
    mimeType: asset.mimeType,
    size: asset.bytes.byteLength,
    lastModified: Date.now(),
    source: "imported" as const,
  }));
  project.tilemap.sourceAssetId = undefined;
  project.atlas.sourceAssetId = undefined;
  project.tilemap.values.fill(0);
  project.timeline.tracks = [];
  project.timeline.audioTracks = [];
  project.timeline.events = [];
  project.extensions = {
    hyperfocusStarter: {
      template: "3d-action",
      goal: "Use WASD in Play mode, edit transforms in the 3D inspector, import glTF, then build an offline WebGL2 game.",
    },
    hyperfocus3D: create3DDeclaration(),
    hyperfocusScripts: {
      activePath: "src/player.ts",
      files: [{ path: "src/player.ts", language: "typescript", source: THREE_D_SCRIPT }],
    },
  };
  validateProject(project);
  return {
    project,
    assets: generated.map((asset) => ({ id: asset.id, blob: new Blob([asset.bytes], { type: asset.mimeType }) })),
  };
}

function create3DDeclaration() {
  return {
    version: 1,
    activeSceneId: "level-3d",
    budgets: { meshes: 4, vertices: 10_000, indices: 30_000, textures: 4, textureBytes: 1_048_576, materials: 4, lights: 8, entities: 64 },
    meshes: [{ id: "cube", assetId: "level-gltf", primitive: 0, buffers: [] }],
    textures: [{ id: "checker", assetId: "checker-rgba", width: 2, height: 2, filter: "nearest", wrap: "repeat", flipY: false }],
    materials: [
      { id: "level", shading: "lit", baseColor: [0.3, 0.48, 0.58, 1], textureId: "checker", metallic: 0, roughness: 0.85, doubleSided: false },
      { id: "actor", shading: "lit", baseColor: [0.2, 0.9, 0.72, 1], metallic: 0, roughness: 0.55, doubleSided: false },
      { id: "accent", shading: "lit", baseColor: [0.95, 0.38, 0.22, 1], metallic: 0.1, roughness: 0.4, doubleSided: false },
    ],
    scenes: [{
      id: "level-3d",
      camera: { position: [0, 5, 8], target: [0, 0, 0], up: [0, 1, 0], fovYRadians: 0.9, near: 0.1, far: 100, followEntityId: "actor", followOffset: [0, 5, 8] },
      lights: [
        { id: "ambient", kind: "ambient", color: [0.35, 0.45, 0.65], intensity: 0.8 },
        { id: "sun", kind: "directional", color: [1, 0.88, 0.72], intensity: 1.2, direction: [-1, -2, -1] },
      ],
      entities: [
        { id: "floor", meshId: "cube", materialId: "level", position: [0, -0.6, 0], scale: [6, 0.25, 6], rotationY: 0, physics: { type: "static", shape: "box", gravityScale: 0, continuous: false } },
        { id: "actor", meshId: "cube", materialId: "actor", position: [0, 0.25, 0], scale: [0.55, 0.55, 0.55], rotationY: 0, controller: { speed: 3.5 }, physics: { type: "dynamic", shape: "box", gravityScale: 1, continuous: false } },
        { id: "spinner", meshId: "cube", materialId: "accent", position: [2.5, 0.25, -1.5], scale: [0.7, 1.1, 0.7], rotationY: 0, animation: { kind: "rotate-y", radiansPerSecond: 0.8 } },
        { id: "pillar-left", meshId: "cube", materialId: "level", position: [-3, 0.75, -3], scale: [0.5, 1.5, 0.5], rotationY: 0, physics: { type: "static", shape: "box", gravityScale: 0, continuous: false } },
        { id: "pillar-right", meshId: "cube", materialId: "level", position: [3, 0.75, -3], scale: [0.5, 1.5, 0.5], rotationY: 0, physics: { type: "static", shape: "box", gravityScale: 0, continuous: false } },
      ],
    }],
    audio: { policy: "disabled", cues: [] },
    save: { restoreOnBoot: true, slot: "auto", maxBytes: 262_144 },
  };
}

function create3DStarterAssets() {
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
    for (let index = 0; index < 4; index += 1) {
      positions.push(...face.v[index]);
      normals.push(...face.n);
      uvs.push(...([[0, 0], [1, 0], [1, 1], [0, 1]][index]));
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const streams = [new Uint8Array(new Float32Array(positions).buffer), new Uint8Array(new Float32Array(normals).buffer), new Uint8Array(new Float32Array(uvs).buffer), new Uint8Array(new Uint16Array(indices).buffer)];
  const offsets: number[] = [];
  let byteLength = 0;
  for (const stream of streams) { offsets.push(byteLength); byteLength += stream.byteLength; }
  const binary = new Uint8Array(byteLength);
  streams.forEach((stream, index) => binary.set(stream, offsets[index]));
  const uri = `data:application/octet-stream;base64,${toBase64(binary)}`;
  const gltf = {
    asset: { version: "2.0", generator: "Catalog Engine browser 3D starter" },
    buffers: [{ uri, byteLength }],
    bufferViews: streams.map((stream, index) => ({ buffer: 0, byteOffset: offsets[index], byteLength: stream.byteLength })),
    accessors: [
      { bufferView: 0, componentType: 5126, count: 24, type: "VEC3", min: [-1, -1, -1], max: [1, 1, 1] },
      { bufferView: 1, componentType: 5126, count: 24, type: "VEC3" },
      { bufferView: 2, componentType: 5126, count: 24, type: "VEC2" },
      { bufferView: 3, componentType: 5123, count: 36, type: "SCALAR" },
    ],
    meshes: [{ name: "Starter Cube", primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3, mode: 4 }] }],
  };
  const gltfBytes = new TextEncoder().encode(JSON.stringify(gltf));
  return [
    { id: "level-gltf", name: "starter-level.gltf", kind: "data" as const, mimeType: "model/gltf+json", bytes: gltfBytes },
    { id: "checker-rgba", name: "starter-checker.rgba8", kind: "data" as const, mimeType: "application/octet-stream", bytes: new Uint8Array([30, 67, 87, 255, 235, 151, 68, 255, 235, 151, 68, 255, 30, 67, 87, 255]) },
  ];
}

function pongEntity(id: string, label: string, x: number, y: number, width: number, height: number, kind: EditorEntityData["kind"], color: string, accent: string, extra: EditorEntityData["components"]): EditorEntityData {
  return {
    id, label, x, y, width, height, scale: 1, layer: kind === "prop" ? 1 : 2, color, accent, kind,
    components: [
      { id: `${id}-transform`, type: "transform", enabled: true, values: { x, y, scale: 1 } },
      { id: `${id}-sprite`, type: "sprite", enabled: true, values: { asset: "generated", tint: color } },
      ...extra,
    ],
  };
}

function scoreEntity(id: string, label: string, x: number, stateKey: string): EditorEntityData {
  return {
    id,
    label,
    x,
    y: 54,
    width: 72,
    height: 48,
    scale: 1,
    layer: 10,
    color: "#09131b",
    accent: "#173442",
    kind: "prop",
    components: [
      { id: `${id}-transform`, type: "transform", enabled: true, values: { x, y: 54, scale: 1 } },
      { id: `${id}-ui`, type: "ui", enabled: true, values: { text: "0", stateKey, align: "center", fontSize: 38 } },
    ],
  };
}

function collider(id: string): EditorEntityData["components"][number] {
  return { id: `${id}-collider`, type: "collider", enabled: true, values: { shape: "box", solid: true } };
}

function behavior(id: string, module: string, values: Record<string, string | number | boolean>): EditorEntityData["components"][number] {
  return { id: `${id}-behavior`, type: "behavior", enabled: true, values: { module, export: "update", ...values } };
}

function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function cleanName(value: string, fallback: string) {
  return value.trim().replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 80) || fallback;
}

const PONG_SCRIPT = `import type { PlayableBehavior2D, PlayableBehaviorDefinition2D } from "@hyperfocus/engine/project/runtime-2d";

// Select Ball > Pong ball to tune its public fields. Create an override when you
// want project-owned logic; behavior commands keep state changes deterministic.
export const addJuiceDefinition = {
  version: 1,
  id: "pong-add-juice",
  module: "./src/gameplay.ts",
  exportName: "addJuice",
  label: "Pong serve boost",
  description: "Adds a small horizontal boost while the Serve action is held.",
  category: "Pong",
  fields: [{ key: "serveBoost", label: "Serve boost", type: "number", default: 40, minimum: 0, maximum: 500, unit: "px/s", group: "Movement" }],
  events: [{ name: "pong:serve-boost", label: "Serve boost applied" }],
} satisfies PlayableBehaviorDefinition2D;

export const addJuice: PlayableBehavior2D = ({ actions, component }) => ({
  velocityX: actions.includes("serve") ? Number(component.values.serveBoost ?? 40) : 0,
  commands: actions.includes("serve") ? [{ type: "emit-event", name: "pong:serve-boost" }] : [],
});

Object.defineProperty(addJuice, "definition", { value: Object.freeze(addJuiceDefinition) });
`;

const BLANK_SCRIPT = `import type { PlayableBehavior2D, PlayableBehaviorDefinition2D } from "@hyperfocus/engine/project/runtime-2d";

export const updateDefinition = {
  version: 1,
  id: "move-right",
  module: "./src/game.ts",
  exportName: "update",
  label: "Move right",
  description: "Moves while the move-right action is active.",
  category: "Movement",
  fields: [{ key: "speed", label: "Speed", type: "number", default: 180, minimum: 0, maximum: 2_000, unit: "px/s" }],
} satisfies PlayableBehaviorDefinition2D;

export const update: PlayableBehavior2D = ({ actions, component }) => ({
  velocityX: actions.includes("move-right") ? Number(component.values.speed ?? 180) : 0,
});

Object.defineProperty(update, "definition", { value: Object.freeze(updateDefinition) });
`;

const PLATFORMER_SCRIPT = `// The built-in platformer controller already owns deterministic movement,
// collision, coyote time, and jump buffering. Add project-specific reactions here
// and attach them alongside the built-in from the selected entity's inspector.
export const summitTuning = {
  targetEntityId: "summit",
  celebrationEvent: "platformer:summit",
};
`;

const THREE_D_SCRIPT = `// The 3D starter uses the portable hyperfocus3D declaration in project.json.
// Add game-specific orchestration here when building with: bun run build:game -- --project <directory>
export const playerTuning = {
  speed: 3.5,
  cameraFollow: [0, 5, 8] as const,
};
`;
