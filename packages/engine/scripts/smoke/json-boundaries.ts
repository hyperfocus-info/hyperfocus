import { readFileSync } from "node:fs";

export type PackageExportTarget = {
  import?: string;
  types?: string;
  default?: string;
};

export type PackageManifest = {
  name: string;
  version: string;
  packageManager?: string;
  private?: boolean;
  types?: string;
  files?: string[];
  exports?: Record<string, PackageExportTarget>;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
  scripts?: Record<string, string>;
};

export type ApiProfile = { status?: string; proof?: string; promotion?: string; exposure?: string };

export type PublicApiContract = {
  package: string;
  line: string;
  stable: Record<string, PackageExportTarget>;
  experimental: Record<string, PackageExportTarget>;
};

export function readPackageManifest(path: string): PackageManifest {
  const value = readJsonObject(readFileSync(path, "utf8"), `package manifest ${path}`);
  return {
    name: requiredString(value.name, "package name"),
    version: requiredString(value.version, "package version"),
    packageManager: optionalString(value, "packageManager"),
    private: optionalBoolean(value, "private"),
    types: optionalString(value, "types"),
    ...(value.files === undefined ? {} : { files: stringArray(value.files, "package files") }),
    ...(value.exports === undefined ? {} : { exports: exportTargets(value.exports) }),
    ...(value.peerDependencies === undefined ? {} : { peerDependencies: stringMap(value.peerDependencies, "peerDependencies") }),
    ...(value.peerDependenciesMeta === undefined ? {} : { peerDependenciesMeta: peerMetadata(value.peerDependenciesMeta) }),
    ...(value.scripts === undefined ? {} : { scripts: stringMap(value.scripts, "scripts") }),
  };
}

export function readPublicApiContract(path: string): PublicApiContract {
  const value = readJsonObject(readFileSync(path, "utf8"), `public API contract ${path}`);
  return {
    package: requiredString(value.package, "public API package"),
    line: requiredString(value.line, "public API line"),
    stable: exportTargets(value.stable),
    experimental: exportTargets(value.experimental),
  };
}

export function readBundledPackageVersion(path: string): string | undefined {
  const value = readJsonObject(readFileSync(path, "utf8"), `bundled package manifest ${path}`);
  return typeof value.version === "string" ? value.version : undefined;
}

export function readApiProfiles(value: unknown, label: string): Record<string, ApiProfile> {
  const profiles = object(value, label);
  const result: Record<string, ApiProfile> = {};
  for (const [name, entry] of Object.entries(profiles)) {
    const profile = object(entry, `${label}.${name}`);
    result[name] = {
      status: optionalString(profile, "status"),
      proof: optionalString(profile, "proof"),
      promotion: optionalString(profile, "promotion"),
      exposure: optionalString(profile, "exposure"),
    };
  }
  return result;
}

export function readPackedFilePaths(output: string): string[] {
  const pack = firstObject(output, "bun package pack output");
  if (!Array.isArray(pack.files)) throw new Error("bun package pack output is missing files.");
  return pack.files.map((entry, index) => requiredString(object(entry, `packed file ${index}`).path, `packed file ${index} path`));
}

export function readTarballFilename(output: string): string {
  return requiredString(firstObject(output, "npm pack output").filename, "npm pack filename");
}

function firstObject(output: string, label: string): Record<string, unknown> {
  const value: unknown = JSON.parse(output);
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${label} must contain one result.`);
  return object(value[0], label);
}

function readJsonObject(source: string, label: string): Record<string, unknown> {
  const value: unknown = JSON.parse(source);
  return object(value, label);
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return Object.fromEntries(Object.entries(value));
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value) throw new Error(`${label} must be a non-empty string.`);
  return value;
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value.map((item, index) => requiredString(item, `${label}[${index}]`));
}

function stringMap(value: unknown, label: string): Record<string, string> {
  const entries = object(value, label);
  return Object.fromEntries(Object.entries(entries).map(([key, item]) => [key, requiredString(item, `${label}.${key}`)]));
}

function exportTargets(value: unknown): Record<string, PackageExportTarget> {
  const entries = object(value, "package exports");
  const result: Record<string, PackageExportTarget> = {};
  for (const [key, item] of Object.entries(entries)) {
    const target = object(item, `package export ${key}`);
    result[key] = {
      import: optionalString(target, "import"),
      types: optionalString(target, "types"),
      default: optionalString(target, "default"),
    };
  }
  return result;
}

function peerMetadata(value: unknown): Record<string, { optional?: boolean }> {
  const entries = object(value, "peerDependenciesMeta");
  return Object.fromEntries(Object.entries(entries).map(([key, item]) => {
    const metadata = object(item, `peerDependenciesMeta.${key}`);
    return [key, { optional: optionalBoolean(metadata, "optional") }];
  }));
}

function optionalString(value: Record<string, unknown>, key: string): string | undefined {
  const field = value[key];
  if (field === undefined) return undefined;
  if (typeof field !== "string") throw new Error(`${key} must be a string.`);
  return field;
}

function optionalBoolean(value: Record<string, unknown>, key: string): boolean | undefined {
  const field = value[key];
  if (field === undefined) return undefined;
  if (typeof field !== "boolean") throw new Error(`${key} must be a boolean.`);
  return field;
}
