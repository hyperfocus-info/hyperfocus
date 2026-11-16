import { expect, spyOn, test } from "bun:test";
import { createPublicSwarmSite, revokePublicSwarmSite, swarmSiteUrl } from "./site";

test("swarm site uses a loopback host and opaque context without credential-bearing URLs", () => {
  expect(swarmSiteUrl("http://127.0.0.1:8787/", "project-1", "run-2")).toBe("http://127.0.0.1:8787/swarm?projectId=project-1&runId=run-2");
  expect(() => swarmSiteUrl("https://public.example")).toThrow("loopback");
  expect(() => swarmSiteUrl("http://token@localhost:8787")).toThrow("loopback");
  expect(() => swarmSiteUrl("http://localhost:8787", "../../escape")).toThrow();
});

test("public links carry only a one-use scoped code while owner authority remains in the request header", async () => {
  const token = "private-owner-token-".repeat(3), code = "a".repeat(64), accessId = crypto.randomUUID();
  const response = { url: `https://swarm.example.test/swarm#code=${code}`, accessId, expiresAt: Date.now() + 3_600_000 };
  const request = spyOn(globalThis, "fetch").mockResolvedValue(Response.json(response));
  try {
    const result = await createPublicSwarmSite({ coordinatorUrl: "https://swarm.example.test", token, runId: "run-1" });
    expect(result).toMatchObject({ ...response, access: "view", workloadsStarted: false });
    expect(JSON.stringify(result)).not.toContain(token);
    const [url, init] = request.mock.calls[0]!;
    expect(String(url)).toBe("https://swarm.example.test/api/swarm/v1/admin/browser-access");
    expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${token}`);
    expect(JSON.parse(String(init?.body))).toEqual({ runId: "run-1", access: "view", expiresInMs: 604_800_000 });
    expect(init?.redirect).toBe("error");
  } finally { request.mockRestore(); }
});

test("public access is bounded before network access and untrusted provider errors never echo owner credentials", async () => {
  const options = { coordinatorUrl: "https://swarm.example.test", token: "private-owner-token-".repeat(3), runId: "run-1" };
  const request = spyOn(globalThis, "fetch").mockResolvedValue(new Response(options.token, { status: 401 }));
  try {
    await expect(createPublicSwarmSite({ ...options, access: "owner" })).rejects.toThrow();
    await expect(createPublicSwarmSite({ ...options, expiresInMs: 2_592_000_001 })).rejects.toThrow();
    await expect(createPublicSwarmSite({ ...options, coordinatorUrl: "http://public.example.test" })).rejects.toThrow("HTTPS origin");
    await expect(createPublicSwarmSite({ ...options, coordinatorUrl: "https://token@public.example.test" })).rejects.toThrow("HTTPS origin");
    expect(request).not.toHaveBeenCalled();
    await expect(createPublicSwarmSite(options)).rejects.toThrow("Public swarm access request failed (401)");
  } finally { request.mockRestore(); }
});

test("revocation targets one access ID and requires an explicit provider acknowledgement", async () => {
  const accessId = crypto.randomUUID(), options = { coordinatorUrl: "https://swarm.example.test", token: "private-owner-token-".repeat(3), accessId };
  const request = spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ revoked: true }));
  try {
    expect(await revokePublicSwarmSite(options)).toEqual({ revoked: true, accessId });
    const [url, init] = request.mock.calls[0]!;
    expect(String(url)).toBe(`https://swarm.example.test/api/swarm/v1/admin/browser-access/${accessId}`);
    expect(init?.method).toBe("DELETE");
    expect(init?.body).toBeUndefined();
    request.mockResolvedValue(Response.json({ revoked: false }));
    await expect(revokePublicSwarmSite(options)).rejects.toThrow();
  } finally { request.mockRestore(); }
});
