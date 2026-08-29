# MMO Field

Small authoritative-room example for `@hyperfocus/engine/server`.

The example keeps scope intentionally narrow: one Bun WebSocket server, one room type, bot-friendly movement inputs, AOI-friendly entity positions, and a stats endpoint. It demonstrates the MMO-ish path without claiming full MMO platform coverage.

Run:

```bash
bun run example:mmo-field
```

The command builds the typed client and serves it from the authoritative server at `http://localhost:8788/`.

Useful endpoints:

- `/healthz`
- `/stats.json`

Limits:

- Dev auth tokens use `dev:<userId>`.
- Persistence is in-memory.
- No global account, chat, economy, or cross-process shard handoff.
