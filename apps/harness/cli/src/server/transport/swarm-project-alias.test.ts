import { expect, test } from "bun:test";
import path from "node:path";
import { resolveSwarmProxyProject } from "./bun-server";

const rootPath = path.resolve(".local/swarm-project-alias/registered");
const projects = [{ id: "local-project", rootPath, name: "Registered project" },
  { id: "unrelated-project", rootPath: path.resolve(".local/swarm-project-alias/unrelated"), name: "Unrelated" }];
const mapping = { HYPERFOCUS_SWARM_PROJECT_ID: "coordinator-project", HYPERFOCUS_SWARM_PROJECT_ROOT: rootPath };

test("explicit live and archived coordinator aliases resolve only the matching opened project", () => {
  for (const environment of [mapping, { ...mapping, HYPERFOCUS_SWARM_ARCHIVE: "1" }]) {
    for (const id of ["coordinator-project", "local-project"]) {
      expect(resolveSwarmProxyProject(projects, id, environment)).toEqual({ ...projects[0], id: "coordinator-project" });
    }
    expect(resolveSwarmProxyProject(projects, "unrelated-project", environment)).toBeUndefined();
    expect(resolveSwarmProxyProject(projects, "unknown-project", environment)).toBeUndefined();
    expect(resolveSwarmProxyProject([], "coordinator-project", environment)).toBeUndefined();
    expect(resolveSwarmProxyProject(projects, "coordinator-project", { ...environment, HYPERFOCUS_SWARM_PROJECT_ROOT: rootPath + "-other" })).toBeUndefined();
  }
  expect(projects[0]!.id).toBe("local-project");
});

test("unconfigured and incomplete mappings preserve exact registered ID access", () => {
  for (const environment of [{}, { HYPERFOCUS_SWARM_PROJECT_ID: "coordinator-project" }, { HYPERFOCUS_SWARM_PROJECT_ROOT: rootPath }]) {
    expect(resolveSwarmProxyProject(projects, "local-project", environment)).toBe(projects[0]);
    expect(resolveSwarmProxyProject(projects, "unrelated-project", environment)).toBe(projects[1]);
    expect(resolveSwarmProxyProject(projects, "coordinator-project", environment)).toBeUndefined();
    expect(resolveSwarmProxyProject(projects, rootPath, environment)).toBeUndefined();
  }
});

test("configured roots use canonical platform path comparison", () => {
  const normalizedRoot = path.join(rootPath, "nested", "..");
  expect(resolveSwarmProxyProject(projects, "coordinator-project", { ...mapping, HYPERFOCUS_SWARM_PROJECT_ROOT: normalizedRoot })?.rootPath).toBe(rootPath);
  if (process.platform === "win32") expect(resolveSwarmProxyProject(projects, "coordinator-project", { ...mapping, HYPERFOCUS_SWARM_PROJECT_ROOT: rootPath.toUpperCase() })?.id).toBe("coordinator-project");
});
