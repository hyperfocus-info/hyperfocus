# PostgreSQL host storage

The Railway host supplies one Bun `SQL` PostgreSQL pool. These adapters borrow
it; their `close()` methods reject subsequent operations without closing the
shared pool. The host closes the pool after stopping its services.

- `await createPostgresPersistenceAdapter({ sql, ...limits })` implements the
  portable player/room/event adapter, including atomic snapshot replacement.
  Its `tod_players`, `tod_rooms` and `tod_events` tables preserve the engine's
  JSON validation and record/backup limits. An advisory transaction lock makes
  count limits, writes and exports consistent across concurrent host processes.
- `await createPostgresDurableServiceStore({ sql, maxRecords?, maxBytes? })`
  implements the synchronous durable-service callback contract with PostgreSQL
  transactions. It locks, loads a detached record workspace, runs the callback,
  then commits only changed/deleted records. Sequence increments share the same
  transaction and rollback. Promise-returning callbacks reject. Atomic restores
  also validate cross-record domain integrity before replacing data.
- `createPostgresModerationIndex({ sql })` asynchronously pages only upload-owner
  or upload-reporter IDs. All identity/cursor values are bound SQL parameters.

The durable bridge reads its bounded collection for every service transaction,
including reads. Defaults are 100,000 records and 64 MiB; this is a simple
single-host demo baseline, not a high-volume MMO storage design. PostgreSQL
serialization prevents lost database updates but does not turn in-process room
membership into a multi-host relay. If measured service volume warrants it,
replace the engine's synchronous callback contract with asynchronous keyed
queries before increasing these limits. Account pictures/profile records stay
in the keyed portable adapter and are not loaded by the durable bridge.

Run the live integration test against a PostgreSQL service using a local file
containing its connection URL (the value is never printed):

```powershell
$env:TOD_POSTGRES_TEST_URL_FILE = 'C:\private\postgres-url.secret'
bun.cmd test packages/engine/examples/touch-of-death/host/postgres/adapters.test.ts
```

Without that variable the integration test is skipped. With it, the test creates
and removes its own random schema; it never modifies existing host tables. It
checks concurrent capacity enforcement, rollback, reopen, atomic replacement,
cross-pool sequence increments, synchronous callback enforcement, bounded scans,
moderation isolation and borrowed-pool ownership. The test passed against the
configured Railway PostgreSQL 18.6 service on September 27, 2026 (22 assertions).
