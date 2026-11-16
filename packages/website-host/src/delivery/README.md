# Delivery receipts

Books and Trade Bot use `runArtifactDeployment` from `/delivery/cli`. Package the
app first, then run its deploy script with `--check` to verify every manifest hash
and reject extra files or links. An upload requires `--target target.json --out
receipt.json`; `--wait` observes that exact upload. Target JSON contains explicit
`projectId`, `environmentId` and `serviceId` UUIDs. Keep receipts outside artifacts.

The CLI never replaces an existing receipt. An interrupted upload may have
completed: inspect Railway before preparing a new candidate. Status selects the
recorded deployment ID, never the latest deployment. Provider health does not
prove public bytes, authentication or the app's critical journey.

Website's visual deployment guide and `website/delivery-cli.ts` additionally own
pinned configuration plans and explicit apply/upload confirmations. Existing task
authorization can supply those flags; tool mechanics do not grant publication.

`createAcceptanceManifest` combines passing reports carrying the exact
`artifactSha256`. `scripts/shipping/acceptance.ts` is its file CLI. Reports and
the artifact retain their own hashes; `humanApproved` remains false until actual
human evidence exists. Automated reports are evidence, not a release decision.

[Railway's deployment CLI](https://docs.railway.com/cli/deployment) owns provider
command behavior. The adapter bounds subprocess output and status waits, and
fails closed if the recorded upload is absent from the queried deployment list.
