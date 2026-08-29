export type DurableJson = null | boolean | number | string | DurableJson[] | { [key: string]: DurableJson };

export type DurableStoreRecord = { bucket: string; key: string; value: DurableJson };
export type DurableStoreScan = { prefix?: string; after?: string; limit: number; reverse?: boolean };

export type DurableServiceTransaction = {
  get(bucket: string, key: string): DurableJson | undefined;
  put(bucket: string, key: string, value: DurableJson): void;
  delete(bucket: string, key: string): boolean;
  scan(bucket: string, options: DurableStoreScan): DurableStoreRecord[];
  nextSequence(name: string): number;
};

export type DurableServiceStore = {
  transaction<T>(operation: (transaction: DurableServiceTransaction) => T): Promise<T>;
  exportRecords(): Promise<DurableStoreRecord[]>;
  replaceRecordsAtomic(records: readonly DurableStoreRecord[]): Promise<void>;
  close?(): void;
};

export type DurablePage<T> = { items: T[]; nextCursor?: string };
export type DurableInventoryItem = { ownerId: string; sku: string; quantity: number; metadata?: DurableJson; updatedAt: number };
export type DurableBalance = { ownerId: string; currency: string; amount: number; updatedAt: number };
export type DurableGuild = { id: string; name: string; ownerId: string; createdAt: number; memberCount: number };
export type DurableGuildMember = { guildId: string; accountId: string; role: "owner" | "member"; joinedAt: number };
export type DurableModerationAction = {
  id: string;
  targetId: string;
  moderatorId: string;
  kind: "mute" | "kick" | "ban" | "warn";
  reason?: string;
  createdAt: number;
  expiresAt?: number;
  revokedAt?: number;
};
export type DurableChatMessage = { id: string; channelId: string; senderId: string; text: string; createdAt: number };
export type DurableAuditRecord = {
  id: string;
  at: number;
  actorId: string;
  operation: string;
  subjectId: string;
  idempotencyKey?: string;
  details: DurableJson;
};

type MatchmakingTicketBase = {
  id: string;
  playerId: string;
  queue: string;
  createdAt: number;
  expiresAt: number;
  attributes: Record<string, DurableJson>;
};

export type MatchmakingTicket = MatchmakingTicketBase & (
  | { state: "waiting" | "cancelled" | "expired"; handoff?: never }
  | { state: "matched"; handoff: { roomId: string; token: string; expiresAt: number; claimedAt?: never } }
  | { state: "claimed"; handoff: { roomId: string; token: string; expiresAt: number; claimedAt: number } }
);

export type DurableMmoServiceOptions = {
  now?: () => number;
  randomId?: () => string;
  maxPageSize?: number;
  maxChatMessageLength?: number;
  maxChatMessagesPerChannel?: number;
  maxGuildMembers?: number;
  maxIdempotencyRecords?: number;
  maxTicketTtlMs?: number;
  maxHandoffTtlMs?: number;
};
