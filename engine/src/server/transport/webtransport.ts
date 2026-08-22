import { createProtocolMessage, encodeProtocolMessage, parseProtocolMessage, type ProtocolMessage } from "../../protocol/messages.ts";

export type WebTransportLikeDatagrams = {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
};

export type WebTransportLikeSession = {
  datagrams: WebTransportLikeDatagrams;
  close?: (options?: { closeCode?: number; reason?: string }) => void;
};

export type WebTransportMessageAdapter = {
  send(message: ProtocolMessage): Promise<void>;
  read(): Promise<ProtocolMessage | undefined>;
  close(reason?: string): void;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

export function createWebTransportMessageAdapter(session: WebTransportLikeSession): WebTransportMessageAdapter {
  const writer = session.datagrams.writable.getWriter();
  const reader = session.datagrams.readable.getReader();
  let closed = false;

  return {
    async send(message) {
      if (closed) throw new Error("webtransport message adapter is closed");
      await writer.write(encoder.encode(encodeProtocolMessage(message)));
    },
    async read() {
      if (closed) return undefined;
      const result = await reader.read();
      if (result.done) return undefined;
      return parseProtocolMessage(decoder.decode(result.value));
    },
    close(reason = "closed") {
      if (closed) return;
      closed = true;
      try {
        session.close?.({ closeCode: 0, reason });
      } catch {
        // Stream cleanup still runs when the session is already closed.
      }
      const cleanup: Promise<unknown>[] = [];
      try {
        cleanup.push(writer.close());
      } catch {
        // The writer may already have released or errored its lock.
      }
      try {
        cleanup.push(reader.cancel(reason));
      } catch {
        // The reader may already have released or errored its lock.
      }
      void Promise.allSettled(cleanup);
    }
  };
}

export function createWebTransportWelcome(tickRate: number) {
  if (!Number.isFinite(tickRate) || tickRate <= 0) throw new RangeError("webtransport tickRate must be a positive finite number");
  return createProtocolMessage("server_welcome", { tickRate, transport: "webtransport" });
}
