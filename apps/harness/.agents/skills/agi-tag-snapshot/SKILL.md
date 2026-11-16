---
name: agi-tag-snapshot
description: Convert existing playtest observations into an AGI/XAG-aligned tag snapshot with provenance and confidence. Use for evidence tagging or handoff, not to claim accessibility compliance or run a playtest.
---

# AGI tag snapshot

Run the bundled helper with Bun; replace `<skill>` with the directory containing
this file. `--template` owns the input contract; no separate playtest skill is required.

```text
bun "<skill>/scripts/agi_tag_snapshot.ts" --template
bun "<skill>/scripts/agi_tag_snapshot.ts" --observations "<evidence.json>" --json-out "<snapshot.json>"
```

The input may also be a Markdown report containing fenced JSON observations.
Use `--text-out <path>` for a readable report. Keep output separate from source
evidence. Preserve missing observations, provenance, confidence, and claim notes;
these heuristic tags are evidence organization, not AGI/XAG conformance certification.
