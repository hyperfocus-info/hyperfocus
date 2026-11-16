import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { createSwarmProxyHandler } from "@hyperfocus/ai-runtime/swarm/client";
import { swarmGit } from "@hyperfocus/ai-runtime/swarm";
import { swarmRunSchema } from "@hyperfocus/ai-core/swarm";
import { createSwarmHttpFixture } from "./test-fixture";

test("simulated tournament approval really applies and rechecks a tiny Git patch without overwriting later work", async () => {
  const owner = resolve(import.meta.dir, "../../../.local/swarm-approval-tests"); await mkdir(owner, { recursive: true });
  const directory = await mkdtemp(join(owner, "run-")); const root = join(directory, "project"); await mkdir(root);
  await writeFile(join(root, "demo.txt"), "baseline\n");
  for (const args of [["init"], ["config", "core.autocrlf", "false"], ["add", "."], ["-c", "user.name=Fixture", "-c", "user.email=fixture@localhost", "commit", "-m", "fixture"]]) await swarmGit({ root, args });
  const revision = (await swarmGit({ root, args: ["rev-parse", "HEAD"] })).output;
  await writeFile(join(root, "notes.txt"), "Unrelated working file\n");
  const fixture = createSwarmHttpFixture({ directory, verifyGitIntegration: true });
  const handler = createSwarmProxyHandler({ resolveProject: id => id === "fixture-project" ? { id, name: "Tiny Git fixture", rootPath: root } : undefined, baseUrl: "http://localhost", token: fixture.token, fetch: (input, init) => fixture.handler(new Request(input, init)) });
  const send = async (route: string, body?: unknown) => {
    const response = await handler(new Request(`http://localhost/api/swarm/v1${route}`, { method: body === undefined ? "GET" : "POST", headers: { "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }));
    const data = await response!.json(); expect(response?.status, JSON.stringify(data)).toBe(200); return swarmRunSchema.parse(data);
  };
  try {
    const run = await send("/runs", { requestId: crypto.randomUUID(), projectId: "fixture-project", goal: "SIMULATED TEST WORKLOAD: tiny Git approval", repository: { revision }, backend: "local", reviewPlan: true });
    await send(`/runs/${run.id}/start`, {}); await fixture.coordinator.drain();
    const reviewed = await send(`/runs/${run.id}`); expect(reviewed.status).toBe("AWAITING_APPROVAL"); expect(reviewed.candidates[0]?.sourceTree).toMatch(/^[a-f0-9]{40}$/);
    const integrated = await send(`/runs/${run.id}/approve`, { candidateId: "candidate-1" });
    expect(integrated.status).toBe("COMPLETED"); expect(integrated.integration?.status).toBe("integrated");
    expect(await readFile(join(root, "demo.txt"), "utf8")).toBe("candidate-1\n"); expect(await readFile(join(root, "notes.txt"), "utf8")).toBe("Unrelated working file\n");
    expect(fixture.integrationVerifications).toHaveLength(1); const receipt = fixture.integrationVerifications[0]!;
    expect(receipt.receivedTree).toBe(receipt.expectedTree); expect(receipt.reconstructedTree).toBe(receipt.expectedTree); expect(receipt.cloudVerified).toBe(false);
    expect(integrated.artifacts.some(artifact => artifact.name === "tiny-git-integration-verification.json")).toBe(true);
    await writeFile(join(root, "demo.txt"), "Later developer edit\n");
    expect((await send(`/runs/${run.id}/approve`, { candidateId: "candidate-1" })).integration?.status).toBe("integrated");
    expect(await readFile(join(root, "demo.txt"), "utf8")).toBe("Later developer edit\n"); expect(fixture.integrationVerifications).toHaveLength(1); expect(await fixture.verificationWorkspaceCount()).toBe(0);
  } finally {
    await fixture.close(); if (!resolve(directory).startsWith(owner + sep)) throw new Error("Fixture cleanup escaped its owner."); await rm(directory, { recursive: true, force: true });
  }
}, 60000);
