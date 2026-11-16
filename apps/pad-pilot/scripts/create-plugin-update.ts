import { copyFile, lstat, mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import { createSign } from "node:crypto";
import path from "node:path";
import { hashBoundedFile } from "@hyperfocus/pad-pilot/bounded-file";
import {
  listRegularDirectoryFiles,
  snapshotDirectory,
} from "./directory-snapshot";
import { canonicalizeSignedManifestPayload } from "@hyperfocus/pad-pilot/update-signing";
import { semanticVersion } from "@hyperfocus/pad-pilot/marketplace-schema";
import { compareSemVer } from "@hyperfocus/pad-pilot/semver";
import {
  processDeadlines,
  runCheckedProcess,
} from "./process-runner";
import { compareUpdaterStrings } from "@hyperfocus/pad-pilot/update-signing";

type CliArgs = Record<string, string>;

function parseArgs(argv: string[]) {
  const values: CliArgs = {};
  const allowed = new Set([
    "arch", "base", "base-max", "base-min", "base-version", "channel",
    "notes", "out", "platform", "target", "version",
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === "--") {
      continue;
    }
    if (!key?.startsWith("--")) {
      throw new Error(`Unexpected create-plugin-update argument: ${key}`);
    }
    const name = key.slice(2);
    if (!allowed.has(name) || name in values) {
      throw new Error(`Unknown or duplicate create-plugin-update argument: --${name}`);
    }
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      throw new Error(`Missing value for create-plugin-update argument: --${name}`);
    }
    values[name] = next;
    index += 1;
  }
  return values;
}

const maxArchiveBytes = 268435456;
const maxEntryBytes = 268435456;
const maxManifestBytes = 1048576;
const maxUncompressedBytes = 536870912;
const maxOperations = 4096;
const maxDirectoryDepth = 64;
const maxTreeEntries = 65_536;
const updateSnapshotLimits = {
  maxDepth: maxDirectoryDepth,
  maxEntries: maxTreeEntries,
  maxFileBytes: maxEntryBytes,
  maxFiles: maxOperations,
  maxTotalBytes: maxUncompressedBytes,
} as const;
const updateInventoryLimits = {
  ...updateSnapshotLimits,
  maxRelativePathBytes: 1024,
};

function listFiles(root: string) {
  return listRegularDirectoryFiles(
    root,
    updateInventoryLimits,
    compareUpdaterStrings,
    "Update bundle",
  );
}

async function pathExists(filePath: string) {
  try {
    await lstat(filePath);
    return true;
  } catch (error) {
    if ((error && typeof error === "object" && "code" in error ? error.code : undefined) === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function directoryExists(directoryPath: string) {
  try {
    const resolved = path.resolve(directoryPath);
    const directoryStat = await lstat(resolved);
    if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) {
      return false;
    }
    const parsed = path.parse(resolved);
    let current = parsed.root;
    for (const segment of resolved.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
      current = path.join(current, segment);
      if ((await lstat(current)).isSymbolicLink()) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

function caseInsensitiveFileMap(files: string[], label: string) {
  const filesByKey = new Map<string, string>();
  for (const relativePath of files) {
    const key = relativePath.replaceAll("\\", "/").toLowerCase();
    if (filesByKey.has(key)) {
      throw new Error(`Update ${label} contains a duplicate case-insensitive path: ${relativePath}`);
    }
    filesByKey.set(key, relativePath);
  }
  return filesByKey;
}

function runPowerShell(script: string, cwd: string, environment: Record<string, string>, failureMessage: string) {
  const childEnvironment = { ...process.env };
  delete childEnvironment.PADPILOT_UPDATE_SIGNING_PRIVATE_KEY_PEM;
  runCheckedProcess(["powershell", "-NoProfile", "-NonInteractive", "-Command", script], {
    cwd,
    env: { ...childEnvironment, ...environment },
    label: failureMessage,
    timeoutMs: processDeadlines.archive,
  });
}

const args = parseArgs(process.argv.slice(2));
const projectRoot = path.resolve(import.meta.dir, "..");
const baseDir = path.resolve(args["base"] ?? "");
const targetDir = path.resolve(args["target"] ?? "");
const outDir = path.resolve(args["out"] ?? path.join(projectRoot, "marketplace", "data", "plugin-releases"));
const version = args["version"] ?? "";
const channel = args["channel"] ?? "stable";
const platform = args["platform"] ?? "windows";
const arch = args["arch"] ?? "x64";
const releaseNotes = args["notes"] ?? "";
const baseVersionMin = args["base-min"] ?? args["base-version"] ?? "";
const baseVersionMax = args["base-max"] ?? args["base-version"] ?? "";

if (!semanticVersion.safeParse(version).success || path.basename(targetDir).toLowerCase() !== "padpilot.vst3"
    || !await directoryExists(path.join(targetDir, "Contents"))) {
  throw new Error("create-plugin-update requires --version and a target .vst3 bundle directory.");
}
if (path.basename(baseDir).toLowerCase() !== "padpilot.vst3" || !await directoryExists(path.join(baseDir, "Contents"))) {
  throw new Error("create-plugin-update requires --base pointing at the previous .vst3 bundle directory.");
}
if (baseDir.toLowerCase() === targetDir.toLowerCase()) {
  throw new Error("create-plugin-update requires distinct base and target bundle snapshots.");
}
if (!semanticVersion.safeParse(baseVersionMin).success || !semanticVersion.safeParse(baseVersionMax).success
    || baseVersionMin !== baseVersionMax || compareSemVer(version, baseVersionMax) <= 0) {
  throw new Error("create-plugin-update requires one exact older --base-version; a single directory diff cannot represent multiple base versions.");
}
for (const [label, value] of [["channel", channel], ["platform", platform], ["arch", arch]] as const) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/.test(value) || value === "." || value === "..") {
    throw new Error(`create-plugin-update received an invalid --${label}.`);
  }
}

const patchId = `${version}-${channel}-${platform}-${arch}`;
const finalPatchRoot = path.join(outDir, patchId);
if (path.dirname(path.resolve(finalPatchRoot)).toLowerCase() !== outDir.toLowerCase()
    || path.basename(finalPatchRoot) !== patchId) {
  throw new Error("create-plugin-update resolved its release outside the requested output directory.");
}
await mkdir(outDir, { recursive: true });
if (!await directoryExists(outDir)) {
  throw new Error("create-plugin-update output must be a real directory without symbolic-link traversal.");
}
if (await pathExists(finalPatchRoot)) {
  throw new Error(`Release already exists and will not be overwritten: ${finalPatchRoot}`);
}
const patchRoot = await mkdtemp(path.join(outDir, `.${patchId}-`));
const payloadRoot = path.join(patchRoot, "payload");
const archivePath = path.join(patchRoot, "patch.zip");
const manifestPath = path.join(patchRoot, "manifest.json");
let promoted = false;

try {
await mkdir(payloadRoot, { recursive: true });

const baseFiles = listFiles(baseDir);
const targetFiles = listFiles(targetDir);
const [baseSnapshot, targetSnapshot] = await Promise.all([
  snapshotDirectory(baseDir, updateSnapshotLimits),
  snapshotDirectory(targetDir, updateSnapshotLimits),
]);
const baseFilesByKey = caseInsensitiveFileMap(baseFiles, "base");
caseInsensitiveFileMap(targetFiles, "target");
const addOrReplace: Array<{ path: string; payloadPath: string; sha256: string; size: number }> = [];
let uncompressedBytes = 0;

for (const relativePath of targetFiles) {
  const relativeKey = relativePath.replaceAll("\\", "/").toLowerCase();
  const targetFile = path.join(targetDir, relativePath);
  const baseRelativePath = baseFilesByKey.get(relativeKey);
  const baseFile = baseRelativePath ? path.join(baseDir, baseRelativePath) : "";
  const targetHash = await hashBoundedFile(targetFile, maxEntryBytes, "Update target file");
  const baseHash = baseRelativePath
    ? await hashBoundedFile(baseFile, maxEntryBytes, "Update base file")
    : null;
  if (baseHash?.sha256 === targetHash.sha256) {
    baseFilesByKey.delete(relativeKey);
    continue;
  }
  if (uncompressedBytes > maxUncompressedBytes - targetHash.size) {
    throw new Error(`Update patch exceeded ${maxUncompressedBytes} uncompressed bytes at: ${relativePath}`);
  }
  const payloadPath = path.join("files", relativePath);
  const payloadFile = path.join(payloadRoot, payloadPath);
  await mkdir(path.dirname(payloadFile), { recursive: true });
  await copyFile(targetFile, payloadFile);
  const remainingUncompressedBytes = maxUncompressedBytes - uncompressedBytes;
  const payloadHash = await hashBoundedFile(
    payloadFile,
    Math.min(maxEntryBytes, remainingUncompressedBytes),
    "Staged update payload",
  );
  const sourceHashAfterCopy = await hashBoundedFile(targetFile, maxEntryBytes, "Update target file");
  if (payloadHash.sha256 !== sourceHashAfterCopy.sha256 || payloadHash.size !== sourceHashAfterCopy.size) {
    throw new Error(`Update target changed while it was being staged: ${relativePath}`);
  }
  uncompressedBytes += payloadHash.size;

  addOrReplace.push({
    path: relativePath.replaceAll("\\", "/"),
    payloadPath: payloadPath.replaceAll("\\", "/"),
    sha256: payloadHash.sha256,
    size: payloadHash.size,
  });
  baseFilesByKey.delete(relativeKey);
}

const deletions = [...baseFilesByKey.values()].map((relativePath) => relativePath.replaceAll("\\", "/"));
if (addOrReplace.length + deletions.length > maxOperations || uncompressedBytes > maxUncompressedBytes) {
  throw new Error("Update patch exceeded its signed operation or uncompressed-size limit.");
}
if (addOrReplace.length + deletions.length === 0) {
  throw new Error("Base and target bundles are identical; refusing to sign an empty update.");
}
const [baseSnapshotAfterRead, targetSnapshotAfterRead] = await Promise.all([
  snapshotDirectory(baseDir, updateSnapshotLimits),
  snapshotDirectory(targetDir, updateSnapshotLimits),
]);
if (baseSnapshotAfterRead !== baseSnapshot || targetSnapshotAfterRead !== targetSnapshot) {
  throw new Error("Base or target bundle changed while the update was being staged.");
}
const signaturePayload = {
  arch,
  artifactKind: "directory_patch",
  baseVersionRange: {
    max: baseVersionMax,
    min: baseVersionMin,
  },
  bundleRoot: "PadPilot.vst3",
  channel,
  createdAt: new Date().toISOString(),
  files: {
    addOrReplace,
    delete: deletions,
  },
  platform,
  postApply: [],
  releaseNotes,
  version,
};

const privateKeyPem = process.env.PADPILOT_UPDATE_SIGNING_PRIVATE_KEY_PEM?.replaceAll("\\n", "\n") ?? "";
if (!privateKeyPem) {
  throw new Error("create-plugin-update requires PADPILOT_UPDATE_SIGNING_PRIVATE_KEY_PEM to sign the manifest.");
}
const signature = createSign("RSA-SHA256")
  .update(canonicalizeSignedManifestPayload(signaturePayload))
  .end()
  .sign(privateKeyPem, "base64");
const manifest = {
  ...signaturePayload,
  signature,
};

const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
if (new TextEncoder().encode(manifestText).byteLength > maxManifestBytes) {
  throw new Error("Generated plugin update manifest exceeded its size limit.");
}
await Bun.write(manifestPath, manifestText);

const compressCommand = [
  "$ErrorActionPreference='Stop'",
  "Add-Type -AssemblyName System.IO.Compression.FileSystem",
  "[System.IO.Compression.ZipFile]::CreateFromDirectory($env:PADPILOT_UPDATE_PAYLOAD_ROOT, $env:PADPILOT_UPDATE_ARCHIVE_PATH, [System.IO.Compression.CompressionLevel]::Optimal, $false)",
].join("; ");
runPowerShell(
  compressCommand,
  patchRoot,
  {
    PADPILOT_UPDATE_ARCHIVE_PATH: archivePath,
    PADPILOT_UPDATE_PAYLOAD_ROOT: payloadRoot,
  },
  "ZIP creation failed while building the plugin patch artifact.",
);
const archiveSize = Number((await Bun.file(archivePath).stat()).size);
if (archiveSize <= 0 || archiveSize > maxArchiveBytes) {
  throw new Error("Generated plugin patch archive exceeded its compressed-size limit.");
}

const verificationRoot = path.join(patchRoot, "archive-verification");
const extractCommand = [
  "$ErrorActionPreference='Stop'",
  "Add-Type -AssemblyName System.IO.Compression.FileSystem",
  "[System.IO.Compression.ZipFile]::ExtractToDirectory($env:PADPILOT_UPDATE_ARCHIVE_PATH, $env:PADPILOT_UPDATE_VERIFY_ROOT)",
].join("; ");
runPowerShell(
  extractCommand,
  patchRoot,
  {
    PADPILOT_UPDATE_ARCHIVE_PATH: archivePath,
    PADPILOT_UPDATE_VERIFY_ROOT: verificationRoot,
  },
  "Generated plugin patch archive failed extraction verification.",
);
const extractedFiles = listFiles(verificationRoot);
const expectedFiles = addOrReplace.map((entry) => entry.payloadPath).sort(compareUpdaterStrings);
if (JSON.stringify(extractedFiles.map((entry) => entry.replaceAll("\\", "/"))) !== JSON.stringify(expectedFiles)) {
  throw new Error("Generated plugin patch archive entries did not match the signed manifest.");
}
for (const entry of addOrReplace) {
  const extracted = await hashBoundedFile(
    path.join(verificationRoot, ...entry.payloadPath.split("/")),
    maxEntryBytes,
    "Extracted update payload",
  );
  if (extracted.sha256 !== entry.sha256 || extracted.size !== entry.size) {
    throw new Error(`Generated plugin patch archive failed hash verification: ${entry.path}`);
  }
}
await rm(verificationRoot, { force: true, recursive: true });

const manifestChecksum = (await hashBoundedFile(manifestPath, maxManifestBytes, "Update manifest")).sha256;
const artifactChecksum = (await hashBoundedFile(archivePath, maxArchiveBytes, "Update archive")).sha256;

await rename(patchRoot, finalPatchRoot);
promoted = true;

const finalArchivePath = path.join(finalPatchRoot, "patch.zip");
const finalManifestPath = path.join(finalPatchRoot, "manifest.json");

console.log(JSON.stringify({
  arch,
  artifactChecksumSha256: artifactChecksum,
  artifactPath: finalArchivePath,
  artifactSizeBytes: archiveSize,
  baseVersionMax: signaturePayload.baseVersionRange.max || null,
  baseVersionMin: signaturePayload.baseVersionRange.min || null,
  channel,
  manifestChecksumSha256: manifestChecksum,
  manifestPath: finalManifestPath,
  platform,
  releaseNotes,
  signature,
  version,
}, null, 2));
} finally {
  if (!promoted) {
    await rm(patchRoot, { force: true, recursive: true });
  }
}
