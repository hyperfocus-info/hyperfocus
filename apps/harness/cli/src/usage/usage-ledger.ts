import type { Database } from "bun:sqlite";
import { tokenUsageTotalsSchema, usageSourceSchema, type UsageSource, type TokenUsageTotals } from "@hyperfocus/ai-core/protocol";
import { z } from "zod";
import { runPersistenceMigrationOnce } from "../persistence/persistence-migrations";
import { addTokenUsageTotals, createEmptyTokenUsageTotals } from "./token-usage";

const legacyKey = "token_usage_observations_v1";
const summaryKey = "token_usage_attributed_v2";
const summarySchema = z.object({ count: z.number().int().nonnegative(), totals: tokenUsageTotalsSchema });
const identity = (source: Omit<UsageSource, "totals">) => JSON.stringify([
  source.projectId, source.threadId, source.sourceKind, source.sourceLabel, source.modelId, source.runtime
]);

export function migrateUsageLedger(db: Database) {
  runPersistenceMigrationOnce(db, "usage-ledger-v2", () => {
    db.exec(`CREATE TABLE usage_sources (identity TEXT PRIMARY KEY, payload TEXT NOT NULL, wire_eligible INTEGER NOT NULL);
      CREATE INDEX usage_sources_wire_idx ON usage_sources(wire_eligible);
      CREATE TABLE usage_receipts (id TEXT PRIMARY KEY) WITHOUT ROWID;`);
    const raw = db.query<{ value: string }, []>("SELECT value FROM workspace_meta WHERE key = 'token_usage_observations_v1'").get();
    let totals = createEmptyTokenUsageTotals();
    let count = 0;
    if (raw) {
      const legacy = z.object({ sources: z.array(usageSourceSchema), observations: z.record(z.string(), z.literal(true)) }).parse(JSON.parse(raw.value));
      for (const source of legacy.sources) {
        const previous = db.query<{ payload: string }, [string]>("SELECT payload FROM usage_sources WHERE identity = ?").get(identity(source));
        const merged = previous ? { ...source, totals: addTokenUsageTotals(usageSourceSchema.parse(JSON.parse(previous.payload)).totals, source.totals) } : source;
        const payload = JSON.stringify(merged);
        db.query("INSERT OR REPLACE INTO usage_sources(identity, payload, wire_eligible) VALUES (?, ?, ?)").run(identity(source), payload, Number(Buffer.byteLength(payload) <= 8192));
        totals = addTokenUsageTotals(totals, source.totals);
        if (!previous) count++;
      }
      for (const id of Object.keys(legacy.observations)) db.query("INSERT INTO usage_receipts(id) VALUES (?)").run(id);
    }
    db.query("INSERT INTO workspace_meta(key, value) VALUES (?, ?)").run(summaryKey, JSON.stringify({ count, totals }));
    db.query("DELETE FROM workspace_meta WHERE key = ?").run(legacyKey);
  });
}

export function createUsageLedger(db: Database) {
  const summary = () => summarySchema.parse(JSON.parse(db.query<{ value: string }, [string]>("SELECT value FROM workspace_meta WHERE key = ?").get(summaryKey)!.value));
  const saveSummary = (value: ReturnType<typeof summary>) => db.query("UPDATE workspace_meta SET value = ? WHERE key = ?").run(JSON.stringify(value), summaryKey);
  return {
    // Caller owns the transaction including lifetime/session accounting. Receipts survive reset.
    record(delta: TokenUsageTotals, attribution: Omit<UsageSource, "totals">, observationId: string) {
      if (!db.query("INSERT OR IGNORE INTO usage_receipts(id) VALUES (?)").run(observationId).changes) return false;
      const key = identity(attribution);
      const previous = db.query<{ payload: string }, [string]>("SELECT payload FROM usage_sources WHERE identity = ?").get(key);
      const source = usageSourceSchema.parse({ ...attribution, totals: previous ? addTokenUsageTotals(usageSourceSchema.parse(JSON.parse(previous.payload)).totals, delta) : delta });
      const payload = JSON.stringify(source);
      db.query(`INSERT INTO usage_sources(identity, payload, wire_eligible) VALUES (?, ?, ?)
        ON CONFLICT(identity) DO UPDATE SET payload = excluded.payload, wire_eligible = excluded.wire_eligible`).run(key, payload, Number(Buffer.byteLength(payload) <= 8192));
      const current = summary();
      saveSummary({ count: current.count + (previous ? 0 : 1), totals: addTokenUsageTotals(current.totals, delta) });
      return true;
    },
    snapshot() {
      // Stable earliest identities, at most 100 rows / 800 KiB. Oversized identities stay on disk.
      // Filter in SQLite before materializing payloads, including imported legacy identities.
      const sources = db.query<{ payload: string }, []>(`SELECT payload FROM usage_sources
        WHERE wire_eligible = 1 ORDER BY rowid LIMIT 100`).all().map(row => usageSourceSchema.parse(JSON.parse(row.payload)));
      const current = summary();
      const shown = sources.reduce((total, source) => addTokenUsageTotals(total, source.totals), createEmptyTokenUsageTotals());
      const totals = createEmptyTokenUsageTotals({ updatedAt: current.totals.updatedAt });
      for (const key of ["inputTokens", "outputTokens", "cachedInputTokens", "totalProcessedTokens", "totalTokensIncludingCached", "events"] as const) totals[key] = current.totals[key] - shown[key];
      return { sources, sourceOverflow: { count: current.count - sources.length, totals } };
    },
    reset() {
      db.exec("DELETE FROM usage_sources");
      saveSummary({ count: 0, totals: createEmptyTokenUsageTotals() });
    }
  };
}
