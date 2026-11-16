import { resolve } from 'node:path';

/** Select runtime persistence without exposing credentials in launch metadata or errors. */
export function resolveHostStorageConfig(options: { environment?: Readonly<Record<string, string | undefined>> } = {}) {
  const environment = options.environment ?? process.env;
  const mode = environment.TOUCH_OF_DEATH_STORAGE;
  if (mode !== undefined && mode !== 'sqlite' && mode !== 'postgres') throw Error('TOUCH_OF_DEATH_STORAGE must be sqlite or postgres.');
  const railway = ['RAILWAY_PROJECT_ID', 'RAILWAY_ENVIRONMENT_ID', 'RAILWAY_SERVICE_ID', 'RAILWAY_DEPLOYMENT_ID']
    .some(key => !!environment[key]?.trim());
  const requiresPostgres = railway || environment.TOUCH_OF_DEATH_REQUIRE_POSTGRES === '1';
  if (requiresPostgres && mode === 'sqlite') throw Error('This deployment requires PostgreSQL; TOUCH_OF_DEATH_STORAGE=sqlite is not allowed.');
  const databasePath = environment.TOUCH_OF_DEATH_DATABASE_PATH ? resolve(environment.TOUCH_OF_DEATH_DATABASE_PATH) : undefined;
  // Explicit local mode must not consult an inherited production connection string.
  if (mode === 'sqlite') return { databasePath, databaseUrl: undefined };
  const databaseUrl = environment.DATABASE_URL?.trim() || undefined;
  if ((requiresPostgres || mode === 'postgres') && !databaseUrl) throw Error('PostgreSQL storage requires DATABASE_URL.');
  if (databaseUrl && !/^postgres(?:ql)?:\/\//.test(databaseUrl)) throw Error('DATABASE_URL must be a PostgreSQL URL.');
  return { databasePath, databaseUrl };
}
