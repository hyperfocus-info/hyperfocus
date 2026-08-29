import { createAuthoritativeServer, type AuthoritativeServerOptions } from "../server.ts";

export function createWebSocketAuthoritativeServer(options: AuthoritativeServerOptions) {
  return createAuthoritativeServer({ ...options, transport: "websocket" });
}
