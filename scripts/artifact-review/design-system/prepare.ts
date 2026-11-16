import { createHash } from 'node:crypto';
import { resolve, basename, dirname, relative, isAbsolute, sep } from 'node:path';
import { createArtifactManifest } from '../create';
import { artifactManifestSchema } from "@hyperfocus/artifact-review/schema";

/** Relocation changes only transport paths, never the reviewed bytes or version metadata. */
export async function relocateDesignReview(options: { previousEvidenceRoot: string; evidenceRoot?: string; outputPath?: string; reviseChanged?: boolean }) {
  const outputPath = resolve(options.outputPath ?? '.local/design-system/review/manifest.json');
  const previousRoot = resolve(options.previousEvidenceRoot);
  const evidenceRoot = resolve(options.evidenceRoot ?? '.local/design-system/evidence');
  const originalManifest = await Bun.file(outputPath).text();
  const manifest = artifactManifestSchema.parse(JSON.parse(originalManifest));
  let relocated = 0;
  const revisions = [];
  for (const item of manifest.items) {
    if (!item.media) continue;
    const original = resolve(dirname(outputPath), item.media);
    const path = relative(previousRoot, original);
    const underPreviousRoot = path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path);
    const media = underPreviousRoot ? resolve(evidenceRoot, path) : original;
    const digest = createHash('sha256').update(new Uint8Array(await Bun.file(media).arrayBuffer())).digest('hex');
    if (digest !== item.sha256) {
      if (!options.reviseChanged) throw new Error(`Refusing relocation: changed bytes for ${item.id}`);
      const previous = { version: item.version, sha256: item.sha256 };
      item.sha256 = digest;
      const { media: _media, version: _version, ...identity } = item;
      item.version = createHash('sha256').update(JSON.stringify(identity)).digest('hex');
      revisions.push({ id: item.id, previous, current: { version: item.version, sha256: item.sha256 } });
    }
    if (media !== original) { item.media = media; relocated++; }
  }
  // Preflight every source before replacing the manifest; feedback.sqlite is never opened.
  const history = revisions.length ? resolve(dirname(outputPath), 'manifest-history', `${createHash('sha256').update(originalManifest).digest('hex')}.json`) : undefined;
  if (history) await Bun.write(history, originalManifest);
  await Bun.write(outputPath, JSON.stringify(manifest, null, 2) + '\n');
  return { manifest: outputPath, relocated, queuedImages: manifest.items.length, revisions, history };
}

/** Pair only matching capture names. Unmatched images remain explicitly unpaired. */
export async function prepareDesignReview(options: { evidenceRoot?: string; batch?: string; outputPath?: string; append?: boolean } = {}) {
  const evidenceRoot = resolve(options.evidenceRoot ?? '.local/design-system/evidence');
  const batch = options.batch ?? 'next25-batch6';
  if (batch !== 'all' && !/^[a-zA-Z0-9_-]+$/.test(batch)) throw new Error('Use an evidence folder prefix or all');
  const paths = [...new Bun.Glob('*/{before,after}/*.png').scanSync({ cwd: evidenceRoot })].map(path => path.replaceAll('\\', '/'))
    .filter(path => batch === 'all' || path.split('/')[0]!.startsWith(batch)).sort();
  const available = new Set(paths);
  const items: Parameters<typeof createArtifactManifest>[0]['items'] = [];
  for (const path of paths) {
    const [surface, phase, name, extra] = path.split('/');
    if (!surface || !name || extra !== undefined || (phase !== 'before' && phase !== 'after')) throw new Error(`Unexpected design capture path: ${path}`);
    const opposite = `${surface}/${phase === 'before' ? 'after' : 'before'}/${name}`;
    const paired = available.has(opposite);
    const key = `${surface}/${name}`;
    const identity = createHash('sha256').update(key).digest('hex').slice(0, 24);
    const media = resolve(evidenceRoot, path);
    const digest = createHash('sha256').update(new Uint8Array(await Bun.file(media).arrayBuffer())).digest('hex');
    const label = basename(name, '.png').replaceAll('-', ' ');
    items.push({ id: `${identity}-${phase}`, version: digest, kind: 'image', media,
      title: `${surface.replaceAll('-', ' ')} · ${label} · ${phase}`,
      description: paired
        ? 'Before and after use matching capture filenames. Fixtures and task states may differ; the owning design-system handoff records the comparison limits. Feedback belongs only to the selected image.'
        : `Unpaired ${phase} capture: no matching ${phase === 'before' ? 'after' : 'before'} filename was preserved. This is a reference image, not a matched comparison.`,
      ...(paired ? { comparison: { id: identity, phase } } : {}), sections: [],
    });
  }
  if (!items.length) throw new Error(`No before/after PNG captures found for ${batch}`);
  const manifest = await createArtifactManifest({ id: 'hyperfocus-design-review', title: 'Hyperfocus design review', items });
  for (const item of manifest.items) {
    const { media: _media, version: _version, ...identity } = item;
    item.version = createHash('sha256').update(JSON.stringify(identity)).digest('hex');
  }
  const outputPath = resolve(options.outputPath ?? '.local/design-system/review/manifest.json');
  if (options.append && await Bun.file(outputPath).exists()) {
    const previous = artifactManifestSchema.parse(await Bun.file(outputPath).json());
    if (previous.id !== manifest.id) throw new Error('Append requires the same design review campaign');
    const current = new Set(manifest.items.map(item => item.id));
    manifest.items.push(...previous.items.filter(item => !current.has(item.id)));
    artifactManifestSchema.parse(manifest);
    // Retained queue entries must still resolve to the same bytes, not just parse.
    await createArtifactManifest({ ...manifest, items: manifest.items.map(item => ({ ...item,
      media: item.media ? resolve(dirname(outputPath), item.media) : undefined, expectedSha256: item.sha256 })) });
  }
  await Bun.write(outputPath, JSON.stringify(manifest, null, 2) + '\n');
  return { manifest: outputPath, images: items.length, comparisons: items.filter(item => item.comparison?.phase === 'after').length, unpaired: items.filter(item => !item.comparison).length, queuedImages: manifest.items.length };
}

if (import.meta.main) {
  const args = Bun.argv.slice(2);
  const read = (key: string) => { const index = args.indexOf(key); if (index < 0) return undefined; const value = args[index + 1]; if (!value || value.startsWith('--')) throw new Error(`Missing ${key} value`); return value; };
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--append' || args[index] === '--revise-changed') continue;
    if (!['--batch', '--output', '--evidence-root', '--relocate-from'].includes(args[index]!)) throw new Error('Usage: prepare.ts [--batch next25-batch6|all] [--output manifest.json] [--append] [--evidence-root path] [--relocate-from old-root [--revise-changed]]');
    index++;
  }
  const previousEvidenceRoot = read('--relocate-from');
  if (args.includes('--revise-changed') && !previousEvidenceRoot) throw new Error('--revise-changed requires --relocate-from');
  if (previousEvidenceRoot && (read('--batch') || args.includes('--append'))) throw new Error('Relocation preserves the existing queue; do not combine it with --batch or --append');
  console.log(JSON.stringify(previousEvidenceRoot
    ? await relocateDesignReview({ previousEvidenceRoot, evidenceRoot: read('--evidence-root'), outputPath: read('--output'), reviseChanged: args.includes('--revise-changed') })
    : await prepareDesignReview({ batch: read('--batch'), evidenceRoot: read('--evidence-root'), outputPath: read('--output'), append: args.includes('--append') })));
}
