# Shared training room

`createTrainingRoom({ contentId, seed, allowedActions, profiles?, now?, proposalTimeoutMs? })`
owns two authenticated human seats on one `tod-training` socket. Register this
RoomType beside the existing local rooms. Admission requires matching `contentId`,
`trainingVersion: 4` and `role: 'fighter'`. Version 4 expands cosmetic selections
to 24 entries; older peers are rejected before they can receive the 17-slot
wardrobe. The host's existing binary input codec
is reused. There are no ratings, winner claims or durable lobby records.

The second human starts a fresh attempt. Either partner can propose reset or swap;
the other must accept within 15 seconds by default. Either can decline. Requests
are bound to the current attempt and authenticated proposer connection. Acceptance
creates a new child relay with frame zero, a new match ID and the same seed; swap
reverses both authenticated seats. Old inputs cannot affect the new attempt.
Disconnect cancels consent and interrupts play. Joining with a new partner starts
a new attempt. Host restart does not resume practice history.

The client validates `training.mode`, then explicitly constructs its network
session with `mode: 'training'`. The engine owns practice rules and training replay
identity; this host never sets health, stun, positions or simulation outcomes.
Monotonic `training.revision` fences stale lifecycle snapshots. The ordinary
profile wrapper freezes appearance during an attempt. Chat is not mounted here.

Integration: add `createTrainingRoom({ contentId, seed, allowedActions, profiles })`
to the local relay's room list and advertise `roomType: 'tod-training'` plus
`trainingVersion: 1`. Use `trainingRoomSnapshotSchema` for the client. Keep local
development tokens explicitly local; this does not add public authentication.

Run `bun test packages/engine/examples/touch-of-death/host/training packages/engine/examples/touch-of-death/src/training/protocol.test.ts`.

Training protocol2 includes explicit roomImages capability and durable block feedback. The local relay enables shared unreviewed prints/emblems using the existing upload service. Partners may change cosmetic equipment during practice; reset/swap changes actor ownership through ordinary authenticated seats. Recovery keeps membership, terminal departure revokes it. See [image service](../uploads/README.md) for privacy, moderation and limits.
