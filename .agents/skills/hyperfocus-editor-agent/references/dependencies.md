# Project-local dependencies

The project must contain `package.json`. Use the editor's Bun wrapper, which
passes explicit argv and project cwd; never build shell text from package names.

```text
bun apps/engine-editor/cli.ts deps list --project <root>
bun apps/engine-editor/cli.ts deps add zod@4 --project <root> --exact
bun apps/engine-editor/cli.ts deps add typescript --project <root> --dev
bun apps/engine-editor/cli.ts deps remove zod --project <root>
bun apps/engine-editor/cli.ts deps install --project <root> --frozen
```

Choose `--optional` or `--peer` only for that package contract. Use `--trust`
only after explicitly reviewing and accepting the package's lifecycle behavior.