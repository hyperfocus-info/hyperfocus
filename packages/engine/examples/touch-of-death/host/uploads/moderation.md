# Local image review and reports

The local host owns moderator authority separately from player connections.
The review page is disabled unless `TOUCH_OF_DEATH_MODERATOR_TOKEN` contains a
32–128 character token using letters, digits, `_` or `-`. Configure it in the
host process environment, never in project data, exported HTML, a URL or source
control. `TOUCH_OF_DEATH_REVIEWER_ID` sets the audit identity (default
`local-host`). Restart the managed combat relay after changing either value.

Packaged hosts set `TOUCH_OF_DEATH_MODERATOR_SCRIPT` to the prebuilt
`moderation.js`. This avoids compiling checkout source at startup. A missing or
empty configured script fails startup before opening the database or listening;
the moderator token remains an environment secret and is never packaged.

Open `/moderation` on the relay's returned loopback URL. Enter the token and
choose Connect. Access is verified before the queue is shown. Tokens stay in
page memory and the Authorization header; Disconnect clears them and aborts
requests. The local acceptance fixture keeps its generated token in the ignored
`.local/touch-of-death/uploads-ui/moderator-token.txt`, outside the game project.

1. Load picture owners, select an owner, then load their pictures. Queues use
   bounded keyset pages of twenty accounts. Select a picture and preview it.
2. Approve after inspecting the actual pixels, or reject with an explanation.
   Decisions use the displayed owner revision. A concurrent edit rejects a stale
   decision; refresh before making another decision. Retry repeats the exact
   request after an uncertain response, rather than applying the decision twice.
3. Open Reports, select a reporter and load their reports. View the image using
   the report's actual owner and upload identity. Removed pixels are unavailable;
   reports retain their verified content hash and reason, not an image copy.
4. Resolve a report as Reviewed or Dismissed with an explanation. This does not
   approve or revoke the picture. Take an image decision separately when needed.

Shared pictures are visible immediately while labeled unreviewed. Moderator
approval records review; it is not a prerequisite for sharing or equipping.
Rejection removes pixels and equipped references, then invalidates viewers.
Players can report a currently visible unreviewed or approved picture through its gallery
button and a fixed reason. The host binds reporter, room and image content hash.
Self, blocked, rejected and unknown images reject. Receipts say saved/unreviewed;
there is no claim of staffed moderation or a response deadline. Each reporter
retains at most 64 reports and four new reports per minute. Exact retries survive
revocation. The last 64 compact mutation receipts are durable. Neither reporting
nor resolution changes combat, image approval, ratings or another person's block
preferences. Reports and review state survive SQLite reopen.

The HTTP boundary requires the configured token for every API call, restricts
methods/content types, rejects foreign Origin headers, limits request bodies to
16 KiB and caps authenticated requests at 120 per minute. Responses are no-store;
the page has a restrictive CSP and cannot be framed. Reviewer identity comes from
configuration, never the command body. This is a loopback host tool, not public
moderator account management: public access requires proper identity, HTTPS,
staffing and operational acceptance. These boundaries follow the
[OWASP REST security guidance](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html).

The engine supplies existing persistence and recipient-scoped events. The app
owns this review policy/UI; it is not a creative-editor project mutation. No
project schema or editor command changes are needed for account review.

Run `bun test --conditions=browser packages/engine/examples/touch-of-death/host/uploads
apps/engine-editor/src/scene3d/uploads`. Host HTTP tests also run with
`HARNESS_TEST_SKIP_UI_PRELOAD=1` to exercise native Request headers. The exported
three-browser acceptance script is
`.local/touch-of-death/uploads-ui/moderation-browser.ts`; its result records game
and moderator bundle hashes. It verifies real controls, approval, peer reads,
bilateral block, reporting, resolution, revocation and owner reload/removal.
