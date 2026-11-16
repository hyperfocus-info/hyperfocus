import { expect, test } from 'bun:test';
import { mkdtempSync, rmSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnBackgroundProcessSync } from '@hyperfocus/desktop-runtime/process';

test('actual session continues after caps without inventing wins or retaining canceled pending windows', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'tactical-session-')), output = join(directory, 'session.json');
  try {
    const child = spawnBackgroundProcessSync({ cmd: [process.execPath, resolve(import.meta.dir, 'session.ts'), '--session-seconds', '60', '--cap', '600', '--out', output],
      cwd: resolve(import.meta.dir, '../../../../../..'), stdout: 'pipe', stderr: 'pipe', timeout: 30000 });
    expect(child.exitCode).toBe(0);
    const report = await Bun.file(output).json();
    expect(report.summary).toMatchObject({ attempted: 6, capped: 6, completed: 0, wins: 0, draws: 0, partial: 0 });
    expect(report.trials.map((trial: any) => trial.ticks)).toEqual([600, 600, 600, 600, 600, 600]);
    expect(report.trials.every((trial: any) => trial.terminal?.combat && trial.terminal.entities.length === 2)).toBe(true);
    expect(report.learning.traces.some((trace: any) => trace.status === 'censored')).toBe(true);
    expect(report.learning.traces.filter((trace: any) => trace.status === 'pending').length).toBeLessThanOrEqual(1);
  } finally {
    rmSync(output, { force: true });rmdirSync(directory);
  }
}, 30000);
