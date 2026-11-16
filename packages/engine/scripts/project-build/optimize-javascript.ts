import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { minify } from 'terser';

/** Preserve public property names and ES module boundaries while compressing implementation code. */
export async function optimizePackageJavaScript(root: string): Promise<void> {
 for (const entry of await readdir(root, { withFileTypes: true })) {
  const path = join(root, entry.name);
  if (entry.isDirectory()) await optimizePackageJavaScript(path);
  else if (entry.name.endsWith('.js')) {
   const result = await minify(await readFile(path, 'utf8'), {
    module: true, compress: { passes: 3 }, mangle: true,
    format: { comments: /^!|@license|@preserve/ },
   });
   if (result.code === undefined) throw new Error('JavaScript optimizer produced no code: ' + path);
   await writeFile(path, result.code + '\n');
  }
 }
}
