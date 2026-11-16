---
name: craftpix-download
description: Download selected Craftpix packs into a project using a local exported cookie session. Use for known product pages or a batch download plan; asset discovery uses asset-catalog and this skill does not purchase access.
---

# Craftpix download

Use the bundled Bun helper; replace `<skill>` with this file's directory.
Keep output in the consuming project's source-asset directory.

```text
bun "<skill>/scripts/download_asset.ts" "<product-url>" --check
bun "<skill>/scripts/download_asset.ts" "<product-url>" --output-dir "<project>/assets/source/craftpix"
```

`--check` probes archive bytes without writing the pack. Exit 0 means ZIP access
works, 2 means the product resolves but archive access needs attention, and 1 means
invalid input or resolution failure. `--resolve-only` checks the product endpoint
without proving archive access. Use the standard product/freebie URL; `--subitem`
selects an offered alternate download.

Cookies default to `.local/craftpix/cookies.txt`; `CRAFTPIX_COOKIE_FILE` or
`--cookie-file` overrides it. For session setup or HTML/auth failures read
[cookie guidance](references/cookies.md). Keep secrets local and ignored, never
print or commit their contents, and do not bypass access restrictions.

Before acquisition, disclose the item URL, license/attribution/redistribution scope,
known archive/unpacked size, formats and conversion, destination, and project impact.
Continue within existing task authorization; ask when paid access, unclear terms,
material unexpected size, unsupported formats, or authored-file replacement creates
a new decision. Reuse an existing disclosure from asset selection.

After download, curate only the files needed and preserve provenance and license
notes. For several selected packs, read [batch downloads](references/batch.md);
a batch plan is local operation data, not a shared asset-system requirement.
