import { isSwarmSensitivePath } from '@hyperfocus/ai-runtime/swarm';

/** A narrow reviewable text patch; Git in a fresh baseline remains the apply authority. */
export function validateSwarmPatch(options: { text: string; ownedPaths: readonly string[]; protectedPaths?: readonly string[]; executionKind?: 'performance' | 'engineering'; validationPaths?: readonly string[] }) {
  const sections = options.text.split(/^diff --git /m);
  if (sections.shift()?.trim() || !sections.length) throw new Error('Expected a bounded Git text patch.');
  const addedTests: string[] = [], files: string[] = [], verifierChanges: string[] = [];
  for (const section of sections) {
    const lines = section.split('\n'), header = /^a\/([A-Za-z0-9_./-]+) b\/([A-Za-z0-9_./-]+)\r?$/.exec(lines[0] ?? '');
    if (!header || header[1] !== header[2]) throw new Error('Renames, quoted paths and ambiguous patch headers are outside this bounded task.');
    const path = header[2]!, parts = path.split('/');
    if (parts.some(part => !part || part === '.' || part === '..') || path.startsWith('-') || !options.ownedPaths.some(prefix => path === prefix || path.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`))) {
      throw new Error('Patch path is outside its bounded assignment.');
    }
    if (files.includes(path)) throw new Error('Duplicate patch file section.');
    files.push(path);
    if (isSwarmSensitivePath(path)) throw new Error('Patch changes a potentially sensitive source path.');
    if (options.protectedPaths?.includes(path)) throw new Error('Patch changes explicitly protected source.');
    const infrastructure = /(?:^|\/)(?:swarm|performance|benchmarks?|__snapshots__|\.github)(?:\/|$)|(?:^|\/)(?:AGENTS\.md|package\.json|bun\.lockb?|[^/]*lock\.json)$/.test(path);
    if (infrastructure && options.executionKind !== 'engineering') {
      throw new Error('Patch changes protected benchmark or validation infrastructure.');
    }
    if (lines.some(line => /^(?:rename |copy |GIT binary patch|Binary files |(?:old|new|deleted file) mode (?!100644|100755))/.test(line))) throw new Error('Patch contains an unsupported file type or transformation.');
    const added = lines.some(line => /^new file mode 100(?:644|755)\r?$/.test(line));
    const before = lines.find(line => line.startsWith('--- '))?.replace(/\r$/, ''), after = lines.find(line => line.startsWith('+++ '))?.replace(/\r$/, '');
    if (before !== (added ? '--- /dev/null' : `--- a/${path}`) || (after !== `+++ b/${path}` && after !== '+++ /dev/null')) throw new Error('Patch file markers do not match the declared path.');
    const test = /(?:\.test|\.spec)\.[cm]?[jt]sx?$|(?:^|\/)(?:__tests__|tests)\//.test(path);
    const changedTest = test && (!added || after === '+++ /dev/null');
    if (changedTest && options.executionKind !== 'engineering') throw new Error('Existing test assertions cannot be changed or deleted by a candidate.');
    if (test && added && after !== '+++ /dev/null') addedTests.push(path);
    if (infrastructure || changedTest || options.validationPaths?.some(prefix => path === prefix || path.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`))) verifierChanges.push(path);
  }
  return { files, addedTests, verifierChanges };
}

export function swarmVerifierBlockers(policy: ReturnType<typeof validateSwarmPatch>) {
  return policy.verifierChanges.length ? [`Candidate changes trusted verification source (${policy.verifierChanges.join(', ').slice(0, 1500)}); host review and a new immutable verifier baseline are required.`] : [];
}
