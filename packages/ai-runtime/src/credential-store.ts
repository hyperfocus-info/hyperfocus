import { isRecord } from "@hyperfocus/utilities/records";
import { encodeStorageValue, readStoredBytes } from "@hyperfocus/serialization";
import { spawnBackgroundProcessSync } from "@hyperfocus/desktop-runtime/process";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

export interface ProviderCredentialStore {
  readonly persistence: "windows-dpapi" | "memory-only";
  get(providerId: string): string | undefined;
  set(providerId: string, apiKey: string): void;
  delete(providerId: string): void;
  list(): string[];
}

type EncryptedCredentialFile = {
  version: 1;
  protection: "windows-dpapi-current-user";
  credentials: Record<string, string>;
};

const DPAPI_ENTROPY = "Hyperfocus AI provider credentials v1";
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

export function createMemoryOnlyProviderCredentialStore(): ProviderCredentialStore {
  const credentials = new Map<string, string>();
  return {
    persistence: "memory-only",
    get: (providerId) => credentials.get(normalizeProviderId(providerId)),
    set: (providerId, apiKey) => credentials.set(normalizeProviderId(providerId), normalizeApiKey(apiKey)),
    delete: (providerId) => void credentials.delete(normalizeProviderId(providerId)),
    list: () => [...credentials.keys()].sort()
  };
}

export function resolveSharedCredentialPath(environment = process.env): string | undefined {
  const appData = environment.APPDATA?.trim();
  if (process.platform !== "win32" || !appData) {
    return undefined;
  }
  return path.join(appData, "Hyperfocus", "ai", "credentials-v1.json");
}

export function createSharedProviderCredentialStore(options: {
  platform?: NodeJS.Platform;
  filePath?: string;
} = {}): ProviderCredentialStore {
  const platform = options.platform ?? process.platform;
  const filePath = options.filePath ?? resolveSharedCredentialPath();
  if (platform !== "win32" || !filePath) {
    return createMemoryOnlyProviderCredentialStore();
  }
  return createWindowsDpapiProviderCredentialStore(filePath);
}

function createWindowsDpapiProviderCredentialStore(filePath: string): ProviderCredentialStore {
  const decryptedCredentials = new Map<string, string>();
  const loadedProviders = new Set<string>();

  function get(providerId: string) {
    const provider = normalizeProviderId(providerId);
    if (loadedProviders.has(provider)) {
      return decryptedCredentials.get(provider);
    }
    const encryptedValue = readCredentialFile(filePath).credentials[provider];
    const apiKey = encryptedValue ? runDpapi(UNPROTECT_SCRIPT, encryptedValue) : undefined;
    loadedProviders.add(provider);
    if (apiKey) decryptedCredentials.set(provider, apiKey);
    return apiKey;
  }

  function set(providerId: string, apiKey: string) {
    const provider = normalizeProviderId(providerId);
    const value = normalizeApiKey(apiKey);
    const file = readCredentialFile(filePath);
    file.credentials[provider] = runDpapi(PROTECT_SCRIPT, value);
    writeCredentialFile(filePath, file);
    loadedProviders.add(provider);
    decryptedCredentials.set(provider, value);
  }

  function deleteCredential(providerId: string) {
    const provider = normalizeProviderId(providerId);
    loadedProviders.add(provider);
    decryptedCredentials.delete(provider);
    const file = readCredentialFile(filePath);
    if (!(provider in file.credentials)) return;
    delete file.credentials[provider];
    if (Object.keys(file.credentials).length === 0) {
      rmSync(filePath, { force: true });
      return;
    }
    writeCredentialFile(filePath, file);
  }

  return {
    persistence: "windows-dpapi",
    get,
    set,
    delete: deleteCredential,
    list: () => Object.keys(readCredentialFile(filePath).credentials).sort()
  };
}

function readCredentialFile(filePath: string): EncryptedCredentialFile {
  if (!existsSync(filePath)) {
    return { version: 1, protection: "windows-dpapi-current-user", credentials: {} };
  }
  const parsed: unknown = readStoredBytes(readFileSync(filePath));
  if (
    !isRecord(parsed) ||
    parsed.version !== 1 ||
    parsed.protection !== "windows-dpapi-current-user" ||
    !isRecord(parsed.credentials)
  ) {
    throw new Error(`Unsupported AI provider credential file: ${filePath}`);
  }
  const credentials: Record<string, string> = {};
  for (const [providerId, value] of Object.entries(parsed.credentials)) {
    if (typeof value === "string" && value.trim()) {
      credentials[normalizeProviderId(providerId)] = value.trim();
    }
  }
  return { version: 1, protection: "windows-dpapi-current-user", credentials };
}

function writeCredentialFile(filePath: string, file: EncryptedCredentialFile) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  writeFileSync(tempPath, encodeStorageValue(file), { mode: 0o600 });
  renameSync(tempPath, filePath);
}

function runDpapi(script: string, input: string): string {
  const result = spawnBackgroundProcessSync({
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

function normalizeProviderId(providerId: string): string {
  const value = providerId.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{0,159}$/.test(value)) {
    throw new Error("Provider id must contain only letters, numbers, dots, underscores, and hyphens.");
  }
  return value;
}

function normalizeApiKey(apiKey: string): string {
  const value = apiKey.trim();
  if (!value || value.length > 32_000) throw new Error("Provider credential is empty or too large.");
  return value;
}
