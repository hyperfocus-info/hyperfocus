import type * as Three from "three";
import type { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import type { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { CameraRig, ThreeWorldTextOverlay3D } from "@hyperfocus/engine/render/3d";
import * as lobbyNetwork from "../network.ts";
import { CAMERA_BASE_DISTANCE, CAMERA_DEFAULT_PITCH } from "./constants.ts";
import { THREE } from "./boot-and-dom.ts";
import type { CameraRigSnapshot, RemotePlayer, WorldPoint } from "./runtime-types.ts";

export let renderer: Three.WebGLRenderer;
export let scene: Three.Scene;
export let camera: Three.PerspectiveCamera;
export let raycaster: Three.Raycaster;
export let groundPlane: Three.Plane;
export let gltfLoader: GLTFLoader | null = null;
export let fbxLoader: FBXLoader | null = null;
export let modelTextureOverride = "assets/usable/textures/kenney/graveyard-colormap.png";
export let networkModule: typeof lobbyNetwork | null = null;
export let networkClient: Awaited<ReturnType<typeof lobbyNetwork.connectLobby>> | null = null;
export let networkClock = 0;
export let lobbyRoomStatus: Record<string, unknown> | null = null;
export let minimapCtx: CanvasRenderingContext2D | null = null;
export let hudClock = 0;
export let lastWeaponHudKey = "";
export let lastPassiveHudKey = "";
export let cameraRig: CameraRig | null = null;
export let cameraRigSnapshot: CameraRigSnapshot | null = null;
export let floatingTextLayer: ThreeWorldTextOverlay3D | null = null;
export let cameraYaw = 0;
export let cameraPitch = CAMERA_DEFAULT_PITCH;
export let cameraDistance = CAMERA_BASE_DISTANCE;
export let desiredCameraYaw = 0;
export let desiredCameraPitch = CAMERA_DEFAULT_PITCH;
export let desiredCameraDistance = CAMERA_BASE_DISTANCE;
export let cameraBlocked = false;
export let centerBannerTimeout: ReturnType<typeof setTimeout> | undefined;
export let toastTimeout: ReturnType<typeof setTimeout> | undefined;

export const renderContext = {
  get renderer(): Three.WebGLRenderer { return renderer; },
  set renderer(value: Three.WebGLRenderer) { renderer = value; },
  get scene(): Three.Scene { return scene; },
  set scene(value: Three.Scene) { scene = value; },
  get camera(): Three.PerspectiveCamera { return camera; },
  set camera(value: Three.PerspectiveCamera) { camera = value; },
  get raycaster(): Three.Raycaster { return raycaster; },
  set raycaster(value: Three.Raycaster) { raycaster = value; },
  get groundPlane(): Three.Plane { return groundPlane; },
  set groundPlane(value: Three.Plane) { groundPlane = value; },
  get gltfLoader(): GLTFLoader | null { return gltfLoader; },
  set gltfLoader(value: GLTFLoader | null) { gltfLoader = value; },
  get fbxLoader(): FBXLoader | null { return fbxLoader; },
  set fbxLoader(value: FBXLoader | null) { fbxLoader = value; },
  get modelTextureOverride(): string { return modelTextureOverride; },
  set modelTextureOverride(value: string) { modelTextureOverride = value; },
  get minimapCtx(): CanvasRenderingContext2D | null { return minimapCtx; },
  set minimapCtx(value: CanvasRenderingContext2D | null) { minimapCtx = value; },
  get floatingTextLayer(): ThreeWorldTextOverlay3D | null { return floatingTextLayer; },
  set floatingTextLayer(value: ThreeWorldTextOverlay3D | null) { floatingTextLayer = value; },
};

export const networkContext = {
  get module(): typeof lobbyNetwork | null { return networkModule; },
  set module(value: typeof lobbyNetwork | null) { networkModule = value; },
  get client(): Awaited<ReturnType<typeof lobbyNetwork.connectLobby>> | null { return networkClient; },
  set client(value: Awaited<ReturnType<typeof lobbyNetwork.connectLobby>> | null) { networkClient = value; },
  get clock(): number { return networkClock; },
  set clock(value: number) { networkClock = value; },
  get roomStatus(): Record<string, unknown> | null { return lobbyRoomStatus; },
  set roomStatus(value: Record<string, unknown> | null) { lobbyRoomStatus = value; },
};

export const cameraContext = {
  get rig(): CameraRig | null { return cameraRig; },
  set rig(value: CameraRig | null) { cameraRig = value; },
  get snapshot(): CameraRigSnapshot | null { return cameraRigSnapshot; },
  set snapshot(value: CameraRigSnapshot | null) { cameraRigSnapshot = value; },
  get yaw(): number { return cameraYaw; },
  set yaw(value: number) { cameraYaw = value; },
  get pitch(): number { return cameraPitch; },
  set pitch(value: number) { cameraPitch = value; },
  get distance(): number { return cameraDistance; },
  set distance(value: number) { cameraDistance = value; },
  get desiredYaw(): number { return desiredCameraYaw; },
  set desiredYaw(value: number) { desiredCameraYaw = value; },
  get desiredPitch(): number { return desiredCameraPitch; },
  set desiredPitch(value: number) { desiredCameraPitch = value; },
  get desiredDistance(): number { return desiredCameraDistance; },
  set desiredDistance(value: number) { desiredCameraDistance = value; },
  get blocked(): boolean { return cameraBlocked; },
  set blocked(value: boolean) { cameraBlocked = value; },
};

export const hudContext = {
  get clock(): number { return hudClock; },
  set clock(value: number) { hudClock = value; },
  get lastWeaponKey(): string { return lastWeaponHudKey; },
  set lastWeaponKey(value: string) { lastWeaponHudKey = value; },
  get lastPassiveKey(): string { return lastPassiveHudKey; },
  set lastPassiveKey(value: string) { lastPassiveHudKey = value; },
  get centerBannerTimeout(): ReturnType<typeof setTimeout> | undefined { return centerBannerTimeout; },
  set centerBannerTimeout(value: ReturnType<typeof setTimeout> | undefined) { centerBannerTimeout = value; },
  get toastTimeout(): ReturnType<typeof setTimeout> | undefined { return toastTimeout; },
  set toastTimeout(value: ReturnType<typeof setTimeout> | undefined) { toastTimeout = value; },
  get lastReticleX(): number { return lastReticleX; },
  set lastReticleX(value: number) { lastReticleX = value; },
  get lastReticleY(): number { return lastReticleY; },
  set lastReticleY(value: number) { lastReticleY = value; },
};

export function setCenterBannerTimeout(value: ReturnType<typeof setTimeout> | undefined): void {
  centerBannerTimeout = value;
}

export function setToastTimeout(value: ReturnType<typeof setTimeout> | undefined): void {
  toastTimeout = value;
}

export const keys = new Set<string>();
export const remotePlayers = new Map<string, RemotePlayer>();
export const cameraObstacleBuffer: Three.Object3D[] = [];
export const tempVec = new THREE.Vector3();
export const tempCameraTarget = new THREE.Vector3();
export const tempCameraOffset = new THREE.Vector3();
export const tempCameraDesired = new THREE.Vector3();
export const tempCameraWorldSize = new THREE.Vector2();
export const tempPointerNdc = new THREE.Vector2();
export const tempMatrix = new THREE.Matrix4();
export const tempQuaternion = new THREE.Quaternion();
export const tempScale = new THREE.Vector3();
export const tempColor = new THREE.Color();
export const tempRenderPosition = { x: 0, z: 0 };
export const tempRenderPositionB = { x: 0, z: 0 };
export const tempWorldDelta = { dx: 0, dz: 0 };
export const clusterTargetScratch: WorldPoint[] = [];
export const pointer = { x: 0, y: 0, worldX: 0, worldZ: -8, manualAimUntil: 0 };
export const playerMotionPosition = new Float32Array(3);
export const playerMotionResolvedDelta = new Float32Array(3);
export const playerMotionDesiredVelocity = new Float32Array(3);
export const playerMotionFacing = new Float32Array(3);
export const playerMotionAimTarget = new Float32Array(3);
export const playerMotionGroundNormal = new Float32Array(3);
export let lastReticleX = Number.NaN;
export let lastReticleY = Number.NaN;

export function setLastReticlePosition(x: number, y: number): void {
  lastReticleX = x;
  lastReticleY = y;
}

export function setLastWeaponHudKey(value: string): void {
  lastWeaponHudKey = value;
}

export function setLastPassiveHudKey(value: string): void {
  lastPassiveHudKey = value;
}
