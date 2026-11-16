# Batch downloads

Probe access with `download_asset.ts --check` before a batch. Resolve the plan and
output paths explicitly; pass an absolute plan path if changing working directory.

```text
bun "<skill>/scripts/download_plan.ts" "<plan.json>" --continue-on-error
```

Example plan:

```json
{
  "defaults": { "cookieFile": ".local/craftpix/cookies.txt", "timeout": 60 },
  "downloads": [
    { "sourceUrl": "https://craftpix.net/product/selected-pack/", "outputDir": "game/assets/source/craftpix" }
  ]
}
```

Each entry can override defaults and supply `subitem` for an offered alternate
package. Use `--help` for resolve-only and other flags. Inspect per-item failures;
`--continue-on-error` does not establish that every selected pack arrived.
