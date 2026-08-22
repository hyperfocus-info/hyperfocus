import { describe, expect, test } from "bun:test";
import { withWebsocketCompression } from "./websocket-compression";

describe("websocket compression", () => {
  test("preserves handlers and enables per-message deflate", () => {
    const open = () => undefined;
    const options = withWebsocketCompression({ open });

    expect(options.open).toBe(open);
    expect(options.perMessageDeflate).toBe(true);
  });
});
