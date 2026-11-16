# Hosting and revision

Read [the review host README](../../../../scripts/artifact-review/README.md) for
commands. Create input with `id`, `title`, and `items`; each item declares `id`,
`title`, `kind`, and `media` or `text`:

```text
bun scripts/artifact-review/create.ts input.json manifest.json
```

The helper hashes real content, defaults version to 1, and resolves media relative
to the input JSON. Producers may import `createArtifactManifest({ id, title, items })`.
Keep campaign and item identities stable. Name meaningful time ranges, ideas, or
image regions and choose scoring dimensions suited to the requested review.

Use `dev-server` to serve only manifest-declared artifacts. Retain the server's
SQLite feedback for phone review; never expose a repository directory, replace
the database to refresh assets, or substitute localStorage/download-import state.
Failed saves remain visibly unsaved. When changing the review host, verify reload,
stale-write conflicts, relevant playback/notes, and touch interaction.

Design before/after queues use `scripts/artifact-review/design-system/prepare.ts`
and `design-system-evolution`. Preserve separate immutable baseline and result
assets; never invent a missing baseline or transfer rectangle notes to another
crop. Read `GET /api/feedback` and relevant `GET /api/history/:id` before revision,
or use the review-store contract offline. Record which versioned notes the new
revision addresses.

Synaesthetic already uses review-store in its native database. Preserve calibration
eligibility, confidence, action verdicts, and train/validation/test labels.
The optional `synaesthetic.ts` presentation adapter does not replace those APIs
or convert letter grades into calibration labels.