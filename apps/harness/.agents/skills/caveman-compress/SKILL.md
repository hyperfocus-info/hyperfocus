---
name: caveman-compress
description: Rewrite an explicitly requested prose file in caveman style using the bundled Python helper and Claude access. Retains a backup and checks structural preservation; ordinary brevity requests do not invoke file compression.
---

# Caveman Compress

Use for `/caveman:compress <file>` or an explicit request to compress a prose file.
Resolve the requested file before changing directories. From this skill directory run:

```text
python -m scripts <absolute-filepath>
```

Requires Python 3.10+ and either authenticated `claude` CLI or the `anthropic`
Python package with `ANTHROPIC_API_KEY`. `CAVEMAN_MODEL` selects the API model.
Each provider call has a 120-second timeout.

The helper accepts Markdown, text, reStructuredText, and heuristically detected
extensionless prose, up to 500,000 bytes. It refuses existing `<stem>.original.md`
backups. It validates temporary output, with at most one repair call, before
replacing the source and retaining a byte-exact backup. Invalid UTF-8 fails instead
of silently dropping bytes.

Preserve requirements, negation, conditions, uncertainty, ordering, technical names,
numbers, commands, code, links, and document structure. Review the actual diff:
structural validation cannot establish semantic equivalence. Do not use a shorter
file as evidence that an agent will execute its instructions correctly.

See [README.md](README.md) for validation and measurement commands and limitations.
