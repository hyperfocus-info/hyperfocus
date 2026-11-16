import type { AuthAdapter, AuthResult } from "../core/types.ts";
import type { SignedSessionAuthority } from "../operations/operations.ts";
import { createMatchmakingGroup } from "./matchmaking/group.ts";
import { createMatchmakingRelease } from "./matchmaking/release.ts";
import {
  auditRecordCodec,
  balanceCodec,
  booleanCodec,
  chatMessageCodec,
  claimResultCodec,
  guildCodec,
  guildMemberCodec,
  inventoryItemCodec,
  matchmakingTicketCodec,
  moderationActionCodec,
  transferResultCodec,
  type ClaimResult,
  type DurableCodec,
  type TransferResult,
} from "./durable-service-codecs.ts";
import type {

  DurableBalance,
  DurableChatMessage,
  DurableGuild,
  DurableInventoryItem,
  DurableJson,
  DurableMmoServiceOptions,
  DurableModerationAction,
  DurablePage,
  DurableServiceStore,
  DurableServiceTransaction,
  DurableStoreRecord,
  DurableStoreScan,
  MatchmakingTicket,
} from "./durable-service-types.ts";

export type {
  DurableAuditRecord,
  DurableBalance,
  DurableChatMessage,
  DurableGuild,
  DurableGuildMember,
  DurableInventoryItem,
  DurableJson,
  DurableMmoServiceOptions,
  DurableModerationAction,
  DurablePage,
  DurableServiceStore,
  DurableServiceTransaction,
  DurableStoreRecord,
  DurableStoreScan,
  MatchmakingTicket,
} from "./durable-service-types.ts";

export type DurableMmoServices = ReturnType<typeof createDurableMmoServices>;

type DurableServiceContext = {
  store: DurableServiceStore;
  randomId: () => string;
  maxChatLength: number;
  maxChatRetention: number;
  maxGuildMembers: number;
  maxTicketTtl: number;
  maxHandoffTtl: number;
  pageLimit(limit?: number): number;
  time(): number;
  unique(prefix: string, transaction: DurableServiceTransaction): string;
  audit(transaction: DurableServiceTransaction, actorId: string, operation: string, subjectId: string, details: DurableJson, idempotencyKey?: string): void;
  idempotent<T>(transaction: DurableServiceTransaction, scope: string, key: string | undefined, fingerprint: string, codec: DurableCodec<T>, operation: () => T): T;
};

const BUCKETS = new Set(["inventory", "wallet", "guild", "guild-member", "moderation", "chat", "ticket", "ticket-owner", "idempotency", "audit", "combat-policy", "replay-share"]);
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
            undo.push(() => { if (existed && previous !== undefined) values.set(key, previous); else values.delete(key); });
            values.set(key, clone(value));
          },
          delete(name, key) {
            const values = bucket(name);
            if (!values.has(key)) return false;
            const previous = values.get(key);
            if (previous === undefined) return false;
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
        validateDurableServiceRecords(records);
        const nextBuckets = new Map<string, Map<string, DurableJson>>();
        const nextSequences = new Map<string, number>();
        const seen = new Set<string>();
        for (const record of records) {
          validateDurableStoreRecord(record, true);
          const unique = `${record.bucket}\0${record.key}`;
          if (seen.has(unique)) throw new Error(`Duplicate durable service record ${record.bucket}/${record.key}.`);
          seen.add(unique);
          if (record.bucket === "$sequence") {
            if (!isNonNegativeSafeInteger(record.value)) throw new Error(`Invalid sequence ${record.key}.`);
            nextSequences.set(record.key, record.value);
          } else {
            let values = nextBuckets.get(record.bucket);
            if (!values) { values = new Map(); nextBuckets.set(record.bucket, values); }
            values.set(record.key, clone(record.value));
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
  const maxTicketTtl = bounded(options.maxTicketTtlMs ?? 1800000, 1_000, 86400000, "maxTicketTtlMs");
  const maxHandoffTtl = bounded(options.maxHandoffTtlMs ?? 120000, 1_000, 3600000, "maxHandoffTtlMs");

  function pageLimit(limit?: number) { return bounded(limit ?? 50, 1, maxPageSize, "page limit"); }
  function time() { const value = now(); if (!Number.isSafeInteger(value) || value < 0) throw new Error("Service clock must return a non-negative safe integer."); return value; }
  function unique(prefix: string, tx: DurableServiceTransaction) { return `${prefix}-${pad(tx.nextSequence(prefix))}-${safeRandom(randomId())}`; }

  function audit(tx: DurableServiceTransaction, actorId: string, operation: string, subjectId: string, details: DurableJson, idempotencyKey?: string) {
    const at = time();
    const id = `audit-${pad(tx.nextSequence("audit"))}`;
    tx.put("audit", id, { id, at, actorId, operation, subjectId, details, ...(idempotencyKey ? { idempotencyKey } : {}) });
  }

  function idempotent<T>(tx: DurableServiceTransaction, scope: string, key: string | undefined, fingerprint: string, codec: DurableCodec<T>, operation: () => T): T {
    if (!key) return operation();
    assertId(key, "idempotency key");
    const storageKey = `${scope}/${key}`;
    const existing = record(tx.get("idempotency", storageKey));
    if (existing) {
      if (existing.fingerprint !== fingerprint) throw new Error(`Idempotency key ${key} was reused with different input.`);
      if (existing.result === undefined) throw new Error(`Idempotency record ${storageKey} has no result.`);
      return codec.decode(clone(existing.result));
    }
    if (tx.nextSequence("idempotency-count") > maxIdempotency) throw new Error("Idempotency record limit reached; prune or archive records before accepting more mutations.");
    const result = operation();
    const encoded = codec.encode(result);
    tx.put("idempotency", storageKey, { fingerprint, result: encoded, createdAt: time() });
    return codec.decode(clone(encoded));
  }

  const context: DurableServiceContext = {
    store,
    randomId,
    maxChatLength,
    maxChatRetention,
    maxGuildMembers,
    maxTicketTtl,
    maxHandoffTtl,
    pageLimit,
    time,
    unique,
    audit,
    idempotent,
  };
  return { store, ...createCoreDurableServices(context), ...createCommunityDurableServices(context) };
}

function createCoreDurableServices(context: DurableServiceContext) {
  const { audit, idempotent, maxGuildMembers, pageLimit, store, time, unique } = context;
  return {
    inventory: {
      async grant(ownerId: string, sku: string, quantity = 1, metadata?: DurableJson, idempotencyKey?: string) {
        assertId(ownerId, "ownerId"); assertId(sku, "sku"); amount(quantity, "quantity"); if (metadata !== undefined) validateJson(metadata);
        return store.transaction((tx) => idempotent(tx, `inventory.grant/${ownerId}`, idempotencyKey, stable({ sku, quantity, metadata: metadata ?? null }), inventoryItemCodec, () => {
          const key = `${ownerId}/${sku}`;
          const stored = tx.get("inventory", key);
          const existing = stored === undefined ? undefined : inventoryItemCodec.decode(stored);
          const nextQuantity = checkedAdd(existing?.quantity ?? 0, quantity, "inventory quantity");
          const item: DurableInventoryItem = { ownerId, sku, quantity: nextQuantity, ...(metadata !== undefined ? { metadata: clone(metadata) } : existing?.metadata !== undefined ? { metadata: clone(existing.metadata) } : {}), updatedAt: time() };
          tx.put("inventory", key, inventoryItemCodec.encode(item));
          audit(tx, ownerId, "inventory.grant", key, { quantity }, idempotencyKey);
          return item;
        }));
      },
      async consume(ownerId: string, sku: string, quantity = 1, idempotencyKey?: string) {
        assertId(ownerId, "ownerId"); assertId(sku, "sku"); amount(quantity, "quantity");
        return store.transaction((tx) => idempotent(tx, `inventory.consume/${ownerId}`, idempotencyKey, stable({ sku, quantity }), booleanCodec, () => {
          const key = `${ownerId}/${sku}`;
          const stored = tx.get("inventory", key);
          const existing = stored === undefined ? undefined : inventoryItemCodec.decode(stored);
          const current = existing?.quantity ?? 0;
          if (current < quantity) return false;
          const remaining = current - quantity;
          if (remaining === 0) tx.delete("inventory", key);
          else if (existing) tx.put("inventory", key, inventoryItemCodec.encode({ ...existing, quantity: remaining, updatedAt: time() }));
          audit(tx, ownerId, "inventory.consume", key, { quantity }, idempotencyKey);
          return true;
        }));
      },
      list(ownerId: string, request: { cursor?: string; limit?: number } = {}) {
        assertId(ownerId, "ownerId");
        return store.transaction((tx) => page(tx.scan("inventory", { prefix: `${ownerId}/`, after: request.cursor, limit: pageLimit(request.limit) + 1 }), pageLimit(request.limit), inventoryItemCodec));
      },
    },
    economy: {
      async balance(ownerId: string, currency: string) {
        assertId(ownerId, "ownerId"); assertId(currency, "currency");
        return store.transaction((tx) => number(record(tx.get("wallet", `${ownerId}/${currency}`))?.amount ?? 0));
      },
      async credit(ownerId: string, currency: string, value: number, actorId = ownerId, idempotencyKey?: string) {
        assertId(ownerId, "ownerId"); assertId(currency, "currency"); assertId(actorId, "actorId"); amount(value, "amount");
        return store.transaction((tx) => idempotent(tx, `economy.credit/${ownerId}`, idempotencyKey, stable({ currency, value }), balanceCodec, () => {
          const key = `${ownerId}/${currency}`;
          const stored = tx.get("wallet", key);
          const current = stored === undefined ? 0 : balanceCodec.decode(stored).amount;
          const balance: DurableBalance = { ownerId, currency, amount: checkedAdd(current, value, "balance"), updatedAt: time() };
          tx.put("wallet", key, balanceCodec.encode(balance));
          audit(tx, actorId, "economy.credit", key, { amount: value }, idempotencyKey);
          return balance;
        }));
      },
      async transfer(fromId: string, toId: string, currency: string, value: number, idempotencyKey: string) {
        assertId(fromId, "fromId"); assertId(toId, "toId"); assertId(currency, "currency"); amount(value, "amount"); if (fromId === toId) throw new Error("Transfer accounts must differ.");
        return store.transaction((tx) => idempotent(tx, `economy.transfer/${fromId}`, idempotencyKey, stable({ toId, currency, value }), transferResultCodec, (): TransferResult => {
          const fromKey = `${fromId}/${currency}`; const toKey = `${toId}/${currency}`;
          const storedFrom = tx.get("wallet", fromKey);
          const fromAmount = storedFrom === undefined ? 0 : balanceCodec.decode(storedFrom).amount;
          if (fromAmount < value) return { ok: false, reason: "insufficient-funds" };
          const storedTo = tx.get("wallet", toKey);
          const toAmount = storedTo === undefined ? 0 : balanceCodec.decode(storedTo).amount;
          const at = time();
          tx.put("wallet", fromKey, balanceCodec.encode({ ownerId: fromId, currency, amount: fromAmount - value, updatedAt: at }));
          tx.put("wallet", toKey, balanceCodec.encode({ ownerId: toId, currency, amount: checkedAdd(toAmount, value, "balance"), updatedAt: at }));
          audit(tx, fromId, "economy.transfer", `${fromId}->${toId}/${currency}`, { amount: value }, idempotencyKey);
          return { ok: true, fromBalance: fromAmount - value, toBalance: toAmount + value };
        }));
      },
    },
    guilds: {
      async create(name: string, ownerId: string, idempotencyKey: string) {
        assertText(name, "guild name", 80); assertId(ownerId, "ownerId");
        return store.transaction((tx) => idempotent(tx, `guild.create/${ownerId}`, idempotencyKey, stable({ name }), guildCodec, () => {
          const id = unique("guild", tx); const createdAt = time();
          const guild: DurableGuild = { id, name: name.trim(), ownerId, createdAt, memberCount: 1 };
          tx.put("guild", id, guildCodec.encode(guild));
          tx.put("guild-member", `${id}/${ownerId}`, guildMemberCodec.encode({ guildId: id, accountId: ownerId, role: "owner", joinedAt: createdAt }));
          audit(tx, ownerId, "guild.create", id, { name: guild.name }, idempotencyKey);
          return guild;
        }));
      },
      async join(guildId: string, accountId: string, idempotencyKey: string) {
        assertId(guildId, "guildId"); assertId(accountId, "accountId");
        return store.transaction((tx) => idempotent(tx, `guild.join/${accountId}`, idempotencyKey, stable({ guildId }), booleanCodec, () => {
          const storedGuild = tx.get("guild", guildId);
          if (storedGuild === undefined) return false;
          const guild = guildCodec.decode(storedGuild);
          const key = `${guildId}/${accountId}`;
          if (tx.get("guild-member", key)) return true;
          const count = guild.memberCount;
          if (count >= maxGuildMembers) throw new Error(`Guild ${guildId} reached member limit ${maxGuildMembers}.`);
          tx.put("guild-member", key, guildMemberCodec.encode({ guildId, accountId, role: "member", joinedAt: time() }));
          tx.put("guild", guildId, guildCodec.encode({ ...guild, memberCount: count + 1 }));
          audit(tx, accountId, "guild.join", guildId, {}, idempotencyKey);
          return true;
        }));
      },
      async leave(guildId: string, accountId: string, idempotencyKey: string) {
        assertId(guildId, "guildId"); assertId(accountId, "accountId");
        return store.transaction((tx) => idempotent(tx, `guild.leave/${accountId}`, idempotencyKey, stable({ guildId }), booleanCodec, () => {
          const storedGuild = tx.get("guild", guildId);
          if (storedGuild === undefined) return false;
          const guild = guildCodec.decode(storedGuild);
          if (guild.ownerId === accountId) return false;
          const key = `${guildId}/${accountId}`;
          if (!tx.delete("guild-member", key)) return false;
          tx.put("guild", guildId, guildCodec.encode({ ...guild, memberCount: guild.memberCount - 1 }));
          audit(tx, accountId, "guild.leave", guildId, {}, idempotencyKey);
          return true;
        }));
      },
      async get(guildId: string) {
        assertId(guildId, "guildId");
        return store.transaction((tx) => {
          const value = tx.get("guild", guildId);
          return value === undefined ? undefined : guildCodec.decode(value);
        });
      },
      members(guildId: string, request: { cursor?: string; limit?: number } = {}) {
        assertId(guildId, "guildId"); const limit = pageLimit(request.limit);
        return store.transaction((tx) => page(tx.scan("guild-member", { prefix: `${guildId}/`, after: request.cursor, limit: limit + 1 }), limit, guildMemberCodec));
      },
    },
  };
}

function createCommunityDurableServices(context: DurableServiceContext) {
  const { audit, idempotent, maxChatLength, maxChatRetention, maxHandoffTtl, maxTicketTtl, pageLimit, randomId, store, time, unique } = context;
  return {
    moderation: {
      async record(input: Omit<DurableModerationAction, "id" | "createdAt" | "revokedAt">, idempotencyKey: string) {
        assertId(input.targetId, "targetId"); assertId(input.moderatorId, "moderatorId");
        if (!["mute", "kick", "ban", "warn"].includes(input.kind)) throw new Error("Moderation kind is invalid.");
        if (input.reason !== undefined) assertText(input.reason, "moderation reason", 1_000);
        const at = time(); if (input.expiresAt !== undefined && (!Number.isSafeInteger(input.expiresAt) || input.expiresAt <= at)) throw new Error("Moderation expiry must be in the future.");
        return store.transaction((tx) => idempotent(tx, `moderation.record/${input.moderatorId}`, idempotencyKey, stable(input), moderationActionCodec, () => {
          const id = unique("moderation", tx);
          const action: DurableModerationAction = { ...input, id, createdAt: at };
          tx.put("moderation", `${input.targetId}/${id}`, moderationActionCodec.encode(action));
          audit(tx, input.moderatorId, `moderation.${input.kind}`, input.targetId, { actionId: id }, idempotencyKey);
          return action;
        }));
      },
      async isBanned(targetId: string) {
        assertId(targetId, "targetId"); const at = time();
        return store.transaction((tx) => tx.scan("moderation", { prefix: `${targetId}/`, limit: 10_000 }).some(({ value }) => {
          const action = moderationActionCodec.decode(value); return action.kind === "ban" && action.revokedAt === undefined && (action.expiresAt === undefined || action.expiresAt > at);
        }));
      },
      async revoke(targetId: string, actionId: string, moderatorId: string, idempotencyKey: string) {
        assertId(targetId, "targetId"); assertId(actionId, "actionId"); assertId(moderatorId, "moderatorId");
        return store.transaction((tx) => idempotent(tx, `moderation.revoke/${moderatorId}`, idempotencyKey, stable({ targetId, actionId }), booleanCodec, () => {
          const key = `${targetId}/${actionId}`; const storedAction = tx.get("moderation", key);
          if (storedAction === undefined) return false;
          const action = moderationActionCodec.decode(storedAction);
          if (action.revokedAt !== undefined) return true;
          tx.put("moderation", key, moderationActionCodec.encode({ ...action, revokedAt: time() }));
          audit(tx, moderatorId, "moderation.revoke", targetId, { actionId }, idempotencyKey);
          return true;
        }));
      },
      list(targetId: string, request: { cursor?: string; limit?: number } = {}) {
        assertId(targetId, "targetId"); const limit = pageLimit(request.limit);
        return store.transaction((tx) => page(tx.scan("moderation", { prefix: `${targetId}/`, after: request.cursor, limit: limit + 1 }), limit, moderationActionCodec));
      },
    },
    chat: {
      async send(channelId: string, senderId: string, text: string, idempotencyKey: string) {
        assertId(channelId, "channelId"); assertId(senderId, "senderId"); assertText(text, "chat message", maxChatLength);
        return store.transaction((tx) => idempotent(tx, `chat.send/${senderId}`, idempotencyKey, stable({ channelId, text }), chatMessageCodec, () => {
          if (hasActiveModeration(tx, senderId, time(), new Set(["ban", "mute"]))) throw new Error(`Sender ${senderId} is banned or muted.`);
          const id = unique("chat", tx); const message: DurableChatMessage = { id, channelId, senderId, text: text.trim(), createdAt: time() };
          tx.put("chat", `${channelId}/${id}`, chatMessageCodec.encode(message));
          const retained = tx.scan("chat", { prefix: `${channelId}/`, limit: maxChatRetention + 1 });
          const oldest = retained[0];
          if (retained.length > maxChatRetention && oldest) tx.delete("chat", oldest.key);
          audit(tx, senderId, "chat.send", channelId, { messageId: id }, idempotencyKey);
          return message;
        }));
      },
      history(channelId: string, request: { cursor?: string; limit?: number } = {}) {
        assertId(channelId, "channelId"); const limit = pageLimit(request.limit);
        return store.transaction((tx) => page(tx.scan("chat", { prefix: `${channelId}/`, after: request.cursor, limit: limit + 1, reverse: true }), limit, chatMessageCodec));
      },
    },
    matchmaking: {
      matchGroup: createMatchmakingGroup({ store, time, maxHandoffTtl, audit, token: () => `${safeRandom(randomId())}.${safeRandom(randomId())}` }),
      release: createMatchmakingRelease({ store, audit, once: (tx, key, fingerprint, run) => idempotent(tx, "matchmaking.release", key, fingerprint, booleanCodec, run) }),
      async assignment(request: { roomId: string }) {
        assertId(request.roomId, "roomId");
        return store.transaction(tx => tx.scan("ticket", { limit: 100_000 }).map(({ value }) => matchmakingTicketCodec.decode(value))
          .filter(ticket => ticket.handoff?.roomId === request.roomId));
      },
      async enqueue(playerId: string, queue: string, request: { ttlMs?: number; attributes?: Record<string, DurableJson>; idempotencyKey: string }) {
        assertId(playerId, "playerId"); assertId(queue, "queue"); const ttlMs = bounded(request.ttlMs ?? 300000, 1_000, maxTicketTtl, "ticket ttlMs");
        validateJson(request.attributes ?? {});
        return store.transaction((tx) => idempotent(tx, `matchmaking.enqueue/${playerId}`, request.idempotencyKey, stable({ queue, ttlMs, attributes: request.attributes ?? {} }), matchmakingTicketCodec, () => {
          const existingId = tx.get("ticket-owner", playerId);
          if (typeof existingId === "string") {
            const storedTicket = tx.get("ticket", existingId);
            if (storedTicket !== undefined) {
              const existing = matchmakingTicketCodec.decode(storedTicket);
              if ((existing.state === "waiting" || existing.state === "matched" || existing.state === "claimed") && existing.expiresAt > time()) return existing;
              const expired: MatchmakingTicket = { id: existing.id, playerId: existing.playerId, queue: existing.queue, createdAt: existing.createdAt,
                expiresAt: existing.expiresAt, attributes: existing.attributes, state: "expired" };
              tx.put("ticket", existing.id, matchmakingTicketCodec.encode(expired));
            }
          }
          const id = unique("ticket", tx); const createdAt = time();
          const ticket: MatchmakingTicket = { id, playerId, queue, state: "waiting", createdAt, expiresAt: createdAt + ttlMs, attributes: clone(request.attributes ?? {}) };
          tx.put("ticket", id, matchmakingTicketCodec.encode(ticket)); tx.put("ticket-owner", playerId, id);
          audit(tx, playerId, "matchmaking.enqueue", id, { queue }, request.idempotencyKey);
          return ticket;
        }));
      },
      async ticketForPlayer(playerId: string) {
        assertId(playerId, "playerId");
        return store.transaction((tx) => {
          const id = tx.get("ticket-owner", playerId);
          if (typeof id !== "string") return undefined;
          const ticket = tx.get("ticket", id);
          return ticket === undefined ? undefined : matchmakingTicketCodec.decode(ticket);
        });
      },
      async match(queue: string, roomId: string, capacity: number, handoffTtlMs = 60_000) {
        assertId(queue, "queue"); assertId(roomId, "roomId"); capacity = bounded(capacity, 1, 10_000, "match capacity"); handoffTtlMs = bounded(handoffTtlMs, 1_000, maxHandoffTtl, "handoff ttlMs");
        return store.transaction((tx) => {
          const at = time(); const waiting = tx.scan("ticket", { limit: 100_000 }).map(({ value }) => matchmakingTicketCodec.decode(value)).filter((ticket): ticket is MatchmakingTicket & { state: "waiting" } => ticket.queue === queue && ticket.state === "waiting").sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
          const matched: MatchmakingTicket[] = [];
          for (const candidate of waiting) {
            if (matched.length >= capacity) break;
            if (candidate.expiresAt <= at) {
              tx.put("ticket", candidate.id, matchmakingTicketCodec.encode({ ...candidate, state: "expired" }));
              if (tx.get("ticket-owner", candidate.playerId) === candidate.id) tx.delete("ticket-owner", candidate.playerId);
              continue;
            }
            const token = `${safeRandom(randomId())}.${safeRandom(randomId())}`;
            const ticket: MatchmakingTicket = { ...candidate, state: "matched", handoff: { roomId, token, expiresAt: at + handoffTtlMs } };
            tx.put("ticket", ticket.id, matchmakingTicketCodec.encode(ticket)); matched.push(ticket);
            audit(tx, "matchmaker", "matchmaking.match", ticket.id, { roomId, queue });
          }
          return matched;
        });
      },
      async claim(playerId: string, ticketId: string, token: string, idempotencyKey: string) {
        assertId(playerId, "playerId"); assertId(ticketId, "ticketId"); assertText(token, "handoff token", 512);
        return store.transaction((tx) => idempotent(tx, `matchmaking.claim/${playerId}`, idempotencyKey, stable({ ticketId, token }), claimResultCodec, (): ClaimResult => {
          const storedTicket = tx.get("ticket", ticketId); const at = time();
          if (storedTicket === undefined) return { ok: false, reason: "ticket-unavailable" };
          const current = matchmakingTicketCodec.decode(storedTicket);
          if (current.playerId !== playerId || current.state !== "matched") return { ok: false, reason: "ticket-unavailable" };
          if (current.handoff.token !== token || current.handoff.expiresAt <= at) return { ok: false, reason: "handoff-invalid" };
          const ticket: MatchmakingTicket = { ...current, state: "claimed", handoff: { ...current.handoff, claimedAt: at } };
          tx.put("ticket", ticketId, matchmakingTicketCodec.encode(ticket));
          audit(tx, playerId, "matchmaking.claim", ticketId, { roomId: current.handoff.roomId }, idempotencyKey);
          return { ok: true, roomId: current.handoff.roomId, ticketId };
        }));
      },
      async cancel(playerId: string, idempotencyKey: string) {
        assertId(playerId, "playerId");
        return store.transaction((tx) => idempotent(tx, `matchmaking.cancel/${playerId}`, idempotencyKey, "cancel", booleanCodec, () => {
          const ticketId = tx.get("ticket-owner", playerId);
          if (typeof ticketId !== "string") return false;
          const storedTicket = tx.get("ticket", ticketId);
          if (storedTicket === undefined) return false;
          const ticket = matchmakingTicketCodec.decode(storedTicket);
          if (ticket.state !== "waiting" && ticket.state !== "matched") return false;
          const cancelled: MatchmakingTicket = {
            id: ticket.id,
            playerId: ticket.playerId,
            queue: ticket.queue,
            state: "cancelled",
            createdAt: ticket.createdAt,
            expiresAt: ticket.expiresAt,
            attributes: ticket.attributes,
          };
          tx.put("ticket", ticketId, matchmakingTicketCodec.encode(cancelled));
          tx.delete("ticket-owner", playerId);
          audit(tx, playerId, "matchmaking.cancel", ticketId, {}, idempotencyKey);
          return true;
        }));
      },
    },
    audit: {
      list(request: { cursor?: string; limit?: number } = {}) {
        const limit = pageLimit(request.limit);
        return store.transaction((tx) => page(tx.scan("audit", { after: request.cursor, limit: limit + 1 }), limit, auditRecordCodec));
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
        return { ok: true, userId: identity.subject, sessionId: identity.sessionId, claims: clone(identity.attributes) };
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
  validateDurableServiceRecords(records);
  const payload = { format: "hyperfocus-durable-services-backup", version: 1, createdAt, records };
  const checksum = await sha256(stable(payload));
  const bytes = new TextEncoder().encode(`${stable({ ...payload, checksum })}\n`);
  if (bytes.byteLength > 1073741824) throw new Error("Durable service backup exceeds byte limit.");
  return bytes;
}

export async function restoreDurableServiceBackup(store: DurableServiceStore, source: Uint8Array | string): Promise<void> {
  const text = typeof source === "string" ? source : new TextDecoder("utf-8", { fatal: true }).decode(source);
  if (new TextEncoder().encode(text).byteLength > 1073741824) throw new Error("Durable service backup exceeds byte limit.");
  const parsed: unknown = JSON.parse(text);
  const value = record(parsed);
  if (!value || value.format !== "hyperfocus-durable-services-backup" || value.version !== 1 || !Array.isArray(value.records) || typeof value.checksum !== "string") throw new Error("Durable service backup format is invalid.");
  if (Object.keys(value).sort().join(",") !== "checksum,createdAt,format,records,version") throw new Error("Durable service backup contains unsupported fields.");
  if (!isNonNegativeSafeInteger(value.createdAt) || !/^[0-9a-f]{64}$/.test(value.checksum)) throw new Error("Durable service backup metadata is invalid.");
  const records = value.records.map(parseDurableStoreRecord);
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
  validateDurableServiceRecords(records);
  await store.replaceRecordsAtomic(records);
}

function scanRecords(values: Map<string, DurableJson>, bucket: string, options: DurableStoreScan): DurableStoreRecord[] {
  bounded(options.limit, 1, 1_000_000, "scan limit");
  let keys = [...values.keys()].filter((key) => !options.prefix || key.startsWith(options.prefix)).sort();
  if (options.reverse) keys.reverse();
  if (options.after) {
    const after = options.after;
    const index = keys.indexOf(options.after);
    keys = index >= 0 ? keys.slice(index + 1) : keys.filter((key) => options.reverse ? key < after : key > after);
  }
  return keys.slice(0, options.limit).map((key) => {
    const value = values.get(key);
    if (value === undefined) throw new Error(`Durable record ${bucket}/${key} disappeared during scan.`);
    return { bucket, key, value: clone(value) };
  });
}

function page<T>(records: DurableStoreRecord[], limit: number, codec: DurableCodec<T>): DurablePage<T> {
  const more = records.length > limit;
  const selected = more ? records.slice(0, limit) : records;
  const last = selected.at(-1);
  return { items: selected.map((item) => codec.decode(clone(item.value))), ...(more && last ? { nextCursor: last.key } : {}) };
}

function hasActiveModeration(tx: DurableServiceTransaction, targetId: string, at: number, kinds: ReadonlySet<string>) {
  return tx.scan("moderation", { prefix: `${targetId}/`, limit: 10_000 }).some(({ value }) => {
    const action = moderationActionCodec.decode(value);
    return kinds.has(action.kind) && action.revokedAt === undefined && (action.expiresAt === undefined || action.expiresAt > at);
  });
}

export function validateDurableServiceRecords(records: readonly DurableStoreRecord[]) {
  if (!Array.isArray(records) || records.length > 2_000_000) throw new Error("Durable service records exceed the supported limit.");
  const indexed = new Map<string, DurableStoreRecord>();
  const guildMemberCounts = new Map<string, number>();
  const guildOwnerAccounts = new Map<string, string>();
  const tickets = new Map<string, Record<string, DurableJson>>();
  const ticketOwners = new Map<string, string>();

  for (const item of records) {
    validateDurableStoreRecord(item, true);
    const unique = `${item.bucket}\0${item.key}`;
    if (indexed.has(unique)) throw new Error(`Duplicate durable service record ${item.bucket}/${item.key}.`);
    indexed.set(unique, item);
    if (item.bucket === "$sequence") {
      if (!isNonNegativeSafeInteger(item.value)) throw new Error(`Invalid sequence ${item.key}.`);
      continue;
    }
    if (item.bucket === "ticket-owner") {
      assertId(item.key, "ticket owner key");
      if (typeof item.value !== "string") throw new Error(`Ticket owner ${item.key} must reference a ticket id.`);
      assertId(item.value, "ticket owner reference");
      ticketOwners.set(item.key, item.value);
      continue;
    }
    // Combat policy envelopes are application-owned; validate them at the host boundary.
    if (item.bucket === "combat-policy") {
      if (typeof item.value !== "string") throw new Error("Combat policy records must be encoded strings.");
      continue;
    }

    const value = requireDomainRecord(item);
    switch (item.bucket) {
      case "replay-share":
        assertDomainShape(value, ["owner", "digest", "expires", "payload"], [], item);
        assertDomainId(value.owner, "replay owner");
        assertDomainTimestamp(value.expires, "replay expiry");
        if (typeof value.digest !== "string" || !/^[a-f0-9]{64}$/.test(value.digest) || typeof value.payload !== "string") throw new Error("Invalid replay share envelope.");
        break;
      case "inventory":
        assertDomainShape(value, ["ownerId", "quantity", "sku", "updatedAt"], ["metadata"], item);
        assertDomainId(value.ownerId, "inventory ownerId");
        assertDomainId(value.sku, "inventory sku");
        assertPositiveAmount(value.quantity, "inventory quantity");
        assertDomainTimestamp(value.updatedAt, "inventory updatedAt");
        if (item.key !== `${value.ownerId}/${value.sku}`) throw new Error(`Inventory key ${item.key} does not match its value.`);
        break;
      case "wallet":
        assertDomainShape(value, ["amount", "currency", "ownerId", "updatedAt"], [], item);
        assertDomainId(value.ownerId, "wallet ownerId");
        assertDomainId(value.currency, "wallet currency");
        assertNonNegativeAmount(value.amount, "wallet amount");
        assertDomainTimestamp(value.updatedAt, "wallet updatedAt");
        if (item.key !== `${value.ownerId}/${value.currency}`) throw new Error(`Wallet key ${item.key} does not match its value.`);
        break;
      case "guild":
        assertDomainShape(value, ["createdAt", "id", "memberCount", "name", "ownerId"], [], item);
        assertDomainId(value.id, "guild id");
        assertDomainId(value.ownerId, "guild ownerId");
        assertDomainText(value.name, "guild name");
        assertPositiveAmount(value.memberCount, "guild memberCount");
        assertDomainTimestamp(value.createdAt, "guild createdAt");
        if (item.key !== value.id) throw new Error(`Guild key ${item.key} does not match its id.`);
        break;
      case "guild-member":
        assertDomainShape(value, ["accountId", "guildId", "joinedAt", "role"], [], item);
        assertDomainId(value.guildId, "guild member guildId");
        assertDomainId(value.accountId, "guild member accountId");
        if (value.role !== "owner" && value.role !== "member") throw new Error(`Guild member ${item.key} has an invalid role.`);
        assertDomainTimestamp(value.joinedAt, "guild member joinedAt");
        if (item.key !== `${value.guildId}/${value.accountId}`) throw new Error(`Guild member key ${item.key} does not match its value.`);
        guildMemberCounts.set(value.guildId, (guildMemberCounts.get(value.guildId) ?? 0) + 1);
        if (value.role === "owner") {
          if (guildOwnerAccounts.has(value.guildId)) throw new Error(`Guild ${value.guildId} has more than one owner membership.`);
          guildOwnerAccounts.set(value.guildId, value.accountId);
        }
        break;
      case "moderation":
        assertDomainShape(value, ["createdAt", "id", "kind", "moderatorId", "targetId"], ["expiresAt", "reason", "revokedAt"], item);
        assertDomainId(value.id, "moderation id");
        assertDomainId(value.targetId, "moderation targetId");
        assertDomainId(value.moderatorId, "moderation moderatorId");
        if (!new Set(["mute", "kick", "ban", "warn"]).has(String(value.kind))) throw new Error(`Moderation ${item.key} has an invalid kind.`);
        assertDomainTimestamp(value.createdAt, "moderation createdAt");
        if (value.expiresAt !== undefined) assertDomainTimestamp(value.expiresAt, "moderation expiresAt");
        if (value.revokedAt !== undefined) assertDomainTimestamp(value.revokedAt, "moderation revokedAt");
        if (value.reason !== undefined) assertDomainText(value.reason, "moderation reason");
        if (item.key !== `${value.targetId}/${value.id}`) throw new Error(`Moderation key ${item.key} does not match its value.`);
        break;
      case "chat":
        assertDomainShape(value, ["channelId", "createdAt", "id", "senderId", "text"], [], item);
        assertDomainId(value.id, "chat id");
        assertDomainId(value.channelId, "chat channelId");
        assertDomainId(value.senderId, "chat senderId");
        assertDomainText(value.text, "chat text");
        assertDomainTimestamp(value.createdAt, "chat createdAt");
        if (item.key !== `${value.channelId}/${value.id}`) throw new Error(`Chat key ${item.key} does not match its value.`);
        break;
      case "ticket":
        validateTicketRecord(item, value);
        tickets.set(item.key, value);
        break;
      case "idempotency":
        assertDomainShape(value, ["createdAt", "fingerprint", "result"], [], item);
        assertDomainText(value.fingerprint, "idempotency fingerprint");
        assertDomainTimestamp(value.createdAt, "idempotency createdAt");
        break;
      case "audit":
        assertDomainShape(value, ["actorId", "at", "details", "id", "operation", "subjectId"], ["idempotencyKey"], item);
        assertDomainId(value.id, "audit id");
        assertDomainId(value.actorId, "audit actorId");
        assertDomainText(value.operation, "audit operation");
        assertDomainText(value.subjectId, "audit subjectId");
        assertDomainTimestamp(value.at, "audit timestamp");
        if (value.idempotencyKey !== undefined) assertDomainId(value.idempotencyKey, "audit idempotencyKey");
        if (item.key !== value.id) throw new Error(`Audit key ${item.key} does not match its id.`);
        break;
    }
  }

  for (const [key, item] of indexed) {
    if (!key.startsWith("guild\0")) continue;
    const guild = requireDomainRecord(item);
    const guildId = String(guild.id);
    if (guildMemberCounts.get(guildId) !== guild.memberCount) throw new Error(`Guild ${guildId} memberCount does not match its members.`);
    const owner = indexed.get(`guild-member\0${guildId}/${guild.ownerId}`);
    if (record(owner?.value)?.role !== "owner") throw new Error(`Guild ${guildId} is missing its owner membership.`);
  }
  for (const guildId of guildMemberCounts.keys()) {
    if (!indexed.has(`guild\0${guildId}`)) throw new Error(`Guild member references missing guild ${guildId}.`);
  }
  for (const [playerId, ticketId] of ticketOwners) {
    const ticket = tickets.get(ticketId);
    if (!ticket || ticket.playerId !== playerId) throw new Error(`Ticket owner ${playerId} references an invalid ticket.`);
    if (ticket.state !== "waiting" && ticket.state !== "matched" && ticket.state !== "claimed") {
      throw new Error(`Inactive ticket ${ticketId} cannot retain an owner index.`);
    }
  }
  for (const ticket of tickets.values()) {
    if ((ticket.state === "waiting" || ticket.state === "matched" || ticket.state === "claimed") && ticketOwners.get(String(ticket.playerId)) !== ticket.id) {
      throw new Error(`Active ticket ${ticket.id} is missing its owner index.`);
    }
  }
}

function validateTicketRecord(item: DurableStoreRecord, value: Record<string, DurableJson>) {
  assertDomainShape(value, ["attributes", "createdAt", "expiresAt", "id", "playerId", "queue", "state"], ["handoff"], item);
  assertDomainId(value.id, "ticket id");
  assertDomainId(value.playerId, "ticket playerId");
  assertDomainId(value.queue, "ticket queue");
  assertDomainTimestamp(value.createdAt, "ticket createdAt");
  assertDomainTimestamp(value.expiresAt, "ticket expiresAt");
  if (!record(value.attributes)) throw new Error(`Ticket ${item.key} attributes must be an object.`);
  if (item.key !== value.id) throw new Error(`Ticket key ${item.key} does not match its id.`);
  if (value.state === "waiting" || value.state === "cancelled" || value.state === "expired") {
    if (value.handoff !== undefined) throw new Error(`Ticket ${item.key} state ${value.state} cannot contain a handoff.`);
    return;
  }
  if (value.state !== "matched" && value.state !== "claimed") throw new Error(`Ticket ${item.key} has an invalid state.`);
  const handoff = record(value.handoff);
  if (!handoff) throw new Error(`Ticket ${item.key} requires a handoff.`);
  assertDomainShape(handoff, ["expiresAt", "roomId", "token"], value.state === "claimed" ? ["claimedAt"] : [], item);
  assertDomainId(handoff.roomId, "ticket handoff roomId");
  assertDomainText(handoff.token, "ticket handoff token");
  assertDomainTimestamp(handoff.expiresAt, "ticket handoff expiresAt");
  if (value.state === "claimed") assertDomainTimestamp(handoff.claimedAt, "ticket handoff claimedAt");
  else if (handoff.claimedAt !== undefined) throw new Error(`Matched ticket ${item.key} cannot be claimed.`);
}

function requireDomainRecord(item: DurableStoreRecord) {
  const value = record(item.value);
  if (!value) throw new Error(`Durable record ${item.bucket}/${item.key} must contain an object.`);
  return value;
}

function assertDomainShape(value: Record<string, DurableJson>, required: readonly string[], optional: readonly string[], item: DurableStoreRecord) {
  const keys = new Set(Object.keys(value));
  for (const key of required) if (!keys.delete(key)) throw new Error(`Durable record ${item.bucket}/${item.key} is missing ${key}.`);
  for (const key of optional) keys.delete(key);
  if (keys.size > 0) throw new Error(`Durable record ${item.bucket}/${item.key} contains unsupported field ${[...keys][0]}.`);
}

function assertDomainId(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string") throw new Error(`${label} must be a string.`);
  assertId(value, label);
}

function assertDomainText(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !value.trim() || value.length > 8_000) throw new Error(`${label} must contain 1-8000 characters.`);
}

function assertDomainTimestamp(value: unknown, label: string): asserts value is number {
  if (!isNonNegativeSafeInteger(value)) throw new Error(`${label} must be a non-negative safe integer.`);
}

function assertPositiveAmount(value: unknown, label: string): asserts value is number {
  if (!isPositiveSafeInteger(value) || value > MAX_SAFE_AMOUNT) throw new Error(`${label} is invalid.`);
}

function assertNonNegativeAmount(value: unknown, label: string): asserts value is number {
  if (!isNonNegativeSafeInteger(value) || value > MAX_SAFE_AMOUNT) throw new Error(`${label} is invalid.`);
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

export function validateDurableStoreRecord(item: DurableStoreRecord, allowSequence = false) {
  if (!item || typeof item !== "object") throw new Error("Durable store record is invalid.");
  if (Object.keys(item).sort().join(",") !== "bucket,key,value") throw new Error("Durable store record contains unsupported fields.");
  if (item.bucket === "$sequence" && allowSequence) assertId(item.key, "sequence key");
  else { if (!BUCKETS.has(item.bucket)) throw new Error(`Unknown durable store bucket ${item.bucket}.`); assertKey(item.key, "record key"); }
  validateJson(item.value);
  if (new TextEncoder().encode(stable(item.value)).byteLength > 1048576) throw new Error(`Durable store record ${item.bucket}/${item.key} exceeds 1 MiB.`);
}

export function parseDurableJson(value: unknown): DurableJson {
  validateJson(value);
  return value;
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
  return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
}

function clone<T>(value: T): T { return value === undefined ? value : structuredClone(value); }
function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return value !== null
    && (typeof value === "object" || typeof value === "function")
    && "then" in value
    && typeof value.then === "function";
}
function record(value: unknown): Record<string, DurableJson> | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  validateJson(value);
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, parseDurableJson(item)]));
}
function parseDurableStoreRecord(value: DurableJson): DurableStoreRecord {
  const item = record(value);
  if (!item || typeof item.bucket !== "string" || typeof item.key !== "string" || item.value === undefined) {
    throw new Error("Durable service backup contains an invalid record.");
  }
  const parsed: DurableStoreRecord = { bucket: item.bucket, key: item.key, value: item.value };
  validateDurableStoreRecord(parsed, true);
  return parsed;
}
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
