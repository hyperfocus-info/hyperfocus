---
name: asset-catalog
description: Search the bundled game-asset source catalog for art, audio, UI, 3D, fonts, or coherent starter packs. Use for asset sourcing and provenance planning; acquiring a selected Craftpix pack uses craftpix-download.
---

# Game asset catalog

The catalog supplies candidate sources, formats, access notes, and license categories.
Treat its genre and 3D routes as starting points; choose assets against the user's
direction and the consuming project's capabilities. Catalog entries are not proof
of an item's current license or availability.

Run with Bun, replacing `<skill>` with this file's directory:

```text
bun "<skill>/scripts/search-catalog.ts" --query "fantasy ui"
bun "<skill>/scripts/search-catalog.ts" --type audio-sfx --cc0-only
bun "<skill>/scripts/search-catalog.ts" --genre platformer
bun "<skill>/scripts/search-catalog.ts" --3d-route fantasy
```

Use `--help`, `--list-types`, `--list-genres`, or `--list-3d-routes` for
discovery, and `--format json` for structured output. Multiple `--type` flags
match any listed type.

Before acquiring selected items, give a compact disclosure: exact item/provider
URL, verified license and attribution/redistribution terms, known size (or unknown),
retained formats/conversion needs, destination, and expected project impact.
Continue downloads already authorized by the task. Ask only for a new decision
such as paid access, ambiguous terms, material unexpected size, incompatible
formats, or replacement of authored work.

- `all-cc0` identifies a source catalog's stated scope; `cc0-filter` still needs
  the exact item's license checked. Preserve the license with the asset.
- `attribution`, `custom`, and `mixed` are not CC0. Verify current item terms.
- `rawRedistribution: forbidden` excludes republishing source files as a reusable
  asset pack; check whether the intended finished-product use is permitted.
- Keep source archives and provenance with the consuming project; curate runtime
  files so a build does not accidentally distribute an entire source pack.
- SoundFonts need an SF2/SFZ-capable player; they are not sample buffers.

For a selected Craftpix product, continue with the bundled `craftpix-download` skill.
