import type { AuthAdapter, AuthResult } from "./types.ts";

export function createDevAuthAdapter(): AuthAdapter {
  return {
    async verify(token: string): Promise<AuthResult> {
      if (!token.startsWith("dev:")) return { ok: false, reason: "dev token must start with dev:" };
      const userId = token.slice(4);
      if (!userId.trim()) return { ok: false, reason: "dev token missing user id" };
      return { ok: true, userId, sessionId: `session:${userId}` };
    },
    async refresh(sessionId: string): Promise<AuthResult> {
      if (!sessionId.startsWith("session:")) return { ok: false, reason: "unknown session" };
      const userId = sessionId.slice("session:".length);
      if (!userId.trim()) return { ok: false, reason: "session missing user id" };
      return { ok: true, userId, sessionId };
    }
  };
}
