# Player profiles

`createProfileService({ persistence, catalog, rewards })` stores a name, free icon and
authored appearance selections under `tod-profile:<authenticated userId>`.
`read({ userId })` and `save({ userId, command })` return detached public profiles.
Room adapters supply the authenticated identity; commands cannot select a user.

`withRoomProfiles` takes the host's complete composed snapshot `schema`; its callers
use the canonical community, Quick Play, training or profile combat schema.

Non-default get-ups require the authenticated host reward collection. The relay
supplies the same SQLite/PostgreSQL rewards service used by the Rewards dialog;
profile saves reject unowned get-ups before committing. First-visit imports keep
the device outfit but fall back to free Stand up if its get-up is not owned on
this host. Previous free wardrobe slots are unaffected.

New UUID guest identities start as `Guest 224178B6` (the first eight UUID digits,
uppercase), rather than sharing the name `Player`. The default is stable across
reloads and host restart without a write. It is a display name, not an identity
or uniqueness guarantee; room duplicate-name handling still distinguishes accounts.
Saved names, including an explicitly saved `Player`, are never replaced. Other
identity formats retain the existing default. Players can choose their own name
through the existing profile editor.

Admission may include an explicitly saved local `initialProfile` (name, icon and
authored selections). `initialize({ userId, appearance })` validates that look,
then creates revision 1 only if the authenticated account still has revision 0.
Concurrent joins and retries preserve the first committed profile; existing
online profiles are never replaced. The write completes before the room's join
hook, and storage failure rejects admission without occupying a fighter seat.
Hosts without an appearance catalog reject initial profiles. Missing initial
profiles retain the ordinary guest default without writing storage.

Use one shared service owner across rooms. Writes are serialized and publish only
after storage succeeds. Revision checks reject stale edits. The last 64 request
receipts survive restart and return the original result for exact retries;
conflicting reuse rejects. Older retries fail their stale revision check. Reads
reload storage, so uncertain committed writes can be retried without duplication.
There is no cross-process compare-and-swap guarantee.

Names contain 1–24 Unicode code points after trimming and NFC normalization, with
control, format and surrogate characters rejected. Render names as text. Icons
are free fixed IDs. Selections name only authored catalog slots/options; they do
not alter project data or combat. Empty selections use catalog defaults. Invalid
stored records fail closed; catalog removal requires an explicit migration.

The local host shares this service across community, Quick Play and its app-owned
private relay wrapper. Authenticated `profile-save` events produce recipient-only
receipts and bounded binary profile/binding metadata. Room admission versions
track the shared profile metadata and first-visit initialization contract. Projects
without a catalog emit empty metadata and retain their ordinary combat behavior.
Live profile caches release on disconnect/disposal; battle appearances freeze
until the battle ends. Saves are rejected during ready/fighting phases. Private
bouts begin when the second fighter joins, so upload before then or use a
community/Quick Play lobby first.

The browser connection waits for a matching durable receipt before resolving
`saveProfile`; disconnects and a ten-second timeout preserve explicit retry.
First-visit initialization carries only a local look the player explicitly saved;
later changes use the ordinary durable save receipt. This adds no public
authentication, entitlements or purchases. Replays still use their existing
combat recording format and do not capture profile metadata.

Run `bun test packages/engine/examples/touch-of-death/host/profiles packages/engine/examples/touch-of-death/src/appearance/profile.test.ts`
for persistence, concurrent editing, malformed input and binary protocol coverage.

Private relay admission requires the current `profileProtocolVersion`, including catalog-free hosts. Missing legacy JavaScript image metadata normalizes to disabled; malformed capability data rejects. Enabled private rooms share current fighters images with authenticated fighters/spectators using [the existing upload service](../uploads/README.md); no profile or image changes combat permissions.

Private profile and shared-training protocol 4 require current exports. Appearance
selections now allow 24 entries for the 17-slot catalog; version-3 decoders reject
metadata above their 16-entry bound. The relay rejects those peers before admission.
