import type { AuthAdapter, AuthResult } from "./types.ts";

export type AccountRecord = {
  id: string;
  username: string;
  displayName?: string;
  roles: string[];
  banned?: boolean;
  createdAt: number;
  updatedAt: number;
};

export type AccountBackend = AuthAdapter & {
  createAccount(options: { username: string; password: string; displayName?: string; roles?: readonly string[] }): Promise<AccountRecord>;
  login(username: string, password: string): Promise<AuthResult>;
  getAccount(accountId: string): Promise<AccountRecord | undefined>;
  setBanned(accountId: string, banned: boolean): Promise<boolean>;
};

type StoredAccount = AccountRecord & {
  password: string;
};

export function createMemoryAccountBackend(options: { now?: () => number } = {}): AccountBackend {
  const now = options.now ?? (() => Date.now());
  const accounts = new Map<string, StoredAccount>();
  const byUsername = new Map<string, string>();
  const sessions = new Map<string, string>();
  const revokedSessions = new Map<string, string>();
  let nextAccountId = 1;

  function publicAccount(account: StoredAccount): AccountRecord {
    const { password: _password, ...record } = account;
    return { ...record, roles: [...record.roles] };
  }

  function keyForSession() {
    return `session:${crypto.randomUUID()}`;
  }

  function revokeSessions(accountId: string) {
    for (const [sessionId, sessionAccountId] of sessions) {
      if (sessionAccountId === accountId) {
        sessions.delete(sessionId);
        revokedSessions.set(sessionId, accountId);
      }
    }
  }

  async function verifySession(token: string): Promise<AuthResult> {
    const accountId = sessions.get(token);
    const account = accountId ? accounts.get(accountId) : undefined;
    if (!account) {
      const revokedAccount = accounts.get(revokedSessions.get(token) ?? "");
      if (revokedAccount?.banned) return { ok: false, reason: "account banned" };
      return { ok: false, reason: "unknown session" };
    }
    if (account.banned) return { ok: false, reason: "account banned" };
    return { ok: true, userId: account.id, sessionId: token, claims: { username: account.username, roles: [...account.roles] } };
  }

  return {
    async createAccount(create) {
      const username = create.username.trim().toLowerCase();
      if (!username) throw new Error("username required");
      if (typeof create.password !== "string" || !create.password) throw new Error("password required");
      if (create.roles !== undefined && (!Array.isArray(create.roles) || create.roles.some((role) => typeof role !== "string" || role.trim().length === 0))) {
        throw new Error("account roles must be non-empty strings");
      }
      if (byUsername.has(username)) throw new Error("username already exists");
      const time = now();
      const account: StoredAccount = {
        id: `account-${nextAccountId++}`,
        username,
        displayName: create.displayName,
        roles: [...(create.roles ?? ["player"])],
        createdAt: time,
        updatedAt: time,
        password: create.password
      };
      accounts.set(account.id, account);
      byUsername.set(username, account.id);
      return publicAccount(account);
    },
    async login(username, password) {
      const accountId = byUsername.get(username.trim().toLowerCase());
      const account = accountId ? accounts.get(accountId) : undefined;
      if (!account || account.password !== password) return { ok: false, reason: "invalid credentials" };
      if (account.banned) return { ok: false, reason: "account banned" };
      const sessionId = keyForSession();
      sessions.set(sessionId, account.id);
      return { ok: true, userId: account.id, sessionId, claims: { username: account.username, roles: [...account.roles] } };
    },
    verify(token) {
      return verifySession(token);
    },
    refresh(sessionId) {
      return verifySession(sessionId);
    },
    async getAccount(accountId) {
      const account = accounts.get(accountId);
      return account ? publicAccount(account) : undefined;
    },
    async setBanned(accountId, banned) {
      const account = accounts.get(accountId);
      if (!account) return false;
      account.banned = banned;
      account.updatedAt = now();
      if (banned) revokeSessions(accountId);
      else {
        for (const [sessionId, sessionAccountId] of revokedSessions) {
          if (sessionAccountId === accountId) revokedSessions.delete(sessionId);
        }
      }
      return true;
    }
  };
}
