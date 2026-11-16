import { expect, test } from "bun:test";
import { createSwarmS3Client } from "./s3-client";

const configuration = { bucket: "swarm-fixture", endpoint: "https://t3.storageapi.dev", accessKeyId: "fixture-id",
  secretAccessKey: "fixture-secret", region: "auto" };

test("Bun addresses a Railway virtual-hosted bucket without losing or duplicating its name", () => {
  for (const endpoint of [configuration.endpoint, "https://swarm-fixture.t3.storageapi.dev"]) {
    const client = createSwarmS3Client({ ...configuration, endpoint, urlStyle: "virtual-hosted" });
    const url = new URL(client.presign("swarm/fixture.json"));
    expect(url.hostname).toBe("swarm-fixture.t3.storageapi.dev");
    expect(url.pathname).toBe("/swarm/fixture.json");
    expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[a-f0-9]{64}$/);
  }
});

test("older path-style buckets keep the provider endpoint and bucket path", () => {
  const client = createSwarmS3Client({ ...configuration, urlStyle: "path" });
  const url = new URL(client.presign("swarm/fixture.json"));
  expect(url.hostname).toBe("t3.storageapi.dev");
  expect(url.pathname).toBe("/swarm-fixture/swarm/fixture.json");
});

test("unresolved credentials and unsafe or ambiguous endpoints fail before storage access", () => {
  for (const value of ["", "${{hyperfocus.BUCKET}}"])
    expect(() => createSwarmS3Client({ ...configuration, bucket: value, urlStyle: "path" })).toThrow("missing or unresolved");
  for (const endpoint of ["http://storage.example.test", "https://user:password@storage.example.test", "https://storage.example.test?secret=value", "https://storage.example.test#fragment"])
    expect(() => createSwarmS3Client({ ...configuration, endpoint, urlStyle: "path" })).toThrow("HTTPS");
  expect(() => createSwarmS3Client({ ...configuration, endpoint: "https://storage.example.test/bucket", urlStyle: "virtual-hosted" })).toThrow("base endpoint");
  expect(() => createSwarmS3Client({ ...configuration, bucket: "../escape", urlStyle: "virtual-hosted" })).toThrow("DNS bucket");
});
