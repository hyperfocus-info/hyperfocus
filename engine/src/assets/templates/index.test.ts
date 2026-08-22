import { expect, test } from "bun:test"
import { loadTemplateImages, resolveTemplateAssetUrl, templateAssetManifest } from "./index.ts"

test("template asset resolver returns embedded bitmap data by default", () => {
  const url = resolveTemplateAssetUrl("template.tile.grass")
  expect(url.startsWith("data:image/png;base64,")).toBe(true)
})

test("template asset resolver joins base paths prefixes and cache tokens", () => {
  expect(resolveTemplateAssetUrl("template.tile.grass", {
    baseUrl: "/engine-assets/",
    pathPrefix: "/templates/",
    cacheBust: "rev 1"
  })).toBe("/engine-assets/templates/template-tile-grass.png?v=rev%201")

  expect(resolveTemplateAssetUrl("template.tile.grass", {
    baseUrl: "/",
    mode: "path"
  })).toBe("/template-tile-grass.png")
})

test("template asset resolver rejects unknown ids", () => {
  expect(() => resolveTemplateAssetUrl("missing")).toThrow("Unknown template asset: missing")
})

test("template image loader uses resolver output and custom image factory", async () => {
  const images = await loadTemplateImages([templateAssetManifest[0]], {
    baseUrl: "/assets",
    imageFactory: () => new FakeImage() as unknown as HTMLImageElement
  })

  expect(images["template.tile.grass"].src).toBe("/assets/template-tile-grass.png")
})

class FakeImage {
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  complete = false
  naturalWidth = 0
  private currentSrc = ""

  get src() {
    return this.currentSrc
  }

  set src(value: string) {
    this.currentSrc = value
    this.complete = true
    this.naturalWidth = 1
    this.onload?.()
  }
}
