import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";

const budgetSchema = z.object({ id: z.string().uuid(), expiresAt: z.string().datetime().nullable(),
  maximumUsd: z.number().positive().max(10), serviceAndEgressReserveUsd: z.number().min(1),
  admissions: z.array(z.object({ id: z.string().uuid(), reservedUsd: z.number().positive(), createdAt: z.string() })).max(100) });

/** Conservative admission reservations, not reported charges or a provider billing cap. */
export async function createDemonstrationBudget(options: {
  file: string; id: string; expiresAt: string | null; maximumUsd: number; now?: () => number;
}) {
  const now = options.now ?? Date.now;
  const requested = budgetSchema.parse({ id: options.id, expiresAt: options.expiresAt,
    maximumUsd: options.maximumUsd, serviceAndEgressReserveUsd: 1, admissions: [] });
  let state = requested;
  let exists = true;
  try { state = budgetSchema.parse(JSON.parse(await readFile(options.file, "utf8"))); }
  catch (error) { if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error; exists = false; }
  if (state.id !== requested.id || state.expiresAt !== requested.expiresAt || state.maximumUsd !== requested.maximumUsd) throw new Error("Demonstration budget identity changed; refusing to reset prior reservations.");
  if (state.expiresAt!==null&&Date.parse(state.expiresAt) - now() > 7_200_000) throw new Error("Demonstration expiry exceeds two hours.");
  if (!exists) {
    await mkdir(dirname(options.file), { recursive: true });
    await writeFile(options.file, JSON.stringify(state), { mode: 0o600, flag: "wx" });
  }
  let queued = Promise.resolve();
  let draining = false;
  const reserved = () => state.serviceAndEgressReserveUsd + state.admissions.reduce((sum, entry) => sum + entry.reservedUsd, 0);
  const expired = () => state.expiresAt!==null&&now() >= Date.parse(state.expiresAt);
  function assertActive() {
    if (draining || expired()) throw new Error("Demonstration is draining or its two-hour lifetime has expired.");
  }
  return {
    expired, assertActive, drain: () => { draining = true; },
    snapshot: () => ({ ...state, reservedUsd: reserved(), billingBasis: "Full assigned CPU/RAM for 65 minutes per admitted sandbox (60-minute lifetime plus cleanup margin), plus $1 service/egress reserve; failed creates retain reservations. Estimates, not reported charges. No provider egress cap." }),
    reserve(resources: { cpu: number; memoryGB: number }) {
      const operation = queued.then(async () => {
        assertActive();
        const reservedUsd = (resources.cpu + resources.memoryGB) * 50 / 720 * 65 / 60;
        if (!Number.isFinite(reservedUsd) || reservedUsd <= 0 || reserved() + reservedUsd > state.maximumUsd) throw new Error("Shared demonstration compute admission budget exhausted.");
        const next = budgetSchema.parse({ ...state, admissions: [...state.admissions,
          { id: randomUUID(), reservedUsd, createdAt: new Date(now()).toISOString() }] });
        await mkdir(dirname(options.file), { recursive: true });
        await writeFile(options.file + ".next", JSON.stringify(next), { mode: 0o600 });
        await rename(options.file + ".next", options.file);
        state = next;
      });
      queued = operation.catch(() => undefined);
      return operation;
    },
  };
}
export type DemonstrationBudget = Awaited<ReturnType<typeof createDemonstrationBudget>>;
