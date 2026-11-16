import { runReleaseCommand } from "../smoke/run-command.ts";
import { existsSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { assert, findAncestorTool } from "./core.ts";

/** Resolve the actual installed peer artifacts used by the offline consumer. */
export function resolveConsumerPeers({ rootDir }: { rootDir: string }) {
  const tscPath = findAncestorTool(rootDir, join("node_modules", ".bin", process.platform === "win32" ? "tsc.exe" : "tsc"));
  const threePath = join(rootDir, "node_modules", "three");
  const threeTypesPath = join(rootDir, "node_modules", "@types", "three");
  const threeTypesRequire = createRequire(join(realpathSync(threeTypesPath), "package.json"));
  const localPeerPackages = {
    three: threePath,
    "@types/three": threeTypesPath,
    "@tweenjs/tween.js": dirname(threeTypesRequire.resolve("@tweenjs/tween.js/package.json")),
    "@types/stats.js": dirname(threeTypesRequire.resolve("@types/stats.js/package.json")),
    "@types/webxr": dirname(threeTypesRequire.resolve("@types/webxr/package.json")),
    fflate: dirname(threeTypesRequire.resolve("fflate/package.json")),
    meshoptimizer: dirname(threeTypesRequire.resolve("meshoptimizer/package.json")),
  };

  assert(tscPath, "local TypeScript install is required for offline consumer typecheck");
  assert(existsSync(threePath), "local Three.js install is required for the offline render/3d consumer");
  assert(existsSync(threeTypesPath), "local Three.js type install is required for the offline render/3d consumer");
  for (const [packageName, packagePath] of Object.entries(localPeerPackages)) {
    assert(existsSync(packagePath), `local ${packageName} install is required for the offline render/3d type consumer`);
  }

  return { tscPath, localPeerPackages };
}

export async function runConsumerCommand(cmd: readonly string[], cwd: string) {
  return runReleaseCommand({ cmd, cwd });
}
