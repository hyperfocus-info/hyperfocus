# Panel state and editor lifetimes

Panel contexts carry stable accessors and commands from their mounted owner.
Assistants, chat, project navigation, notifications, jobs, trace and IDE surfaces
create their resources once per mount; the provider does not create a second
store. Consumers track the fields they read. Reusable controls retain their
explicit value/event APIs, and collection rows receive their entity identity.
Detached Preferences detail roots explicitly install the same panel provider.

| Editor or surface | Identity and reset | Shared updates and pending work |
| --- | --- | --- |
| Assistant dialog | The open `assistantEditorDraft`, including assistant ID or create intent. Independent field signals reseed when the owner opens/replaces the draft. | Reads the latest saved assistant when constructing the command. Save dispatch is synchronous; this dialog does not establish persistence acknowledgement. |
| Background job dialog | Open editor draft: project, job/create intent and optional promoted run. Independent field signals seed from that draft under `untrack`. | Schedule preview has a cancelled 250 ms timer and request-ID matching. Save waits for the matching persistence result; rejection preserves fields and retry identity. An unrelated or older editor acknowledgement cannot close a new draft. |
| Custom mode editor | Store journal owner plus scope and draft key; selected mode/create intent is local. Project hosts key the mount by project ID; workspace Preferences uses its store owner and workspace key. | Dirty drafts survive shared list refresh. Removed modes surface a retained-draft warning. The journal retains the draft and pending save across unmount; scope/project switches have separate keys. The draft is an atomic save/journal snapshot. |
| IDE editor | Workbench project and active file path. The editor model resets its draft snapshot when the path/source changes. | The IDE store owns project/request epochs and dirty content; stale reads and old save acknowledgements cannot overwrite newer work. Scroll coordinates and the path/text/source snapshot are atomic. Hover timers dispose with the editor. |
| Notification response forms | Inbox mount plus notification/question ID. Drafts are keyed dictionaries rather than entity snapshots in each row. | Forms read current notification status and the inbox's commands at use. The column's reusable question-answer API has its own scoped provider for row actions. |
| Preference theme and keybind editors | Mounted Preferences model; detached detail roots reuse that model and commands. | Theme tokens and shortcut drafts remain derived from that owner. Re-rendering a section disposes its prior detail root. Provider credentials retain their explicit input/test/save contracts. |
| Swarm request/review dialog | The chat header keys the Launcher by project ID; same-project updates retain it. A new dialog initializes its goal when opened. | Launcher retains the review controller while the dialog is closed and supplies it through a scoped review provider. The dialog unsubscribes without disposing that borrowed controller. Standalone pages create and dispose their own controller. Launcher subscriptions, controller and request abort signal dispose with the launcher; dialog-owned previews revoke object URLs and reject stale artifact results. A closed dialog cannot apply its pending initial-run selection. |
| Guided tutorial | One overlay mount owns canvas, particles, target listeners and timers. Tutorial ID and step index reset interaction evidence and target tracking; the narrow panel context exposes live progress and commands. | Completion stays derived from the caller's workspace goal. Independent overlays cannot advance each other. Step cleanup removes old target listeners and queued target synchronization; overlay disposal cancels animation frames, intervals and bounce timers. |
| Terminal and CLI panes | Resource identity is `(projectId, sessionId)`, keyed inside the actual pane owner. Selection/project switches remount renderer handles and both renderer modes. The unsplit layout passes a live session accessor; same-identity metadata/locks stay reactive. | Resize, stop, restart, attach and capture commands read current metadata. Xterm owns one instance per project/session even when output strings, output versions and reset versions are equal; switching rebuilds buffer, search and selection state. CWD/project-root updates within the same identity stay live, including link activation. |
| Xterm and Solid renderer resources | Xterm's keyed session closure owns terminal/addons, resize observer/frame, copy timer and output counters. Solid's pending clipboard work belongs to its keyed pane mount. Standalone xterm callers can omit project ID only when session IDs are unique in their scope. | Disposed or mismatched xterm identities reject input, keyboard, link, resize, search/serialize handles and late WebGL completion. Pending paste rechecks identity/disposal and the latest input lock. Cleanup disconnects observers, clears timers/frames and disposes terminal/addons. Solid also rejects paste after unmount or a new lock. |
| Project switcher | Mounted dialog and current query/request identity. | Query timers and document handlers dispose with the dialog. Search results remain owned by their request. Project/thread row snapshots are rendered beneath the virtual list's keyed item boundary. |
| Trace run actions and history | The selected trace's `(projectId, threadId, runId)`, including an inactive thread selected in Runs. Availability, dispatch and terminal history use that tuple and its transcript. | Retry requires the selected thread to be active and explains when it is inactive; it never substitutes the project's active thread. Global execution pause and streaming guards remain live. Approval actions validate the selected run's pending session/tool call. Terminal history hides responses for another project, thread or run. |

Existing behavior evidence lives in `components/visual-review/batch5/tasks.test.tsx`,
`components/visual-review/batch8/tasks.test.tsx`, `ide/ide-store.test.ts`,
`components/swarm/swarm-launcher.test.tsx`, `components/notification-inbox.test.tsx`
and the affected panel tests. `components/tutorial-overlay.test.tsx` proves
live progress, command replacement and independent scopes. `terminal/terminal-drawer.test.tsx`
proves real pane selection/remounts, same-session lock updates and CLI command identity;
`terminal/renderers/xterm-renderer.test.tsx` exercises the real Solid resource owner
with foreign xterm constructors replaced, equal-buffer/version switches, input/clipboard
routing, disposal, late callbacks and live CWD activation. The Solid renderer test
also proves clipboard disposal/lock behavior. `project-sidebar.test.tsx` exercises two simultaneous
store providers; `trace-panel.test.tsx` switches project without remounting the run
card and checks both retry availability and its command target.
`trace-panel/action-target.test.tsx` covers active A versus selected inactive B in one
project, run/subagent commands, approval identity and late terminal-history scopes
using intercepted commands without a server or PTY.

Question/stream timestamps and notification response dictionaries remain object
signals because their keys identify independent entities. Overlay geometry, terminal
drag coordinates and IDE snapshots remain atomic. This review establishes no
performance improvement: no state primitive or cache policy was changed.
