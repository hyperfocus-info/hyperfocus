import { spawnBackgroundProcessSync } from "@hyperfocus/desktop-runtime/process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, ".."), output = join(root, "src", "generated");
mkdirSync(output, { recursive: true });
const executable = process.platform === "win32" ? ".exe" : "";
const result = spawnBackgroundProcessSync({
  cmd: [join(root, "node_modules", "grpc-tools", "bin", `protoc${executable}`),
    `--plugin=protoc-gen-es=${join(root, "node_modules", ".bin", `protoc-gen-es${executable}`)}`,
    `--proto_path=${join(root, "schema")}`, `--es_out=target=ts,import_extension=none:${output}`, "value.proto"],
  cwd: root, stdout: "pipe", stderr: "pipe", timeout: 30000,
});
if (result.exitCode !== 0) throw new Error(result.stderr?.toString() || "Protobuf generation failed");
