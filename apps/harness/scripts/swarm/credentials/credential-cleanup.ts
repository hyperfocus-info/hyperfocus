import { spawnBackgroundProcess } from "@hyperfocus/desktop-runtime/process";
import { createHash } from "node:crypto";
import { lstat, readFile, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { z } from "zod";
import { readSwarmRailwayCredential, verifySwarmRailwayCredential } from "./credential";

const workspaceId = "9725002b-c991-4e0e-bd48-fb4065ef5482";
const projectId = "13527ca6-cda6-4341-8d8a-9ab70d7bcdf5";
const keySchema = z.object({ id: z.string().uuid(), name: z.string(), fingerprint: z.string(), workspaceId: z.literal(workspaceId) });
const receiptSchema = z.object({ demonstrationId: z.string().uuid(), approved: z.literal(true), registered: z.literal(true),
  workspaceId: z.literal(workspaceId), fingerprint: z.string(), identityFiles: z.array(z.string()).min(1).max(2), key: keySchema,
  addedKnownHostsFile: z.string().optional(), addedKnownHostsText: z.string().optional() });
const inventoryQuery = "query SwarmCredentialCleanupInventory($project: String!, $workspace: String!) { project(id: $project) { services { edges { node { id name } } } } sshPublicKeys(workspaceId: $workspace, first: 100) { edges { node { id name fingerprint workspaceId } } pageInfo { hasNextPage } } }";
const inventorySchema = z.object({ project: z.object({ services: z.object({ edges: z.array(z.object({ node: z.object({ id: z.string(), name: z.string() }) })) }) }),
  sshPublicKeys: z.object({ edges: z.array(z.object({ node: keySchema })), pageInfo: z.object({ hasNextPage: z.literal(false) }) }) });

function samePath(a: string, b: string) {
  return process.platform === "win32" ? path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase() : path.resolve(a) === path.resolve(b);
}
function fingerprint(publicKey: string) {
  const parts = publicKey.trim().split(/\s+/);
  if (parts[0] !== "ssh-ed25519" || !parts[1] || !/^[A-Za-z0-9+/]+=*$/.test(parts[1])) throw Error("Temporary SSH public key is not the approved Ed25519 key.");
  return `SHA256:${createHash("sha256").update(Buffer.from(parts[1], "base64")).digest("base64url").replaceAll("-", "+").replaceAll("_", "/")}`;
}
async function ordinaryFile(file: string) {
  const stat = await lstat(file).catch((error: unknown) => {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  });
  if (stat && (!stat.isFile() || stat.isSymbolicLink())) throw Error("Credential cleanup refuses non-regular files and symbolic links.");
  return Boolean(stat);
}
async function publicKeyFromPrivate(file: string) {
  const child = spawnBackgroundProcess({ cmd: ["ssh-keygen", "-y", "-f", file], stdin: "ignore", stdout: "pipe", stderr: "ignore", timeout: 10_000, maxBuffer: 4096 });
  const [publicKey, code] = await Promise.all([new Response(child.stdout).text(), child.exited]);
  if (code) throw Error("Cannot verify the temporary private key; retained its local files.");
  return publicKey;
}

/** Explicitly authorized, SSH-only cleanup. API token revocation remains an owner operation. */
export async function cleanupSwarmSshCredential(options: {
  root: string; demonstrationId: string; allowCleanup: boolean; token?: string; homeDirectory?: string;
}) {
  if (!options.allowCleanup) throw Error("Credential cleanup requires --allow-credential-cleanup and prior authorization for the recorded key.");
  const id = z.string().uuid().parse(options.demonstrationId);
  const directory = path.resolve(options.root, ".local/swarm/credentials", id), home = options.homeDirectory ?? homedir();
  const receipt = receiptSchema.parse(JSON.parse(await readFile(path.join(directory, "ssh-key-registration.json"), "utf8")));
  const expectedName = `hyperfocus-swarm-${id.slice(0, 8)}`;
  if (receipt.demonstrationId !== id || receipt.key.name !== expectedName || receipt.fingerprint !== receipt.key.fingerprint) throw Error("SSH cleanup receipt identity differs from this demonstration.");
  const allowedFiles = [path.join(directory, "id_ed25519"), path.resolve(home, ".ssh", expectedName)];
  if (receipt.identityFiles.some(file => !allowedFiles.some(allowed => samePath(file, allowed)))) throw Error("SSH cleanup receipt includes a path outside the exact owned key locations.");
  if (receipt.addedKnownHostsFile && !samePath(receipt.addedKnownHostsFile, path.resolve(home, ".ssh/known_hosts"))) throw Error("SSH known_hosts receipt is outside the expected user path.");
  const state = z.object({ id: z.literal(id), projectId: z.literal(projectId), phase: z.literal("cleaned"),
    coordinator: z.object({ id: z.string().uuid() }).optional(), worker: z.object({ id: z.string().uuid() }).optional() })
    .parse(JSON.parse(await readFile(path.resolve(options.root, ".local/swarm/deployments", id, "deployment.json"), "utf8")));
  const token = options.token ?? process.env.SWARM_RAILWAY_API_TOKEN ?? process.env.RAILWAY_API_TOKEN ?? await readSwarmRailwayCredential(options);
  await verifySwarmRailwayCredential({ token });
  async function request(query: string, variables: Record<string, unknown>) {
    const response = await fetch("https://backboard.railway.com/graphql/v2", { method: "POST", redirect: "error", signal: AbortSignal.timeout(20_000),
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ query, variables }) });
    if (!response.ok) throw Error(`Credential cleanup API request failed (${response.status}); details suppressed.`);
    const result = z.object({ data: z.record(z.unknown()).nullable().optional(), errors: z.array(z.unknown()).optional() }).parse(await response.json());
    if (!result.data || result.errors?.length) throw Error("Credential cleanup API request was rejected; details suppressed.");
    return result.data;
  }
  async function inventory() {
    const data = inventorySchema.parse(await request(inventoryQuery, { project: projectId, workspace: workspaceId }));
    if (data.project.services.edges.some(({ node }) => node.id === state.coordinator?.id || node.id === state.worker?.id || node.name === `${expectedName}-worker` || node.name === `${expectedName}-coordinator`)) throw Error("Temporary services still exist; credential cleanup must wait until service cleanup is verified.");
    return data.sshPublicKeys.edges.map(edge => edge.node);
  }
  const keys = await inventory(), key = keys.find(value => value.id === receipt.key.id);
  if (key && (key.name !== receipt.key.name || key.fingerprint !== receipt.key.fingerprint || key.workspaceId !== receipt.key.workspaceId)) throw Error("Remote SSH key metadata differs from the approved cleanup receipt.");
  if (keys.some(value => value.id !== receipt.key.id && value.fingerprint === receipt.key.fingerprint)) throw Error("Approved fingerprint belongs to an unexpected remote key; cleanup refused.");
  if (key) {
    const deleted = await request("mutation SwarmRevokeApprovedSshKey($id: String!) { sshPublicKeyDelete(id: $id) }", { id: receipt.key.id });
    if (deleted.sshPublicKeyDelete !== true) throw Error("Railway did not acknowledge temporary SSH key revocation; local files retained.");
  }
  const after = await inventory();
  if (after.some(value => value.id === receipt.key.id || value.fingerprint === receipt.key.fingerprint)) throw Error("Temporary SSH key remains registered; local files retained.");
  const files: Array<{ path: string; disposition: string }> = [];
  for (const identity of [...new Set(receipt.identityFiles.map(file => path.resolve(file)))]) {
    const pair = [identity, `${identity}.pub`], present: string[] = [];
    try {
      for (const file of pair) if (await ordinaryFile(file)) {
        const publicKey = file === identity ? await publicKeyFromPrivate(file) : await readFile(file, "utf8");
        if (fingerprint(publicKey) !== receipt.key.fingerprint) throw Error("Local SSH key changed; retaining the pair.");
        present.push(file);
      }
      for (const file of present) { await unlink(file); files.push({ path: file, disposition: "removed-verified-key" }); }
      if (!present.length) files.push({ path: identity, disposition: "already-absent" });
    } catch { files.push({ path: identity, disposition: "retained-unverified-or-modified" }); }
  }
  if (receipt.addedKnownHostsFile && receipt.addedKnownHostsText) {
    const file = receipt.addedKnownHostsFile;
    try {
      if (!await ordinaryFile(file)) files.push({ path: file, disposition: "already-absent" });
      else if (await readFile(file, "utf8") === receipt.addedKnownHostsText) { await unlink(file); files.push({ path: file, disposition: "removed-exact-owned-file" }); }
      else files.push({ path: file, disposition: "retained-modified-or-unrelated-entries" });
    } catch { files.push({ path: file, disposition: "retained-unverified-or-modified" }); }
  }
  const result = { demonstrationId: id, workspaceId, keyId: receipt.key.id, fingerprint: receipt.key.fingerprint,
    revoked: true, verifiedAt: new Date().toISOString(), files, apiTokenRevoked: false,
    apiTokenAction: "Use the existing owner login to revoke the exact temporary API token; the workspace token cannot list or identify itself." };
  await writeFile(path.join(directory, "ssh-key-cleanup.json"), JSON.stringify(result, null, 2), { mode: 0o600 });
  return result;
}
