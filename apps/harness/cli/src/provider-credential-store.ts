import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

export type ProviderCredential = "openai" | "google" | "anthropic";

export interface ProviderCredentialStore {
  readonly persistence: "windows-dpapi" | "memory-only";
  get(provider: ProviderCredential): string | undefined;
  set(provider: ProviderCredential, apiKey: string): void;
  delete(provider: ProviderCredential): void;
}

type EncryptedCredentialFile = {
  version: 1;
  protection: "windows-dpapi-current-user";
  credentials: Partial<Record<ProviderCredential, string>>;
};

const PROVIDERS: ProviderCredential[] = ["openai", "google", "anthropic"];
const DPAPI_ENTROPY = "Hyperfocus provider credentials v1";
const PROTECT_SCRIPT = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
$plainText = [Console]::In.ReadToEnd()
$plainBytes = [Text.Encoding]::UTF8.GetBytes($plainText)
$entropy = [Text.Encoding]::UTF8.GetBytes('${DPAPI_ENTROPY}')
$protectedBytes = [Security.Cryptography.ProtectedData]::Protect(
  $plainBytes,
  $entropy,
  [Security.Cryptography.DataProtectionScope]::CurrentUser
)
[Console]::Out.Write([Convert]::ToBase64String($protectedBytes))
`;
const UNPROTECT_SCRIPT = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
$protectedText = [Console]::In.ReadToEnd()
$protectedBytes = [Convert]::FromBase64String($protectedText)
$entropy = [Text.Encoding]::UTF8.GetBytes('${DPAPI_ENTROPY}')
$plainBytes = [Security.Cryptography.ProtectedData]::Unprotect(
  $protectedBytes,
  $entropy,
  [Security.Cryptography.DataProtectionScope]::CurrentUser
)
[Console]::Out.Write([Text.Encoding]::UTF8.GetString($plainBytes))
`;

/**
 * Safe cross-platform fallback. Credentials remain available to the running
 * process but are deliberately not written to disk. A future platform adapter
 * must use the native user credential vault rather than add a plaintext file.
 */
export function createMemoryOnlyProviderCredentialStore(): ProviderCredentialStore {
  const credentials = new Map<ProviderCredential, string>();
  return {
    persistence: "memory-only",
    get: (provider) => credentials.get(provider),
    set: (provider, apiKey) => credentials.set(provider, apiKey),
    delete: (provider) => credentials.delete(provider)
  };
}

function createWindowsDpapiProviderCredentialStore(filePath: string): ProviderCredentialStore {
  const loadedProviders = new Set<ProviderCredential>();
  const decryptedCredentials = new Map<ProviderCredential, string>();

  function get(provider: ProviderCredential) {
    if (loadedProviders.has(provider)) {
      return decryptedCredentials.get(provider);
    }

    const encryptedValue = readFile().credentials[provider];
    const apiKey = encryptedValue ? runDpapi(UNPROTECT_SCRIPT, encryptedValue) : undefined;
    loadedProviders.add(provider);
    if (apiKey) {
      decryptedCredentials.set(provider, apiKey);
    }
    return apiKey;
  }

  function set(provider: ProviderCredential, apiKey: string) {
    const file = readFile();
    file.credentials[provider] = runDpapi(PROTECT_SCRIPT, apiKey);
    writeFile(file);
    loadedProviders.add(provider);
    decryptedCredentials.set(provider, apiKey);
  }

  function deleteCredential(provider: ProviderCredential) {
    loadedProviders.add(provider);
    decryptedCredentials.delete(provider);
    const file = readFile();
    if (!(provider in file.credentials)) {
      return;
    }

    delete file.credentials[provider];
    if (Object.keys(file.credentials).length === 0) {
      rmSync(filePath, { force: true });
      return;
    }
    writeFile(file);
  }

  function readFile(): EncryptedCredentialFile {
    if (!existsSync(filePath)) {
      return createEmptyEncryptedCredentialFile();
    }

    const parsed: unknown = JSON.parse(readFileSync(filePath, "utf8"));
    if (!isRecord(parsed) || parsed.version !== 1 || parsed.protection !== "windows-dpapi-current-user" || !isRecord(parsed.credentials)) {
      throw new Error(`Unsupported provider credential file: ${filePath}`);
    }

    const credentials: Partial<Record<ProviderCredential, string>> = {};
    for (const provider of PROVIDERS) {
      const value = parsed.credentials[provider];
      if (typeof value === "string" && value.trim()) {
        credentials[provider] = value.trim();
      }
    }
    return {
      version: 1,
      protection: "windows-dpapi-current-user",
      credentials
    };
  }

  function writeFile(file: EncryptedCredentialFile) {
    mkdirSync(path.dirname(filePath), { recursive: true });
    const tempPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
    writeFileSync(tempPath, `${JSON.stringify(file, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    renameSync(tempPath, filePath);
  }

  return { persistence: "windows-dpapi", get, set, delete: deleteCredential };
}

export function resolveProviderCredentialPath(dbPath: string) {
  return `${path.resolve(dbPath)}.provider-credentials.json`;
}

export function createProviderCredentialStore(
  dbPath: string,
  platform: NodeJS.Platform = process.platform
): ProviderCredentialStore {
  if (dbPath === ":memory:" || platform !== "win32") {
    return createMemoryOnlyProviderCredentialStore();
  }
  return createWindowsDpapiProviderCredentialStore(resolveProviderCredentialPath(dbPath));
}

function createEmptyEncryptedCredentialFile(): EncryptedCredentialFile {
  return {
    version: 1,
    protection: "windows-dpapi-current-user",
    credentials: {}
  };
}

function runDpapi(script: string, input: string) {
  const result = Bun.spawnSync({
    cmd: ["powershell.exe", "-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script],
    stdin: Buffer.from(input, "utf8"),
    stdout: "pipe",
    stderr: "pipe",
    env: {
      SystemRoot: process.env.SystemRoot ?? "C:\\Windows",
      PATH: process.env.PATH ?? "",
      TEMP: process.env.TEMP ?? "",
      TMP: process.env.TMP ?? ""
    }
  });
  const output = new TextDecoder().decode(result.stdout).trim();
  if (result.exitCode !== 0 || !output) {
    const detail = new TextDecoder().decode(result.stderr).trim();
    throw new Error(`Windows credential protection failed${detail ? `: ${detail}` : "."}`);
  }
  return output;
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return Boolean(input) && typeof input === "object" && !Array.isArray(input);
}
