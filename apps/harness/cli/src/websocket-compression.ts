/** Enables RFC 7692 compression without changing websocket lifecycle handlers. */
export function withWebsocketCompression<T extends object>(options: T) {
  return {
    ...options,
    perMessageDeflate: true as const
  };
}
