# Application branding

`@hyperfocus/branding` owns portable logo/social schemas and framework-neutral
HTML metadata. `/build` generates SVG/ICO/PNG renditions, a 1200×630 logo card,
web app manifest and hashed `assets.json`. `/config` reads editable `brand.json`
and can update marked head metadata in a host HTML file.

The renderer is resvg WASM, shipped as `resvg.wasm` beside connected Website
exports. No platform-specific native addon or installed font is needed. The
default social card contains the mark; page title/description remain text metadata.

```json
{
  "name": "My app",
  "description": "What it helps you do.",
  "branding": {"mark": "book", "color": "#9578d3", "background": "#15131c"},
  "social": {"canonicalUrl": "https://example.com", "imageAlt": "My app logo"}
}
```

Add `logoPath` relative to this config to use your own logo. The CLI's `--logo`
override is relative to the working directory and preserves the original.
Use `bun scripts/branding/cli.ts --help`; `scripts/branding/catalog-build.ts`
updates the registered app/example assets without replacing existing configs.
Generated renditions should not be edited directly.

Website's **Logo** and **Social preview** controls use the same schemas and
command/history boundary. Empty social text inherits the page title/description.
Canonical and custom social-image URLs must be HTTPS; no production origin is
guessed. A canonical origin enables the generated public `/brand/social.png` URL.
Remote publication regenerates assets from current portable data.

SVG sources must be self-contained vector shapes. Raster originals are embedded
without changing the source file. `maskable-512.png` includes an opaque background
and safe padding; favicon/touch/PWA icons have separate purposes. The manifest
does not itself provide offline support or certify PWA installation.

Validate with `bun test packages/branding`, then inspect the consuming app and
export. [MDN icon guidance](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Define_app_icons)
owns platform background; [the logo skill](../../.agents/skills/generate-app-logo/SKILL.md)
owns creation workflow.
