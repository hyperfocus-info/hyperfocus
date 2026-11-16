import path from 'node:path';
import type { DevSurface } from './surfaces';

export function supportsLocalAuth(surface: string) {
  return ['books', 'trade-bot', 'pad-pilot'].includes(surface);
}

export function devServerRuntimeDirectory(options: { worktreePath: string; id: string }) {
  if (!/^[a-zA-Z0-9_-]+$/.test(options.id)) throw new Error('Server id must be a safe runtime directory name.');
  return path.join(options.worktreePath, '.local', 'dev-server', 'runtimes', options.id);
}

/** Local-auth policy belongs to the repository supervisor, not application auth. */
export function createDevServerEnvironment(options: {
  surface: DevSurface; worktreePath: string; id: string; port: number;
  isolated: boolean; localAuth?: boolean; inherited: Record<string, string | undefined>;
}) {
  const { surface, port, inherited, isolated } = options;
  const env = { ...inherited, ...surface.environment(port) };
  const runtime = devServerRuntimeDirectory(options);
  if (isolated && surface.name === 'pad-pilot') env.PADPILOT_DEV_RUNTIME_ROOT = runtime;
  if (isolated && surface.name === 'editor' && !inherited.ENGINE_EDITOR_ARTIFACT_DIR) env.HYPERFOCUS_EDITOR_OUTPUT_ROOT = runtime;
  if (!options.localAuth) return env;
  if (!isolated || !supportsLocalAuth(surface.name)) throw new Error('--local-auth requires an isolated Books, Trade Bot, or PadPilot server.');
  const origin = `http://127.0.0.1:${port}`;
  for (const key of Object.keys(env)) if (/^RAILWAY_/i.test(key)) delete env[key];
  Object.assign(env, { HOST: '127.0.0.1', PORT: String(port), NODE_ENV: 'development', HYPERFOCUS_DEV_AUTH: '1', DATABASE_URL: '' });
  if (surface.name === 'books') Object.assign(env, {
    BOOKS_PUBLIC_ORIGIN: origin, BOOKS_REQUIRE_POSTGRES: '0', BOOKS_SQLITE_PATH: path.join(runtime, 'books.sqlite'),
  });
  if (surface.name === 'trade-bot') Object.assign(env, {
    TRADE_PUBLIC_ORIGIN: origin, TRADE_DATABASE_PATH: path.join(runtime, 'trade-bot.sqlite'),
    TRADE_SESSION_SECRET: 'local-trade-bot-development-secret-only',
  });
  if (surface.name === 'pad-pilot') Object.assign(env, {
    PADPILOT_PUBLIC_ORIGIN: origin, PADPILOT_DATA_ROOT: runtime,
    PADPILOT_DB_PATH: path.join(runtime, 'marketplace.sqlite'),
    PADPILOT_MODULE_UPLOAD_ROOT: path.join(runtime, 'module-uploads'),
  });
  return env;
}
