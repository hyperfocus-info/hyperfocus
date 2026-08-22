export type TemplateAssetKind = "tile" | "actor" | "effect" | "ui"

export interface TemplateAssetDescriptor {
  id: string
  kind: TemplateAssetKind
  fileName: string
  width: number
  height: number
  tags: readonly string[]
  dataUri: string
}

export type TemplateAssetManifest = readonly TemplateAssetDescriptor[]

export interface ResolveTemplateAssetUrlOptions {
  manifest?: TemplateAssetManifest
  baseUrl?: string
  pathPrefix?: string
  mode?: "data" | "path"
  cacheBust?: string | number
}

export interface LoadTemplateImagesOptions extends ResolveTemplateAssetUrlOptions {
  imageFactory?: () => HTMLImageElement
  crossOrigin?: "" | "anonymous" | "use-credentials"
  referrerPolicy?: ReferrerPolicy
}

// Package-owned, mechanically generated 1x1 RGBA swatches. No third-party artwork is embedded here.
const grassPng = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGOwKLD5DwADrAHkH9FyhwAAAABJRU5ErkJggg=="
const stonePng = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNISMj4DwAEdAIoPlk/tgAAAABJRU5ErkJggg=="
const waterPng = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGMwSNjyHwAETAJEbqYPfwAAAABJRU5ErkJggg=="
const actorPng = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGM4UuDxHwAF9AJ8eKylYgAAAABJRU5ErkJggg=="
const lootPng = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGN4sMHgPwAG9ALA0W2rYgAAAABJRU5ErkJggg=="
const effectPng = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4/yDhPwAIYAM/8ZL5LQAAAABJRU5ErkJggg=="
const uiPng = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGMwsHD4DwAC7AGo4wQwPQAAAABJRU5ErkJggg=="

export const templateAssetManifest: TemplateAssetManifest = [
  asset("template.tile.grass", "tile", "template-tile-grass.png", grassPng, ["terrain", "field"]),
  asset("template.tile.stone", "tile", "template-tile-stone.png", stonePng, ["terrain", "dungeon"]),
  asset("template.tile.water", "tile", "template-tile-water.png", waterPng, ["terrain", "water"]),
  asset("template.actor.hero", "actor", "template-actor-hero.png", actorPng, ["actor", "player"]),
  asset("template.actor.npc", "actor", "template-actor-npc.png", actorPng, ["actor", "npc"]),
  asset("template.loot.bag", "ui", "template-loot-bag.png", lootPng, ["loot", "inventory"]),
  asset("template.effect.spark", "effect", "template-effect-spark.png", effectPng, ["effect", "combat"]),
  asset("template.ui.slot", "ui", "template-ui-slot.png", uiPng, ["ui", "frame"])
]

export function resolveTemplateAssetUrl(id: string, options: ResolveTemplateAssetUrlOptions = {}): string {
  const manifest = options.manifest ?? templateAssetManifest
  const descriptor = manifest.find((asset) => asset.id === id)
  if (!descriptor) throw new Error(`Unknown template asset: ${id}`)

  const mode = options.mode ?? (options.baseUrl || options.pathPrefix ? "path" : "data")
  const url = mode === "data"
    ? descriptor.dataUri
    : joinAssetPath(options.baseUrl, options.pathPrefix, descriptor.fileName)

  if (options.cacheBust === undefined || url.startsWith("data:")) return url
  return `${url}${url.includes("?") ? "&" : "?"}v=${encodeURIComponent(String(options.cacheBust))}`
}

export async function loadTemplateImages(
  manifest: TemplateAssetManifest = templateAssetManifest,
  options: LoadTemplateImagesOptions = {}
): Promise<Record<string, HTMLImageElement>> {
  const entries = await Promise.all(manifest.map((descriptor) => loadOneTemplateImage(descriptor, options)))
  return Object.fromEntries(entries)
}

function asset(
  id: string,
  kind: TemplateAssetKind,
  fileName: string,
  dataUri: string,
  tags: readonly string[]
): TemplateAssetDescriptor {
  return { id, kind, fileName, width: 1, height: 1, tags, dataUri }
}

function joinAssetPath(baseUrl = "", pathPrefix = "", fileName: string) {
  const path = [trimSlashes(pathPrefix), trimSlashes(fileName)].filter(Boolean).join("/")
  const base = baseUrl.trim()
  if (!base) return path
  if (base === "/") return `/${path}`
  return `${base.replace(/\/+$/g, "")}/${path}`
}

function trimSlashes(value: string) {
  return value.trim().replace(/^\/+|\/+$/g, "")
}

function loadOneTemplateImage(
  descriptor: TemplateAssetDescriptor,
  options: LoadTemplateImagesOptions
): Promise<[string, HTMLImageElement]> {
  const imageFactory = options.imageFactory ?? (() => new Image())
  const image = imageFactory()
  if (options.crossOrigin !== undefined) image.crossOrigin = options.crossOrigin
  if (options.referrerPolicy !== undefined) image.referrerPolicy = options.referrerPolicy

  const src = resolveTemplateAssetUrl(descriptor.id, options)

  return new Promise((resolve, reject) => {
    image.onload = () => resolve([descriptor.id, image])
    image.onerror = () => reject(new Error(`Failed to load template asset: ${descriptor.id}`))
    image.src = src
    if (image.complete && image.naturalWidth !== 0) resolve([descriptor.id, image])
  })
}
