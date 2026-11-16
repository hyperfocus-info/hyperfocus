import { spawnBackgroundProcessSync } from "@hyperfocus/desktop-runtime/process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "../.."), owner = resolve(root, "packages/serialization");
const output = resolve(import.meta.dir, "generated"), executable = process.platform === "win32" ? ".exe" : "";
mkdirSync(output, { recursive: true });
const result = spawnBackgroundProcessSync({
  cmd: [resolve(owner, `node_modules/grpc-tools/bin/protoc${executable}`),
    `--plugin=protoc-gen-es=${resolve(owner, `node_modules/.bin/protoc-gen-es${executable}`)}`,
    `--proto_path=${resolve(import.meta.dir, "schema")}`, `--es_out=target=ts,import_extension=none:${output}`, "candidates.proto"],
  cwd: root, stdout: "pipe", stderr: "pipe", timeout: 30000,
});
if (result.exitCode !== 0) throw new Error(result.stderr?.toString() || "Benchmark schema generation failed");
