# Versioning

The repository uses one SemVer patch line across the root manifest, first-party
applications, and first-party packages. `package.json` owns the canonical version;
`apps/*/package.json` and `packages/*/package.json` must match it before release.

The first release target is `0.0.1`. Branch pushes run the version workflow, which
bumps the checked-in manifests to the next patch version by default and commits the
result back to the pushed branch with `[skip version]` to avoid a loop. Tagged
releases publish the exact version already committed on the tag.

Use the same script locally when preparing a manual patch:

```powershell
bun scripts/bump-patch-version.ts
```

Release readiness is enforced by:

```powershell
bun run check:release-readiness
```

Related: [distribution](distribution.md), [package testing](package-testing.md), and
[documentation governance](documentation-governance.md).
