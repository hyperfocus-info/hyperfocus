import { expect, test } from "bun:test";
import { prepareExistingSwarmBucketInstance } from "./bucket-instance";

const projectId = "13527ca6-cda6-4341-8d8a-9ab70d7bcdf5", environmentId = "e46fa18a-61c0-4cc4-9379-45b8dfde47a6";
const bucketId = "6d43edaa-e4e7-4030-8f49-804b03b834a1";
function fixture() {
  return { project: { id: projectId, buckets: { edges: [{ node: { id: bucketId, name: "hyperfocus", deletedAt: null } }] } },
    environment: { id: environmentId, projectId, configEtag: "a".repeat(64), config: { services: { protected: { source: { image: "keep" } } } } },
    stagedChanges: { status: "STAGED", patch: {} },
    instanceQuery: { data: { details: null }, errors: [{ message: "BucketInstance not found", path: ["details"] }] }, region: "iad" };
}

test("the reviewable deployment patch contains only the approved missing bucket and suppresses service redeploys", () => {
  const plan = prepareExistingSwarmBucketInstance(fixture());
  expect(plan.mutationPerformed).toBe(false);
  expect(plan.variables.patch).toEqual({ buckets: { [bucketId]: { region: "iad", isCreated: true } } });
  expect(plan.variables.skipDeploys).toBe(true);
  expect(plan.expectedEnvironmentConfigEtag).toBe("a".repeat(64));
  expect(plan.query).not.toContain("bucketCreate");
  expect(plan.query).not.toContain("environmentPatchCommitStaged");
});

test("changed ownership, existing instances and staged changes cannot produce an executable patch", () => {
  const value = fixture();
  expect(() => prepareExistingSwarmBucketInstance({ ...value, project: { ...value.project, id: "foreign" } })).toThrow();
  expect(() => prepareExistingSwarmBucketInstance({ ...value, environment: { ...value.environment, id: "foreign" } })).toThrow();
  expect(() => prepareExistingSwarmBucketInstance({ ...value, project: { ...value.project, buckets: { edges: [] } } })).toThrow("identity");
  expect(() => prepareExistingSwarmBucketInstance({ ...value, environment: { ...value.environment, config: { buckets: { [bucketId]: { region: "sjc" } } } } })).toThrow("already has");
  expect(() => prepareExistingSwarmBucketInstance({ ...value, stagedChanges: { status: "STAGED", patch: { services: { unrelated: {} } } } })).toThrow("staged changes");
});

test("provider errors and even an empty deployed instance do not count as an absent instance", () => {
  const value = fixture();
  for (const instanceQuery of [{ data: { details: { objectCount: 0, sizeBytes: 0 } } },
    { data: { details: null } }, { data: { details: null }, errors: [{ message: "Unauthorized", path: ["details"] }] }])
    expect(() => prepareExistingSwarmBucketInstance({ ...value, instanceQuery })).toThrow("not confirmed");
  expect(() => prepareExistingSwarmBucketInstance({ ...value, region: "automatic" })).toThrow();
});
