import type { SQL, TransactionSQL } from 'bun';
import { guestRejected } from './request.ts';
import { guestDay, guestHash, guestOpaque, guestRate, guestTransaction } from './postgres-store.ts';

export function createPostgresGuestRecovery(options: { sql: SQL; now(): number; onRestore?(userId: string): Promise<void> }) {
  async function prepare(tx: TransactionSQL, value: Record<string, unknown>, cookie: string | undefined, key: string, time: number) {
    const [account] = cookie ? await tx`SELECT user_id FROM tod_guest_accounts WHERE cookie_hash=${guestHash(cookie)} AND expires>${time}` : [];
    if (!account) throw guestRejected('Valid guest access is required to save a recovery key.', 401, 'guest-identity-unavailable');
    const userId = String(account.user_id);await guestRate(tx, `recovery:${userId}`, 10, time);
    await tx`UPDATE tod_guest_recovery SET pending_hash=NULL,pending_until=0 WHERE pending_until<=${time}`;
    await tx`DELETE FROM tod_guest_recovery WHERE active_hash IS NULL AND pending_hash IS NULL`;
    const [row] = await tx`SELECT active_hash,pending_hash,pending_until FROM tod_guest_recovery WHERE user_id=${userId}`;
    if (row?.active_hash === key) return;
    if (value.operation === 'prepare') {
      if ((await tx`SELECT 1 FROM tod_guest_recovery WHERE user_id<>${userId} AND (active_hash=${key} OR pending_hash=${key})`).length) throw guestRejected('Recovery key is unavailable.', 409, 'guest-recovery-invalid');
      const [count] = await tx`SELECT count(*)::integer AS count FROM tod_guest_recovery`;
      if (!row && count.count >= 10000) throw guestRejected('Recovery capacity reached.', 503, 'guest-recovery-retry');
      await tx`INSERT INTO tod_guest_recovery VALUES (${userId},NULL,${key},${time + 600000}) ON CONFLICT(user_id) DO UPDATE SET pending_hash=excluded.pending_hash,pending_until=excluded.pending_until`;
    } else {
      if (!row || row.pending_hash !== key || Number(row.pending_until) <= time) throw guestRejected('Prepare and save this recovery key again before confirming.', 409, 'guest-recovery-pending-expired');
      await tx`UPDATE tod_guest_recovery SET active_hash=${key},pending_hash=NULL,pending_until=0 WHERE user_id=${userId}`;
    }
  }
  return { async handle(value: Record<string, unknown>, cookie: string | undefined): Promise<{ cookie?: string }> {
    if (Object.keys(value).some(key => key !== 'operation' && key !== 'key') || !['prepare', 'confirm', 'restore'].includes(String(value.operation)) || typeof value.key !== 'string' || !/^[a-f0-9]{64}$/.test(value.key)) throw guestRejected('Invalid recovery request.', 400, 'guest-recovery-invalid');
    const key = guestHash(value.key), time = options.now();
    // The reserved session lock spans both committed revocation and asynchronous connection eviction.
    const reserved = await options.sql.reserve();
    try {
      await reserved`SELECT pg_advisory_lock(184772, 2)`;
      await guestTransaction(reserved, async tx => { await tx`DELETE FROM tod_guest_rates WHERE start<=${time - 60000}`;await guestRate(tx, 'global-recovery', 30, time); });
      if (value.operation !== 'restore') { await guestTransaction(reserved, tx => prepare(tx, value, cookie, key, time));return {}; }
      const userId = await guestTransaction(reserved, async tx => {
        const [row] = await tx`SELECT user_id FROM tod_guest_recovery WHERE active_hash=${key}`;
        if (!row) throw guestRejected('This recovery key is invalid or has been replaced.', 401, 'guest-recovery-invalid');
        const id = String(row.user_id);await guestRate(tx, `recovery:${id}`, 10, time);
        await tx`UPDATE tod_guest_accounts SET expires=0 WHERE user_id=${id}`;
        await tx`DELETE FROM tod_guest_leases WHERE user_id=${id}`;return id;
      });
      try { await options.onRestore?.(userId); } catch { throw guestRejected('Could not finish restoring access. Retry with the same recovery key.', 503, 'guest-recovery-retry'); }
      const nextCookie = guestOpaque();
      await guestTransaction(reserved, async tx => {
        const current = options.now();await tx`DELETE FROM tod_guest_accounts WHERE expires<=${current}`;
        const [count] = await tx`SELECT count(*)::integer AS count FROM tod_guest_accounts`;
        if (count.count >= 10000 && !(await tx`SELECT 1 FROM tod_guest_accounts WHERE user_id=${userId}`).length) throw guestRejected('Guest capacity reached. Retry later.', 503, 'guest-recovery-retry');
        await tx`DELETE FROM tod_guest_accounts WHERE user_id=${userId}`;
        await tx`INSERT INTO tod_guest_accounts VALUES (${guestHash(nextCookie)},${userId},${current + 30 * guestDay})`;
      });
      return { cookie: nextCookie };
    } finally {
      try { await reserved`SELECT pg_advisory_unlock(184772, 2)`; } finally { reserved.release(); }
    }
  } };
}
