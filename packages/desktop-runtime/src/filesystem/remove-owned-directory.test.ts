import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnBackgroundProcess } from '../process/spawn';
import { terminateProcessTree } from '../process/terminate';
import { removeOwnedDirectory } from './remove-owned-directory';

test('owned cleanup rejects parent/traversal and escaping junctions while retaining outside files', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'hyperfocus-cleanup-'));
  const child = join(parent, 'owned');
  const outside = await mkdtemp(join(tmpdir(), 'hyperfocus-outside-'));
  try {
    await mkdir(child); await writeFile(join(outside, 'keep.txt'), 'untouched');
    await expect(removeOwnedDirectory({ directory: parent, parent })).rejects.toThrow('outside');
    await expect(removeOwnedDirectory({ directory: outside, parent })).rejects.toThrow('outside');
    await symlink(outside, join(child, 'escape'), 'junction');
    await expect(removeOwnedDirectory({ directory: join(child, 'escape'), parent: child })).rejects.toThrow('escaping');
    expect(await Bun.file(join(outside, 'keep.txt')).text()).toBe('untouched');
    await removeOwnedDirectory({ directory: child, parent });
    await removeOwnedDirectory({ directory: child, parent });
    expect(await Bun.file(join(outside, 'keep.txt')).text()).toBe('untouched');
  } finally {
    await removeOwnedDirectory({ directory: parent, parent: tmpdir() });
    await removeOwnedDirectory({ directory: outside, parent: tmpdir() });
  }
});

test.skipIf(process.platform !== 'win32')('Windows working-directory locks retry after process exit and fail within their bound when held', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'hyperfocus-cleanup-'));
  try {
    for (const held of [false, true]) {
      const directory = join(parent, held ? 'held' : 'releasing'); await mkdir(directory);
      const child = spawnBackgroundProcess({ cmd: [process.execPath, '-e', `console.log('ready'); setTimeout(()=>process.exit(0),${held ? 3000 : 200});`],
        cwd: directory, stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' });
      try {
        const reader = child.stdout.getReader();
        try { expect((await reader.read()).done).toBe(false); } finally { reader.releaseLock(); }
        const result = removeOwnedDirectory({ directory, parent, timeoutMs: held ? 30 : 2000, retryDelayMs: 10 });
        if (held) await expect(result).rejects.toMatchObject({ code: 'EBUSY' });
        else { await result; expect(await child.exited).toBe(0); }
      } finally {
        if (child.exitCode === null) await terminateProcessTree({ process: child });
        await removeOwnedDirectory({ directory, parent });
      }
    }
  } finally { await removeOwnedDirectory({ directory: parent, parent: tmpdir() }); }
});
