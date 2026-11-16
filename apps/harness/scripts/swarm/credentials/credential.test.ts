import { expect, spyOn, test } from "bun:test";
import { verifySwarmRailwayCredential } from "./credential";

test("deployment credential must resolve exclusively to the approved workspace", async () => {
  const workspace = { id: "9725002b-c991-4e0e-bd48-fb4065ef5482", name: "I Am Jabriel's Projects" };
  for (const workspaces of [[], [{ id: "another-workspace", name: "Other" }], [workspace, { id: "other", name: "Other" }]]) {
    const request = spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ data: { apiToken: { workspaces } } }));
    try { await expect(verifySwarmRailwayCredential({ token: "test-only-secret" })).rejects.toThrow("exclusively"); }
    finally { request.mockRestore(); }
  }
  const request = spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ data: { apiToken: { workspaces: [workspace] } } }));
  try {
    const result = await verifySwarmRailwayCredential({ token: "test-only-secret" });
    expect(result).toMatchObject({ verified: true, accessibleWorkspaceCount: 1, workspace });
    expect(JSON.stringify(result)).not.toContain("test-only-secret");
  } finally { request.mockRestore(); }
});

test("credential verification does not expose provider error bodies", async () => {
  const request = spyOn(globalThis, "fetch").mockResolvedValue(new Response("sensitive-provider-detail", { status: 401 }));
  try { await expect(verifySwarmRailwayCredential({ token: "test-only-secret" })).rejects.toThrow("Railway credential check failed (401); details suppressed."); }
  finally { request.mockRestore(); }
});
