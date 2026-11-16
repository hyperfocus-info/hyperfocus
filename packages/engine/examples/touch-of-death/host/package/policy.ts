import { Database } from 'bun:sqlite';
import { existsSync } from 'node:fs';
import { encodeDeploymentPolicy } from '../policy-learning/deployment.ts';
import { POLICY_BUCKET, policyScope, readHeadValue } from '../policy-learning/records.ts';

/** Read a consistent committed champion from SQLite; never open credentials or copy account data. */
export function exportDevelopmentPolicy(options: { databasePath: string; contentId: string; required?: boolean }) {
  if (!existsSync(options.databasePath)) {
    if (options.required) throw Error('The requested development policy database does not exist.');
    return encodeDeploymentPolicy({ head: readHeadValue(undefined, options.contentId) });
  }
  const database = new Database(options.databasePath, { readonly: true, strict: true });
  try {
    const exists = database.query("SELECT 1 FROM sqlite_master WHERE type='table' AND name='durable_records'").get();
    if (!exists) throw Error('Development database has no durable policy storage.');
    const row = database.query<{ value: string }, [string, string]>('SELECT value FROM durable_records WHERE bucket=? AND key=?')
      .get(POLICY_BUCKET, `${policyScope(options.contentId)}head`);
    const head = readHeadValue(row ? JSON.parse(row.value) : undefined, options.contentId);
    return encodeDeploymentPolicy({ head });
  } finally { database.close(); }
}
