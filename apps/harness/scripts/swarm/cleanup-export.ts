import { createSwarmS3Client } from "@hyperfocus/ai-runtime/swarm";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const reference = z.object({sha256:z.string().regex(/^[a-f0-9]{64}$/),bytes:z.number().int().positive().max(268_435_456)});
const service = z.object({id:z.string().uuid(),name:z.string(),volumeId:z.string().uuid()});
const owner = z.object({id:z.string().uuid(),projectId:z.literal("13527ca6-cda6-4341-8d8a-9ab70d7bcdf5"),environmentId:z.literal("e46fa18a-61c0-4cc4-9379-45b8dfde47a6"),expiresAt:z.string().datetime(),maximumUsd:z.number().positive().max(10),coordinator:service,worker:service,archive:reference.optional()});
const credentialCleanup = z.object({localStoreRemoved:z.literal(true),loggedOut:z.boolean(),alreadyAbsent:z.boolean(),remoteRevocationConfirmed:z.boolean(),physicalErasureVerified:z.boolean()}).refine(value=>value.loggedOut||value.alreadyAbsent);
const manifestSchema = z.object({demonstrationId:z.string().uuid(),archive:reference,deploymentReceipt:reference,remainingWorkspaces:z.literal(0),artifactsPrefix:z.literal("swarm/"),runIds:z.array(z.string()).max(10000)});
type Api = (query:string,variables:Record<string,unknown>)=>Promise<Record<string,unknown>>;

/** Offline-service recovery: independent durable export and logout proof precede exact owned-resource deletion. */
export async function cleanupSwarmDeploymentFromBucket(options:{state:unknown;directory:string;api:Api;readObject?:(key:string)=>Promise<Uint8Array>}) {
  const state=owner.parse(options.state),owned=[state.coordinator,state.worker];
  if(state.coordinator.id===state.worker.id||state.coordinator.volumeId===state.worker.volumeId||owned.some(item=>item.id==="b2ca89d2-a1db-4b64-b6ee-d8ef8e43e04a")||state.coordinator.name!==`hyperfocus-swarm-${state.id.slice(0,8)}-coordinator`||state.worker.name!==`hyperfocus-swarm-${state.id.slice(0,8)}-worker`)throw Error("Fallback cleanup ownership mismatch.");
  const api=options.api;
  let read=options.readObject;
  if(!read){
    const result=await api("query SwarmCleanupBucketCredentials($projectId:String!,$environmentId:String!,$bucketId:String!){bucketS3Credentials(projectId:$projectId,environmentId:$environmentId,bucketId:$bucketId){accessKeyId secretAccessKey bucketName endpoint region urlStyle}}",{projectId:state.projectId,environmentId:state.environmentId,bucketId:"6d43edaa-e4e7-4030-8f49-804b03b834a1"});
    const credentials=z.array(z.object({accessKeyId:z.string(),secretAccessKey:z.string(),bucketName:z.string(),endpoint:z.string(),region:z.string(),urlStyle:z.enum(["virtual-host","path"])})).min(1).parse(result.bucketS3Credentials)[0]!;
    const client=createSwarmS3Client({bucket:credentials.bucketName,endpoint:credentials.endpoint,accessKeyId:credentials.accessKeyId,secretAccessKey:credentials.secretAccessKey,region:credentials.region,urlStyle:credentials.urlStyle==="virtual-host"?"virtual-hosted":"path"});
    read=async key=>{try{return new Uint8Array(await client.file(key).arrayBuffer());}catch{throw Error("Fallback cleanup could not read durable export; credential details suppressed.");}};
  }
  async function object(key:string,maximum=65536){const bytes=await read!(key);if(bytes.byteLength>maximum)throw Error("Cleanup evidence exceeds its byte limit.");return bytes;}
  async function artifact(input:unknown){const ref=reference.parse(input);const bytes=await object(`swarm/sha256/${ref.sha256.slice(0,2)}/${ref.sha256}`,ref.bytes);if(bytes.byteLength!==ref.bytes||createHash("sha256").update(bytes).digest("hex")!==ref.sha256)throw Error("Cleanup artifact integrity mismatch.");return bytes;}
  const manifest=manifestSchema.parse(JSON.parse(new TextDecoder().decode(await object(`swarm/deployments/${state.id}/manifest.json`))));
  const cleanup=z.object({archive:reference,credentialCleanup,credentialCleanupReceipt:reference,remainingWorkspaces:z.literal(0)}).parse(JSON.parse(new TextDecoder().decode(await object(`swarm/deployments/${state.id}/credential-cleanup.json`))));
  if(manifest.demonstrationId!==state.id||cleanup.archive.sha256!==manifest.archive.sha256||state.archive&&state.archive.sha256!==manifest.archive.sha256)throw Error("Cleanup export does not match this deployment.");
  const archive=await artifact(manifest.archive);
  const deployment=z.object({receipt:z.object({demonstration:z.object({id:z.string(),expiresAt:z.string(),budget:z.object({id:z.string(),expiresAt:z.string(),maximumUsd:z.number(),reservedUsd:z.number().nonnegative(),admissions:z.array(z.unknown()).max(100)}).passthrough()})}),remainingWorkspaces:z.literal(0)}).parse(JSON.parse(new TextDecoder().decode(await artifact(manifest.deploymentReceipt))));
  const logout=credentialCleanup.and(z.object({demonstrationId:z.string()})).parse(JSON.parse(new TextDecoder().decode(await artifact(cleanup.credentialCleanupReceipt))));
  const receipt=deployment.receipt.demonstration;
  if(receipt.id!==state.id||receipt.expiresAt!==state.expiresAt||receipt.budget.id!==state.id||receipt.budget.expiresAt!==state.expiresAt||receipt.budget.maximumUsd!==state.maximumUsd||receipt.budget.reservedUsd>state.maximumUsd||logout.demonstrationId!==state.id)throw Error("Cleanup budget or credential receipt ownership mismatch.");
  const inventory=z.object({project:z.object({services:z.object({edges:z.array(z.object({node:z.object({id:z.string(),name:z.string()})}))}),volumes:z.object({edges:z.array(z.object({node:z.object({id:z.string(),volumeInstances:z.object({edges:z.array(z.object({node:z.object({serviceId:z.string().nullable(),environmentId:z.string(),isPendingDeletion:z.boolean()})}))})})}))})}),sandboxes:z.object({edges:z.array(z.object({node:z.object({id:z.string(),status:z.string()})})),pageInfo:z.object({hasNextPage:z.literal(false)})})}).parse(await api("query SwarmCleanupFallbackInventory($projectId:String!,$environmentId:String!){project(id:$projectId){services{edges{node{id name}}}volumes{edges{node{id volumeInstances{edges{node{serviceId environmentId isPendingDeletion}}}}}}}sandboxes(environmentId:$environmentId,first:100){edges{node{id status}}pageInfo{hasNextPage}}}",{projectId:state.projectId,environmentId:state.environmentId}));
  if(inventory.sandboxes.edges.some(item=>item.node.status!=="DESTROYED"))throw Error("Fallback cleanup requires the inspected sandbox environment to have no remaining compute.");
  for(const item of owned){
    const remote=inventory.project.services.edges.find(entry=>entry.node.id===item.id)?.node;
    if(remote&&remote.name!==item.name)throw Error("Fallback service ownership changed.");
    const volume=inventory.project.volumes.edges.find(entry=>entry.node.id===item.volumeId)?.node;
    if(volume?.volumeInstances.edges.some(entry=>entry.node.environmentId!==state.environmentId||entry.node.serviceId!==null&&entry.node.serviceId!==item.id))throw Error("Fallback volume ownership changed.");
    if(remote){const deployments=z.object({edges:z.array(z.object({node:z.object({status:z.string()})}))}).parse((await api("query SwarmCleanupFallbackDeployments($input:DeploymentListInput!){deployments(input:$input,first:100){edges{node{status}}}}",{input:{projectId:state.projectId,environmentId:state.environmentId,serviceId:item.id}})).deployments);if(deployments.edges.some(entry=>!["REMOVED","FAILED","CRASHED","SKIPPED"].includes(entry.node.status)))throw Error("Fallback cleanup requires owned service deployments to be stopped.");}
  }
  await writeFile(path.join(options.directory,"swarm.sqlite"),archive,{mode:0o600});
  const evidence={at:new Date().toISOString(),demonstrationId:state.id,archive:manifest.archive,credentialCleanup:logout,budget:receipt.budget,sandboxesDestroyed:inventory.sandboxes.edges.length,archiveVerified:true};
  await writeFile(path.join(options.directory,"verified-export-fallback.json"),JSON.stringify(evidence,null,2));
  for(const item of owned){
    const remote=inventory.project.services.edges.some(entry=>entry.node.id===item.id),volume=inventory.project.volumes.edges.find(entry=>entry.node.id===item.volumeId)?.node;
    const pending=volume&&volume.volumeInstances.edges.length>0&&volume.volumeInstances.edges.every(entry=>entry.node.isPendingDeletion&&entry.node.serviceId===null);
    let result:Record<string,unknown>|undefined;
    if(volume&&!pending)result=await api("mutation SwarmCleanupFallbackVolume($volumeId:String!,$environmentId:String!){detach:volumeInstanceUpdate(volumeId:$volumeId,environmentId:$environmentId,input:{serviceId:null}) volumeDelete(volumeId:$volumeId)}",{volumeId:item.volumeId,environmentId:state.environmentId});
    if(result&&(result.detach!==true||result.volumeDelete!==true))throw Error("Fallback volume deletion was not acknowledged.");
    if(remote){result=await api("mutation SwarmCleanupFallbackService($id:String!,$environmentId:String!){serviceDelete(id:$id,environmentId:$environmentId)}",{id:item.id,environmentId:state.environmentId});if(result.serviceDelete!==true)throw Error("Fallback service deletion was not acknowledged.");}
  }
  return evidence;
}
