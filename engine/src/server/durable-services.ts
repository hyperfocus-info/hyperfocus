import type { AuthAdapter, AuthResult } from "./types.ts";
import type { SignedSessionAuthority } from "./operations.ts";

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
  id: string; targetId: string; moderatorId: string; kind: "mute" | "kick" | "ban" | "warn";
  reason?: string; createdAt: number; expiresAt?: number; revokedAt?: number;
};
export type DurableChatMessage = { id: string; channelId: string; senderId: string; text: string; createdAt: number };
export type DurableAuditRecord = {
  id: string; at: number; actorId: string; operation: string; subjectId: string; idempotencyKey?: string; details: DurableJson;
};
export type MatchmakingTicket = {
  id: string;
  playerId: string;
  queue: string;
  state: "waiting" | "matched" | "claimed" | "cancelled" | "expired";
  createdAt: number;
  expiresAt: number;
  attributes: Record<string, DurableJson>;
  handoff?: { roomId: string; token: string; expiresAt: number; claimedAt?: number };
};

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

export type DurableMmoServices = ReturnType<typeof createDurableMmoServices>;

const BUCKETS = new Set(["inventory", "wallet", "guild", "guild-member", "moderation", "chat", "ticket", "ticket-owner", "idempotency", "audit"]);
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const MAX_SAFE_AMOUNT = 9_000_000_000_000;

/** Bounded serialized reference store with undo-journal rollback. */
export function createMemoryDurableServiceStore(): DurableServiceStore {
  const buckets = new Map<string, Map<string, DurableJson>>();
  const sequences = new Map<string, number>();
  let tail: Promise<void> = Promise.resolve();

  function enqueue<T>(operation: () => T): Promise<T> {
    const result = tail.then(operation);
    tail = result.then(() => undefined, () => undefined);
    return result;
  }

  function bucket(name: string) {
    let values = buckets.get(name);
    if (!values) { values = new Map(); buckets.set(name, values); }
    return values;
  }

  return {
    transaction<T>(operation: (transaction: DurableServiceTransaction) => T): Promise<T> {
      return enqueue(() => {
        const undo: Array<() => void> = [];
        const transaction: DurableServiceTransaction = {
          get(name, key) { return clone(bucket(name).get(key)); },
          put(name, key, value) {
            validateDurableStoreRecord({ bucket: name, key, value });
            const values = bucket(name);
            const existed = values.has(key);
            const previous = values.get(key);
            undo.push(() => { if (existed) values.set(key, previous!); else values.delete(key); });
            values.set(key, clone(value)!);
          },
          delete(name, key) {
            const values = bucket(name);
            if (!values.has(key)) return false;
            const previous = values.get(key)!;
            undo.push(() => values.set(key, previous));
            return values.delete(key);
          },
          scan(name, options) { return scanRecords(bucket(name), name, options); },
          nextSequence(name) {
            assertId(name, "sequence");
            const previous = sequences.get(name) ?? 0;
            if (previous >= Number.MAX_SAFE_INTEGER) throw new Error(`Sequence ${name} is exhausted.`);
            undo.push(() => { if (previous) sequences.set(name, previous); else sequences.delete(name); });
            const next = previous + 1;
            sequences.set(name, next);
            return next;
          },
        };
        try {
          const value = operation(transaction);
          if (isPromiseLike(value)) throw new Error("Durable store transaction callbacks must be synchronous.");
          return value;
        }
        catch (cause) {
          for (let index = undo.length - 1; index >= 0; index -= 1) undo[index]!();
          throw cause;
        }
      });
    },
    exportRecords() {
      return enqueue(() => {
      const records: DurableStoreRecord[] = [];
      for (const [name, values] of buckets) for (const [key, value] of values) records.push({ bucket: name, key, value: clone(value)! });
      for (const [name, value] of sequences) records.push({ bucket: "$sequence", key: name, value });
      return records.sort(compareRecord);
      });
    },
    replaceRecordsAtomic(records) {
      return enqueue(() => {
        const nextBuckets = new Map<string, Map<string, DurableJson>>();
        const nextSequences = new Map<string, number>();
        const seen = new Set<string>();
        for (const record of records) {
          validateDurableStoreRecord(record, true);
          const unique = `${record.bucket}\0${record.key}`;
          if (seen.has(unique)) throw new Error(`Duplicate durable service record ${record.bucket}/${record.key}.`);
          seen.add(unique);
          if (record.bucket === "$sequence") {
            if (!Number.isSafeInteger(record.value) || (record.value as number) < 0) throw new Error(`Invalid sequence ${record.key}.`);
            nextSequences.set(record.key, record.value as number);
          } else {
            let values = nextBuckets.get(record.bucket);
            if (!values) { values = new Map(); nextBuckets.set(record.bucket, values); }
            values.set(record.key, clone(record.value)!);
          }
        }
        buckets.clear();
        sequences.clear();
        for (const [name, values] of nextBuckets) buckets.set(name, values);
        for (const [name, value] of nextSequences) sequences.set(name, value);
      });
    },
  };
}

export function createDurableMmoServices(store: DurableServiceStore, options: DurableMmoServiceOptions = {}) {
  const now = options.now ?? Date.now;
  const randomId = options.randomId ?? (() => crypto.randomUUID());
  const maxPageSize = bounded(options.maxPageSize ?? 100, 1, 1_000, "maxPageSize");
  const maxChatLength = bounded(options.maxChatMessageLength ?? 500, 1, 8_000, "maxChatMessageLength");
  const maxChatRetention = bounded(options.maxChatMessagesPerChannel ?? 1_000, 1, 100_000, "maxChatMessagesPerChannel");
  const maxGuildMembers = bounded(options.maxGuildMembers ?? 500, 1, 100_000, "maxGuildMembers");
  const maxIdempotency = bounded(options.maxIdempotencyRecords ?? 100_000, 1, 1_000_000, "maxIdempotencyRecords");
  const maxTicketTtl = bounded(options.maxTicketTtlMs ?? 30 * 60_000, 1_000, 24 * 60 * 60_000, "maxTicketTtlMs");
  const maxHandoffTtl = bounded(options.maxHandoffTtlMs ?? 2 * 60_000, 1_000, 60 * 60_000, "maxHandoffTtlMs");

  function pageLimit(limit?: number) { return bounded(limit ?? 50, 1, maxPageSize, "page limit"); }
  function time() { const value = now(); if (!Number.isSafeInteger(value) || value < 0) throw new Error("Service clock must return a non-negative safe integer."); return value; }
  function unique(prefix: string, tx: DurableServiceTransaction) { return `${prefix}-${pad(tx.nextSequence(prefix))}-${safeRandom(randomId())}`; }

  function audit(tx: DurableServiceTransaction, actorId: string, operation: string, subjectId: string, details: DurableJson, idempotencyKey?: string) {
    const at = time();
    const id = `audit-${pad(tx.nextSequence("audit"))}`;
    tx.put("audit", id, { id, at, actorId, operation, subjectId, details, ...(idempotencyKey ? { idempotencyKey } : {}) });
  }

  function idempotent<T extends DurableJson>(tx: DurableServiceTransaction, scope: string, key: string | undefined, fingerprint: string, operation: () => T): T {
    if (!key) return operation();
    assertId(key, "idempotency key");
    const storageKey = `${scope}/${key}`;
    const existing = record(tx.get("idempotency", storageKey));
    if (existing) {
      if (existing.fingerprint !== fingerprint) throw new Error(`Idempotency key ${key} was reused with different input.`);
      return clone(existing.result as T)!;
    }
    if (tx.nextSequence("idempotency-count") > maxIdempotency) throw new Error("Idempotency record limit reached; prune or archive records before accepting more mutations.");
    const result = operation();
    tx.put("idempotency", storageKey, { fingerprint, result, createdAt: time() });
    return clone(result)!;
  }

  return {
    store,
    inventory: {
      async grant(ownerId: string, sku: string, quantity = 1, metadata?: DurableJson, idempotencyKey?: string) {
        assertId(ownerId, "ownerId"); assertId(sku, "sku"); amount(quantity, "quantity"); if (metadata !== undefined) validateJson(metadata);
        return store.transaction((tx) => idempotent(tx, `inventory.grant/${ownerId}`, idempotencyKey, stable({ sku, quantity, metadata: metadata ?? null }), () => {
          const key = `${ownerId}/${sku}`;
          const existing = record(tx.get("inventory", key));
          const nextQuantity = checkedAdd(number(existing?.quantity ?? 0), quantity, "inventory quantity");
          const item: DurableInventoryItem = { ownerId, sku, quantity: nextQuantity, ...(metadata !== undefined ? { metadata: clone(metadata) } : existing?.metadata !== undefined ? { metadata: clone(existing.metadata as DurableJson) } : {}), updatedAt: time() };
          tx.put("inventory", key, item as unknown as DurableJson);
          audit(tx, ownerId, "inventory.grant", key, { quantity }, idempotencyKey);
          return item as unknown as DurableJson;
        })) as Promise<DurableInventoryItem>;
      },
      async consume(ownerId: string, sku: string, quantity = 1, idempotencyKey?: string) {
        assertId(ownerId, "ownerId"); assertId(sku, "sku"); amount(quantity, "quantity");
        return store.transaction((tx) => idempotent(tx, `inventory.consume/${ownerId}`, idempotencyKey, stable({ sku, quantity }), () => {
          const key = `${ownerId}/${sku}`;
          const existing = record(tx.get("inventory", key));
          const current = number(existing?.quantity ?? 0);
          if (current < quantity) return false;
          const remaining = current - quantity;
          if (remaining === 0) tx.delete("inventory", key);
          else tx.put("inventory", key, { ...existing!, quantity: remaining, updatedAt: time() });
          audit(tx, ownerId, "inventory.consume", key, { quantity }, idempotencyKey);
          return true;
        })) as Promise<boolean>;
      },
      list(ownerId: string, request: { cursor?: string; limit?: number } = {}) {
        assertId(ownerId, "ownerId");
        return store.transaction((tx) => page(tx.scan("inventory", { prefix: `${ownerId}/`, after: request.cursor, limit: pageLimit(request.limit) + 1 }), pageLimit(request.limit)) as DurablePage<DurableInventoryItem>);
      },
    },
    economy: {
      async balance(ownerId: string, currency: string) {
        assertId(ownerId, "ownerId"); assertId(currency, "currency");
        return store.transaction((tx) => number(record(tx.get("wallet", `${ownerId}/${currency}`))?.amount ?? 0));
      },
      async credit(ownerId: string, currency: string, value: number, actorId = ownerId, idempotencyKey?: string) {
        assertId(ownerId, "ownerId"); assertId(currency, "currency"); assertId(actorId, "actorId"); amount(value, "amount");
        return store.transaction((tx) => idempotent(tx, `economy.credit/${ownerId}`, idempotencyKey, stable({ currency, value }), () => {
          const key = `${ownerId}/${currency}`;
          const current = number(record(tx.get("wallet", key))?.amount ?? 0);
          const balance: DurableBalance = { ownerId, currency, amount: checkedAdd(current, value, "balance"), updatedAt: time() };
          tx.put("wallet", key, balance as unknown as DurableJson);
          audit(tx, actorId, "economy.credit", key, { amount: value }, idempotencyKey);
          return balance as unknown as DurableJson;
        })) as Promise<DurableBalance>;
      },
      async transfer(fromId: string, toId: string, currency: string, value: number, idempotencyKey: string) {
        assertId(fromId, "fromId"); assertId(toId, "toId"); assertId(currency, "currency"); amount(value, "amount"); if (fromId === toId) throw new Error("Transfer accounts must differ.");
        return store.transaction((tx) => idempotent(tx, `economy.transfer/${fromId}`, idempotencyKey, stable({ toId, currency, value }), () => {
          const fromKey = `${fromId}/${currency}`; const toKey = `${toId}/${currency}`;
          const fromAmount = number(record(tx.get("wallet", fromKey))?.amount ?? 0);
          if (fromAmount < value) return { ok: false, reason: "insufficient-funds" } as DurableJson;
          const toAmount = number(record(tx.get("wallet", toKey))?.amount ?? 0);
          const at = time();
          tx.put("wallet", fromKey, { ownerId: fromId, currency, amount: fromAmount - value, updatedAt: at });
          tx.put("wallet", toKey, { ownerId: toId, currency, amount: checkedAdd(toAmount, value, "balance"), updatedAt: at });
          audit(tx, fromId, "economy.transfer", `${fromId}->${toId}/${currency}`, { amount: value }, idempotencyKey);
          return { ok: true, fromBalance: fromAmount - value, toBalance: toAmount + value } as DurableJson;
        })) as Promise<{ ok: boolean; reason?: string; fromBalance?: number; toBalance?: number }>;
      },
    },
    guilds: {
      async create(name: string, ownerId: string, idempotencyKey: string) {
        assertText(name, "guild name", 80); assertId(ownerId, "ownerId");
        return store.transaction((tx) => idempotent(tx, `guild.create/${ownerId}`, idempotencyKey, stable({ name }), () => {
          const id = unique("guild", tx); const createdAt = time();
          const guild: DurableGuild = { id, name: name.trim(), ownerId, createdAt, memberCount: 1 };
          tx.put("guild", id, guild as unknown as DurableJson);
          tx.put("guild-member", `${id}/${ownerId}`, { guildId: id, accountId: ownerId, role: "owner", joinedAt: createdAt });
          audit(tx, ownerId, "guild.create", id, { name: guild.name }, idempotencyKey);
          return guild as unknown as DurableJson;
        })) as Promise<DurableGuild>;
      },
      async join(guildId: string, accountId: string, idempotencyKey: string) {
        assertId(guildId, "guildId"); assertId(accountId, "accountId");
        return store.transaction((tx) => idempotent(tx, `guild.join/${accountId}`, idempotencyKey, stable({ guildId }), () => {
          const guild = record(tx.get("guild", guildId));
          if (!guild) return false;
          const key = `${guildId}/${accountId}`;
          if (tx.get("guild-member", key)) return true;
          const count = number(guild.memberCount);
          if (count >= maxGuildMembers) throw new Error(`Guild ${guildId} reached member limit ${maxGuildMembers}.`);
          tx.put("guild-member", key, { guildId, accountId, role: "member", joinedAt: time() });
          tx.put("guild", guildId, { ...guild, memberCount: count + 1 });
          audit(tx, accountId, "guild.join", guildId, {}, idempotencyKey);
          return true;
        })) as Promise<boolean>;
      },
      async leave(guildId: string, accountId: string, idempotencyKey: string) {
        assertId(guildId, "guildId"); assertId(accountId, "accountId");
        return store.transaction((tx) => idempotent(tx, `guild.leave/${accountId}`, idempotencyKey, stable({ guildId }), () => {
          const guild = record(tx.get("guild", guildId));
          if (!guild || guild.ownerId === accountId) return false;
          const key = `${guildId}/${accountId}`;
          if (!tx.delete("guild-member", key)) return false;
          tx.put("guild", guildId, { ...guild, memberCount: number(guild.memberCount) - 1 });
          audit(tx, accountId, "guild.leave", guildId, {}, idempotencyKey);
          return true;
        })) as Promise<boolean>;
      },
      async get(guildId: string) { assertId(guildId, "guildId"); return store.transaction((tx) => clone(tx.get("guild", guildId)) as DurableGuild | undefined); },
      members(guildId: string, request: { cursor?: string; limit?: number } = {}) {
        assertId(guildId, "guildId"); const limit = pageLimit(request.limit);
        return store.transaction((tx) => page(tx.scan("guild-member", { prefix: `${guildId}/`, after: request.cursor, limit: limit + 1 }), limit) as DurablePage<DurableGuildMember>);
      },
    },
    moderation: {
      async record(input: Omit<DurableModerationAction, "id" | "createdAt" | "revokedAt">, idempotencyKey: string) {
        assertId(input.targetId, "targetId"); assertId(input.moderatorId, "moderatorId");
        if (!["mute", "kick", "ban", "warn"].includes(input.kind)) throw new Error("Moderation kind is invalid.");
        if (input.reason !== undefined) assertText(input.reason, "moderation reason", 1_000);
        const at = time(); if (input.expiresAt !== undefined && (!Number.isSafeInteger(input.expiresAt) || input.expiresAt <= at)) throw new Error("Moderation expiry must be in the future.");
        return store.transaction((tx) => idempotent(tx, `moderation.record/${input.moderatorId}`, idempotencyKey, stable(input), () => {
          const id = unique("moderation", tx);
          const action: DurableModerationAction = { ...input, id, createdAt: at };
          tx.put("moderation", `${input.targetId}/${id}`, action as unknown as DurableJson);
          audit(tx, input.moderatorId, `moderation.${input.kind}`, input.targetId, { actionId: id }, idempotencyKey);
          return action as unknown as DurableJson;
        })) as Promise<DurableModerationAction>;
      },
      async isBanned(targetId: string) {
        assertId(targetId, "targetId"); const at = time();
        return store.transaction((tx) => tx.scan("moderation", { prefix: `${targetId}/`, limit: 10_000 }).some(({ value }) => {
          const action = record(value); return action?.kind === "ban" && action.revokedAt === undefined && (action.expiresAt === undefined || number(action.expiresAt) > at);
        }));
      },
      async revoke(targetId: string, actionId: string, moderatorId: string, idempotencyKey: string) {
        assertId(targetId, "targetId"); assertId(actionId, "actionId"); assertId(moderatorId, "moderatorId");
        return store.transaction((tx) => idempotent(tx, `moderation.revoke/${moderatorId}`, idempotencyKey, stable({ targetId, actionId }), () => {
          const key = `${targetId}/${actionId}`; const action = record(tx.get("moderation", key));
          if (!action) return false;
          if (action.revokedAt !== undefined) return true;
          tx.put("moderation", key, { ...action, revokedAt: time() });
          audit(tx, moderatorId, "moderation.revoke", targetId, { actionId }, idempotencyKey);
          return true;
        })) as Promise<boolean>;
      },
      list(targetId: string, request: { cursor?: string; limit?: number } = {}) {
        assertId(targetId, "targetId"); const limit = pageLimit(request.limit);
        return store.transaction((tx) => page(tx.scan("moderation", { prefix: `${targetId}/`, after: request.cursor, limit: limit + 1 }), limit) as DurablePage<DurableModerationAction>);
      },
    },
    chat: {
      async send(channelId: string, senderId: string, text: string, idempotencyKey: string) {
        assertId(channelId, "channelId"); assertId(senderId, "senderId"); assertText(text, "chat message", maxChatLength);
        return store.transaction((tx) => idempotent(tx, `chat.send/${senderId}`, idempotencyKey, stable({ channelId, text }), () => {
          if (hasActiveModeration(tx, senderId, time(), new Set(["ban", "mute"]))) throw new Error(`Sender ${senderId} is banned or muted.`);
          const id = unique("chat", tx); const message: DurableChatMessage = { id, channelId, senderId, text: text.trim(), createdAt: time() };
          tx.put("chat", `${channelId}/${id}`, message as unknown as DurableJson);
          const retained = tx.scan("chat", { prefix: `${channelId}/`, limit: maxChatRetention + 1 });
          if (retained.length > maxChatRetention) tx.delete("chat", retained[0]!.key);
          audit(tx, senderId, "chat.send", channelId, { messageId: id }, idempotencyKey);
          return message as unknown as DurableJson;
        })) as Promise<DurableChatMessage>;
      },
      history(channelId: string, request: { cursor?: string; limit?: number } = {}) {
        assertId(channelId, "channelId"); const limit = pageLimit(request.limit);
        return store.transaction((tx) => page(tx.scan("chat", { prefix: `${channelId}/`, after: request.cursor, limit: limit + 1, reverse: true }), limit) as DurablePage<DurableChatMessage>);
      },
    },
    matchmaking: {
      async enqueue(playerId: string, queue: string, request: { ttlMs?: number; attributes?: Record<string, DurableJson>; idempotencyKey: string }) {
        assertId(playerId, "playerId"); assertId(queue, "queue"); const ttlMs = bounded(request.ttlMs ?? 5 * 60_000, 1_000, maxTicketTtl, "ticket ttlMs");
        validateJson(request.attributes ?? {});
        return store.transaction((tx) => idempotent(tx, `matchmaking.enqueue/${playerId}`, request.idempotencyKey, stable({ queue, ttlMs, attributes: request.attributes ?? {} }), () => {
          const existingId = tx.get("ticket-owner", playerId);
          if (typeof existingId === "string") {
            const existing = record(tx.get("ticket", existingId));
            if (existing && ["waiting", "matched", "claimed"].includes(String(existing.state)) && number(existing.expiresAt) > time()) return existing as DurableJson;
          }
          const id = unique("ticket", tx); const createdAt = time();
          const ticket: MatchmakingTicket = { id, playerId, queue, state: "waiting", createdAt, expiresAt: createdAt + ttlMs, attributes: clone(request.attributes ?? {})! };
          tx.put("ticket", id, ticket as unknown as DurableJson); tx.put("ticket-owner", playerId, id);
          audit(tx, playerId, "matchmaking.enqueue", id, { queue }, request.idempotencyKey);
          return ticket as unknown as DurableJson;
        })) as Promise<MatchmakingTicket>;
      },
      async ticketForPlayer(playerId: string) {
        assertId(playerId, "playerId");
        return store.transaction((tx) => { const id = tx.get("ticket-owner", playerId); return typeof id === "string" ? clone(tx.get("ticket", id)) as MatchmakingTicket | undefined : undefined; });
      },
      async match(queue: string, roomId: string, capacity: number, handoffTtlMs = 60_000) {
        assertId(queue, "queue"); assertId(roomId, "roomId"); capacity = bounded(capacity, 1, 10_000, "match capacity"); handoffTtlMs = bounded(handoffTtlMs, 1_000, maxHandoffTtl, "handoff ttlMs");
        return store.transaction((tx) => {
          const at = time(); const waiting = tx.scan("ticket", { limit: 100_000 }).map(({ value }) => record(value)!).filter((ticket) => ticket.queue === queue && ticket.state === "waiting").sort((a, b) => number(a.createdAt) - number(b.createdAt) || String(a.id).localeCompare(String(b.id)));
          const matched: MatchmakingTicket[] = [];
          for (const candidate of waiting) {
            if (matched.length >= capacity) break;
            if (number(candidate.expiresAt) <= at) { tx.put("ticket", String(candidate.id), { ...candidate, state: "expired" }); continue; }
            const token = `${safeRandom(randomId())}.${safeRandom(randomId())}`;
            const ticket = { ...candidate, state: "matched", handoff: { roomId, token, expiresAt: at + handoffTtlMs } } as MatchmakingTicket;
            tx.put("ticket", ticket.id, ticket as unknown as DurableJson); matched.push(ticket);
            audit(tx, "matchmaker", "matchmaking.match", ticket.id, { roomId, queue });
          }
          return matched;
        });
      },
      async claim(playerId: string, ticketId: string, token: string, idempotencyKey: string) {
        assertId(playerId, "playerId"); assertId(ticketId, "ticketId"); assertText(token, "handoff token", 512);
        return store.transaction((tx) => idempotent(tx, `matchmaking.claim/${playerId}`, idempotencyKey, stable({ ticketId, token }), () => {
          const current = record(tx.get("ticket", ticketId)); const at = time();
          if (!current || current.playerId !== playerId || current.state !== "matched") return { ok: false, reason: "ticket-unavailable" } as DurableJson;
          const handoff = record(current.handoff);
          if (!handoff || handoff.token !== token || number(handoff.expiresAt) <= at) return { ok: false, reason: "handoff-invalid" } as DurableJson;
          const ticket = { ...current, state: "claimed", handoff: { ...handoff, claimedAt: at } } as unknown as MatchmakingTicket;
          tx.put("ticket", ticketId, ticket as unknown as DurableJson);
          audit(tx, playerId, "matchmaking.claim", ticketId, { roomId: String(handoff.roomId) }, idempotencyKey);
          return { ok: true, roomId: String(handoff.roomId), ticketId } as DurableJson;
        })) as Promise<{ ok: boolean; reason?: string; roomId?: string; ticketId?: string }>;
      },
      async cancel(playerId: string, idempotencyKey: string) {
        assertId(playerId, "playerId");
        return store.transaction((tx) => idempotent(tx, `matchmaking.cancel/${playerId}`, idempotencyKey, "cancel", () => {
          const ticketId = tx.get("ticket-owner", playerId);
          if (typeof ticketId !== "string") return false;
          const ticket = record(tx.get("ticket", ticketId));
          if (!ticket || !["waiting", "matched"].includes(String(ticket.state))) return false;
          tx.put("ticket", ticketId, { ...ticket, state: "cancelled" });
          tx.delete("ticket-owner", playerId);
          audit(tx, playerId, "matchmaking.cancel", ticketId, {}, idempotencyKey);
          return true;
        })) as Promise<boolean>;
      },
    },
    audit: {
      list(request: { cursor?: string; limit?: number } = {}) {
        const limit = pageLimit(request.limit);
        return store.transaction((tx) => page(tx.scan("audit", { after: request.cursor, limit: limit + 1 }), limit) as DurablePage<DurableAuditRecord>);
      },
    },
  };
}

/** AuthAdapter integration: consumes a signed one-use identity, then checks durable bans. */
export function createDurableServiceAuthAdapter(authority: SignedSessionAuthority, services: Pick<DurableMmoServices, "moderation">): AuthAdapter {
  return {
    async verify(token: string): Promise<AuthResult> {
      try {
        const identity = await authority.verify(token);
        if (await services.moderation.isBanned(identity.subject)) return { ok: false, reason: "account banned" };
        return { ok: true, userId: identity.subject, sessionId: identity.sessionId, claims: clone(identity.attributes) as Record<string, unknown> };
      } catch { return { ok: false, reason: "session rejected" }; }
    },
  };
}

export async function createDurableServiceBackup(store: DurableServiceStore, createdAt = Date.now()): Promise<Uint8Array> {
  if (!Number.isSafeInteger(createdAt) || createdAt < 0) throw new Error("Backup createdAt is invalid.");
  const records = await store.exportRecords();
  if (records.length > 2_000_000) throw new Error("Durable service backup exceeds record limit 2000000.");
  const seen = new Set<string>();
  for (const record of records) {
    validateDurableStoreRecord(record, true);
    const key = `${record.bucket}\0${record.key}`;
    if (seen.has(key)) throw new Error(`Duplicate durable service record ${record.bucket}/${record.key}.`);
    seen.add(key);
  }
  const payload = { format: "hyperfocus-durable-services-backup", version: 1, createdAt, records };
  const checksum = await sha256(stable(payload));
  const bytes = new TextEncoder().encode(`${stable({ ...payload, checksum })}\n`);
  if (bytes.byteLength > 1024 * 1024 * 1024) throw new Error("Durable service backup exceeds byte limit.");
  return bytes;
}

export async function restoreDurableServiceBackup(store: DurableServiceStore, source: Uint8Array | string): Promise<void> {
  const text = typeof source === "string" ? source : new TextDecoder("utf-8", { fatal: true }).decode(source);
  if (new TextEncoder().encode(text).byteLength > 1024 * 1024 * 1024) throw new Error("Durable service backup exceeds byte limit.");
  const value = record(JSON.parse(text));
  if (!value || value.format !== "hyperfocus-durable-services-backup" || value.version !== 1 || !Array.isArray(value.records) || typeof value.checksum !== "string") throw new Error("Durable service backup format is invalid.");
  if (Object.keys(value).sort().join(",") !== "checksum,createdAt,format,records,version") throw new Error("Durable service backup contains unsupported fields.");
  if (!Number.isSafeInteger(value.createdAt) || (value.createdAt as number) < 0 || !/^[0-9a-f]{64}$/.test(value.checksum)) throw new Error("Durable service backup metadata is invalid.");
  const records = value.records as unknown as DurableStoreRecord[];
  if (records.length > 2_000_000) throw new Error("Durable service backup exceeds record limit.");
  const seen = new Set<string>();
  for (const item of records) {
    validateDurableStoreRecord(item, true);
    const key = `${item.bucket}\0${item.key}`;
    if (seen.has(key)) throw new Error(`Duplicate durable service record ${item.bucket}/${item.key}.`);
    seen.add(key);
  }
  const checksum = await sha256(stable({ format: value.format, version: value.version, createdAt: value.createdAt, records }));
  if (checksum !== value.checksum) throw new Error("Durable service backup checksum verification failed.");
  await store.replaceRecordsAtomic(records);
}

function scanRecords(values: Map<string, DurableJson>, bucket: string, options: DurableStoreScan): DurableStoreRecord[] {
  bounded(options.limit, 1, 1_000_000, "scan limit");
  let keys = [...values.keys()].filter((key) => !options.prefix || key.startsWith(options.prefix)).sort();
  if (options.reverse) keys.reverse();
  if (options.after) {
    const index = keys.indexOf(options.after);
    keys = index >= 0 ? keys.slice(index + 1) : keys.filter((key) => options.reverse ? key < options.after! : key > options.after!);
  }
  return keys.slice(0, options.limit).map((key) => ({ bucket, key, value: clone(values.get(key))! }));
}

function page<T>(records: DurableStoreRecord[], limit: number): DurablePage<T> {
  const more = records.length > limit;
  const selected = more ? records.slice(0, limit) : records;
  return { items: selected.map((item) => clone(item.value) as T), ...(more ? { nextCursor: selected.at(-1)!.key } : {}) };
}

function hasActiveModeration(tx: DurableServiceTransaction, targetId: string, at: number, kinds: ReadonlySet<string>) {
  return tx.scan("moderation", { prefix: `${targetId}/`, limit: 10_000 }).some(({ value }) => {
    const action = record(value);
    return Boolean(action && kinds.has(String(action.kind)) && action.revokedAt === undefined && (action.expiresAt === undefined || number(action.expiresAt) > at));
  });
}

export function validateDurableStoreRecord(item: DurableStoreRecord, allowSequence = false) {
  if (!item || typeof item !== "object") throw new Error("Durable store record is invalid.");
  if (Object.keys(item).sort().join(",") !== "bucket,key,value") throw new Error("Durable store record contains unsupported fields.");
  if (item.bucket === "$sequence" && allowSequence) assertId(item.key, "sequence key");
  else { if (!BUCKETS.has(item.bucket)) throw new Error(`Unknown durable store bucket ${item.bucket}.`); assertKey(item.key, "record key"); }
  validateJson(item.value);
  if (new TextEncoder().encode(stable(item.value)).byteLength > 1024 * 1024) throw new Error(`Durable store record ${item.bucket}/${item.key} exceeds 1 MiB.`);
}

function validateJson(value: unknown, depth = 0, nodes = { value: 0 }): asserts value is DurableJson {
  nodes.value += 1; if (nodes.value > 100_000 || depth > 64) throw new Error("Durable JSON exceeds structural limits.");
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") { if (!Number.isFinite(value)) throw new Error("Durable JSON numbers must be finite."); return; }
  if (Array.isArray(value)) { for (const item of value) validateJson(item, depth + 1, nodes); return; }
  if (!value || typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) throw new Error("Durable values must contain plain JSON only.");
  for (const [key, item] of Object.entries(value)) { if (key.length > 256) throw new Error("Durable JSON key is too long."); validateJson(item, depth + 1, nodes); }
}

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`).join(",")}}`;
}

function clone<T>(value: T): T { return value === undefined ? value : structuredClone(value); }
function isPromiseLike(value: unknown): value is PromiseLike<unknown> { return Boolean(value && (typeof value === "object" || typeof value === "function") && typeof (value as { then?: unknown }).then === "function"); }
function record(value: unknown): Record<string, DurableJson> | undefined { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, DurableJson> : undefined; }
function number(value: unknown): number { if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("Stored numeric value is corrupt."); return value; }
function checkedAdd(a: number, b: number, label: string) { const value = a + b; if (!Number.isSafeInteger(value) || value > MAX_SAFE_AMOUNT) throw new Error(`${label} exceeds safe bound ${MAX_SAFE_AMOUNT}.`); return value; }
function amount(value: number, label: string) { if (!Number.isSafeInteger(value) || value <= 0 || value > MAX_SAFE_AMOUNT) throw new Error(`${label} must be a positive safe integer no greater than ${MAX_SAFE_AMOUNT}.`); }
function bounded(value: number, min: number, max: number, label: string) { if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${label} must be an integer from ${min} to ${max}.`); return value; }
function assertId(value: string, label: string) { if (typeof value !== "string" || !ID.test(value)) throw new Error(`${label} must match ${ID}.`); }
function assertKey(value: string, label: string) { if (typeof value !== "string" || !value || value.length > 512 || value.includes("\0")) throw new Error(`${label} is invalid.`); }
function assertText(value: string, label: string, max: number) { if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error(`${label} must contain 1-${max} characters.`); }
function safeRandom(value: string) { const safe = value.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64); if (safe.length < 8) throw new Error("Random ID source returned insufficient entropy text."); return safe; }
function pad(value: number) { return value.toString().padStart(16, "0"); }
function compareRecord(a: DurableStoreRecord, b: DurableStoreRecord) { return a.bucket.localeCompare(b.bucket) || a.key.localeCompare(b.key); }
async function sha256(value: string) { return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))].map((byte) => byte.toString(16).padStart(2, "0")).join(""); }
