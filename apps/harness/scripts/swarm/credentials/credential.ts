import { spawnBackgroundProcess } from "@hyperfocus/desktop-runtime/process";
import path from "node:path";
import { z } from "zod";

/** Read only this deployment's Windows-encrypted credential; never log the plaintext. */
export async function readSwarmRailwayCredential(options: { root: string; demonstrationId: string }) {
  if (process.platform !== "win32") throw Error("This local credential store requires Windows; use the explicit environment credential on other hosts.");
  const id = z.string().uuid().parse(options.demonstrationId);
  const file = path.resolve(options.root, ".local/swarm/credentials", id, "railway-token.dpapi");
  const command = [
    "$ErrorActionPreference = 'Stop'",
    "Add-Type -AssemblyName System.Security",
    "$encrypted = [IO.File]::ReadAllBytes($env:HYPERFOCUS_CREDENTIAL_FILE)",
    "$entropy = [Text.Encoding]::UTF8.GetBytes('hyperfocus-swarm:' + $env:HYPERFOCUS_CREDENTIAL_ID)",
    "$plain = [Security.Cryptography.ProtectedData]::Unprotect($encrypted, $entropy, [Security.Cryptography.DataProtectionScope]::CurrentUser)",
    "try { [Console]::Out.Write([Text.Encoding]::UTF8.GetString($plain)) } finally { [Array]::Clear($plain, 0, $plain.Length) }",
  ].join("\n");
  const child = spawnBackgroundProcess({ cmd: ["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", command],
    env: { ...process.env, HYPERFOCUS_CREDENTIAL_FILE: file, HYPERFOCUS_CREDENTIAL_ID: id },
    stdin: "ignore", stdout: "pipe", stderr: "ignore", timeout: 10_000, maxBuffer: 4096 });
  const [token, code] = await Promise.all([new Response(child.stdout).text(), child.exited]);
  if (code || !/^[A-Za-z0-9_.-]{20,512}$/.test(token)) throw Error("Could not decrypt the approved Railway credential. Plaintext suppressed.");
  return token;
}

export async function verifySwarmRailwayCredential(options: { token: string }) {
  const response = await fetch("https://backboard.railway.com/graphql/v2", {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(20_000),
    headers: { authorization: `Bearer ${options.token}`, "content-type": "application/json" },
    body: JSON.stringify({ query: "query SwarmCredentialScope { apiToken { workspaces { id name } } }" }),
  });
  if (!response.ok) throw Error(`Railway credential check failed (${response.status}); details suppressed.`);
  const value = z.object({ data: z.object({ apiToken: z.object({ workspaces: z.array(z.object({ id: z.string(), name: z.string() })) }) }).nullable(), errors: z.array(z.unknown()).optional() }).parse(await response.json());
  const workspaces = value.data?.apiToken.workspaces;
  if (value.errors?.length || workspaces?.length !== 1 || workspaces[0]?.id !== "9725002b-c991-4e0e-bd48-fb4065ef5482") throw Error("Credential does not resolve exclusively to the approved Railway workspace.");
  return { verified: true, workspace: workspaces[0], accessibleWorkspaceCount: workspaces.length };
}
