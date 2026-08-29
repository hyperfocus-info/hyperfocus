import { afterEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  generateProtoBindings,
  protoTransactionJournalByteLimit,
} from "./generate-proto";

const names = ["analyzer", "capability", "fx-chain", "bridge", "recut"];
const tempRoots: string[] = [];

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      rmSync(root, { force: true, recursive: true });
    }
  }
});

function createProject() {
  const project = mkdtempSync(path.join(tmpdir(), "padpilot-generate-proto-"));
  tempRoots.push(project);
  const protoDirectory = path.join(project, "utils", "proto");
  mkdirSync(protoDirectory, { recursive: true });
  for (const name of names) {
    writeFileSync(path.join(protoDirectory, `${name}.proto`), `syntax = "proto3"; // ${name}`);
  }
  const typeScriptOutput = path.join(project, "ui", "src", "proto", "generated");
  const cppOutput = path.join(project, "plugin", "generated", "proto");
  mkdirSync(typeScriptOutput, { recursive: true });
  mkdirSync(cppOutput, { recursive: true });
  writeFileSync(path.join(typeScriptOutput, "sentinel.txt"), "old ts");
  writeFileSync(path.join(cppOutput, "sentinel.txt"), "old cpp");
  return { cppOutput, project, typeScriptOutput };
}

function writeFakeOutputs(args: string[]) {
  const esPrefix = "--es_out=target=ts,import_extension=none:";
  const cppPrefix = "--cpp_out=";
  const typeScriptOutput = args.find((argument) => argument.startsWith(esPrefix))?.slice(esPrefix.length);
  const cppOutput = args.find((argument) => argument.startsWith(cppPrefix))?.slice(cppPrefix.length);
  if (!typeScriptOutput || !cppOutput) {
    throw new Error("missing fake output arguments");
  }
  for (const name of names) {
    writeFileSync(path.join(typeScriptOutput, `${name}_pb.ts`), `export * from './shared_pb'; // ${name}  \n`);
    writeFileSync(path.join(cppOutput, `${name}.pb.cc`), `// ${name} cc \t\n`);
    writeFileSync(path.join(cppOutput, `${name}.pb.h`), `// ${name} h  \n`);
  }
}

describe("generateProtoBindings", () => {
  it("leaves canonical generated outputs intact when protoc fails", async () => {
    const fixture = createProject();
    await expect(generateProtoBindings({
      projectRoot: fixture.project,
      runProtoc: () => {
        throw new Error("protoc failed");
      },
    })).rejects.toThrow("protoc failed");
    expect(readFileSync(path.join(fixture.typeScriptOutput, "sentinel.txt"), "utf8")).toBe("old ts");
    expect(readFileSync(path.join(fixture.cppOutput, "sentinel.txt"), "utf8")).toBe("old cpp");
    expect(existsSync(path.join(fixture.project, ".padpilot-proto-transaction"))).toBe(false);
  });

  it("promotes complete TypeScript and C++ output sets together", async () => {
    const fixture = createProject();
    await generateProtoBindings({ projectRoot: fixture.project, runProtoc: writeFakeOutputs });
    expect(readFileSync(path.join(fixture.typeScriptOutput, "analyzer-pb.ts"), "utf8")).toContain("./shared-pb");
    expect(existsSync(path.join(fixture.typeScriptOutput, "sentinel.txt"))).toBe(false);
    expect(existsSync(path.join(fixture.cppOutput, "sentinel.txt"))).toBe(false);
    expect(existsSync(path.join(fixture.cppOutput, "recut.pb.h"))).toBe(true);
    for (const output of [fixture.typeScriptOutput, fixture.cppOutput]) {
      const glob = new Bun.Glob("**/*");
      for await (const relativePath of glob.scan(output)) {
        expect(readFileSync(path.join(output, relativePath), "utf8")).not.toMatch(/[ \t]+$/m);
      }
    }
  });

  it("fails closed before reading an oversized recovery journal", async () => {
    const fixture = createProject();
    const transactionRoot = path.join(fixture.project, ".padpilot-proto-transaction");
    mkdirSync(transactionRoot);
    writeFileSync(
      path.join(transactionRoot, "transaction.json"),
      "x".repeat(protoTransactionJournalByteLimit + 1),
    );
    let invokedProtoc = false;

    await expect(generateProtoBindings({
      projectRoot: fixture.project,
      runProtoc: () => {
        invokedProtoc = true;
      },
    })).rejects.toThrow("exceeds");
    expect(invokedProtoc).toBe(false);
    expect(readFileSync(path.join(fixture.typeScriptOutput, "sentinel.txt"), "utf8")).toBe("old ts");
    expect(readFileSync(path.join(fixture.cppOutput, "sentinel.txt"), "utf8")).toBe("old cpp");
    expect(existsSync(transactionRoot)).toBe(true);
  });
});
