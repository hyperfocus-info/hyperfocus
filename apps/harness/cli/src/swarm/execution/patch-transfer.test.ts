import { expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { spawnBackgroundProcessSync } from '@hyperfocus/desktop-runtime/process';
import { swarmPatchApplyCommands, swarmPatchByteLimit } from './patch-transfer';

function transferFixture(check: (input: { directory: string; commands: string[]; expected: string; run: (cmd: string[]) => ReturnType<typeof spawnBackgroundProcessSync> }) => void) {
  const parent = resolve(import.meta.dir, '../../../../.local/swarm-tests');
  mkdirSync(parent, { recursive: true });
  const directory = mkdtempSync(resolve(parent, 'patch-transfer-'));
  const run = (cmd: string[]) => spawnBackgroundProcessSync({ cmd, cwd: directory, timeout: 10000 });
  try {
    expect(run(['git', 'init', '--quiet']).exitCode).toBe(0);
    writeFileSync(resolve(directory, 'work.txt'), 'original\n');
    expect(run(['git', 'add', 'work.txt']).exitCode).toBe(0);
    const expected = Array.from({ length: 5000 }, (_, index) => `bulk change ${index} for the requested scope\n`).join('');
    writeFileSync(resolve(directory, 'work.txt'), expected);
    const patch = run(['git', 'diff', '--', 'work.txt']);
    expect(patch.exitCode).toBe(0);
    const commands = swarmPatchApplyCommands(new Uint8Array(patch.stdout));
    expect(commands.length).toBeGreaterThan(2);
    expect(commands.every(command => command.length < 64000)).toBe(true);
    expect(run(['git', 'restore', '--', 'work.txt']).exitCode).toBe(0);
    check({ directory, commands, expected, run });
  } finally {
    if (!resolve(directory).startsWith(parent + sep)) throw Error('Refusing cleanup outside the owned test directory.');
    rmSync(directory, { recursive: true, force: true });
  }
}

// The cloud provider uses Linux shell commands. This fixture never invokes a local fallback.
test.skipIf(process.platform !== 'linux')('chunked bulk patches reconstruct and apply exact bytes under the provider command ceiling', () => {
  transferFixture(({ directory, commands, expected, run }) => {
    for (const command of commands) expect(run(['sh', '-c', command]).exitCode).toBe(0);
    expect(readFileSync(resolve(directory, 'work.txt'), 'utf8')).toBe(expected);
  });
});

test.skipIf(process.platform !== 'linux')('a corrupted transfer fails its hash before changing the immutable source', () => {
  transferFixture(({ directory, commands, run }) => {
    const corrupted = commands.map((command, index) => index === 0 ? command.replace(/(printf '%s' ')[A-Za-z0-9]/, '$1A') : command);
    for (const command of corrupted.slice(0, -1)) expect(run(['sh', '-c', command]).exitCode).toBe(0);
    expect(run(['sh', '-c', corrupted.at(-1)!]).exitCode).not.toBe(0);
    expect(readFileSync(resolve(directory, 'work.txt'), 'utf8')).toBe('original\n');
  });
});

test('patch admission fails closed above its bounded transfer and evidence limit', () => {
  expect(() => swarmPatchApplyCommands(new Uint8Array(swarmPatchByteLimit + 1))).toThrow(`${swarmPatchByteLimit}-byte`);
});
