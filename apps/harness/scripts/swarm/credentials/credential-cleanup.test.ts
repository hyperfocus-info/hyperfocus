import { afterEach, expect, spyOn, test } from "bun:test";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { cleanupSwarmSshCredential } from "./credential-cleanup";

const directories: string[] = [];
afterEach(async () => { for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true }); });
async function fixture() {
  const parent = path.resolve(import.meta.dir, "../../../.local/swarm/credential-cleanup-tests");
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(path.join(parent, "owned-")); directories.push(root);
  const id = randomUUID(), directory = path.join(root, ".local/swarm/credentials", id), deployment = path.join(root, ".local/swarm/deployments", id);
  const home = path.join(root, "test-home"), knownHosts = path.join(home, ".ssh/known_hosts"), identity = path.join(directory, "id_ed25519");
  for (const folder of [directory, deployment, path.dirname(knownHosts)]) await mkdir(folder, { recursive: true });
  const bytes = Buffer.from("fixture-public-key-only"), publicKey = `ssh-ed25519 ${bytes.toString("base64")} fixture`;
  const fingerprint = `SHA256:${createHash("sha256").update(bytes).digest("base64").replace(/=+$/, "")}`;
  const key = { id: randomUUID(), name: `hyperfocus-swarm-${id.slice(0, 8)}`, fingerprint, workspaceId: "9725002b-c991-4e0e-bd48-fb4065ef5482" };
  const receipt = { demonstrationId: id, approved: true, registered: true, workspaceId: key.workspaceId, fingerprint, identityFiles: [identity],
    key, addedKnownHostsFile: knownHosts, addedKnownHostsText: "ssh.railway.com ssh-ed25519 fixture\n" };
  await writeFile(path.join(directory, "ssh-key-registration.json"), JSON.stringify(receipt));
  await writeFile(`${identity}.pub`, publicKey);
  await writeFile(knownHosts, receipt.addedKnownHostsText);
  await writeFile(path.join(deployment, "deployment.json"), JSON.stringify({ id, projectId: "13527ca6-cda6-4341-8d8a-9ab70d7bcdf5", phase: "cleaned", worker: { id: randomUUID() } }));
  return { root, demonstrationId: id, allowCleanup: true, token: "fixture-only-token", homeDirectory: home, key, receipt, directory, identity, knownHosts };
}
function provider(key: { id: string; name: string; fingerprint: string; workspaceId: string }, options: { services?: Array<{ id: string; name: string }>; deleteResult?: boolean; retainAfter?: boolean } = {}) {
  let present = true, mutations = 0;
  const request = spyOn(globalThis, "fetch").mockImplementation(Object.assign(async (_url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const input = JSON.parse(String(init?.body));
    if (input.query.includes("SwarmCredentialScope")) return Response.json({ data: { apiToken: { workspaces: [{ id: key.workspaceId, name: "fixture" }] } } });
    if (input.query.includes("SwarmRevokeApprovedSshKey")) {
      expect(input.variables.id).toBe(key.id); mutations++;
      if (options.deleteResult !== false && !options.retainAfter) present = false;
      return Response.json({ data: { sshPublicKeyDelete: options.deleteResult ?? true } });
    }
    if (input.query.includes("SwarmCredentialCleanupInventory")) return Response.json({ data: {
      project: { services: { edges: (options.services ?? []).map(node => ({ node })) } },
      sshPublicKeys: { edges: present ? [{ node: key }] : [], pageInfo: { hasNextPage: false } },
    } });
    throw Error("Unexpected fixture provider request.");
  }, { preconnect: fetch.preconnect }));
  return { request, mutations: () => mutations };
}

test("credential cleanup verifies remote revocation before removing only the recorded matching files", async () => {
  const value = await fixture(), remote = provider(value.key);
  try {
    const result = await cleanupSwarmSshCredential(value);
    expect(result).toMatchObject({ revoked: true, apiTokenRevoked: false, keyId: value.key.id });
    expect(remote.mutations()).toBe(1);
    expect(await Bun.file(`${value.identity}.pub`).exists()).toBe(false);
    expect(await Bun.file(value.knownHosts).exists()).toBe(false);
    expect(await readFile(path.join(value.directory, "ssh-key-cleanup.json"), "utf8")).not.toContain(value.token);
    expect((await cleanupSwarmSshCredential(value)).files.every(file => file.disposition === "already-absent")).toBe(true);
    expect(remote.mutations()).toBe(1);
  } finally { remote.request.mockRestore(); }
});

test("credential cleanup refuses changed key metadata, running owned services, or unverified deletion", async () => {
  for (const failure of ["metadata", "service", "rejected", "retained"] as const) {
    const value = await fixture(), key = failure === "metadata" ? { ...value.key, name: "different-key" } : value.key;
    const remote = provider(key, { services: failure === "service" ? [{ id: randomUUID(), name: `${value.key.name}-worker` }] : [],
      deleteResult: failure !== "rejected", retainAfter: failure === "retained" });
    try {
      await expect(cleanupSwarmSshCredential(value)).rejects.toThrow();
      expect(remote.mutations()).toBe(failure === "metadata" || failure === "service" ? 0 : 1);
      expect(await Bun.file(`${value.identity}.pub`).exists()).toBe(true);
      expect(await Bun.file(value.knownHosts).exists()).toBe(true);
    } finally { remote.request.mockRestore(); }
  }
});

test("credential cleanup retains modified key files and known_hosts with unrelated additions", async () => {
  const value = await fixture(), remote = provider(value.key);
  await writeFile(`${value.identity}.pub`, "ssh-ed25519 ZGlmZmVyZW50 changed");
  const changedHosts = `${value.receipt.addedKnownHostsText}unrelated.example ssh-ed25519 another\n`;
  await writeFile(value.knownHosts, changedHosts);
  try {
    const result = await cleanupSwarmSshCredential(value);
    expect(result.revoked).toBe(true);
    expect(result.files.every(file => file.disposition.startsWith("retained"))).toBe(true);
    expect(await readFile(value.knownHosts, "utf8")).toBe(changedHosts);
    expect(await Bun.file(`${value.identity}.pub`).exists()).toBe(true);
  } finally { remote.request.mockRestore(); }
});

test("credential cleanup requires explicit authorization and rejects receipt path tampering before provider access", async () => {
  const value = await fixture(), remote = provider(value.key);
  try {
    await expect(cleanupSwarmSshCredential({ ...value, allowCleanup: false })).rejects.toThrow("prior authorization");
    await writeFile(path.join(value.directory, "ssh-key-registration.json"), JSON.stringify({ ...value.receipt, identityFiles: [path.join(value.root, "unrelated-key")] }));
    await expect(cleanupSwarmSshCredential(value)).rejects.toThrow("exact owned key locations");
    expect(remote.request).not.toHaveBeenCalled();
  } finally { remote.request.mockRestore(); }
});
