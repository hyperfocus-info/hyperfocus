import { z } from "zod";

const projectId = "13527ca6-cda6-4341-8d8a-9ab70d7bcdf5";
const environmentId = "e46fa18a-61c0-4cc4-9379-45b8dfde47a6";
const bucketId = "6d43edaa-e4e7-4030-8f49-804b03b834a1";
const regionSchema = z.enum(["iad", "sjc", "ams", "sin"]);

/** Prepare only. The caller must obtain approval for the new instance and reread this state before applying. */
export function prepareExistingSwarmBucketInstance(options: {
  project: unknown; environment: unknown; stagedChanges: unknown; instanceQuery: unknown; region: string;
}) {
  const project = z.object({ id: z.literal(projectId), buckets: z.object({ edges: z.array(z.object({ node: z.object({
    id: z.string(), name: z.string(), deletedAt: z.string().nullable(),
  }) })) }) }).parse(options.project);
  const bucket = project.buckets.edges.find(edge => edge.node.id === bucketId)?.node;
  if (!bucket || bucket.name !== "hyperfocus" || bucket.deletedAt !== null) throw Error("The existing approved bucket identity changed.");
  const environment = z.object({ id: z.literal(environmentId), projectId: z.literal(projectId),
    configEtag: z.string().regex(/^[a-f0-9]{64}$/), config: z.object({ buckets: z.record(z.unknown()).optional() }).passthrough(),
  }).parse(options.environment);
  const staged = z.object({ status: z.literal("STAGED"), patch: z.record(z.unknown()) }).parse(options.stagedChanges);
  if (Object.keys(staged.patch).length) throw Error("Unrelated staged changes exist; bucket deployment refused.");
  if (Object.hasOwn(environment.config.buckets ?? {}, bucketId)) throw Error("The bucket already has environment configuration; creation refused.");
  const instance = z.object({ data: z.object({ details: z.null() }), errors: z.array(z.object({
    message: z.literal("BucketInstance not found"), path: z.tuple([z.literal("details")]),
  })).length(1) }).safeParse(options.instanceQuery);
  if (!instance.success) throw Error("The provider has not confirmed that the bucket instance is absent.");
  const region = regionSchema.parse(options.region);
  return {
    mutationPerformed: false,
    authorizationRequired: "Deploy one persistent instance of the existing hyperfocus bucket in the selected immutable region; keep artifacts under swarm/.",
    projectId, environmentId, bucketId, bucketName: bucket.name, region,
    expectedEnvironmentConfigEtag: environment.configEtag,
    query: "mutation SwarmDeployExistingBucketInstance($environmentId: String!, $patch: EnvironmentConfig!, $commitMessage: String!, $skipDeploys: Boolean!) { environmentPatchCommit(environmentId: $environmentId, patch: $patch, commitMessage: $commitMessage, skipDeploys: $skipDeploys) }",
    variables: { environmentId, patch: { buckets: { [bucketId]: { region, isCreated: true } } },
      commitMessage: "Deploy existing hyperfocus bucket instance for approved swarm evidence", skipDeploys: true },
    verification: ["Reread the environment config etag and empty staged patch immediately before applying.",
      "Require a nonempty patch commit receipt; verify this bucket instance now exists and references resolve.",
      "Read provider credential urlStyle without exposing credentials; set SWARM_S3_URL_STYLE accordingly.",
      "Redeploy only the approved coordinator, then verify content-addressed artifact write/read integrity."],
  };
}
