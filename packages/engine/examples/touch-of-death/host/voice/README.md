# Opt-in room voice

`withRoomVoice({ room, schema, social, reports?, now?, iceServers?, iceTransportPolicy? })` wraps the
community RoomType. Existing authenticated sockets carry strict low-rate voice
intents; targeted transient broadcasts deliver signaling only to the opted-in
destination player/session. SDP and ICE are never sent to room bystanders.

The host supplies its complete composed snapshot schema, including `voiceSnapshotDefinition`.
The wrapper does not assert that an unknown generic schema contains those fields.

Voice has at most eight participants. Joining creates a fresh session ID. Leaving,
disconnecting and reconnecting invalidate old negotiation. Bilateral durable
blocks filter both peer rosters and reject signaling; local mute remains a client
receive preference. The wrapper recomputes visibility after social changes and
on updates. Fighter/spectator rotations do not change voice membership.

Microphones begin muted. `voice-mic` carries its own request ID and acknowledges
the resulting state. The browser must enable capture transmission only after
that acknowledgement and disable immediately on local mute/leave. Last 32 join
and microphone receipts prevent ordinary retries from reopening ended sessions
or re-enabling a superseded microphone grant.

Per connection, ten-second budgets allow 20 join/unmute controls, 120 signaling
messages, eight SDP descriptions and 256 KiB of signaling. SDP is limited to
16 KiB and individual ICE messages to 2 KiB. Leaving and muting remain available
when a budget is exhausted. No media, consent or signaling is persisted;
the host does not capture, relay or record media.

Optional `createVoiceReportService({ persistence, now? })` stores incidents under
`tod-voice-reports:<authenticated reporterId>`. Inject it as `reports` to advertise
`voice.reportingEnabled`; unconfigured hosts advertise false. A report names a
server-observed participant/session and one reason: harassment, hate, threats or
other. Evidence contains only room/user/session identities, request ID, reason
and server timestamp. It contains no audio, SDP, ICE or credentials, and makes no
claim that anyone has reviewed it. Host operations can read detached evidence
with `read({ reporterId })`.

New reports require both current opted-in sessions and a target previously shown
in the reporter's server roster. The last 64 observed participant/session pairs
are retained per connection. Blocking stops media without removing this report
authority; local mute also does not prevent reporting. Departed/replaced targets
cannot receive new reports. An already committed exact retry still acknowledges
after target departure, using durable evidence. Conflicting request IDs reject.
The separate targeted `voice-report-result` acknowledges storage without changing
microphone receipts. Failed writes return a retry error, never success.

One shared service serializes writes across rooms. It retains at most 64 incidents
per reporter, permits four new incidents per minute, and never discards evidence
to make room. The wrapper limits report attempts to 12 per ten seconds separately
from mute/leave controls. Receipts survive SQLite reopen and uncertain committed
writes; the room membership proof is intentionally not restored after restart.

Default ICE configuration is `[]` with policy `all`, suitable for local testing.
Hosts can supply up to four bounded STUN/TURN servers; `relay` requires TURN.
Credentials are sent only to authenticated opted-in recipients, never embedded
in the export. Public deployment still requires actual ICE infrastructure and
production authentication. Static host credentials are supported; ephemeral TURN
credential issuance is not implemented here.

Run `bun test packages/engine/examples/touch-of-death/host/voice packages/engine/examples/touch-of-death/src/network/voice/protocol.test.ts`.
