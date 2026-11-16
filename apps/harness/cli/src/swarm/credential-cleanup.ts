import { spawnBackgroundProcess } from "@hyperfocus/desktop-runtime/process";
import { lstat, realpath } from "node:fs/promises";
import path from "node:path";

const timeoutMs = 30000, maxBuffer = 65536;
const pinnedVersion = "codex-cli 0.163.0";
const inherited = ["PATH", "HOME", "USERPROFILE", "SystemRoot", "WINDIR", "TMPDIR", "TEMP", "TMP", "LANG", "LC_ALL"];

async function inspect(file: string) {
  try { return await lstat(file); }
  catch (error) { if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return undefined; throw error; }
}
async function run(options: { command: string[]; env: Record<string, string>; cwd: string }) {
  const child = spawnBackgroundProcess({ cmd: options.command, env: options.env, cwd: options.cwd,
    stdin: "ignore", stdout: "pipe", stderr: "pipe", timeout: timeoutMs, maxBuffer });
  const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  return { stdout, stderr, code };
}

/** Called only after the temporary coordinator's evidence export is verified. No token is read or returned. */
export async function removeOwnedSwarmCodexCredentials(options: {
  dataDir: string; codexHome: string; executable?: string; run?: typeof run;
}) {
  const directory = await realpath(options.dataDir), home = path.join(directory, "codex");
  if (path.resolve(options.codexHome) !== home) throw Error("Credential cleanup requires the exact owned dataDir/codex directory.");
  const homeInfo = await inspect(home);
  if (homeInfo && (!homeInfo.isDirectory() || homeInfo.isSymbolicLink() || await realpath(home) !== home))
    throw Error("Credential cleanup refuses a redirected Codex directory.");
  const authFile = path.join(home, "auth.json"), auth = await inspect(authFile);
  if (auth && (!auth.isFile() || auth.isSymbolicLink() || auth.nlink !== 1)) throw Error("Credential cleanup refuses a redirected credential file.");
  const receipt = { localStoreRemoved: true, remoteRevocationConfirmed: false, physicalErasureVerified: false };
  if (!auth) return { ...receipt, alreadyAbsent: true, loggedOut: false };
  // A temporary worker has no user config. Refuse hidden auth-routing changes
  // instead of allowing logout to read an unrelated credential store or endpoint.
  if (await inspect(path.join(home, "config.toml"))) throw Error("Credential cleanup requires the temporary Codex home without user configuration.");
  if (!options.executable || !path.isAbsolute(options.executable)) throw Error("Credential cleanup requires the pinned absolute Codex executable.");
  const env: Record<string, string> = { CODEX_HOME: home };
  for (const name of inherited) if (process.env[name]) env[name] = process.env[name];
  const execute = options.run ?? run;
  async function command(args: string[]) {
    try { return await execute({ command: [options.executable ?? "", ...args], env, cwd: directory }); }
    catch { throw Error("Owned Codex credential cleanup process failed; raw output suppressed."); }
  }
  const version = await command(["--version"]);
  if (version.code !== 0 || version.stdout.trim() !== pinnedVersion) throw Error("Credential cleanup requires the pinned Codex version.");
  const overrides = ["-c", 'cli_auth_credentials_store="file"'];
  const logout = await command([...overrides, "logout"]);
  if (logout.code !== 0) throw Error("Owned Codex logout failed; evidence volumes must be retained.");
  const status = await command([...overrides, "login", "status"]);
  if (status.code !== 1 || !/^Not logged in\s*$/.test((status.stdout + status.stderr).trim()) || await inspect(authFile))
    throw Error("Owned Codex credential removal could not be verified; evidence volumes must be retained.");
  return { ...receipt, alreadyAbsent: false, loggedOut: true };
}
