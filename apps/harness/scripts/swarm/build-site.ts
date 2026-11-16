import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { stylexSolidPlugin } from "@hyperfocus/ui/build/stylex-solid-plugin";

/** Uses the Harness styling/build pipeline with a bounded coordinator browser entry. */
export async function buildSwarmSite() {
  const root=resolve(import.meta.dir,"../../../..");
  const output=resolve(root,"apps/harness/dist/swarm-site");
  await mkdir(output,{recursive:true});
  const result=await Bun.build({entrypoints:[resolve(root,"apps/harness/ui/src/components/swarm/main.tsx")],outdir:output,naming:"main.[ext]",format:"iife",target:"browser",minify:true,sourcemap:"none",metafile:true,plugins:[stylexSolidPlugin({useCSSLayers:{before:["reset"],prefix:"hyperfocus"},importSources:["@stylexjs/stylex"]})]});
  if(!result.success)throw new AggregateError(result.logs.map(log=>new Error(log.message)),"Swarm site build failed");
  await writeFile(resolve(output,"index.html"),'<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="hyperfocus-swarm-site" content="public"><title>Hyperfocus Swarm</title><link rel="stylesheet" href="/swarm-assets/main.css"></head><body><div id="root"></div><script src="/swarm-assets/main.js"></script></body></html>');
  return {output,files:result.outputs.map(file=>({path:file.path,bytes:file.size})),cache:"no-store"};
}
if(import.meta.main)console.log(JSON.stringify(await buildSwarmSite(),null,2));
