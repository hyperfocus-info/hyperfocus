# Create and configure

Use [operation handoffs](operation-handoffs.md) for the supported live actions.

Creation needs a name and job purpose. Project chat defaults to project scope;
global scope must be requested. Report the created identity and bootstrap result.
An update changes only the requested fields; validate asset references before saving.
A clone needs a source and destination project and resets failure/breaker state.

For explicit removal of a project's assistants, run the bundled maintenance helper
first without `--execute`, inspect the matched list, then execute when correct:

```text
bun "<skill>/scripts/assistant-maintenance.ts" --action remove-project-assistants --project "<project>"
```

This soft-deletes project-scoped assistants and removes their owned jobs; it does
not remove global assistants. Verify saved state afterward. `<skill>` is the
directory containing this skill's SKILL.md, not the active project's root.
