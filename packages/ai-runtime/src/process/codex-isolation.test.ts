import { expect, test } from 'bun:test';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { createCodexConnectionAdapter, openCodexAccountSession } from '@hyperfocus/ai-runtime/connections/codex';
import { readCodexSubscription } from './codex-account';

test('official account adapters honor injected environment and cwd for inspection, device login, logout and cancellation', async () => {
  const root = resolve(import.meta.dir, '../../.local/isolated-account-tests'); await mkdir(root, { recursive: true });
  const directory = await mkdtemp(join(root, 'rpc-')), script = join(directory, 'fixture.ts');
  const executable = join(directory, process.platform === 'win32' ? 'fixture.cmd' : 'fixture');
  const codexHome = join(directory, 'codex'), cwd = join(directory, 'work');
  await mkdir(cwd); await mkdir(codexHome);
  await writeFile(script, `
    import { createInterface } from 'node:readline';
    const signed = Bun.file(process.env.CODEX_HOME + '/fixture-signed');
    const reply = (id, result) => console.log(JSON.stringify({ id, result }));
    for await (const line of createInterface({ input: process.stdin })) {
      const request = JSON.parse(line);
      if (request.method === 'initialized') continue;
      if (request.method === 'initialize') reply(request.id, {});
      if (request.method === 'fixture/context') reply(request.id, { cwd: process.cwd(), home: process.env.HOME, codexHome: process.env.CODEX_HOME,
        leaked: ['OPENAI_API_KEY', 'CODEX_API_KEY', 'DATABASE_URL', 'OIDC_CLIENT_SECRET', 'HTTPS_PROXY'].filter(key => process.env[key]), pid: process.pid });
      if (request.method === 'account/read') {
        if (request.params.refreshToken && await signed.exists()) await Bun.write(signed, 'renewed synthetic account');
        reply(request.id, { account: await signed.exists() ? { type: 'chatgpt', planType: 'pro' } : null });
      }
      if (request.method === 'account/rateLimits/read') {
        if (await signed.text() === 'expired') console.log(JSON.stringify({ id: request.id, error: { code: -32000, message: 'expired access' } }));
        else reply(request.id, { rateLimits: { primary: { usedPercent: 1 }, secondary: null } });
      }
      if (request.method === 'account/login/start') {
        reply(request.id, { type: 'chatgptDeviceCode', loginId: 'fixture-login', verificationUrl: 'https://auth.openai.com/codex/device', userCode: 'TEST-1234' });
        await Bun.write(signed, 'synthetic account only');
        console.log(JSON.stringify({ method: 'account/login/completed', params: { loginId: 'fixture-login', success: true } }));
      }
      if (request.method === 'account/logout') { await signed.delete(); reply(request.id, {}); }
    }
  `);
  await writeFile(executable, process.platform === 'win32' ? `@echo off\r\n"${process.execPath}" "${script}" %*\r\n`
    : `#!/bin/sh\nexec '${process.execPath.replaceAll("'", "'\\''")}' '${script.replaceAll("'", "'\\''")}' "$@"\n`);
  if (process.platform !== 'win32') await chmod(executable, 0o700);
  const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, COMSPEC: process.env.COMSPEC, HOME: directory,
    CODEX_HOME: 'ignored-ambient', OPENAI_API_KEY: 'fixture-secret', CODEX_API_KEY: 'fixture-secret', DATABASE_URL: 'fixture-secret', OIDC_CLIENT_SECRET: 'fixture-secret', HTTPS_PROXY: 'fixture-secret' };
  const options = { executable, codexHome, cwd, env };
  let session: Awaited<ReturnType<typeof openCodexAccountSession>> | undefined;
  try {
    const controller = new AbortController();
    session = await openCodexAccountSession({ ...options, signal: controller.signal });
    const context = await session.request('fixture/context');
    expect(context).toMatchObject({ cwd, home: directory, codexHome, leaked: [] });
    controller.abort(); await session.close();
    const adapter = createCodexConnectionAdapter({ ...options, ownerId: 'fixture' });
    expect((await adapter.inspect(AbortSignal.timeout(5000))).state).toBe('disconnected');
    const actions: unknown[] = [];
    await adapter.connect!({ signal: AbortSignal.timeout(5000), onAction: action => { actions.push(action); } });
    expect(actions).toHaveLength(1); expect(actions[0]).toMatchObject({ userCode: 'TEST-1234' });
    expect((await readCodexSubscription({ ...options, signal: AbortSignal.timeout(5000) })).available).toBe(true);
    await writeFile(join(codexHome, 'fixture-signed'), 'expired');
    await expect(readCodexSubscription({ ...options, signal: AbortSignal.timeout(5000) })).rejects.toThrow();
    expect((await readCodexSubscription({ ...options, refreshToken: true, signal: AbortSignal.timeout(5000) })).available).toBe(true);
    expect(await readFile(join(codexHome, 'fixture-signed'), 'utf8')).toBe('renewed synthetic account');
    const restarted = createCodexConnectionAdapter({ ...options, ownerId: 'fixture' });
    expect((await restarted.inspect(AbortSignal.timeout(5000))).state).toBe('ready');
    await adapter.revoke!(AbortSignal.timeout(5000));
    expect((await adapter.inspect(AbortSignal.timeout(5000))).state).toBe('disconnected');
  } finally {
    await session?.close();
    if (dirname(directory) !== root) throw new Error('Unsafe fixture cleanup.');
    await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}, 30_000);
