# Bounded uploaded rasters

`createUploadService({ persistence, allowView, allowedSlots?, now? })` is a single trusted host
owner. Callers authenticate the owner/viewer separately. `review` is internal
host authority; it must never be exposed as a client-selected moderator action.
The required synchronous `allowView` policy permits or denies available images for
a specific authenticated viewer. There is no anonymous read API or default allow.

`submit`, `remove`, `equip` and `review` use `requestId` and the owner's `expectedRevision`.
They return `{ revision, uploads, equipment }` with metadata only. `list({ ownerId })` is an
owner-facing metadata read. `listForViewer({ ownerId, viewerId, roomId })` applies
the same audience policy and exposes pending and approved metadata with revision zero to
other people. `read({ ownerId, viewerId, uploadId, roomId })` returns detached
validated `{ upload, raster }` or null. Owners can read pending/approved pixels.
Other viewers can read pending and approved images with explicit policy permission.
Pending means not yet reviewed; it does not mean private or human-approved. Rejected
images retain metadata/reason but no pixels. Revocation deletes pixels in the
same write, and subsequent serialized reads cannot return them. Already downloaded
copies cannot be recalled.

`equip({ ownerId, requestId, expectedRevision, slotId, uploadId })` selects an owned,
pending or approved picture for one host-allowlisted slot. An empty `uploadId` unequips it.
The default empty allowlist disables equipment; the copied allowlist accepts at
most 32 unique IDs and a record can equip at most four slots. Equipment references
are cleared in the same durable write as removal or rejection. Viewer lists and
atomic reads expose only equipment whose available picture passes that viewer's
visibility policy. Legacy version-1 records, receipts and wire replies without
equipment normalize to `{}`; the next write stores the normalized record. Exact
receipt retries return their original metadata result, so clients still refresh
on `upload-invalidate` rather than treating a historical receipt as current state.

Only canonical base64 RGBA pixels are accepted: dimensions 1–128, at most 16,384
pixels and exactly four decoded bytes per pixel. No encoded image, MIME, path or
URL is accepted. SHA-256 covers an unambiguous versioned dimension prefix and raw
pixels. Duplicate content for one owner reuses its existing slot and review
state. Each owner retains at most four uploads, identified by server UUIDs.

Versioned records live under `tod-uploads:<ownerId>` using the existing player
record adapter. All mutations serialize, validate, save, then publish; reload on
every operation handles uncertain commits. Last 64 request receipts retain exact
results without retaining pixel copies. Older retries fail stale revisions.
IDs/request IDs are at most 128 UTF-8 bytes and reasons at most 512. Owner limits
are four new images and twenty changes per minute; exact retries do not consume
another slot. Trusted reviews bypass owner rate limits so flooding cannot prevent
revocation. One shared service instance is required; no cross-process CAS is
provided. Removed/rejected pixels are not retained in receipts or audit copies.

`withRoomUploads({ room, uploads, canEquip?, now? })` routes authenticated low-rate commands
and targets replies only to their requesting connection. Mutation ownership and
room identity come from the host context; review is never a network command.
Equipment requests require `canEquip({ ctx, player }) === true`; omission denies
both equip and unequip. The owning room supplies its between-fights rule. This
permission is checked when the command is admitted; hosts should capture fighter
appearance at bout creation if a previously admitted save completes during play.
Reads require the requested owner to remain in the room. Twelve requests per ten
seconds bound each connection. No raster enters combat snapshots. Clients must
clear a blocked person's gallery locally. The wrapper tracks authorized list and raster
readers, including empty lists, and sends targeted `upload-invalidate` events after durable changes,
blocks or owner departure. Clients must discard that owner's cached raster on
receipt. `readWithList` captures pixels and their visible metadata atomically;
the wrapper rejects a read overtaken by an invalidation before publication.
`onChange` observers run after commit (and exact receipt retries); observer failure
cannot turn a committed write into an error. All subscriptions release when the
last wrapped room disposes and restart on the next room admission.

The local host now provides an opt-in [moderator review page and image reports](moderation.md).
Shared unreviewed equipment now renders in community and capability-enabled Quick Play
fights through authored texture targets. Quick Play limits foreign reads to the
current opponent and locks equipment except in idle/result. Public moderator
accounts remain unfinished. Private/training support is described below.
Catalog-enabled hosts also allow the reserved account slot `profile-emblem` for
a pending or approved nameplate image. Every low-rate reply advertises `emblemEnabled` only
when that slot is supported. Unsupported hosts reject equip attempts; absence of
the capability is false. The emblem and authored outfit textures share the same
four-equipment limit, durable revisions, audience policy and invalidations.
Removing or revoking an image clears only equipment referring to that image.
No profile image enters project data or combat snapshots.
Visibility remains an explicit host policy. Run
`bun test packages/engine/examples/touch-of-death/host/uploads` for failure/retry, ownership, bounds,
revocation, concurrent edits and real SQLite reopen coverage.

## Friends and training rooms

Private sets and shared training compose `withFriendsRoomImages` with the same upload/report services. `roomImages` explicitly advertises enabled, viewer-specific blockedUserIds (maximum64) and preference errors. Unsupported hosts publish false, an empty list and an empty error. Authenticated social membership is cleaned on failed admission, terminal leave and disposal, even if room cleanup fails. Recovery preserves membership with the same player ID. Private spectators may view current fighters; training partners may view one another. Unrelated rooms and departed owners are denied.

Equipment changes are cosmetic and allowed continuously in these two modes; the relay does not pretend to know between-round timing. Quick Play retains idle/result restrictions. Pending images are immediately shared and equippable, with existing bilateral blocks, hide, reporting and revocation. No image enters simulation or project data. Private profile admission version 4 and training protocol 4 include image metadata and first-visit profile initialization.
