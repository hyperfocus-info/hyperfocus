import { spawnBackgroundProcess } from "@hyperfocus/desktop-runtime/process";
import { resolve } from "node:path";
import { z } from "zod";
import { swarmBrowserAccessReceiptSchema, swarmBrowserAccessRequestSchema } from "@hyperfocus/ai-core/swarm";

/** Reuse the host's authenticated proxy; never put cloud credentials in a URL. */
export function swarmSiteUrl(host: string, projectId?: string, runId?: string) {
  const url = new URL(host);
  if (url.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.username || url.password)
    throw Error("Use the managed loopback Harness URL for the swarm site.");
  url.pathname = "/swarm"; url.search = ""; url.hash = "";
  if (projectId) url.searchParams.set("projectId", z.string().max(160).regex(/^[a-zA-Z0-9_.:-]+$/).parse(projectId));
  if (runId) url.searchParams.set("runId", z.string().max(160).regex(/^[a-zA-Z0-9_.:-]+$/).parse(runId));
  return url.href;
}

export async function startSwarmSite(options: { projectId?: string; runId?: string; hostUrl?: string }) {
  let hostUrl = options.hostUrl;
  let host: { id: string; url: string; reused: boolean } | undefined;
  if (!hostUrl) {
    const root = resolve(import.meta.dir, "../../../..");
    const child = spawnBackgroundProcess({ cmd: [process.execPath, ".agents/skills/dev-server/scripts/dev.ts", "start", "harness", "--json"], cwd: root, stdout: "pipe", stderr: "pipe", timeout: 120_000 });
    const [output, , code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    if (code) throw Error("Managed Harness startup failed; inspect bun run dev:errors harness.");
    host = z.object({ id: z.string(), url: z.string().url(), reused: z.boolean() }).parse(JSON.parse(output));
    hostUrl = host.url;
  }
  const url = swarmSiteUrl(hostUrl, options.projectId, options.runId);
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(15_000) });
  if (!response.ok || !response.headers.get("content-type")?.includes("text/html")) throw Error("The managed Harness does not serve the swarm site; rebuild/restart the owned host.");
  if (!(await response.text()).includes('name="hyperfocus-swarm-site" content="1"')) throw Error("The host returned another page; rebuild/restart Harness with the swarm site entry.");
  return { url, ...(host ? { serverId: host.id, reused: host.reused } : {}), workloadsStarted: false, authentication: "Existing Harness session; coordinator credentials remain server-side." };
}

async function publicSiteRequest(options: {
  coordinatorUrl?: string; token?: string; route: string; method: "POST" | "DELETE"; body?: unknown;
}) {
  const url = new URL(options.coordinatorUrl ?? process.env.HYPERFOCUS_SWARM_URL ?? "");
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/" || url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))
    throw Error("HYPERFOCUS_SWARM_URL must be an HTTPS origin (loopback HTTP is allowed for local verification).");
  const token = z.string().min(32).parse(options.token ?? process.env.HYPERFOCUS_SWARM_TOKEN);
  const response = await fetch(new URL(`/api/swarm/v1/admin/browser-access${options.route}`, url), {
    method: options.method, headers: { authorization: `Bearer ${token}`, ...(options.body === undefined ? {} : { "content-type": "application/json" }) },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }), redirect: "error", signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw Error(`Public swarm access request failed (${response.status}). Verify the coordinator URL, owner authentication and SWARM_PUBLIC_ORIGIN configuration.`);
  const text = await response.text();
  if (text.length > 16_384) throw Error("Public swarm access response exceeds its byte limit.");
  return JSON.parse(text);
}

/** Mint a run-scoped link; the owner's coordinator token never enters the browser. */
export async function createPublicSwarmSite(options: {
  runId: string; access?: string; expiresInMs?: number; coordinatorUrl?: string; token?: string;
}) {
  const input = swarmBrowserAccessRequestSchema
    .parse({ runId: options.runId, access: options.access ?? "view", expiresInMs: options.expiresInMs });
  const result = swarmBrowserAccessReceiptSchema
    .parse(await publicSiteRequest({ ...options, route: "", method: "POST", body: input }));
  return { ...result, access: input.access, workloadsStarted: false, authentication: "One-use link exchanges for a scoped browser session; keep this link private until opened." };
}

export async function revokePublicSwarmSite(options: { accessId: string; coordinatorUrl?: string; token?: string }) {
  const accessId = z.string().uuid().parse(options.accessId);
  const result = z.object({ revoked: z.literal(true) }).strict().parse(await publicSiteRequest({ ...options, route: `/${accessId}`, method: "DELETE" }));
  return { ...result, accessId };
}
