import { lstat, readdir, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { z } from 'zod';

export const digest = (value: string | Uint8Array) => new Bun.CryptoHasher('sha256').update(value).digest('hex');
export const artifactSchema = z.object({ schema: z.string().min(1), files: z.array(z.object({
  path: z.string().min(1).refine(path => !path.includes('\\') && !path.split('/').some(part => !part || part === '.' || part === '..') && !/[:\x00-\x1f]/.test(path), 'Use a relative file path.'),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
})).min(1) });

export async function artifactFiles({ directory }: { directory: string }) {
  const root = await realpath(directory), files: string[] = [];
  async function visit(relative: string) {
    for (const entry of await readdir(join(root, relative), { withFileTypes: true })) {
      const path = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) throw new Error(`Artifact contains a symbolic link: ${path}`);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) files.push(path);
      else throw new Error(`Artifact contains a non-file: ${path}`);
      if (files.length > 100_000) throw new Error('Artifact exceeds the file limit.');
    }
  }
  await visit('');
  return files.sort();
}

export async function verifyArtifact({ directory, schema, manifest = 'artifact.json' }: { directory: string; schema?: string; manifest?: string }) {
  const root = await realpath(directory);
  const bytes = await Bun.file(join(root, manifest)).bytes();
  const receipt = artifactSchema.parse(JSON.parse(new TextDecoder().decode(bytes)));
  if (schema && receipt.schema !== schema) throw new Error('Unexpected artifact schema. Rebuild this application.');
  const names = receipt.files.map(file => file.path.toLowerCase());
  if (new Set(names).size !== names.length || names.includes(manifest.toLowerCase())) throw new Error('Duplicate or self-referencing artifact files.');
  const expected = new Set([...receipt.files.map(file => file.path), manifest]);
  for (const file of await artifactFiles({ directory: root })) if (!expected.has(file)) throw new Error(`Unexpected deployment file: ${file}`);
  for (const file of receipt.files) {
    const path = resolve(root, file.path);
    if (!(await lstat(path)).isFile() || digest(await Bun.file(path).bytes()) !== file.sha256) throw new Error(`Artifact changed: ${file.path}. Rebuild before deployment.`);
  }
  return { directory: root, artifactHash: digest(bytes), receipt };
}
