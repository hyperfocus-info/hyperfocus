export type ProgressionProfile = {
  schemaVersion: 1;
  revision: number;
  points: number;
  unlocked: readonly string[];
  receipts: readonly { id: string; points: number; unlocks: readonly string[] }[];
};

function ids(values: readonly string[]) {
  if (values.length > 4096) throw new Error("Progression lists are limited to 4096 entries");
  for (const value of values) {
    if (typeof value !== "string" || value.length < 1 || value.length > 128) throw new Error("Progression ids must contain 1–128 characters");
  }
  return [...new Set(values)].sort();
}

function count(value: number) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Progression values must be nonnegative safe integers");
  return value;
}

export function createProgressionProfile(options: { points?: number; unlocked?: readonly string[] } = {}): ProgressionProfile {
  return { schemaVersion: 1, revision: 0, points: count(options.points ?? 0), unlocked: ids(options.unlocked ?? []), receipts: [] };
}

export function validateProgressionProfile(profile: ProgressionProfile) {
  if (profile.schemaVersion !== 1) throw new Error("Unsupported progression schema version");
  count(profile.revision);
  count(profile.points);
  if (ids(profile.unlocked).length !== profile.unlocked.length) throw new Error("Duplicate unlocks");
  if (profile.receipts.length > 4096) throw new Error("Reward ledger is full; archive through the trusted host");
  const seen = new Set<string>();
  for (const receipt of profile.receipts) {
    ids([receipt.id]);
    count(receipt.points);
    ids(receipt.unlocks);
    if (seen.has(receipt.id)) throw new Error("Duplicate reward receipts");
    seen.add(receipt.id);
  }
}

/** Copy match-start choices so later progression changes cannot mutate an active bout. */
export function snapshotProgressionLoadout(options: {
  profile: ProgressionProfile;
  rulesVersion: string;
  selections: readonly string[];
  maxSelections?: number;
}) {
  validateProgressionProfile(options.profile);
  ids([options.rulesVersion]);
  const selections = ids(options.selections);
  const limit = count(options.maxSelections ?? 8);
  if (selections.length !== options.selections.length) throw new Error("Duplicate loadout selections");
  if (selections.length > limit) throw new Error("Loadout selection limit exceeded");
  const unlocked = new Set(options.profile.unlocked);
  for (const id of selections) if (!unlocked.has(id)) throw new Error(`Loadout selection is locked: ${id}`);
  return Object.freeze({ schemaVersion: 1 as const, profileRevision: options.profile.revision,
    rulesVersion: options.rulesVersion, selections: Object.freeze(selections) });
}

/** Pure trusted-host reducer. Persist the returned profile atomically with revision comparison. */
export function applyProgressionReward(options: {
  profile: ProgressionProfile;
  expectedRevision: number;
  reward: { id: string; points?: number; unlocks?: readonly string[] };
}) {
  const { profile, reward } = options;
  validateProgressionProfile(profile);
  ids([reward.id]);
  count(options.expectedRevision);
  const points = count(reward.points ?? 0);
  const unlocks = ids(reward.unlocks ?? []);
  const existing = profile.receipts.find((receipt) => receipt.id === reward.id);
  if (existing) {
    if (existing.points !== points || JSON.stringify(ids(existing.unlocks)) !== JSON.stringify(unlocks)) {
      throw new Error("Reward id was reused with different content");
    }
    return { status: "duplicate" as const, profile };
  }
  if (profile.revision !== options.expectedRevision) return { status: "conflict" as const, profile };
  if (profile.receipts.length >= 4096) throw new Error("Reward ledger is full; archive through the trusted host");
  const next: ProgressionProfile = {
    schemaVersion: 1,
    revision: count(profile.revision + 1),
    points: count(profile.points + points),
    unlocked: ids([...profile.unlocked, ...unlocks]),
    receipts: [...profile.receipts.map((receipt) => ({ ...receipt, unlocks: [...receipt.unlocks] })), { id: reward.id, points, unlocks }],
  };
  return { status: "applied" as const, profile: next };
}
