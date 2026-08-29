# Solid 2 RC migration spike

This isolated fixture tests the Solid 2 runtime and type contract without changing
the monorepo dependency graph. Install and run it from this directory:

```powershell
npm.cmd install
bun.cmd run typecheck
bun.cmd run test
```

The exact migration specification and repository inventory live in
[`../../docs/migration/solid-2-rc-spike.md`](../../docs/migration/solid-2-rc-spike.md).
