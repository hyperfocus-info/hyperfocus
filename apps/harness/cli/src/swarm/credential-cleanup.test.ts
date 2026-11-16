import { afterEach, expect, test } from "bun:test";
import { link, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { removeOwnedSwarmCodexCredentials } from "./credential-cleanup";

const directories: string[] = [];
afterEach(async () => { for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true }); });
async function fixture() {
  const parent = resolve(import.meta.dir, "../../../.local/swarm/credential-tests"); await mkdir(parent, { recursive: true });
  const dataDir = await mkdtemp(join(parent, "owned-")); directories.push(dataDir);
  const codexHome = join(dataDir, "codex"), authFile = join(codexHome, "auth.json"); await mkdir(codexHome);
  await writeFile(authFile, "synthetic credential fixture");
  return { dataDir, codexHome, authFile, executable: resolve("codex-fixture.exe") };
}

test("cleanup uses only the owned file store after export and verifies logged-out status without claiming revocation", async () => {
  const value = await fixture(), commands: string[][] = [];
  const result = await removeOwnedSwarmCodexCredentials({ ...value, run: async input => {
    commands.push(input.command);
    expect(input.cwd).toBe(value.dataDir); expect(input.env.CODEX_HOME).toBe(value.codexHome);
    expect(input.env).not.toHaveProperty("OPENAI_API_KEY"); expect(input.env).not.toHaveProperty("SWARM_SERVICE_TOKEN");
    if (input.command.includes("--version")) return { code: 0, stdout: "codex-cli 0.163.0\n", stderr: "" };
    if (input.command.includes("logout")) { await rm(value.authFile); return { code: 0, stdout: "", stderr: "Successfully logged out\n" }; }
    return { code: 1, stdout: "", stderr: "Not logged in\n" };
  } });
  expect(result).toEqual({ localStoreRemoved: true, remoteRevocationConfirmed: false, physicalErasureVerified: false, alreadyAbsent: false, loggedOut: true });
  expect(commands[1]).toEqual([value.executable, "-c", 'cli_auth_credentials_store="file"', "logout"]);
  expect(commands[2]).toEqual([value.executable, "-c", 'cli_auth_credentials_store="file"', "login", "status"]);
  expect(await removeOwnedSwarmCodexCredentials({ ...value, run: async () => { throw Error("must not run"); } })).toMatchObject({ localStoreRemoved: true, alreadyAbsent: true });
});

test("foreign home and unexpected config fail before running Codex or touching credentials", async () => {
  const value = await fixture(), run = async () => { throw Error("must not run"); };
  await expect(removeOwnedSwarmCodexCredentials({ ...value, codexHome: value.dataDir, run })).rejects.toThrow("exact owned");
  await writeFile(join(value.codexHome, "config.toml"), 'cli_auth_credentials_store="keyring"');
  await expect(removeOwnedSwarmCodexCredentials({ ...value, run })).rejects.toThrow("without user configuration");
  expect(await readFile(value.authFile, "utf8")).toBe("synthetic credential fixture");
});

test("a successful logout exit is insufficient when credentials or logged-in status remain", async () => {
  const value = await fixture();
  for (const loggedIn of [true, false]) await expect(removeOwnedSwarmCodexCredentials({ ...value, run: async input => {
    if (input.command.includes("--version")) return { code: 0, stdout: "codex-cli 0.163.0", stderr: "" };
    if (input.command.includes("logout")) return { code: 0, stdout: "", stderr: "" };
    return { code: loggedIn ? 0 : 1, stdout: "", stderr: loggedIn ? "Logged in using ChatGPT" : "Not logged in" };
  } })).rejects.toThrow("could not be verified");
  expect(await readFile(value.authFile, "utf8")).toBe("synthetic credential fixture");
});

test("failed logout and incorrect pinned runtime cannot authorize evidence volume deletion", async () => {
  const value = await fixture();
  await expect(removeOwnedSwarmCodexCredentials({ ...value, run: async () => ({ code: 0, stdout: "codex-cli other", stderr: "" }) })).rejects.toThrow("pinned");
  await expect(removeOwnedSwarmCodexCredentials({ ...value, run: async input => input.command.includes("--version")
    ? { code: 0, stdout: "codex-cli 0.163.0", stderr: "" } : { code: 1, stdout: "", stderr: "sensitive error" } })).rejects.toThrow("logout failed");
});

test("hard-linked credentials cannot cause cleanup outside the owned login store", async () => {
  const value = await fixture(), outside = join(value.dataDir, "other-login.json");
  await link(value.authFile, outside);
  await expect(removeOwnedSwarmCodexCredentials({ ...value, run: async () => { throw Error("must not run"); } })).rejects.toThrow("redirected credential");
  expect(await readFile(outside, "utf8")).toBe("synthetic credential fixture");
});
