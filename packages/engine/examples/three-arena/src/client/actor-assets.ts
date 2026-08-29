import { runtimeThreeModules, THREE } from "./boot-and-dom.ts";
import { runtimeCallback } from "./runtime-ports.ts";
const bootErrorLabel = runtimeCallback("bootstrap", "bootErrorLabel");
const reportBootProgress = runtimeCallback("bootstrap", "reportBootProgress");
const hasArenaAnimationMetadata = runtimeCallback("contentUi", "hasArenaAnimationMetadata");
const isRecord = runtimeCallback("contentUi", "isRecord");
const createPickupSpriteTexture = runtimeCallback("pointerAndTextures", "createPickupSpriteTexture");
const loadFirstTexture = runtimeCallback("pointerAndTextures", "loadFirstTexture");
const solidTexture = runtimeCallback("pointerAndTextures", "solidTexture");
import { loadThreeLoaderAsset } from "@hyperfocus/engine/render/3d";
import type * as Three from "three";
import type { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import type { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { state } from "./arena-state.ts";
import { KENNEY_TO_UNIVERSAL_BONE_NAMES, UNIVERSAL_ANIMATION_CLIP_ALIASES, UNIVERSAL_ANIMATION_RETARGET_FPS, animatedCharacterPaths, texturePaths, universalAnimationPaths } from "./asset-catalog.ts";
import { fbxLoader, gltfLoader, renderContext } from "./runtime-context.ts";
import type { SkeletonUtilsModule } from "./boot-context.ts";
import type { ArenaAnimationClip } from "./runtime-types.ts";

export async function setupTextures(): Promise<void> {
  const loader = new THREE.TextureLoader();
  state.textures.survivor = await loadFirstTexture(loader, texturePaths.survivor, solidTexture("#7aa56e"), "Survivor skin", 0.04, 0.16);
  state.textures.ally = await loadFirstTexture(loader, texturePaths.ally, solidTexture("#6fa0c8"), "Ally skin", 0.16, 0.28);
  state.textures.zombieA = await loadFirstTexture(loader, texturePaths.zombieA, solidTexture("#74a867"), "Shambler skin", 0.28, 0.4);
  state.textures.zombieB = await loadFirstTexture(loader, texturePaths.zombieB, solidTexture("#6ea79f"), "Runner skin", 0.4, 0.52);
  state.textures.brute = await loadFirstTexture(loader, texturePaths.brute, solidTexture("#a57d52"), "Brute skin", 0.52, 0.64);
  state.textures.shade = await loadFirstTexture(loader, texturePaths.shade, solidTexture("#8b78b9"), "Shade skin", 0.64, 0.76);
  state.textures.shard = createPickupSpriteTexture("xp");
  state.textures.heal = createPickupSpriteTexture("heal");
  state.textures.magnet = createPickupSpriteTexture("magnet");
  state.textures.crate = createPickupSpriteTexture("weapon");
  reportBootProgress(0.8, "Pickup textures");
  state.textures.ruin = await loadFirstTexture(loader, ["assets/usable/scenery/ruin-low-poly/texture/Texture_MAp_ruins.png"], solidTexture("#6d6a5d"), "Ruin texture", 0.8, 0.9);
  state.textures.treasure = await loadFirstTexture(loader, ["assets/usable/collectibles/treasure-low-poly/texture/Texture_MAp_treasure.png"], solidTexture("#ffd36d"), "Treasure texture", 0.9, 1);
}

export async function setupActorAssets(): Promise<void> {
  try {
    reportBootProgress(0.05, "Preparing Three addons");
    const { FBXLoader, GLTFLoader, skeletonUtils } = runtimeThreeModules;
    const actorFbxLoader = fbxLoader ?? new FBXLoader();
    renderContext.fbxLoader = actorFbxLoader;
    const animationGltfLoader = new GLTFLoader();
    renderContext.gltfLoader = gltfLoader ?? animationGltfLoader;
    const textureLoader = new THREE.TextureLoader();
    reportBootProgress(0.18, "Loading actor rig");
    const [baseModel, idleFbx, runFbx, jumpFbx, rigSidecar] = await Promise.all([
      loadFbx(actorFbxLoader, animatedCharacterPaths.model),
      loadFbx(actorFbxLoader, animatedCharacterPaths.animations.idle),
      loadFbx(actorFbxLoader, animatedCharacterPaths.animations.run),
      loadFbx(actorFbxLoader, animatedCharacterPaths.animations.jump),
      fetch(animatedCharacterPaths.rig).then(async (response) => {
        if (!response.ok) throw new Error(`Character rig sidecar failed with HTTP ${response.status}`);
        return response.text();
      })
    ]);
    const kenneyClips = [
      renameClip(selectSourceAnimationClip(idleFbx, "idle"), "idle"),
      renameClip(selectSourceAnimationClip(runFbx, "run"), "run"),
      renameClip(selectSourceAnimationClip(jumpFbx, "jump"), "jump")
    ]
      .filter((clip): clip is Three.AnimationClip => clip !== null)
      .map((clip) => markClipSource(clip, "kenney"));
    reportBootProgress(0.48, "Binding universal clips");
    const universal = await loadRetargetedUniversalAnimations(animationGltfLoader, skeletonUtils, baseModel);
    reportBootProgress(0.68, "Loading actor skins");
    const skins: Record<string, Three.Texture> = {};
    const skinEntries = Object.entries(animatedCharacterPaths.skins);
    for (const [index, [key, path]] of skinEntries.entries()) {
      const start = 0.68 + index / Math.max(1, skinEntries.length) * 0.28;
      const end = 0.68 + (index + 1) / Math.max(1, skinEntries.length) * 0.28;
      skins[key] = await loadFirstTexture(textureLoader, [path], solidTexture("#88aa66"), `${key} skin`, start, end);
    }
    const clips = [...kenneyClips, ...universal.clips];
    const clipSources = new Map(clips.map((clip): [string, string] => {
      const source = clip.userData.animationSource;
      return [clip.name, typeof source === "string" ? source : "unknown"];
    }));
    state.actorAssets = {
      baseModel,
      clips,
      skins,
      clone: skeletonUtils.clone,
      universalClipNames: universal.names,
      retargetedUniversalClipNames: universal.clips.map((clip) => clip.name),
      retargetFailures: universal.failures,
      clipSources,
      rigSidecar
    };
    reportBootProgress(1, "Actor animation ready");
  } catch (error) {
    console.warn("Animated actor assets unavailable; using billboards.", error);
    state.actorAssets = null;
    reportBootProgress(1, "Billboard fallback ready");
  }
}

export function loadFbx(loader: FBXLoader, path: string): Promise<Three.Group> {
  return loadThreeLoaderAsset(loader, path);
}

export function renameClip(clip: Three.AnimationClip | null, name: string): Three.AnimationClip | null {
  if (!clip) return null;
  clip.name = name;
  return clip;
}

export function selectSourceAnimationClip(asset: Three.Object3D, preferredName: string): Three.AnimationClip | null {
  const clips = asset?.animations ?? [];
  const requested = normalizeSourceClipName(preferredName);
  return clips.find((clip) => normalizeSourceClipName(clip.name) === requested)
    ?? clips.find((clip) => normalizeSourceClipName(clip.name).includes(requested) && !isSourcePoseClip(clip))
    ?? clips.find((clip) => !isSourcePoseClip(clip) && (clip.duration ?? 0) > 0.1)
    ?? clips[0]
    ?? null;
}

export function normalizeSourceClipName(name = ""): string {
  return (String(name).split("|").pop() ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function isSourcePoseClip(clip: Three.AnimationClip | null | undefined): boolean {
  return /targeting|pose/i.test(clip?.name ?? "") || (clip?.duration ?? 0) <= 0.05;
}

export function markClipSource(
  clip: Three.AnimationClip | null,
  source: string,
  extra: Record<string, unknown> = {}
): ArenaAnimationClip {
  if (!clip) throw new Error(`Cannot mark a missing ${source} animation clip.`);
  const userData = "userData" in clip && isRecord(clip.userData) ? clip.userData : {};
  Object.assign(clip, { userData: { ...userData, ...extra, animationSource: source } });
  if (!hasArenaAnimationMetadata(clip)) throw new Error("Animation clip metadata was not attached.");
  return clip;
}

export async function loadRetargetedUniversalAnimations(
  loader: GLTFLoader,
  skeletonUtils: SkeletonUtilsModule,
  baseModel: Three.Object3D
): Promise<{ names: string[]; failures: string[]; clips: ArenaAnimationClip[] }> {
  const names: string[] = [];
  const failures: string[] = [];
  const clips: ArenaAnimationClip[] = [];
  if (!skeletonUtils.retargetClip) return { names, failures: ["retargetClip unavailable"], clips };
  const targetRoot = skeletonUtils.clone(baseModel);
  const targetMesh = findSkinnedMesh(targetRoot);
  if (!targetMesh?.skeleton) return { names, failures: ["Kenney target skeleton unavailable"], clips };
  for (const path of universalAnimationPaths) {
    try {
      const gltf = await loadThreeLoaderAsset(loader, path);
      const sourceMesh = findSkinnedMesh(gltf.scene);
      if (!sourceMesh?.skeleton) {
        failures.push(`${path}: source skeleton unavailable`);
        continue;
      }
      for (const sourceClip of gltf.animations ?? []) {
        if (sourceClip?.name) names.push(sourceClip.name);
        const mappedAliases = UNIVERSAL_ANIMATION_CLIP_ALIASES[sourceClip.name];
        const aliases = (Array.isArray(mappedAliases) ? mappedAliases : [mappedAliases])
          .filter((alias): alias is string => typeof alias === "string");
        for (const alias of aliases) {
          if (clips.some((clip) => clip.name === alias)) continue;
          try {
            const retargeted = skeletonUtils.retargetClip(targetMesh, sourceMesh, sourceClip, {
              names: KENNEY_TO_UNIVERSAL_BONE_NAMES,
              hip: "pelvis",
              fps: UNIVERSAL_ANIMATION_RETARGET_FPS,
              preserveMatrix: true,
              preservePosition: true,
              preserveHipPosition: false,
              useFirstFramePosition: true
            });
            retargeted.name = alias;
            rewriteRetargetedClipTracks(retargeted);
            clips.push(markClipSource(retargeted, "universal", { sourceName: sourceClip.name, sourcePath: path }));
            targetMesh.skeleton.pose?.();
            targetRoot.updateMatrixWorld?.(true);
          } catch (error) {
            failures.push(`${sourceClip.name} -> ${alias}: ${bootErrorLabel(error)}`);
          }
        }
      }
    } catch (error) {
      failures.push(`${path}: ${bootErrorLabel(error)}`);
    }
  }
  return { names, failures, clips };
}

export function findSkinnedMesh(root: Three.Object3D | null | undefined): Three.SkinnedMesh | null {
  let skinned: Three.SkinnedMesh | null = null;
  root?.traverse?.((child) => {
    if (!skinned && child instanceof THREE.SkinnedMesh && child.skeleton) skinned = child;
  });
  return skinned;
}

export function rewriteRetargetedClipTracks(clip: Three.AnimationClip): Three.AnimationClip {
  for (const track of clip.tracks ?? []) {
    track.name = track.name.replace(/^\.bones\[([^\]]+)\]\./, "$1.");
  }
  return clip;
}
