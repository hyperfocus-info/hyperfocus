# Release TODO

## Trusted npm publishing

Trusted publishing cannot be activated until this project has a public GitHub
repository, the final repository URL is recorded in `package.json`, and the
`@hyperfocus/engine` package exists under an npm account or organization controlled
by the owner.

When those prerequisites exist:

1. Add the exact public repository URL to the `repository`, `homepage`, and
   `bugs` fields in `package.json`.
2. Add `.github/workflows/publish.yml` using a GitHub-hosted runner, Node 24 or
   newer, npm 11.5.1 or newer, and permissions `contents: read` and
   `id-token: write`.
3. Make the workflow run `bun install --frozen-lockfile`,
   `bun run release:verify`, and `npm publish --access public` from a protected
   release tag or environment.
4. Register that exact repository and `publish.yml` as the package's trusted
   GitHub publisher in npm, initially allowing staged publishing if available.
5. Complete one staged or test release, verify the provenance attestation, and
   then disable token-based publishing in the npm package settings.
6. Protect release tags and require review for the publishing environment.

Do not add an npm write token to repository secrets. Trusted publishing uses a
short-lived OIDC credential issued to the approved workflow.
