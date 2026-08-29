import type {
  DurableAuditRecord,
  DurableBalance,
  DurableChatMessage,
  DurableGuild,
  DurableGuildMember,
  DurableInventoryItem,
  DurableJson,
  DurableModerationAction,
  MatchmakingTicket,
} from "./durable-service-types.ts";

type DurableObject = { [key: string]: DurableJson };

export type DurableCodec<T> = {
  encode(value: T): DurableJson;
  decode(value: DurableJson): T;
};

export type TransferResult = { ok: boolean; reason?: string; fromBalance?: number; toBalance?: number };
export type ClaimResult = { ok: boolean; reason?: string; roomId?: string; ticketId?: string };

function object(value: DurableJson, label: string): DurableObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value;
}

function required(value: DurableObject, key: string, label: string): DurableJson {
  const field = value[key];
  if (field === undefined) throw new Error(`${label} is missing ${key}.`);
  return field;
}

function text(value: DurableJson, label: string): string {
  if (typeof value !== "string") throw new Error(`${label} must be a string.`);
  return value;
}

function numeric(value: DurableJson, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${label} must be a finite number.`);
  return value;
}

function bool(value: DurableJson, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${label} must be a boolean.`);
  return value;
}

function optionalText(value: DurableObject, key: string, label: string): string | undefined {
  const field = value[key];
  return field === undefined ? undefined : text(field, label);
}

function optionalNumber(value: DurableObject, key: string, label: string): number | undefined {
  const field = value[key];
  return field === undefined ? undefined : numeric(field, label);
}

export const booleanCodec: DurableCodec<boolean> = {
  encode: (value) => value,
  decode: (value) => bool(value, "Stored boolean"),
};

export const inventoryItemCodec: DurableCodec<DurableInventoryItem> = {
  encode(item) {
    return {
      ownerId: item.ownerId,
      sku: item.sku,
      quantity: item.quantity,
      ...(item.metadata === undefined ? {} : { metadata: item.metadata }),
      updatedAt: item.updatedAt,
    };
  },
  decode(value) {
    const item = object(value, "Stored inventory item");
    const metadata = item.metadata;
    return {
      ownerId: text(required(item, "ownerId", "Stored inventory item"), "Stored inventory ownerId"),
      sku: text(required(item, "sku", "Stored inventory item"), "Stored inventory sku"),
      quantity: numeric(required(item, "quantity", "Stored inventory item"), "Stored inventory quantity"),
      ...(metadata === undefined ? {} : { metadata: structuredClone(metadata) }),
      updatedAt: numeric(required(item, "updatedAt", "Stored inventory item"), "Stored inventory updatedAt"),
    };
  },
};

export const balanceCodec: DurableCodec<DurableBalance> = {
  encode: (value) => ({ ...value }),
  decode(value) {
    const balance = object(value, "Stored balance");
    return {
      ownerId: text(required(balance, "ownerId", "Stored balance"), "Stored balance ownerId"),
      currency: text(required(balance, "currency", "Stored balance"), "Stored balance currency"),
      amount: numeric(required(balance, "amount", "Stored balance"), "Stored balance amount"),
      updatedAt: numeric(required(balance, "updatedAt", "Stored balance"), "Stored balance updatedAt"),
    };
  },
};

export const guildCodec: DurableCodec<DurableGuild> = {
  encode: (value) => ({ ...value }),
  decode(value) {
    const guild = object(value, "Stored guild");
    return {
      id: text(required(guild, "id", "Stored guild"), "Stored guild id"),
      name: text(required(guild, "name", "Stored guild"), "Stored guild name"),
      ownerId: text(required(guild, "ownerId", "Stored guild"), "Stored guild ownerId"),
      createdAt: numeric(required(guild, "createdAt", "Stored guild"), "Stored guild createdAt"),
      memberCount: numeric(required(guild, "memberCount", "Stored guild"), "Stored guild memberCount"),
    };
  },
};

export const guildMemberCodec: DurableCodec<DurableGuildMember> = {
  encode: (value) => ({ ...value }),
  decode(value) {
    const member = object(value, "Stored guild member");
    const role = text(required(member, "role", "Stored guild member"), "Stored guild member role");
    if (role !== "owner" && role !== "member") throw new Error("Stored guild member role is invalid.");
    return {
      guildId: text(required(member, "guildId", "Stored guild member"), "Stored guild member guildId"),
      accountId: text(required(member, "accountId", "Stored guild member"), "Stored guild member accountId"),
      role,
      joinedAt: numeric(required(member, "joinedAt", "Stored guild member"), "Stored guild member joinedAt"),
    };
  },
};

export const moderationActionCodec: DurableCodec<DurableModerationAction> = {
  encode(value) {
    return {
      id: value.id,
      targetId: value.targetId,
      moderatorId: value.moderatorId,
      kind: value.kind,
      ...(value.reason === undefined ? {} : { reason: value.reason }),
      createdAt: value.createdAt,
      ...(value.expiresAt === undefined ? {} : { expiresAt: value.expiresAt }),
      ...(value.revokedAt === undefined ? {} : { revokedAt: value.revokedAt }),
    };
  },
  decode(value) {
    const action = object(value, "Stored moderation action");
    const kind = text(required(action, "kind", "Stored moderation action"), "Stored moderation kind");
    if (kind !== "mute" && kind !== "kick" && kind !== "ban" && kind !== "warn") throw new Error("Stored moderation kind is invalid.");
    const reason = optionalText(action, "reason", "Stored moderation reason");
    const expiresAt = optionalNumber(action, "expiresAt", "Stored moderation expiresAt");
    const revokedAt = optionalNumber(action, "revokedAt", "Stored moderation revokedAt");
    return {
      id: text(required(action, "id", "Stored moderation action"), "Stored moderation id"),
      targetId: text(required(action, "targetId", "Stored moderation action"), "Stored moderation targetId"),
      moderatorId: text(required(action, "moderatorId", "Stored moderation action"), "Stored moderation moderatorId"),
      kind,
      ...(reason === undefined ? {} : { reason }),
      createdAt: numeric(required(action, "createdAt", "Stored moderation action"), "Stored moderation createdAt"),
      ...(expiresAt === undefined ? {} : { expiresAt }),
      ...(revokedAt === undefined ? {} : { revokedAt }),
    };
  },
};

export const chatMessageCodec: DurableCodec<DurableChatMessage> = {
  encode: (value) => ({ ...value }),
  decode(value) {
    const message = object(value, "Stored chat message");
    return {
      id: text(required(message, "id", "Stored chat message"), "Stored chat id"),
      channelId: text(required(message, "channelId", "Stored chat message"), "Stored chat channelId"),
      senderId: text(required(message, "senderId", "Stored chat message"), "Stored chat senderId"),
      text: text(required(message, "text", "Stored chat message"), "Stored chat text"),
      createdAt: numeric(required(message, "createdAt", "Stored chat message"), "Stored chat createdAt"),
    };
  },
};

export const auditRecordCodec: DurableCodec<DurableAuditRecord> = {
  encode(value) {
    return {
      id: value.id,
      at: value.at,
      actorId: value.actorId,
      operation: value.operation,
      subjectId: value.subjectId,
      ...(value.idempotencyKey === undefined ? {} : { idempotencyKey: value.idempotencyKey }),
      details: value.details,
    };
  },
  decode(value) {
    const audit = object(value, "Stored audit record");
    const idempotencyKey = optionalText(audit, "idempotencyKey", "Stored audit idempotencyKey");
    return {
      id: text(required(audit, "id", "Stored audit record"), "Stored audit id"),
      at: numeric(required(audit, "at", "Stored audit record"), "Stored audit timestamp"),
      actorId: text(required(audit, "actorId", "Stored audit record"), "Stored audit actorId"),
      operation: text(required(audit, "operation", "Stored audit record"), "Stored audit operation"),
      subjectId: text(required(audit, "subjectId", "Stored audit record"), "Stored audit subjectId"),
      ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
      details: structuredClone(required(audit, "details", "Stored audit record")),
    };
  },
};

export const transferResultCodec: DurableCodec<TransferResult> = {
  encode(value) {
    return {
      ok: value.ok,
      ...(value.reason === undefined ? {} : { reason: value.reason }),
      ...(value.fromBalance === undefined ? {} : { fromBalance: value.fromBalance }),
      ...(value.toBalance === undefined ? {} : { toBalance: value.toBalance }),
    };
  },
  decode(value) {
    const result = object(value, "Stored transfer result");
    const reason = optionalText(result, "reason", "Stored transfer reason");
    const fromBalance = optionalNumber(result, "fromBalance", "Stored transfer fromBalance");
    const toBalance = optionalNumber(result, "toBalance", "Stored transfer toBalance");
    return {
      ok: bool(required(result, "ok", "Stored transfer result"), "Stored transfer status"),
      ...(reason === undefined ? {} : { reason }),
      ...(fromBalance === undefined ? {} : { fromBalance }),
      ...(toBalance === undefined ? {} : { toBalance }),
    };
  },
};

export const claimResultCodec: DurableCodec<ClaimResult> = {
  encode(value) {
    return {
      ok: value.ok,
      ...(value.reason === undefined ? {} : { reason: value.reason }),
      ...(value.roomId === undefined ? {} : { roomId: value.roomId }),
      ...(value.ticketId === undefined ? {} : { ticketId: value.ticketId }),
    };
  },
  decode(value) {
    const result = object(value, "Stored claim result");
    const reason = optionalText(result, "reason", "Stored claim reason");
    const roomId = optionalText(result, "roomId", "Stored claim roomId");
    const ticketId = optionalText(result, "ticketId", "Stored claim ticketId");
    return {
      ok: bool(required(result, "ok", "Stored claim result"), "Stored claim status"),
      ...(reason === undefined ? {} : { reason }),
      ...(roomId === undefined ? {} : { roomId }),
      ...(ticketId === undefined ? {} : { ticketId }),
    };
  },
};

export const matchmakingTicketCodec: DurableCodec<MatchmakingTicket> = {
  encode(ticket): DurableJson {
    const base = {
      id: ticket.id,
      playerId: ticket.playerId,
      queue: ticket.queue,
      state: ticket.state,
      createdAt: ticket.createdAt,
      expiresAt: ticket.expiresAt,
      attributes: ticket.attributes,
    };
    if (ticket.state === "matched") {
      return { ...base, handoff: { roomId: ticket.handoff.roomId, token: ticket.handoff.token, expiresAt: ticket.handoff.expiresAt } };
    }
    if (ticket.state === "claimed") {
      return { ...base, handoff: { roomId: ticket.handoff.roomId, token: ticket.handoff.token, expiresAt: ticket.handoff.expiresAt, claimedAt: ticket.handoff.claimedAt } };
    }
    return base;
  },
  decode(value) {
    const ticket = object(value, "Stored matchmaking ticket");
    const base = {
      id: text(required(ticket, "id", "Stored matchmaking ticket"), "Stored ticket id"),
      playerId: text(required(ticket, "playerId", "Stored matchmaking ticket"), "Stored ticket playerId"),
      queue: text(required(ticket, "queue", "Stored matchmaking ticket"), "Stored ticket queue"),
      createdAt: numeric(required(ticket, "createdAt", "Stored matchmaking ticket"), "Stored ticket createdAt"),
      expiresAt: numeric(required(ticket, "expiresAt", "Stored matchmaking ticket"), "Stored ticket expiresAt"),
      attributes: structuredClone(object(required(ticket, "attributes", "Stored matchmaking ticket"), "Stored ticket attributes")),
    };
    const state = text(required(ticket, "state", "Stored matchmaking ticket"), "Stored ticket state");
    if (state === "waiting" || state === "cancelled" || state === "expired") return { ...base, state };
    if (state !== "matched" && state !== "claimed") throw new Error("Stored ticket state is invalid.");
    const handoff = object(required(ticket, "handoff", "Stored matchmaking ticket"), "Stored ticket handoff");
    const commonHandoff = {
      roomId: text(required(handoff, "roomId", "Stored ticket handoff"), "Stored handoff roomId"),
      token: text(required(handoff, "token", "Stored ticket handoff"), "Stored handoff token"),
      expiresAt: numeric(required(handoff, "expiresAt", "Stored ticket handoff"), "Stored handoff expiresAt"),
    };
    if (state === "matched") return { ...base, state, handoff: commonHandoff };
    return {
      ...base,
      state,
      handoff: {
        ...commonHandoff,
        claimedAt: numeric(required(handoff, "claimedAt", "Stored ticket handoff"), "Stored handoff claimedAt"),
      },
    };
  },
};
