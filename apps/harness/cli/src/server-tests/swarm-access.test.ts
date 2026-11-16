import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { TEST_HARNESS_SESSION_TOKEN } from "../server/transport/request-admission";
import { useServerSuiteFixture } from "./support/server-suite-fixture";

describe("swarm project host admission", () => {
  let previousUrl: string | undefined;
  let previousToken: string | undefined;
  beforeEach(() => { previousUrl = process.env.HYPERFOCUS_SWARM_URL; previousToken = process.env.HYPERFOCUS_SWARM_TOKEN; delete process.env.HYPERFOCUS_SWARM_URL; delete process.env.HYPERFOCUS_SWARM_TOKEN; });
  afterEach(() => { if (previousUrl === undefined) delete process.env.HYPERFOCUS_SWARM_URL; else process.env.HYPERFOCUS_SWARM_URL = previousUrl; if (previousToken === undefined) delete process.env.HYPERFOCUS_SWARM_TOKEN; else process.env.HYPERFOCUS_SWARM_TOKEN = previousToken; });
  const suite = useServerSuiteFixture({ fixtureName: "swarm-access" });

  test("requires the Harness session capability and same-origin admission", async () => {
    const endpoint = `http://127.0.0.1:${suite.port}/api/swarm/v1/capabilities`;
    expect((await fetch(endpoint)).status).toBe(403);
    expect((await fetch(endpoint, { headers: { "x-harness-session-token": TEST_HARNESS_SESSION_TOKEN, origin: "https://untrusted.example" } })).status).toBe(403);
    const response = await fetch(endpoint, { headers: { "x-harness-session-token": TEST_HARNESS_SESSION_TOKEN } });
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.available).toBe(false);
    expect(result.backends).toEqual([]);
  });
});
