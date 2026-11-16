import { Database } from 'bun:sqlite';
import { profileId } from '../../src/appearance/profile.ts';

/** App-owned index over its existing account records; never reads or exports unrelated records. */
export function createSqliteModerationIndex(options: { path: string }) {
  const db = new Database(options.path, { readonly: true });
  const query = db.query<{ id: string }, [string, string, string]>('select id from players where id >= ? and id < ? and id > ? order by id limit 21');
  return {
    page({ kind, cursor }: { kind: 'owners' | 'reporters'; cursor: string }) {
      if (cursor) profileId(cursor);
      const prefix = kind === 'owners' ? 'tod-uploads:' : 'tod-upload-reports:';
      const rows = query.all(prefix, `${prefix.slice(0, -1)};`, `${prefix}${cursor}`);
      const ids = rows.slice(0, 20).map(row => { const id = row.id.slice(prefix.length);profileId(id);return id; });
      return { ids, nextCursor: rows.length > 20 ? ids.at(-1)! : '' };
    },
    close() { db.close(); },
  };
}
