import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { z } from "zod";
import { createSwarmRequestSchema, swarmRunSchema } from "@hyperfocus/ai-core/swarm";
import { createSwarmHttpFixture } from "../test-fixture";
import { createSwarmBrowserAccessHandler } from "./access";
import { browserAccessSchema, SWARM_BROWSER_COOKIE, SWARM_BROWSER_CSRF } from "./sessions";
import { createSwarmSiteHandler } from "./site";

const origin = "https://swarm.example.test";
const prefix = "/api/swarm/v1/browser";
const parent = resolve(import.meta.dir, "../../../../.local/swarm-browser-tests");
const issuedSchema = z.object({ url: z.string().url(), accessId: z.string().uuid(), expiresAt: z.number() });
const sessionSchema = z.object({ csrfToken: z.string(), access: browserAccessSchema, context: z.object({ projectId: z.string() }), capabilities: z.object({ projects: z.array(z.object({ id: z.string() })) }) });
let directory = "", time = 0;
let fixture: ReturnType<typeof createSwarmHttpFixture>;
let handler: ReturnType<typeof createSwarmBrowserAccessHandler>;
function wrapper(deploymentExpiresAt?: number) {
  return createSwarmBrowserAccessHandler({ store: fixture.store, token: fixture.token, handler: fixture.handler,
    publicOrigin: origin, now: () => time, deploymentExpiresAt, name: id => fixture.recipes.get(id)?.name });
}
beforeEach(async () => {
  await mkdir(parent, { recursive: true }); directory = await mkdtemp(join(parent, "run-")); time = Date.now();
  fixture = createSwarmHttpFixture({ directory, projectIds: ["first-project", "second-project"] }); handler = wrapper();
});
afterEach(async () => { await fixture.close(); if (!resolve(directory).startsWith(parent + "/") && !resolve(directory).startsWith(parent + "\\")) throw Error("Unsafe fixture cleanup path."); await rm(directory, { recursive: true, force: true }); });
function run(projectId = "first-project") {
  return fixture.coordinator.create(createSwarmRequestSchema.parse({ projectId, requestId: crypto.randomUUID(), goal: "SIMULATED browser-access fixture", backend: "local", repository: { revision: "a".repeat(40) }, reviewPlan: true }));
}
function owner(path: string, body?: unknown, method = body === undefined ? "DELETE" : "POST") {
  return handler(new Request(`${origin}/api/swarm/v1/admin/browser-access${path}`, { method, headers: { authorization: `Bearer ${fixture.token}`, "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }));
}
async function issue(runId: string, access: "view" | "control" = "control", expiresInMs = 3_600_000) {
  const result = await owner("", { runId, access, expiresInMs }); expect(result.status).toBe(200);
  return issuedSchema.parse(await result.json());
}
function browser(path: string, options: { cookie?: string; csrfToken?: string; body?: unknown; method?: string; headers?: Record<string, string> } = {}) {
  return handler(new Request(`${origin}${prefix}${path}`, { method: options.method ?? (options.body === undefined ? "GET" : "POST"),
    headers: { origin, "content-type": "application/json", ...(options.cookie ? { cookie: options.cookie } : {}), ...(options.csrfToken ? { [SWARM_BROWSER_CSRF]: options.csrfToken } : {}), ...options.headers },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }) }));
}
async function login(runId: string, access: "view" | "control" = "control", expiresInMs = 3_600_000) {
  const grant = await issue(runId, access, expiresInMs), code = new URLSearchParams(new URL(grant.url).hash.slice(1)).get("code");
  const response = await browser("/session", { body: { code } }); expect(response.status).toBe(200);
  const cookie = response.headers.get("set-cookie")?.split(";")[0]; if (!cookie) throw Error("Missing session cookie.");
  return { grant, code, cookie, ...sessionSchema.parse(await response.json()), cookieHeader: response.headers.get("set-cookie") };
}

test("one-use bootstrap issues a scoped HttpOnly cookie and survives coordinator wrapper restart", async () => {
  const root = run(), session = await login(root.id);
  expect(session.cookieHeader).toContain("Secure; HttpOnly; SameSite=Strict");
  expect(session.access.runId).toBe(root.id); expect(session.context.projectId).toBe(root.request.projectId);
  expect(session.capabilities.projects.map(project => project.id)).toEqual([root.request.projectId]);
  expect((await browser("/session", { body: { code: session.code } })).status).toBe(403);
  const dump = Buffer.from(fixture.store.db.serialize()).toString("utf8");
  expect(dump).not.toContain(session.code!); expect(dump).not.toContain(session.cookie.split("=")[1]!); expect(dump).not.toContain(session.csrfToken);
  await fixture.close();
  fixture = createSwarmHttpFixture({ directory, projectIds: ["first-project", "second-project"] }); handler = wrapper();
  const resumed = await browser("/session", { cookie: session.cookie }); expect(resumed.status).toBe(200);
  expect(sessionSchema.parse(await resumed.json()).csrfToken).toBe(session.csrfToken);
  expect((await browser("/session", { cookie: `${session.cookie}; ${session.cookie}` })).status).toBe(403);
});
test("paired phone survives laptop logout and next-day reconnect but shares grant revocation",async()=>{
  const root=run(),laptop=await login(root.id,"control",7*86400000);
  time+=3600000;
  const paired=await browser("/session/pair",{...laptop,body:{}});
  expect(paired.status).toBe(200);
  const grant=issuedSchema.parse(await paired.json());expect(grant.expiresAt).toBe(laptop.access.expiresAt);
  const code=new URLSearchParams(new URL(grant.url).hash.slice(1)).get("code");
  const connected=await browser("/session",{body:{code}});
  expect(connected.status).toBe(200);const phoneCookie=connected.headers.get("set-cookie")!.split(";")[0]!;
  await browser("/session",{...laptop,method:"DELETE"});time+=86400000;handler=wrapper();
  expect((await browser("/session",{cookie:phoneCookie})).status).toBe(200);
  await owner(`/${grant.accessId}`);
  expect((await browser("/session",{cookie:phoneCookie})).status).toBe(403);
});

test("scoped reads exclude sibling runs, other projects, source uploads and administrative operations", async () => {
  const root = run(), sibling = run(), other = run("second-project");
  const child = fixture.coordinator.followUp(root.id, { requestId: "child", goal: "Inspect the same source again." });
  const session = await login(root.id, "view");
  const listed = await browser(`/runs?projectId=${root.request.projectId}`, session);
  expect(swarmRunSchema.array().parse(await listed.json()).map(value => value.id).sort()).toEqual([root.id, child.id].sort());
  for (const path of [`/runs/${sibling.id}`, `/runs/${other.id}`, `/runs/${other.id}/events`, `/runs?projectId=second-project`, "/context?projectId=second-project", "/admin/export", "/sources"]) {
    expect((await browser(path, session)).status).toBe(403);
  }
  expect((await browser(`/runs/${child.id}`, session)).status).toBe(200);
  expect((await browser(`/context?projectId=${root.request.projectId}`, session)).status).toBe(200);
  for (const action of ["steer", "follow-up", "start", "cancel", "reject", "approve", "integration"]) {
    expect((await browser(`/runs/${root.id}/${action}`, { ...session, body: {} })).status).toBe(403);
  }
});

test("control requires exact Origin and CSRF, preserves follow-up source and limits, and denies integration", async () => {
  const root = run(), session = await login(root.id), body = { requestId: "steering", text: "Preserve verified baseline evidence." };
  expect((await browser(`/runs/${root.id}/steer`, { cookie: session.cookie, body })).status).toBe(403);
  expect((await browser(`/runs/${root.id}/steer`, { ...session, csrfToken: "wrong", body })).status).toBe(403);
  expect((await browser(`/runs/${root.id}/steer`, { ...session, headers: { origin: "https://attacker.test" }, body })).status).toBe(403);
  expect((await handler(new Request(`${origin}${prefix}/runs/${root.id}/steer`, { method: "POST", headers: { cookie: session.cookie, [SWARM_BROWSER_CSRF]: session.csrfToken, "content-type": "application/json" }, body: JSON.stringify(body) }))).status).toBe(403);
  expect((await browser(`/runs/${root.id}/steer`, { ...session, body })).status).toBe(200);
  expect(fixture.store.get(root.id)?.messages.at(-1)?.text).toContain(body.text);
  const queued = await browser(`/runs/${root.id}/follow-up`, { ...session, body: { requestId: "followup", goal: "Review the next bounded hypothesis." } });
  const child = swarmRunSchema.parse(await queued.json()); expect(child.parentRunId).toBe(root.id); expect(child.status).toBe("READY");
  expect(child.request.budget).toEqual(root.request.budget); expect(child.request.repository).toEqual(root.request.repository);
  expect((await browser(`/runs/${root.id}/follow-up`, { ...session, body: { requestId: "bad", goal: "Change a budget", budget: { maxComputeUsd: 100 } } })).status).toBe(403);
  for (const path of [`/runs/${root.id}/approve`, `/runs/${root.id}/integration`, "/runs", "/sources", "/cleanup", "/admin/export"]) expect((await browser(path, { ...session, body: {} })).status).toBe(403);
  expect((await browser(`/runs/${child.id}/start`, { ...session, body: {} })).status).toBe(200);
  expect((await browser(`/runs/${child.id}/cancel`, { ...session, body: {} })).status).toBe(200);
});

test("revocation and logout invalidate durable sessions; grant expiry cannot extend deployment lifetime", async () => {
  const root = run(), session = await login(root.id);
  expect((await owner(`/${session.grant.accessId}`)).status).toBe(200);
  expect((await browser(`/runs/${root.id}`, session)).status).toBe(403);
  const second = await login(root.id);
  expect((await browser("/session", { ...second, method: "DELETE" })).status).toBe(200);
  expect((await browser("/session", second)).status).toBe(403);
  handler = wrapper(time + 2_000);
  const bounded = await login(root.id); expect(bounded.access.expiresAt).toBe(time + 2_000);
  time += 2_001;
  expect((await browser("/session", bounded)).status).toBe(403);
  expect((await owner("", { runId: root.id, access: "control", expiresInMs: 3_600_000 })).status).toBe(400);
});

test("expired bootstrap, cross-origin exchanges and oversized bodies fail before delegated operations", async () => {
  const root = run(), grant = await issue(root.id), code = new URLSearchParams(new URL(grant.url).hash.slice(1)).get("code");
  expect((await browser("/session", { body: { code }, headers: { origin: "null" } })).status).toBe(403);
  expect((await browser("/session", { body: { code }, headers: { "sec-fetch-site": "cross-site" } })).status).toBe(403);
  expect((await browser("/session", { body: { code: "a".repeat(40_000) } })).status).toBe(403);
  time += 86_400_001; expect((await browser("/session", { body: { code } })).status).toBe(403);
  expect((await handler(new Request(`${origin}/api/swarm/v1/admin/browser-access`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ runId: root.id, access: "control" }) }))).status).toBe(401);
});

test("a failed readiness check retains the exchanged session for a later retry", async () => {
  const root = run(); let unavailable = true;
  handler = createSwarmBrowserAccessHandler({ store: fixture.store, token: fixture.token, publicOrigin: origin, now: () => time,
    name: id => fixture.recipes.get(id)?.name, handler: request => {
      if (new URL(request.url).pathname.endsWith("/capabilities") && unavailable) throw Error("Transient provider outage.");
      return fixture.handler(request);
    } });
  const session = await login(root.id);
  expect((await browser(`/runs/${root.id}`, session)).status).toBe(200);
  unavailable = false;
  const resumed = await browser("/session", session); expect(resumed.status).toBe(200);
  expect(sessionSchema.parse(await resumed.json()).access.id).toBe(session.access.id);
  expect((await browser("/session", { body: { code: session.code } })).status).toBe(403);
});

test("an idempotency collision cannot return another run through scoped follow-up", async () => {
  const root = run(), sibling = run(), session = await login(root.id);
  const response = await browser(`/runs/${root.id}/follow-up`, { ...session, body: { requestId: sibling.request.requestId, goal: sibling.request.goal } });
  expect(response.status).toBe(403); expect(await response.text()).not.toContain(sibling.request.goal);
});

test("follow-up depth is checked before creation and invalid descendants cannot hide the scoped root", async () => {
  const root = run(), session = await login(root.id); let latest = root;
  for (let depth = 1; depth < 64; depth++) latest = fixture.coordinator.followUp(latest.id, { requestId: `depth-${depth}`, goal: "Inspect another bounded hypothesis." });
  const before = fixture.store.db.query<{ count: number }, []>("SELECT count(*) AS count FROM swarm_runs").get()?.count;
  expect((await browser(`/runs/${latest.id}/follow-up`, { ...session, body: { requestId: "too-deep", goal: "Unsupported depth" } })).status).toBe(403);
  expect(fixture.store.db.query<{ count: number }, []>("SELECT count(*) AS count FROM swarm_runs").get()?.count).toBe(before);
  fixture.store.change(latest.id, value => { value.request.repository.revision = "b".repeat(40); });
  expect((await browser(`/runs/${latest.id}`, session)).status).toBe(403);
  const listed = swarmRunSchema.array().parse(await (await browser(`/runs?projectId=${root.request.projectId}`, session)).json());
  expect(listed[0]?.id).toBe(root.id); expect(listed.some(value => value.id === latest.id)).toBe(false);
});

test("revocation closes an already-open scoped event stream", async () => {
  const root = run(), session = await login(root.id);
  const response = await browser(`/runs/${root.id}/events`, session); expect(response.status).toBe(200);
  const reader = response.body?.getReader(); if (!reader) throw Error("No SSE body.");
  expect(new TextDecoder().decode((await reader.read()).value)).toContain(root.id);
  await owner(`/${session.access.id}`);
  await expect(reader.read()).rejects.toThrow("revoked");
  await reader.cancel().catch(() => {});
});

test("compressed event streams retain streaming delivery and stop when the session expires", async () => {
  const root = run(), session = await login(root.id, "view", 2_000);
  const response = await browser(`/runs/${root.id}/events`, { ...session, headers: { "accept-encoding": "gzip" } });
  expect(response.headers.get("content-encoding")).toBe("gzip");
  const reader = response.body?.pipeThrough(new DecompressionStream("gzip")).getReader(); if (!reader) throw Error("Missing compressed stream.");
  expect(new TextDecoder().decode((await reader.read()).value)).toContain(root.id);
  time += 2_001;
  await expect(reader.read()).rejects.toThrow("expired");
  await reader.cancel().catch(() => {});
});

test("static public entry serves only exact built assets and never exposes the local Harness session", async () => {
  const siteDir = join(directory, "site"); await mkdir(siteDir);
  await Bun.write(join(siteDir, "index.html"), '<html><script src="/swarm-assets/main.js"></script></html>');
  await Bun.write(join(siteDir, "main.js"), "// public bundle"); await Bun.write(join(siteDir, "main.css"), "body{}");
  const site = createSwarmSiteHandler({ handler, directory: siteDir, publicOrigin: origin });
  const response = await site(new Request(`${origin}/swarm`));
  expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
  expect(await response.text()).not.toContain("harness-session-token");
  expect((await site(new Request(`${origin}/swarm-assets/main.js`))).status).toBe(200);
  expect((await site(new Request(`${origin}/swarm-assets/other.js`))).status).toBe(401);
  expect((await site(new Request("https://attacker.test/swarm"))).status).toBe(403);
  expect((await site(new Request(`${origin}/swarm`, { method: "POST" }))).status).toBe(405);
  expect(SWARM_BROWSER_COOKIE.startsWith("__Host-")).toBe(true);
});
