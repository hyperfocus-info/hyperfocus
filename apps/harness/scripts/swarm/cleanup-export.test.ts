import { afterEach,expect,test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir,mkdtemp,rm } from "node:fs/promises";
import path from "node:path";
import { encode } from "../tests/cleanup-fixtures";
import { cleanupSwarmDeploymentFromBucket } from "./cleanup-export";

const parent=path.resolve(import.meta.dir,"../../.local/cleanup-export-tests"),directories:string[]=[];
afterEach(async()=>{for(const directory of directories.splice(0)){if(!directory.startsWith(parent+path.sep))throw Error("Fixture escapes owner.");await rm(directory,{recursive:true,force:true});}});
async function fixture(){
 await mkdir(parent,{recursive:true});const directory=await mkdtemp(path.join(parent,"case-"));directories.push(directory);
 const id="a2952022-d5a4-4334-b4dc-213dd402bb61",state={id,projectId:"13527ca6-cda6-4341-8d8a-9ab70d7bcdf5",environmentId:"e46fa18a-61c0-4cc4-9379-45b8dfde47a6",expiresAt:"2026-10-16T04:00:41.106Z",maximumUsd:10,coordinator:{id:crypto.randomUUID(),name:"hyperfocus-swarm-a2952022-coordinator",volumeId:crypto.randomUUID()},worker:{id:crypto.randomUUID(),name:"hyperfocus-swarm-a2952022-worker",volumeId:crypto.randomUUID()}};
 const objects=new Map<string,Uint8Array>(),put=(value:unknown)=>{const bytes=new TextEncoder().encode(JSON.stringify(value)),sha256=createHash("sha256").update(bytes).digest("hex");objects.set(`swarm/sha256/${sha256.slice(0,2)}/${sha256}`,bytes);return{sha256,bytes:bytes.length};};
 const archive=put({fixture:"simulated immutable archive"}),budget={id,expiresAt:state.expiresAt,maximumUsd:10,reservedUsd:3,admissions:[]},cleanup={localStoreRemoved:true,loggedOut:true,alreadyAbsent:false,remoteRevocationConfirmed:false,physicalErasureVerified:false};
 const deploymentReceipt=put({receipt:{demonstration:{id,expiresAt:state.expiresAt,budget}},remainingWorkspaces:0});
 const cleanupRef=put({demonstrationId:id,...cleanup});

 objects.set(`swarm/deployments/${id}/manifest.json`,encode({demonstrationId:id,archive,deploymentReceipt,remainingWorkspaces:0,artifactsPrefix:"swarm/",runIds:["fixture"]}));
 objects.set(`swarm/deployments/${id}/credential-cleanup.json`,encode({archive,credentialCleanup:cleanup,credentialCleanupReceipt:cleanupRef,remainingWorkspaces:0}));
 function volumeInstance(serviceId:string|null){return{serviceId,environmentId:state.environmentId,isPendingDeletion:false};}
 const inventory={project:{services:{edges:[state.coordinator,state.worker].map(item=>({node:{id:item.id,name:item.name}}))},volumes:{edges:[state.coordinator,state.worker].map(item=>({node:{id:item.volumeId,volumeInstances:{edges:[{node:volumeInstance(item.id)}]}}}))}},sandboxes:{edges:[{node:{id:"owned-sandbox",status:"DESTROYED"}}],pageInfo:{hasNextPage:false}}};
 const mutations:string[]=[],statuses=["REMOVED"];
 const api=async(query:string)=>{if(query.startsWith("mutation")){mutations.push(query);return{detach:true,volumeDelete:true,serviceDelete:true};}if(query.includes("SwarmCleanupFallbackDeployments"))return{deployments:{edges:statuses.map(status=>({node:{status}}))}};return inventory;};
 return{state,directory,objects,archive,inventory,mutations,statuses,run:()=>cleanupSwarmDeploymentFromBucket({state,directory,api,readObject:async key=>{const value=objects.get(key);if(!value)throw Error("Missing fixture object");return value;}})};
}
test("fallback verifies immutable export and logout before deleting only recorded resources",async()=>{const f=await fixture();expect((await f.run()).archive).toEqual(f.archive);expect(f.mutations).toHaveLength(4);expect(f.mutations.every(query=>query.includes("SwarmCleanupFallback"))).toBe(true);});
test("fallback refuses corrupt export before any resource mutation",async()=>{const f=await fixture();f.objects.set(`swarm/sha256/${f.archive.sha256.slice(0,2)}/${f.archive.sha256}`,new TextEncoder().encode("corrupt"));await expect(f.run()).rejects.toThrow("integrity");expect(f.mutations).toHaveLength(0);});
test("fallback refuses missing credential cleanup proof",async()=>{const f=await fixture();f.objects.delete(`swarm/deployments/${f.state.id}/credential-cleanup.json`);await expect(f.run()).rejects.toThrow("Missing");expect(f.mutations).toHaveLength(0);});
test("fallback refuses active sandboxes and active service deployments",async()=>{const f=await fixture();f.inventory.sandboxes.edges[0]!.node.status="RUNNING";await expect(f.run()).rejects.toThrow("remaining compute");expect(f.mutations).toHaveLength(0);f.inventory.sandboxes.edges[0]!.node.status="DESTROYED";f.statuses[0]="SUCCESS";await expect(f.run()).rejects.toThrow("stopped");expect(f.mutations).toHaveLength(0);});
test("fallback is idempotent when services and volumes are absent",async()=>{const f=await fixture();f.inventory.project.services.edges=[];f.inventory.project.volumes.edges=[];expect((await f.run()).archiveVerified).toBe(true);expect(f.mutations).toHaveLength(0);});
test("fallback leaves already detached volumes pending provider deletion alone",async()=>{const f=await fixture();f.inventory.project.services.edges=[];for(const entry of f.inventory.project.volumes.edges){entry.node.volumeInstances.edges[0]!.node={...entry.node.volumeInstances.edges[0]!.node,serviceId:null,isPendingDeletion:true};}expect((await f.run()).archiveVerified).toBe(true);expect(f.mutations).toHaveLength(0);});
test("fallback refuses a volume reattached to unrelated work",async()=>{const f=await fixture();f.inventory.project.volumes.edges[0]!.node.volumeInstances.edges[0]!.node.serviceId=crypto.randomUUID();await expect(f.run()).rejects.toThrow("volume ownership");expect(f.mutations).toHaveLength(0);});
