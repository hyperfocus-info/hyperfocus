import type { SQL } from 'bun';
import { profileId } from '../../src/appearance/profile.ts';

/** Account-scoped indexed pagination; borrowed pool belongs to the host. */
export function createPostgresModerationIndex(options: { sql: SQL }) {
  let closed = false;
  return {
    async page({ kind, cursor }: { kind: 'owners' | 'reporters'; cursor: string }) {
      if (closed) throw new Error('PostgreSQL moderation index is closed.');
      if (cursor) profileId(cursor);
      const prefix = kind === 'owners' ? 'tod-uploads:' : 'tod-upload-reports:';
      const rows: Array<{ id: string }> = await options.sql`SELECT id FROM tod_players WHERE id >= ${prefix} AND id < ${prefix.slice(0, -1) + ';'} AND id > ${prefix + cursor} ORDER BY id LIMIT 21`;
      const ids = rows.slice(0, 20).map(row => { const id = row.id.slice(prefix.length);profileId(id);return id; });
      return { ids, nextCursor: rows.length > 20 ? ids.at(-1)! : '' };
    },
    close() { closed = true; },
  };
}
