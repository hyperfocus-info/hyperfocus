import {
  ACESFilmicToneMapping,
  AmbientLight,
  BoxGeometry,
  Color,
  DirectionalLight,
  Fog,
  GridHelper,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type Object3D,
} from "three";
import { createFixedStepDriver } from "@hyperfocus/engine";
import {
  loadMotionLabFixtureRepository,
  MOTION_LAB_FIXTURE_IDS,
  MOTION_LAB_FIXTURE_LABELS,
  type MotionLabFixtureId,
  type MotionLabFixtureRepository,
} from "./fixture-repository.ts";
import {
  createMotionPreviewAdapter,
  type MotionPreviewAdapter,
  type MotionPreviewCapabilities,
  type MotionPreviewSnapshot,
} from "./motion-integration.ts";
import {
  DEFAULT_LAB_CONTROLS,
  LAB_SCENARIO_IDS,
  normalizeLabControls,
  resolveLabSignals,
  scenarioFromKeyboard,
  type LabControls,
  type LabScenarioId,
  type LabSignals,
  type LabTerrainKind,
} from "./scenarios.ts";

const FIXED_STEP_SECONDS = 1 / 60;
const MAX_FRAME_DELTA_SECONDS = 0.1;
const TELEMETRY_INTERVAL_SECONDS = 0.1;
const SLOPE_RADIANS = Math.PI / 12;

type ViewId = "aim" | "front" | "side";

type TerrainSet = Readonly<Record<LabTerrainKind, Group>>;

type LabViewport = {
  actorRoot: Group;
  adapter: MotionPreviewAdapter | null;
  aimMarker: Mesh;
  camera: PerspectiveCamera;
  canvas: HTMLCanvasElement;
  id: ViewId;
  renderer: WebGLRenderer;
  rigRoot: Group | null;
  scene: Scene;
  terrain: TerrainSet;
};

type MotionLabSnapshot = {
  captureReady: boolean;
  controls: LabControls;
  fixture: MotionLabFixtureId;
  paused: boolean;
  scenario: LabScenarioId;
  simulationStep: number;
  simulationTimeSeconds: number;
  views: Readonly<Record<ViewId, MotionPreviewSnapshot | null>>;
};

type StableMotionLabSnapshot = Omit<MotionLabSnapshot, "views"> & {
  views: Readonly<Record<ViewId, {
    gaitPhase: number;
    nanCount: number;
    poseChecksum: string;
  } | null>>;
};

type MotionLabAutomation = {
  captureReady: boolean;
  ready: boolean;
  advanceFixed(steps?: number): StableMotionLabSnapshot;
  captureViewDataUrl(view: ViewId): string;
  pause(): void;
  render(): void;
  reset(): StableMotionLabSnapshot;
  resume(): void;
  setControls(patch: Partial<LabControls>): StableMotionLabSnapshot;
  setFixture(id: MotionLabFixtureId): Promise<StableMotionLabSnapshot>;
  setScenario(id: LabScenarioId): StableMotionLabSnapshot;
  snapshot(): MotionLabSnapshot;
  stableSnapshot(): StableMotionLabSnapshot;
};

declare global {
  interface Window {
    __motionLab: MotionLabAutomation;
  }
}

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Motion laboratory UI is missing ${selector}.`);
  return element;
}

const fixtureSelect = requiredElement<HTMLSelectElement>("#fixtureSelect");
const pauseButton = requiredElement<HTMLButtonElement>("#pauseButton");
const resetButton = requiredElement<HTMLButtonElement>("#resetButton");
const statusElement = requiredElement<HTMLElement>("#labStatus");
const speedInput = requiredElement<HTMLInputElement>("#speedInput");
const speedOutput = requiredElement<HTMLOutputElement>("#speedOutput");
const aimPitchInput = requiredElement<HTMLInputElement>("#aimPitchInput");
const aimPitchOutput = requiredElement<HTMLOutputElement>("#aimPitchOutput");
const aimYawInput = requiredElement<HTMLInputElement>("#aimYawInput");
const aimYawOutput = requiredElement<HTMLOutputElement>("#aimYawOutput");
const poseP95Element = requiredElement<HTMLElement>("#poseP95");
const footSlipElement = requiredElement<HTMLElement>("#footSlip");
const plantErrorElement = requiredElement<HTMLElement>("#plantError");
const nanCountElement = requiredElement<HTMLElement>("#nanCount");
const gaitPhaseElement = requiredElement<HTMLElement>("#gaitPhase");
const poseChecksumElement = requiredElement<HTMLElement>("#poseChecksum");
const adapterModeElement = requiredElement<HTMLElement>("#adapterMode");
const capabilityList = requiredElement<HTMLUListElement>("#capabilityList");
const mappingStatusElement = requiredElement<HTMLElement>("#mappingStatus");
const warningList = requiredElement<HTMLUListElement>("#warningList");
const warningCountElement = requiredElement<HTMLElement>("#warningCount");
const fixtureJointsElement = requiredElement<HTMLElement>("#fixtureJoints");
const fixtureClipsElement = requiredElement<HTMLElement>("#fixtureClips");
const fixtureBytesElement = requiredElement<HTMLElement>("#fixtureBytes");
const fixtureTransformElement = requiredElement<HTMLElement>("#fixtureTransform");
const scenarioButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-scenario]"));

const sharedGroundMaterial = new MeshStandardMaterial({ color: 0x1a2229, metalness: 0.02, roughness: 0.92 });
const sharedSlopeMaterial = new MeshStandardMaterial({ color: 0x18242a, metalness: 0.02, roughness: 0.9 });
const sharedStairMaterial = new MeshStandardMaterial({ color: 0x202830, metalness: 0.03, roughness: 0.88 });
const sharedPlaneGeometry = new PlaneGeometry(8, 8);
const sharedStepGeometry = new BoxGeometry(5.6, 1, 0.38);
const sharedAimGeometry = new SphereGeometry(0.055, 12, 8);
const sharedAimMaterial = new MeshBasicMaterial({ color: 0xffbd4a, depthTest: false });
const aimTargetPosition = new Vector3();

function terrainGroup(kind: LabTerrainKind): Group {
  const group = new Group();
  group.name = `terrain:${kind}`;
  if (kind === "flat") {
    const floor = new Mesh(sharedPlaneGeometry, sharedGroundMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    group.add(floor);
    const grid = new GridHelper(8, 20, 0x34414c, 0x202830);
    grid.position.y = 0.002;
    group.add(grid);
    return group;
  }
  if (kind === "slope") {
    const slope = new Mesh(sharedPlaneGeometry, sharedSlopeMaterial);
    slope.rotation.x = -Math.PI / 2 - SLOPE_RADIANS;
    slope.receiveShadow = true;
    group.add(slope);
    return group;
  }

  const baseHeight = -0.9;
  for (let index = -6; index <= 6; index += 1) {
    const top = index * 0.12;
    const height = Math.max(0.02, top - baseHeight);
    const step = new Mesh(sharedStepGeometry, sharedStairMaterial);
    step.scale.y = height;
    step.position.set(0, baseHeight + height * 0.5, index * 0.4);
    step.receiveShadow = true;
    group.add(step);
  }
  return group;
}

function createViewport(id: ViewId, canvas: HTMLCanvasElement): LabViewport {
  const renderer = new WebGLRenderer({ alpha: false, antialias: true, canvas, powerPreference: "high-performance" });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;

  const scene = new Scene();
  scene.background = new Color(0x0c1014);
  scene.fog = new Fog(0x0c1014, 7, 14);
  scene.add(new AmbientLight(0x8ba2b6, 0.45));
  scene.add(new HemisphereLight(0xb9d9ee, 0x17200f, 1.4));
  const keyLight = new DirectionalLight(0xffffff, 2.2);
  keyLight.position.set(-2.5, 5, 3.5);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  keyLight.shadow.camera.near = 0.1;
  keyLight.shadow.camera.far = 12;
  scene.add(keyLight);

  const camera = new PerspectiveCamera(id === "aim" ? 28 : 25, 1, 0.05, 30);
  if (id === "side") camera.position.set(4.25, 1.05, 0);
  else if (id === "front") camera.position.set(0, 1.05, 4.25);
  else camera.position.set(3.25, 1.8, 4.1);
  camera.lookAt(0, 0.92, 0);

  const actorRoot = new Group();
  actorRoot.name = `actor:${id}`;
  scene.add(actorRoot);

  const flat = terrainGroup("flat");
  const slope = terrainGroup("slope");
  const stairs = terrainGroup("stairs");
  scene.add(flat, slope, stairs);

  const aimMarker = new Mesh(sharedAimGeometry, sharedAimMaterial);
  aimMarker.name = `aim-target:${id}`;
  aimMarker.renderOrder = 10;
  scene.add(aimMarker);

  return {
    actorRoot,
    adapter: null,
    aimMarker,
    camera,
    canvas,
    id,
    renderer,
    rigRoot: null,
    scene,
    terrain: { flat, slope, stairs },
  };
}

const viewports: readonly LabViewport[] = [
  createViewport("side", requiredElement<HTMLCanvasElement>("#sideCanvas")),
  createViewport("front", requiredElement<HTMLCanvasElement>("#frontCanvas")),
  createViewport("aim", requiredElement<HTMLCanvasElement>("#aimCanvas")),
];

let repository: MotionLabFixtureRepository | null = null;
let currentFixture: MotionLabFixtureId = "canonical";
let currentScenario: LabScenarioId = "forward";
let controls: LabControls = { ...DEFAULT_LAB_CONTROLS };
let signals: LabSignals = resolveLabSignals(currentScenario, controls);
let paused = false;
let simulationStep = 0;
let simulationTimeSeconds = 0;
let lastTelemetrySeconds = -Infinity;

function isFixtureId(value: string): value is MotionLabFixtureId {
  return (MOTION_LAB_FIXTURE_IDS as readonly string[]).includes(value);
}

function isScenarioId(value: string): value is LabScenarioId {
  return (LAB_SCENARIO_IDS as readonly string[]).includes(value);
}

function setStatus(message: string, state: "error" | "loading" | "ready"): void {
  statusElement.textContent = message;
  statusElement.dataset.state = state;
}

function refreshSignals(): void {
  signals = resolveLabSignals(currentScenario, controls);
  for (const viewport of viewports) {
    viewport.terrain.flat.visible = signals.terrain === "flat";
    viewport.terrain.slope.visible = signals.terrain === "slope";
    viewport.terrain.stairs.visible = signals.terrain === "stairs";
    const horizontal = Math.cos(signals.aimPitch) * 2.7;
    aimTargetPosition.set(
      Math.sin(signals.aimYaw) * horizontal,
      1.28 + Math.sin(signals.aimPitch) * 2.7,
      Math.cos(signals.aimYaw) * horizontal,
    );
    viewport.aimMarker.position.copy(aimTargetPosition);
    viewport.aimMarker.visible = currentScenario === "aim" || viewport.id === "aim";
  }
}

function updateControlOutputs(): void {
  speedInput.value = controls.speedMetersPerSecond.toString();
  aimPitchInput.value = controls.aimPitchDegrees.toString();
  aimYawInput.value = controls.aimYawDegrees.toString();
  speedOutput.value = `${controls.speedMetersPerSecond.toFixed(2)} m/s`;
  aimPitchOutput.value = `${Math.round(controls.aimPitchDegrees)} deg`;
  aimYawOutput.value = `${Math.round(controls.aimYawDegrees)} deg`;
}

function setControls(patch: Partial<LabControls>): void {
  controls = normalizeLabControls({ ...controls, ...patch });
  updateControlOutputs();
  refreshSignals();
}

function setScenario(id: LabScenarioId): void {
  currentScenario = id;
  for (const button of scenarioButtons) button.setAttribute("aria-pressed", String(button.dataset.scenario === id));
  refreshSignals();
  resetSimulation();
}

function resetSimulation(): void {
  simulationStep = 0;
  simulationTimeSeconds = 0;
  simulationDriver.reset(performance.now());
  for (const viewport of viewports) viewport.adapter?.reset();
  lastTelemetrySeconds = -Infinity;
  refreshTelemetry();
}

function stepSimulation(): void {
  for (const viewport of viewports) viewport.adapter?.step(FIXED_STEP_SECONDS, signals);
  simulationStep += 1;
  simulationTimeSeconds = simulationStep * FIXED_STEP_SECONDS;
}

function resizeViewport(viewport: LabViewport): void {
  const width = Math.max(1, Math.floor(viewport.canvas.clientWidth));
  const height = Math.max(1, Math.floor(viewport.canvas.clientHeight));
  const pixelRatio = viewport.renderer.getPixelRatio();
  if (viewport.canvas.width !== Math.floor(width * pixelRatio) || viewport.canvas.height !== Math.floor(height * pixelRatio)) {
    viewport.renderer.setSize(width, height, false);
    viewport.camera.aspect = width / height;
    viewport.camera.updateProjectionMatrix();
  }
}

function renderAll(): void {
  for (const viewport of viewports) {
    resizeViewport(viewport);
    viewport.renderer.render(viewport.scene, viewport.camera);
  }
}

function setGate(element: HTMLElement, passed: boolean | null): void {
  if (passed === null) delete element.dataset.gate;
  else element.dataset.gate = passed ? "pass" : "fail";
}

const capabilityLabels: ReadonlyArray<readonly [keyof MotionPreviewCapabilities, string]> = [
  ["proceduralLocomotion", "Procedural locomotion"],
  ["footPlanting", "Two-leg foot planting"],
  ["armReach", "Two-arm reach IK"],
  ["aim", "Distributed spine aim"],
  ["extraBonePassthrough", "Tagged extra-bone passthrough"],
];

function updateCapabilities(capabilities: MotionPreviewCapabilities): void {
  capabilityList.replaceChildren(...capabilityLabels.map(([key, label]) => {
    const item = document.createElement("li");
    item.dataset.enabled = String(capabilities[key]);
    item.textContent = label;
    return item;
  }));
  mappingStatusElement.textContent = capabilities.mappingValidated ? "validated" : "review required";
  mappingStatusElement.style.color = capabilities.mappingValidated ? "var(--accent)" : "var(--warning)";
}

function updateWarnings(warnings: readonly string[]): void {
  warningCountElement.textContent = String(warnings.length);
  if (warnings.length === 0) {
    const item = document.createElement("li");
    item.className = "no-warning";
    item.textContent = "No capability warnings for this fixture.";
    warningList.replaceChildren(item);
    return;
  }
  warningList.replaceChildren(...warnings.map((warning) => {
    const item = document.createElement("li");
    item.textContent = warning;
    return item;
  }));
}

function viewportSnapshots(): Readonly<Record<ViewId, MotionPreviewSnapshot | null>> {
  return {
    aim: viewports[2]?.adapter?.snapshot() ?? null,
    front: viewports[1]?.adapter?.snapshot() ?? null,
    side: viewports[0]?.adapter?.snapshot() ?? null,
  };
}

function refreshTelemetry(): void {
  const snapshots = viewports.map((viewport) => viewport.adapter?.snapshot() ?? null);
  const available = snapshots.filter((snapshot): snapshot is MotionPreviewSnapshot => snapshot !== null);
  if (available.length === 0) return;
  const p95 = Math.max(...available.map((snapshot) => snapshot.metrics.evaluationP95Ms));
  const slips = available
    .map((snapshot) => snapshot.metrics.footSlipMeters)
    .filter((value): value is number => value !== null);
  const footSlip = slips.length > 0 ? Math.max(...slips) : null;
  const plantErrors = available
    .map((snapshot) => snapshot.metrics.plantedVerticalErrorMeters)
    .filter((value): value is number => value !== null);
  const plantError = plantErrors.length > 0 ? Math.max(...plantErrors) : null;
  const nanCount = Math.max(...available.map((snapshot) => snapshot.metrics.nanCount));
  const representative = available[0];
  if (!representative) return;

  poseP95Element.textContent = `${p95.toFixed(3)} ms`;
  setGate(poseP95Element, p95 < 2);
  footSlipElement.textContent = footSlip === null ? "disabled" : `${footSlip.toFixed(3)} m`;
  setGate(footSlipElement, footSlip === null ? null : footSlip < 0.02);
  plantErrorElement.textContent = plantError === null ? "disabled" : `${plantError.toExponential(1)} m`;
  setGate(plantErrorElement, plantError === null ? null : plantError <= 1e-4);
  nanCountElement.textContent = nanCount === 0 ? "pass / 0" : `fail / ${nanCount}`;
  setGate(nanCountElement, nanCount === 0);
  gaitPhaseElement.textContent = representative.metrics.gaitPhase.toFixed(3);
  poseChecksumElement.textContent = representative.metrics.poseChecksum;
  adapterModeElement.textContent = representative.adapter;
}

function snapshot(): MotionLabSnapshot {
  return {
    captureReady: window.__motionLab.captureReady,
    controls: { ...controls },
    fixture: currentFixture,
    paused,
    scenario: currentScenario,
    simulationStep,
    simulationTimeSeconds,
    views: viewportSnapshots(),
  };
}

function stableSnapshot(): StableMotionLabSnapshot {
  const full = snapshot();
  return {
    captureReady: full.captureReady,
    controls: full.controls,
    fixture: full.fixture,
    paused: full.paused,
    scenario: full.scenario,
    simulationStep: full.simulationStep,
    simulationTimeSeconds: full.simulationTimeSeconds,
    views: {
      aim: full.views.aim ? {
        gaitPhase: full.views.aim.metrics.gaitPhase,
        nanCount: full.views.aim.metrics.nanCount,
        poseChecksum: full.views.aim.metrics.poseChecksum,
      } : null,
      front: full.views.front ? {
        gaitPhase: full.views.front.metrics.gaitPhase,
        nanCount: full.views.front.metrics.nanCount,
        poseChecksum: full.views.front.metrics.poseChecksum,
      } : null,
      side: full.views.side ? {
        gaitPhase: full.views.side.metrics.gaitPhase,
        nanCount: full.views.side.metrics.nanCount,
        poseChecksum: full.views.side.metrics.poseChecksum,
      } : null,
    },
  };
}

function markFixtureMeshes(root: Object3D): void {
  root.traverse((object) => {
    if (!("isMesh" in object) || !(object as Mesh).isMesh) return;
    const mesh = object as Mesh;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });
}

async function selectFixture(id: MotionLabFixtureId): Promise<void> {
  const source = repository;
  if (!source) throw new Error("Fixture repository has not finished loading.");
  window.__motionLab.captureReady = false;
  setStatus(`Preparing ${MOTION_LAB_FIXTURE_LABELS[id]}...`, "loading");
  currentFixture = id;
  fixtureSelect.value = id;
  const entry = source.entry(id);

  for (const viewport of viewports) {
    if (viewport.rigRoot) viewport.actorRoot.remove(viewport.rigRoot);
    const rigRoot = source.createInstance(id);
    markFixtureMeshes(rigRoot);
    viewport.actorRoot.add(rigRoot);
    viewport.rigRoot = rigRoot;
    viewport.adapter = createMotionPreviewAdapter({
      actorRoot: viewport.actorRoot,
      canonicalJointNames: source.canonicalJointNames,
      fixture: entry,
      fixtureId: id,
      rigRoot,
    });
  }

  const representative = viewports[0]?.adapter;
  if (!representative) throw new Error("Motion adapter did not initialize.");
  updateCapabilities(representative.capabilities);
  updateWarnings(representative.warnings);
  fixtureJointsElement.textContent = String(entry.inspection.joints);
  fixtureClipsElement.textContent = String(entry.inspection.animations);
  fixtureBytesElement.textContent = `${(entry.byteLength / 1024).toFixed(1)} KiB`;
  fixtureTransformElement.textContent = entry.transform;
  resetSimulation();
  stepSimulation();
  renderAll();
  refreshTelemetry();
  window.__motionLab.captureReady = true;
  setStatus(`${MOTION_LAB_FIXTURE_LABELS[id]} / ready`, "ready");
}

function setPaused(value: boolean): void {
  paused = value;
  pauseButton.textContent = paused ? "Resume" : "Pause";
  simulationDriver.reset(performance.now());
}

window.__motionLab = {
  captureReady: false,
  ready: false,
  advanceFixed(steps = 1) {
    setPaused(true);
    const count = Math.min(36_000, Math.max(0, Math.floor(Number.isFinite(steps) ? steps : 0)));
    for (let index = 0; index < count; index += 1) stepSimulation();
    renderAll();
    refreshTelemetry();
    return stableSnapshot();
  },
  captureViewDataUrl(view) {
    const viewport = viewports.find((candidate) => candidate.id === view);
    if (!viewport) throw new RangeError(`Unknown motion-lab view: ${String(view)}`);
    resizeViewport(viewport);
    viewport.renderer.render(viewport.scene, viewport.camera);
    return viewport.canvas.toDataURL("image/png");
  },
  pause() {
    setPaused(true);
  },
  render() {
    renderAll();
    refreshTelemetry();
  },
  reset() {
    resetSimulation();
    stepSimulation();
    renderAll();
    return stableSnapshot();
  },
  resume() {
    setPaused(false);
  },
  setControls(patch) {
    setControls(patch);
    renderAll();
    return stableSnapshot();
  },
  async setFixture(id) {
    if (!isFixtureId(id)) throw new RangeError(`Unknown motion-lab fixture: ${String(id)}`);
    await selectFixture(id);
    return stableSnapshot();
  },
  setScenario(id) {
    if (!isScenarioId(id)) throw new RangeError(`Unknown motion-lab scenario: ${String(id)}`);
    setScenario(id);
    renderAll();
    return stableSnapshot();
  },
  snapshot,
  stableSnapshot,
};

for (const button of scenarioButtons) {
  button.addEventListener("click", () => {
    const id = button.dataset.scenario;
    if (id && isScenarioId(id)) setScenario(id);
  });
}

fixtureSelect.addEventListener("change", () => {
  if (!isFixtureId(fixtureSelect.value)) return;
  void selectFixture(fixtureSelect.value).catch(handleFatalError);
});

pauseButton.addEventListener("click", () => setPaused(!paused));
resetButton.addEventListener("click", () => {
  resetSimulation();
  stepSimulation();
});

speedInput.addEventListener("input", () => setControls({ speedMetersPerSecond: Number(speedInput.value) }));
aimPitchInput.addEventListener("input", () => setControls({ aimPitchDegrees: Number(aimPitchInput.value) }));
aimYawInput.addEventListener("input", () => setControls({ aimYawDegrees: Number(aimYawInput.value) }));

window.addEventListener("keydown", (event) => {
  const target = event.target as HTMLElement | null;
  if (target?.matches("input, select, textarea, button")) return;
  if (event.code === "Space") {
    event.preventDefault();
    setPaused(!paused);
    return;
  }
  if (event.code === "KeyR") {
    resetSimulation();
    return;
  }
  const scenario = scenarioFromKeyboard(event.code);
  if (scenario) setScenario(scenario);
});

const simulationDriver = createFixedStepDriver({
  step: FIXED_STEP_SECONDS,
  maxFrame: MAX_FRAME_DELTA_SECONDS,
  update: stepSimulation,
  render: renderAll,
});

function frame(nowMilliseconds: number): void {
  const nowSeconds = nowMilliseconds / 1000;
  if (paused) {
    simulationDriver.reset(nowMilliseconds);
    renderAll();
  } else {
    simulationDriver.advance(nowMilliseconds);
  }
  if (nowSeconds - lastTelemetrySeconds >= TELEMETRY_INTERVAL_SECONDS) {
    refreshTelemetry();
    lastTelemetrySeconds = nowSeconds;
  }
  requestAnimationFrame(frame);
}

function handleFatalError(error: unknown): void {
  console.error(error);
  const message = error instanceof Error ? error.message : String(error);
  setStatus(message, "error");
  window.__motionLab.captureReady = false;
}

async function initialize(): Promise<void> {
  updateControlOutputs();
  refreshSignals();
  renderAll();
  repository = await loadMotionLabFixtureRepository();
  await selectFixture(currentFixture);
  fixtureSelect.disabled = false;
  pauseButton.disabled = false;
  resetButton.disabled = false;
  window.__motionLab.ready = true;
  requestAnimationFrame(frame);
}

void initialize().catch(handleFatalError);
