---
name: generate-app-logo
description: Create or replace application logos and generate favicons, app icons, social-preview assets and an asset manifest. Use for app identity work or missing branding in a new app, including user-supplied logos.
---

# App identity

Preserve an existing identity unless a redesign is requested. For this repository,
the approved default is a simple SVG symbol using the application's existing
colors. Inspect the real header and favicon before choosing a new mark. Keep it
recognizable at 16–32 px; separate visible text from the symbol.

Use [the branding owner](../../../packages/branding/README.md). `brand.json` owns
identity and social defaults; `logoPath` can point to the user's original SVG,
PNG, JPEG or WebP. Website projects instead own these fields in portable
`branding`/`social` data and expose **Logo** / **Social preview** in the editor.

```powershell
bun scripts/branding/cli.ts --config brand.json --out public/brand
bun scripts/branding/cli.ts --config brand.json --out public/brand --logo own.svg
```

Author simple SVGs directly. For an illustrated raster identity or raster editing,
use the available imagegen skill/tool, then package the resulting file with this
CLI. Do not use a favicon-sized raster as the original. Preserve supplied originals.
Never install scripts, external references or executable SVG content in a logo.

Wire the home control, favicon, touch icon, webmanifest and social metadata to the
same identity. Give a decorative header image empty alt text when the adjacent
app name already labels the home control. Keep visible settings concise; advanced
metadata belongs in a disclosure.

Inspect the real header and 16/32/192/512 px renditions on light/dark backgrounds;
verify asset URLs and a 1200×630 social preview. Check a custom replacement and
export/reopen. Generated assets carry hashes; automation does not approve taste.
Do not publish an app or overwrite an approved source merely to present a candidate.
