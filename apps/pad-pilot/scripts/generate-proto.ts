import { existsSync } from "node:fs";
import { lstat, mkdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import {
  readBoundedUtf8File,
  withProcessLock,
  writeDurableNewFile,
} from "./directory-transaction";
import {
  processDeadlines,
  runCheckedProcess,
} from "./process-runner";

type GenerateProtoOptions = {
  projectRoot?: string;
  runProtoc?: (args: string[], cwd: string) => Promise<void> | void;
};

type ProtoTransaction = {
  hadCppOutput: boolean;
  hadTypeScriptOutput: boolean;
  version: 1;
};

const protoNames = ["analyzer", "capability", "fx-chain", "bridge", "recut"] as const;
export const protoTransactionJournalByteLimit = 16 * 1024;
const generatedProtoFileByteLimit = 64 * 1024 * 1024;

async function directoryExists(directory: string) {
  try {
    const directoryStat = await lstat(directory);
    return directoryStat.isDirectory() && !directoryStat.isSymbolicLink();
  } catch {
    return false;
  }
}

function runCommand(args: string[], cwd: string) {
  runCheckedProcess(args, {
    cwd,
    label: "Protobuf generation",
    timeoutMs: processDeadlines.protoc,
  });
}

async function postProcessProtoFiles(directory: string) {
  const glob = new Bun.Glob("**/*.ts");
  for await (const relativePath of glob.scan(directory)) {
    const fullPath = path.join(directory, relativePath);
    const content = await readBoundedUtf8File(
      fullPath,
      generatedProtoFileByteLimit,
      "Generated TypeScript protobuf file",
    );
    const updatedContent = normalizeTrailingWhitespace(content.replace(/(_pb)(?=['"])/g, "-pb"));
    const targetPath = fullPath.endsWith("_pb.ts") ? fullPath.slice(0, -6) + "-pb.ts" : fullPath;
    await Bun.write(targetPath, updatedContent);
    if (targetPath !== fullPath) {
      await rm(fullPath, { force: true });
    }
  }
}

async function normalizeCppProtoFiles(directory: string) {
  const glob = new Bun.Glob("**/*");
  for await (const relativePath of glob.scan(directory)) {
    if (!relativePath.endsWith(".pb.cc") && !relativePath.endsWith(".pb.h")) {
      continue;
    }
    const fullPath = path.join(directory, relativePath);
    const content = await readBoundedUtf8File(
      fullPath,
      generatedProtoFileByteLimit,
      "Generated C++ protobuf file",
    );
    await Bun.write(fullPath, normalizeTrailingWhitespace(content));
  }
}

function normalizeTrailingWhitespace(content: string) {
  return content.replace(/[ \t]+(?=\r?\n|$)/g, "");
}

async function validateGeneratedOutputs(typeScriptDirectory: string, cppDirectory: string) {
  for (const name of protoNames) {
    const required = [
      path.join(typeScriptDirectory, `${name}-pb.ts`),
      path.join(cppDirectory, `${name}.pb.cc`),
      path.join(cppDirectory, `${name}.pb.h`),
    ];
    for (const filePath of required) {
      if (!existsSync(filePath) || (await stat(filePath)).size <= 0) {
        throw new Error(`Protobuf generation did not produce required output: ${filePath}`);
      }
    }
  }
}

async function recoverProtoTransaction(
  transactionRoot: string,
  typeScriptOutput: string,
  cppOutput: string,
) {
  if (!await directoryExists(transactionRoot)) {
    return;
  }
  const journalPath = path.join(transactionRoot, "transaction.json");
  const committedPath = path.join(transactionRoot, "committed");
  if (!existsSync(journalPath)) {
    await rm(transactionRoot, { force: true, recursive: true });
    return;
  }
  const journal = await readBoundedUtf8File(
    journalPath,
    protoTransactionJournalByteLimit,
    "Protobuf generation transaction journal",
  );
  const parsed = JSON.parse(journal) as Partial<ProtoTransaction>;
  if (parsed.version !== 1 || typeof parsed.hadCppOutput !== "boolean"
      || typeof parsed.hadTypeScriptOutput !== "boolean") {
    throw new Error(`Invalid protobuf generation transaction: ${journalPath}`);
  }
  if (existsSync(committedPath)) {
    await rm(transactionRoot, { force: true, recursive: true });
    return;
  }

  const entries = [
    {
      backup: path.join(transactionRoot, "backup-typescript"),
      destination: typeScriptOutput,
      hadDestination: parsed.hadTypeScriptOutput,
      staged: path.join(transactionRoot, "staged-typescript"),
    },
    {
      backup: path.join(transactionRoot, "backup-cpp"),
      destination: cppOutput,
      hadDestination: parsed.hadCppOutput,
      staged: path.join(transactionRoot, "staged-cpp"),
    },
  ];
  for (const entry of entries) {
    if (await directoryExists(entry.backup)) {
      await rm(entry.destination, { force: true, recursive: true });
      await rename(entry.backup, entry.destination);
    } else if (!entry.hadDestination && !await directoryExists(entry.staged) && await directoryExists(entry.destination)) {
      await rm(entry.destination, { force: true, recursive: true });
    }
  }
  await rm(transactionRoot, { force: true, recursive: true });
}

export async function generateProtoBindings(options: GenerateProtoOptions = {}) {
  const projectRoot = path.resolve(options.projectRoot ?? path.resolve(import.meta.dir, ".."));
  const protoDirectory = path.join(projectRoot, "utils", "proto");
  const typeScriptOutput = path.join(projectRoot, "ui", "src", "proto", "generated");
  const cppOutput = path.join(projectRoot, "plugin", "generated", "proto");
  const transactionRoot = path.join(projectRoot, ".padpilot-proto-transaction");
  const lockPath = path.join(projectRoot, ".padpilot-proto-transaction.lock");
  const protoc = process.env.PADPILOT_PROTOC
    ?? path.join(projectRoot, "node_modules", "grpc-tools", "bin", "protoc.exe");
  const protocGenEs = process.env.PADPILOT_PROTOC_GEN_ES
    ?? path.join(projectRoot, "node_modules", ".bin", "protoc-gen-es.exe");
  const protoFiles = protoNames.map((name) => path.join(protoDirectory, `${name}.proto`));
  for (const protoFile of protoFiles) {
    if (!existsSync(protoFile)) {
      throw new Error(`Missing protobuf schema: ${protoFile}`);
    }
  }

  return withProcessLock(lockPath, async () => {
    await recoverProtoTransaction(transactionRoot, typeScriptOutput, cppOutput);
    await mkdir(transactionRoot, { recursive: false });
    const stagedTypeScript = path.join(transactionRoot, "staged-typescript");
    const stagedCpp = path.join(transactionRoot, "staged-cpp");
    const backupTypeScript = path.join(transactionRoot, "backup-typescript");
    const backupCpp = path.join(transactionRoot, "backup-cpp");
    await mkdir(stagedTypeScript);
    await mkdir(stagedCpp);

    try {
      const args = [
        protoc,
        `--plugin=protoc-gen-es=${protocGenEs}`,
        `--proto_path=${protoDirectory}`,
        `--es_out=target=ts,import_extension=none:${stagedTypeScript}`,
        `--cpp_out=${stagedCpp}`,
        ...protoFiles,
      ];
      await (options.runProtoc ?? runCommand)(args, projectRoot);
      await postProcessProtoFiles(stagedTypeScript);
      await normalizeCppProtoFiles(stagedCpp);
      await validateGeneratedOutputs(stagedTypeScript, stagedCpp);

      const journal = {
        hadCppOutput: await directoryExists(cppOutput),
        hadTypeScriptOutput: await directoryExists(typeScriptOutput),
        version: 1,
      } satisfies ProtoTransaction;
      await writeDurableNewFile(path.join(transactionRoot, "transaction.json"), JSON.stringify(journal));
      if (journal.hadTypeScriptOutput) {
        await rename(typeScriptOutput, backupTypeScript);
      }
      if (journal.hadCppOutput) {
        await rename(cppOutput, backupCpp);
      }
      await mkdir(path.dirname(typeScriptOutput), { recursive: true });
      await mkdir(path.dirname(cppOutput), { recursive: true });
      await rename(stagedTypeScript, typeScriptOutput);
      await rename(stagedCpp, cppOutput);
      await writeDurableNewFile(path.join(transactionRoot, "committed"), "committed\n");
      await rm(transactionRoot, { force: true, recursive: true });
      return { cppOutput, typeScriptOutput };
    } catch (error) {
      try {
        await recoverProtoTransaction(transactionRoot, typeScriptOutput, cppOutput);
      } catch (recoveryError) {
        throw new AggregateError([error, recoveryError], "Protobuf generation and rollback both failed.");
      }
      throw error;
    }
  });
}

if (import.meta.main) {
  await generateProtoBindings();
  console.log("[proto] Generated TypeScript and C++ protobuf outputs.");
}
