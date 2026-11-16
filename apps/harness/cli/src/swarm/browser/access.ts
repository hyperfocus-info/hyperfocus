import { z } from "zod";
import { swarmRunSchema, swarmFollowUpSchema } from "@hyperfocus/ai-core/swarm";
import type { SwarmStore } from "../persistence/store";
import { browserAccessRequestSchema, createSwarmBrowserSessions, sameSecret, swarmBrowserCookie, SWARM_BROWSER_COOKIE, SWARM_BROWSER_CSRF } from "./sessions";
import { createSwarmBrowserScope } from "./scope";

const API = "/api/swarm/v1";
const BROWSER = `${API}/browser`;
const MAX_BODY_BYTES = 32_768;
const CHECK_SESSION_MS = 1_000;
const controlActions = new Set(["steer", "follow-up", "start", "cancel", "reject"]);

/** The public wrapper never forwards a browser credential as coordinator authority. */
export function createSwarmBrowserAccessHandler(options: {
  store: SwarmStore; token: string; publicOrigin: string; deploymentExpiresAt?: number; now?: () => number;
  name: (projectId: string) => string | undefined;
  handler: (request: Request) => Promise<Response>;
}) {
  const origin = new URL(options.publicOrigin);
  if (origin.origin !== options.publicOrigin || origin.username || origin.password || origin.protocol !== "https:" && !(origin.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname)))
    throw Error("SWARM_PUBLIC_ORIGIN must be one exact HTTPS origin (loopback HTTP is allowed for local verification).");
  const sessions = createSwarmBrowserSessions({ db: options.store.db, now: options.now, deploymentExpiresAt: options.deploymentExpiresAt });
  const scope = createSwarmBrowserScope({ store: options.store, name: options.name });
  const reply = (value: unknown, status = 200, headers?: HeadersInit) => Response.json(value, { status, headers: { "cache-control": "no-store", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff", ...Object.fromEntries(new Headers(headers)) } });
  const service = (route: string, request?: Request) => options.handler(new Request(`${origin.origin}${API}${route}${request?new URL(request.url).search:""}`, {
    method: request?.method ?? "GET", headers: { authorization: `Bearer ${options.token}`, ...(request?.headers.get("content-type") ? { "content-type": request.headers.get("content-type")! } : {}),
      ...(request?.headers.get("accept") ? { accept: request.headers.get("accept")! } : {}), ...(request?.headers.get("accept-encoding") ? { "accept-encoding": request.headers.get("accept-encoding")! } : {}) },
    ...(request && !["GET", "HEAD"].includes(request.method) ? { body: request.body } : {}), signal: request?.signal,
  }));
  async function capabilities(access: Parameters<typeof scope.capabilities>[0]) {
    const response = await service("/capabilities");
    if (!response.ok) throw Error("Coordinator capabilities are unavailable.");
    return scope.capabilities(access, await response.json());
  }
  async function bootstrap(session: ReturnType<typeof sessions.authenticate>) {
    const root = scope.run(session.access, session.access.runId);
    // Establish the session even when a transient readiness check fails after the
    // one-use exchange. The browser can retry with its cookie without a new link.
    const available = await capabilities(session.access).catch(() => ({ available: false, reason: "Coordinator readiness is temporarily unavailable. Refresh to retry.",
      backends: [root.request.backend], maxWorkers: root.request.maxWorkers, projects: [{ id: session.access.projectId, name: options.name(session.access.projectId) ?? "Swarm project" }] }));
    sessions.authenticate(`${SWARM_BROWSER_COOKIE}=${session.token}`);
    return { csrfToken: session.csrfToken, access: session.access, context: scope.context(session.access, available), capabilities: available };
  }
  function checkOrigin(request: Request, required = false) {
    const supplied = request.headers.get("origin");
    if (new URL(request.url).host !== origin.host || supplied !== null && supplied !== origin.origin || required && supplied === null || ["cross-site", "none"].includes(request.headers.get("sec-fetch-site") ?? ""))
      throw Error("Browser origin is not authorized.");
  }
  function authenticate(request: Request, mutation = false) {
    checkOrigin(request, mutation);
    const session = sessions.authenticate(request.headers.get("cookie"));
    scope.run(session.access, session.access.runId);
    if (mutation && !sameSecret(request.headers.get(SWARM_BROWSER_CSRF) ?? "", session.csrfToken)) throw Error("Browser CSRF check failed.");
    return session;
  }
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url), ownerRoute = `${API}/admin/browser-access`;
    if (url.pathname === ownerRoute || url.pathname.startsWith(ownerRoute + "/")) {
      if (request.headers.has("origin") || !sameSecret(request.headers.get("authorization") ?? "", `Bearer ${options.token}`)) return reply({ error: "Trusted host authentication required." }, 401);
      try {
        if (url.pathname === ownerRoute && request.method === "POST") {
          const input = browserAccessRequestSchema.parse(await readBody(request)), run = options.store.get(input.runId);
          if (!run || !options.name(run.request.projectId)) throw Error("Unknown or unauthorized run.");
          const { access, code } = sessions.mint({ ...input, projectId: run.request.projectId });
          return reply({ url: `${origin.origin}/swarm#code=${code}`, accessId: access.id, expiresAt: access.expiresAt });
        }
        if (url.pathname.startsWith(ownerRoute + "/") && request.method === "DELETE") {
          sessions.revoke(url.pathname.slice(ownerRoute.length + 1)); return reply({ revoked: true });
        }
        return reply({ error: "Not found." }, 404);
      } catch (error) { return reply({ error: message(error) }, 400); }
    }
    if (!url.pathname.startsWith(BROWSER + "/")) return options.handler(request);
    try {
      const route = url.pathname.slice(BROWSER.length);
      if (route === "/session" && request.method === "POST") {
        checkOrigin(request, true);
        const input = z.object({ code: z.string().max(128) }).strict().parse(await readBody(request));
        const session = sessions.exchange(input.code);
        return reply(await bootstrap(session), 200, { "set-cookie": swarmBrowserCookie({ token: session.token, expiresAt: session.access.expiresAt }) });
      }
      const mutation = !["GET", "HEAD"].includes(request.method), session = authenticate(request, mutation);
      if (route === "/session" && request.method === "GET") return reply(await bootstrap(session));
      if (route === "/session" && request.method === "DELETE") {
        sessions.logout(session.token); return reply({ loggedOut: true }, 200, { "set-cookie": swarmBrowserCookie({ token: "", expiresAt: 0 }) });
      }
      if (mutation && session.access.access !== "control") return reply({ error: "This link permits viewing only." }, 403);
      if(route==="/session/pair"&&request.method==="POST"){
        const {access,code}=sessions.pair(session.access);
        return reply({url:`${origin.origin}/swarm#code=${code}`,accessId:access.id,expiresAt:access.expiresAt});
      }
      if (request.method === "GET" && route === "/capabilities") { const available = await capabilities(session.access); authenticate(request); return reply(available); }
      if (request.method === "GET" && ["/context", "/runs"].includes(route)) {
        if (url.searchParams.get("projectId") !== session.access.projectId) throw Error("Project access denied.");
        const result = route === "/runs" ? scope.list(session.access) : scope.context(session.access, await capabilities(session.access));
        authenticate(request); return reply(result);
      }
      const match = /^\/runs\/([a-zA-Z0-9_.:-]+)(?:\/(.*))?$/.exec(route);
      if (!match) return reply({ error: "Browser operation is not permitted." }, 403);
      scope.run(session.access, match[1]!);
      const action = match[2];
      const read = request.method === "GET" && (!action || action === "events" || /^artifacts\/[a-zA-Z0-9_.:-]+$/.test(action));
      if (!read && !(request.method === "POST" && action && controlActions.has(action))) return reply({ error: "Browser operation is not permitted." }, 403);
      let forwarded = request;
      if (!read) {
        const body = await readBody(request);
        authenticate(request, true);
        if (action === "follow-up") {
          scope.assertFollowUp(session.access, match[1]!);
          const input = swarmFollowUpSchema.parse(body);
          const existing = options.store.db.query<{ id: string }, [string, string]>("SELECT id FROM swarm_runs WHERE project_id=? AND request_id=?").get(session.access.projectId, input.requestId);
          if (existing) scope.run(session.access, existing.id);
        }
        forwarded = new Request(request.url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: request.signal });
      }
      const response = await service(route, forwarded);
      if (action === "events" && response.ok && response.body) return sessionStream(response, () => { authenticate(request); scope.run(session.access, match[1]!); });
      authenticate(request);
      if (!read && response.ok) {
        const result = swarmRunSchema.parse(await response.json());
        scope.run(session.access, result.id);
        return reply(result);
      }
      const headers = new Headers(response.headers); headers.set("cache-control", "no-store"); headers.set("referrer-policy", "no-referrer");
      return new Response(response.body, { status: response.status, headers });
    } catch (error) { return reply({ error: message(error) }, 403); }
  };
}
function message(error: unknown) { return error instanceof Error ? error.message : "Browser access rejected."; }
async function readBody(request: Request) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw Error("JSON content type is required.");
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) throw Error("Browser request exceeds byte limit.");
  const reader = request.body?.getReader();
  if (!reader) return {};
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) { const next = await reader.read(); if (next.done) break; size += next.value.length; if (size > MAX_BODY_BYTES) throw Error("Browser request exceeds byte limit."); chunks.push(next.value); }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder().decode(bytes) || "{}");
}
function sessionStream(response: Response, check: () => void) {
  const reader = response.body?.getReader();
  if (!reader) return response;
  let timer: ReturnType<typeof setInterval> | undefined;
  let stopped = false;
  const stop = () => { stopped = true; clearInterval(timer); void reader.cancel().catch(() => {}); };
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      timer = setInterval(() => { if (stopped) return; try { check(); } catch (error) { stop(); controller.error(error); } }, CHECK_SESSION_MS);
    },
    async pull(controller) {
      try {
        check(); const next = await reader.read(); if (stopped) return; check();
        if (next.done) { stop(); controller.close(); } else controller.enqueue(next.value);
      } catch (error) { if (!stopped) { stop(); controller.error(error); } }
    },
    cancel() { stop(); },
  });
  const headers = new Headers(response.headers); headers.set("cache-control", "no-store"); headers.set("referrer-policy", "no-referrer");
  return new Response(body, { status: response.status, headers });
}
