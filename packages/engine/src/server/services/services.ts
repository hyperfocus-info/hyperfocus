export type InventoryItem = {
  id: string;
  sku: string;
  quantity: number;
  metadata?: unknown;
};

export type EconomyAccount = {
  ownerId: string;
  balances: Record<string, number>;
};

export type GuildRecord = {
  id: string;
  name: string;
  ownerId: string;
  members: string[];
};

export type ChatMessage = {
  id: string;
  channelId: string;
  senderId: string;
  text: string;
  createdAt: number;
  moderated?: boolean;
};

export type ModerationAction = {
  id: string;
  targetId: string;
  moderatorId: string;
  kind: "mute" | "kick" | "ban" | "warn";
  reason?: string;
  createdAt: number;
};

export type MmoGameplayServices = {
  inventory: {
    grant(ownerId: string, sku: string, quantity?: number, metadata?: unknown): InventoryItem;
    consume(ownerId: string, sku: string, quantity?: number): boolean;
    list(ownerId: string): InventoryItem[];
  };
  economy: {
    credit(ownerId: string, currency: string, amount: number): EconomyAccount;
    debit(ownerId: string, currency: string, amount: number): boolean;
    transfer(fromId: string, toId: string, currency: string, amount: number): boolean;
    balance(ownerId: string, currency: string): number;
  };
  guilds: {
    create(name: string, ownerId: string): GuildRecord;
    join(guildId: string, accountId: string): boolean;
    leave(guildId: string, accountId: string): boolean;
    get(guildId: string): GuildRecord | undefined;
  };
  moderation: {
    record(action: Omit<ModerationAction, "id" | "createdAt">): ModerationAction;
    isBanned(targetId: string): boolean;
    list(targetId?: string): ModerationAction[];
  };
  chat: {
    send(channelId: string, senderId: string, text: string): ChatMessage;
    history(channelId: string, limit?: number): ChatMessage[];
  };
};

export function createMmoGameplayServices(options: { now?: () => number; maxChatMessageLength?: number } = {}): MmoGameplayServices {
  const now = options.now ?? (() => Date.now());
  const inventory = new Map<string, InventoryItem[]>();
  const wallets = new Map<string, EconomyAccount>();
  const guilds = new Map<string, GuildRecord>();
  const moderation: ModerationAction[] = [];
  const messages = new Map<string, ChatMessage[]>();
  let nextItemId = 1;
  let nextGuildId = 1;
  let nextActionId = 1;
  let nextMessageId = 1;

  function wallet(ownerId: string) {
    let account = wallets.get(ownerId);
    if (!account) {
      account = { ownerId, balances: {} };
      wallets.set(ownerId, account);
    }
    return account;
  }

  function copyGuild(guild: GuildRecord): GuildRecord {
    return { ...guild, members: [...guild.members] };
  }

  return {
    inventory: {
      grant(ownerId, sku, quantity = 1, metadata) {
        if (quantity <= 0) throw new Error("quantity must be positive");
        const items = inventory.get(ownerId) ?? [];
        const existing = items.find((item) => item.sku === sku && item.metadata === metadata);
        if (existing) {
          existing.quantity += quantity;
          return { ...existing };
        }
        const item = { id: `item-${nextItemId++}`, sku, quantity, metadata };
        items.push(item);
        inventory.set(ownerId, items);
        return { ...item };
      },
      consume(ownerId, sku, quantity = 1) {
        if (quantity <= 0) return false;
        const items = inventory.get(ownerId) ?? [];
        const item = items.find((entry) => entry.sku === sku);
        if (!item || item.quantity < quantity) return false;
        item.quantity -= quantity;
        if (item.quantity === 0) items.splice(items.indexOf(item), 1);
        return true;
      },
      list(ownerId) {
        return (inventory.get(ownerId) ?? []).map((item) => ({ ...item }));
      }
    },
    economy: {
      credit(ownerId, currency, amount) {
        if (amount <= 0) throw new Error("amount must be positive");
        const account = wallet(ownerId);
        account.balances[currency] = (account.balances[currency] ?? 0) + amount;
        return { ownerId, balances: { ...account.balances } };
      },
      debit(ownerId, currency, amount) {
        if (amount <= 0) return false;
        const account = wallet(ownerId);
        if ((account.balances[currency] ?? 0) < amount) return false;
        account.balances[currency] -= amount;
        return true;
      },
      transfer(fromId, toId, currency, amount) {
        if (!this.debit(fromId, currency, amount)) return false;
        this.credit(toId, currency, amount);
        return true;
      },
      balance(ownerId, currency) {
        return wallet(ownerId).balances[currency] ?? 0;
      }
    },
    guilds: {
      create(name, ownerId) {
        const guild = { id: `guild-${nextGuildId++}`, name, ownerId, members: [ownerId] };
        guilds.set(guild.id, guild);
        return copyGuild(guild);
      },
      join(guildId, accountId) {
        const guild = guilds.get(guildId);
        if (!guild || guild.members.includes(accountId)) return false;
        guild.members.push(accountId);
        return true;
      },
      leave(guildId, accountId) {
        const guild = guilds.get(guildId);
        if (!guild || guild.ownerId === accountId) return false;
        const index = guild.members.indexOf(accountId);
        if (index < 0) return false;
        guild.members.splice(index, 1);
        return true;
      },
      get(guildId) {
        const guild = guilds.get(guildId);
        return guild ? copyGuild(guild) : undefined;
      }
    },
    moderation: {
      record(action) {
        const saved = { ...action, id: `moderation-${nextActionId++}`, createdAt: now() };
        moderation.push(saved);
        return { ...saved };
      },
      isBanned(targetId) {
        return moderation.some((action) => action.targetId === targetId && action.kind === "ban");
      },
      list(targetId) {
        return moderation.filter((action) => !targetId || action.targetId === targetId).map((action) => ({ ...action }));
      }
    },
    chat: {
      send(channelId, senderId, text) {
        const cleanText = text.trim().slice(0, options.maxChatMessageLength ?? 500);
        const message = {
          id: `chat-${nextMessageId++}`,
          channelId,
          senderId,
          text: cleanText,
          createdAt: now(),
          moderated: cleanText.length === 0
        };
        const channel = messages.get(channelId) ?? [];
        channel.push(message);
        messages.set(channelId, channel);
        return { ...message };
      },
      history(channelId, limit = 50) {
        return (messages.get(channelId) ?? []).slice(-limit).map((message) => ({ ...message }));
      }
    }
  };
}
