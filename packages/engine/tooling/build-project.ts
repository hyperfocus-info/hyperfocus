import { buildPortableProject as build } from "../scripts/build-project.ts";

export { runBuildProjectCli } from "../scripts/build-project.ts";
export { buildWebRuntime } from '../scripts/project-build/web-runtime.ts';
export { buildWebProject } from '../scripts/project-build/web-project.ts';
export { createWebDeliveryHandler, readWebDeliveryInventory, verifyWebDeliveryDirectory, readByteRange } from '../scripts/project-build/web-host.ts';

/** Build an installed consumer's canonical pair and authored sources into one HTML. */
export function buildPortableProject(options: { projectDirectory: string; outputPath?: string }) {
  return build(options.projectDirectory, options.outputPath);
}
