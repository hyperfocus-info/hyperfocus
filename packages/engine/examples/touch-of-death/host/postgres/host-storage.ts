import { SQL } from 'bun';
import { createSqlitePersistenceAdapter, createSqliteDurableServiceStore } from '@hyperfocus/engine/server';
import { createGuestSessionService } from '../guest-session/service.ts';
import { createPostgresGuestSessionService } from '../guest-session/postgres.ts';
import { createQuickPlayRatings } from '../quick-play/ratings.ts';
import { createPostgresQuickPlayRatings } from '../quick-play/ratings-postgres.ts';
import { createRewardService } from '../progression/service.ts';
import { createPostgresRewardService } from '../progression/service-postgres.ts';
import { createSqliteModerationIndex } from '../uploads/moderation-index.ts';
import { createPostgresPersistenceAdapter } from './persistence.ts';
import { createPostgresDurableServiceStore } from './durable-store.ts';
import { createPostgresModerationIndex } from './moderation-index.ts';

/** One host owns the pool; partial startup and shutdown release every acquired resource. */
export async function createHostStorage(options: {
  databaseUrl?: string; databasePath: string;
  catalog?: Parameters<typeof createRewardService>[0]['catalog'];
  guest?: Omit<Parameters<typeof createGuestSessionService>[0], 'databasePath'>;
  moderation?: boolean;
}) {
  if (options.databaseUrl && !/^postgres(?:ql)?:\/\//.test(options.databaseUrl)) throw Error('DATABASE_URL must be a PostgreSQL URL.');
  const sql = options.databaseUrl ? new SQL(options.databaseUrl, { max: 10, connectionTimeout: 10, idleTimeout: 30, connection: { statement_timeout: '15000', lock_timeout: '10000' } }) : undefined;
  const resources: Array<{ close(): void | Promise<unknown> }> = [];
  function own<T extends { close(): void | Promise<unknown> }>(value: T) { resources.push(value);return value; }
  let closed = false;
  async function close() {
    if (closed) return;closed = true;
    try { await Promise.allSettled(resources.reverse().map(resource => Promise.resolve().then(() => resource.close()))); }
    finally { await sql?.close(); }
  }
  try {
    const persistence = own(sql ? await createPostgresPersistenceAdapter({ sql }) : createSqlitePersistenceAdapter({ path: options.databasePath }));
    const socialStore = own(sql ? await createPostgresDurableServiceStore({ sql }) : createSqliteDurableServiceStore({ path: options.databasePath }));
    const ratings = own(sql ? await createPostgresQuickPlayRatings({ sql }) : createQuickPlayRatings({ path: options.databasePath }));
    const rewards = own(sql ? await createPostgresRewardService({ sql, catalog: options.catalog }) : createRewardService({ databasePath: options.databasePath, catalog: options.catalog }));
    const guests = options.guest ? own(sql ? await createPostgresGuestSessionService({ sql, ...options.guest }) : createGuestSessionService({ databasePath: options.databasePath, ...options.guest })) : undefined;
    const moderationIndex = options.moderation ? own(sql ? createPostgresModerationIndex({ sql }) : createSqliteModerationIndex({ path: options.databasePath })) : undefined;
    return { persistence, socialStore, ratings, rewards, guests, moderationIndex, close,
      async healthy() { if (closed) return false;try { if (sql) await sql`SELECT 1`;return true; } catch { return false; } },
    };
  } catch (error) { await close();throw error; }
}
