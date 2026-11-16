import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createRailwayWorkerService } from "./service";
import { createWorkspaceRegistry } from "./registry";
import { fakeRailway } from "./test-support";
import { createDemonstrationBudget } from "./budget";

const directories: string[] = [];
afterEach(async () => { for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true }); });
async function fixture() {
  const root = resolve(import.meta.dir, "../../../.local"); await mkdir(root, { recursive: true });
  const directory = await mkdtemp(join(root, "swarm-worker-test-")); directories.push(directory);
  const file = join(directory, "registry.json"), registry = await createWorkspaceRegistry({ file }), fake = fakeRailway();
  const service = createRailwayWorkerService({ registry, sdk: fake.sdk, token: "private-api-token", environmentId: "only-environment", allowedRepositories: ["https://example.com/repo.git"] });
  const spec = { swarmId: "swarm", taskId: "baseline", source: { revision: "a".repeat(40), repositoryUrl: "https://example.com/repo.git" }, resources: { cpu: 2, memoryGB: 2 }, lane: "investigation" };
  return { service, fake, registry, file, spec };
}
test("creates immutable isolated workspaces, forks independently and restores ownership after restart", async () => {
  const { service, fake, file, spec } = await fixture();
  const workspace = await service.create(spec);
  expect(fake.operations.find(item => item.name === "create")?.options).toMatchObject({ networkIsolation: "ISOLATED", domains: [], idleTimeoutMinutes: 3, resources: { cpu: 2, memoryGB: 2 } });
  expect(JSON.stringify(fake.operations.filter(item => item.name === "exec"))).not.toContain("private-api-token");
  const duplicate = await service.create(spec); expect(duplicate.id).toBe(workspace.id); expect(fake.instances.size).toBe(1);
  await expect(service.create({ ...spec, source: { ...spec.source, revision: "b".repeat(40) } })).rejects.toThrow("Idempotency conflict");
  const fork = await service.fork(workspace.id, "candidate"); expect(fork.id).not.toBe(workspace.id);
  expect((await createWorkspaceRegistry({ file })).list()).toHaveLength(2);
  await service.destroy(fork.id); await service.destroy(workspace.id); expect(fake.instances.size).toBe(0);
});

test("concurrent creates share immutable input and reject changed source before preparation finishes", async () => {
  const { service, fake, spec } = await fixture();
  const first = service.create(spec), duplicate = service.create(spec);
  await expect(service.create({ ...spec, source: { ...spec.source, revision: "b".repeat(40) } })).rejects.toThrow("Idempotency conflict");
  expect((await duplicate).id).toBe((await first).id);
  expect(fake.operations.filter(operation => operation.name === "create")).toHaveLength(1);
});

test("fork retries share one reservation and retain immutable parent identity after restart", async () => {
  const { registry, fake, file, spec } = await fixture();
  const budget = await createDemonstrationBudget({ file: file + ".budget", id: crypto.randomUUID(), maximumUsd: 2, expiresAt: new Date(Date.now() + 3_600_000).toISOString() });
  const options = { registry, sdk: fake.sdk, token: "private-api-token", environmentId: "only-environment", allowedRepositories: ["https://example.com/repo.git"], budget };
  const service = createRailwayWorkerService(options), workspace = await service.create(spec);
  const forks = await Promise.all([service.fork(workspace.id, "candidate"), service.fork(workspace.id, "candidate")]);
  expect(forks[0]!.id).toBe(forks[1]!.id);
  const restarted = createRailwayWorkerService({ ...options, registry: await createWorkspaceRegistry({ file }) });
  expect((await restarted.fork(workspace.id, "candidate")).id).toBe(forks[0]!.id);
  expect(fake.operations.filter(operation => operation.name === "fork")).toHaveLength(1);
  expect(budget.snapshot().admissions).toHaveLength(2);
  await expect(restarted.create({ ...spec, taskId: "candidate" })).rejects.toThrow("Idempotency conflict");
  await expect(restarted.fork(forks[0]!.id, "candidate")).rejects.toThrow("Idempotency conflict");
  budget.drain();
  await expect(restarted.fork(workspace.id, "candidate")).rejects.toThrow("draining");
});

test("concurrent recovery replaces an interrupted fork once before advertising readiness", async () => {
  const { service, fake, file, spec } = await fixture();
  const workspace = await service.create(spec), interrupted = await service.fork(workspace.id, "candidate");
  const saved = JSON.parse(await readFile(file, "utf8")); saved.find((entry: { workspace: { id: string } }) => entry.workspace.id === interrupted.id).ready = false;
  await writeFile(file, JSON.stringify(saved));
  const restarted = createRailwayWorkerService({ registry: await createWorkspaceRegistry({ file }), sdk: fake.sdk, token: "private-api-token", environmentId: "only-environment", allowedRepositories: ["https://example.com/repo.git"] });
  const recovered = await Promise.all([restarted.fork(workspace.id, "candidate"), restarted.fork(workspace.id, "candidate")]);
  expect(recovered[0]!.id).toBe(recovered[1]!.id); expect(recovered[0]!.id).not.toBe(interrupted.id);
  expect(fake.instances.has(interrupted.id)).toBe(false);
  expect(restarted.list()).toHaveLength(2);
});
test("rejects unapproved repositories and invalid bundles before leaking a workspace", async () => {
  const { service, fake, spec } = await fixture();
  await expect(service.create({ ...spec, source: { ...spec.source, repositoryUrl: "https://evil.example/repo" } })).rejects.toThrow("allowlist");
  expect(fake.instances.size).toBe(0);
  await expect(service.create({ ...spec, source: { revision: spec.source.revision, bundle: { sha256: "0".repeat(64), bytesBase64: "aGVsbG8=" } } })).rejects.toThrow("integrity");
  expect(fake.instances.size).toBe(0); expect(service.list()).toHaveLength(0);
});
test("preparation failure destroys the sandbox and does not leave an idle execution pool", async () => {
  const { service, fake, spec } = await fixture();
  await expect(service.create({ ...spec, preparation: { command: "fail", timeoutMs: 1000 } })).rejects.toThrow("preparation failed");
  expect(fake.instances.size).toBe(0); expect(service.list()).toHaveLength(0);
});
test("streaming returns durable session identity, timeout and nonzero failures honestly", async () => {
  const { service, spec } = await fixture(); const workspace = await service.create(spec);
  for (const command of ["success", "fail", "timeout"]) {
    const events: any[] = [];
    await service.execute(workspace.id, { id: command, command, timeoutMs: 1000 }, new AbortController().signal, event => events.push(event));
    expect(events.find(event => event.type === "session")?.sessionId).toBe("durable-session");
    expect(events.find(event => event.type === "output")?.text).toBe("remote output\n");
    expect(events.at(-1)?.result).toMatchObject({ timedOut: command === "timeout", exitCode: command === "fail" ? 1 : 0 });
  }
});
test("cancellation propagates, exclusive workspace leases reject contention, credentials stay outside execution", async () => {
  const { service, spec } = await fixture(); const workspace = await service.create(spec), controller = new AbortController();
  const task = { id: "task", command: "wait", timeoutMs: 1000 };
  let started!: () => void; const ready = new Promise<void>(resolve => { started = resolve; });
  const operation = service.execute(workspace.id, task, controller.signal, () => started());
  await ready;
  await expect(service.execute(workspace.id, task, new AbortController().signal, () => undefined)).rejects.toThrow("lease");
  await expect(service.fork(workspace.id, "unsafe-fork")).rejects.toThrow("during execution");
  controller.abort(new Error("user cancelled")); await expect(operation).rejects.toThrow("user cancelled");
  await expect(service.execute(workspace.id, { ...task, environment: { RAILWAY_API_TOKEN: "leak" } }, new AbortController().signal, () => undefined)).rejects.toThrow("Credential");
});
test("absolute expiry destroys owned sandboxes and never lists other services' environments", async () => {
  const { service, spec, fake } = await fixture(); await service.create(spec);
  expect(await service.reapExpired(-1)).toEqual({ attempted: 1, failed: 0 });
  expect(fake.instances.size).toBe(0); expect(service.list()).toHaveLength(0);
});
test("completed command receipts are idempotent after a bridge restart", async () => {
  const { service, spec, fake, file } = await fixture(); const workspace = await service.create(spec);
  const task = { id: "same-command", command: "success", timeoutMs: 1000 };
  await service.execute(workspace.id, task, new AbortController().signal, () => undefined);
  const count = fake.operations.filter(item => item.name === "exec").length;
  const restarted = createRailwayWorkerService({ registry: await createWorkspaceRegistry({ file }), sdk: fake.sdk, token: "private-api-token", environmentId: "only-environment", allowedRepositories: ["https://example.com/repo.git"] });
  const events: any[] = [];
  await restarted.execute(workspace.id, task, new AbortController().signal, event => events.push(event));
  expect(events.at(-1).result.exitCode).toBe(0); expect(fake.operations.filter(item => item.name === "exec")).toHaveLength(count);
  await expect(restarted.execute(workspace.id, { ...task, command: "different mutation" }, new AbortController().signal, () => undefined)).rejects.toThrow("Idempotency conflict");
});
test("interrupted preparation is discarded instead of advertised as a ready workspace", async () => {
  const { service, spec, fake, file } = await fixture(); const first = await service.create(spec);
  const saved = JSON.parse(await readFile(file, "utf8")); saved[0].ready = false; await writeFile(file, JSON.stringify(saved));
  const restarted = createRailwayWorkerService({ registry: await createWorkspaceRegistry({ file }), sdk: fake.sdk, token: "private-api-token", environmentId: "only-environment", allowedRepositories: ["https://example.com/repo.git"] });
  const recovered = await Promise.all([restarted.create(spec), restarted.create(spec)]);
  expect(recovered[0]!.id).toBe(recovered[1]!.id);
  expect(recovered[0]!.id).not.toBe(first.id); expect(fake.instances.has(first.id)).toBe(false); expect(restarted.list()).toHaveLength(1);
});
test("parallel forks obey the four-workspace service cap", async () => {
  const { service, spec, fake } = await fixture(); const workspace = await service.create(spec);
  const forks = await Promise.allSettled(Array.from({ length: 6 }, (_, index) => service.fork(workspace.id, `candidate-${index}`)));
  expect(forks.filter(result => result.status === "fulfilled")).toHaveLength(3);
  expect(fake.instances.size).toBe(4);
  await expect(service.destroy("not-owned")).rejects.toThrow("not owned");
});

test("native Node 24 and prepared Bun versions are checked before create and fork readiness", async () => {
  const { service, spec, fake } = await fixture();
  const workspace = await service.create(spec), fork = await service.fork(workspace.id, "pinned-candidate");
  const checks = fake.operations.filter(operation => operation.command === "node --version && bun --version");
  expect(checks).toHaveLength(2);
  expect(checks.map(check => check.id)).toEqual([workspace.id, fork.id]);
  const workspaceCommands = fake.operations.filter(operation => operation.name === "exec" && operation.id === workspace.id);
  expect(workspaceCommands[0]?.command).toBe("node --version && bun --version");
  await service.execute(fork.id, { id: "pinned", command: "success", timeoutMs: 1000, environment: { LC_ALL: "C" } }, new AbortController().signal, () => undefined);
  expect(fake.operations.at(-1)?.options).toMatchObject({ env: { LC_ALL: "C" } });
});

test("wrong runtimes block readiness and destroy newly created or forked sandboxes", async () => {
  const { service, spec, fake, registry } = await fixture();
  fake.versions.node = "v22.23.3";
  await expect(service.create(spec)).rejects.toThrow("required Node 24");
  expect(fake.instances.size).toBe(0); expect(registry.list()).toEqual([]);
  fake.versions.node = "v24.22.0";
  const workspace = await service.create(spec);
  fake.versions.bun = "1.5.0";
  await expect(service.fork(workspace.id, "wrong-bun")).rejects.toThrow("required Node 24");
  expect(fake.instances.size).toBe(1); expect(registry.list().map(value => value.id)).toEqual([workspace.id]);
});
