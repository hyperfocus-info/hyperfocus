# Next 25 surfaces — second batch

This batch continues [the previous 25](next25-surfaces.md). Each row is an
existing task boundary, not a count of edited controls. Screenshots are review
evidence, not user approval. The [debt inventory](design-debt.md) owns open work.

| # | Surface | Repeated failure / existing owner |
| --- | --- | --- |
| 1 | Harness command bar | Redundant identity and boxed status consume the task viewport; app chrome and ConnectionBanner |
| 2 | IDE project search | Clipped paths, inert Replace and indistinguishable empty states; GlobalSearchView and existing Button |
| 3 | Terminal sessions | Double-click-only rename, clipped names and tiny close targets; TerminalTabs |
| 4 | Terminal output search | Fixed input competes with navigation buttons; terminal control styles shared with session management |
| 5 | Chat planner answers | Choice names/descriptions clipped; existing Button and bounded question scroll |
| 6 | Composer attachment review | Filename and removal control exceed narrow container; composer sections |
| 7 | Composer file/skill lookup | Hidden destination paths and raw selection targets; existing Button |
| 8 | Experiment diff review | Split width tied to viewport; selected path clipped; experiment dialog |
| 9 | Chat Run result/recovery | Status trivia precedes actionable outcome; transcript Run view |
| 10 | Chat Events history | Unbounded stage/model heading; transcript Events view |
| 11 | Git preflight recovery | Init label hides automatic commit; setup dialog |
| 12 | Website section ordering | Boundary movement appears available; inspector position/disabled state |
| 13 | Website page appearance | Missing persistent labels and mixed settings scope; SelectControl/Disclosure |
| 14 | Member owner setup | Remote error and stale success; local OwnerSetup |
| 15 | Commerce preview owner | Same retry failure in a second consumer; same OwnerSetup |
| 16 | Official image review | Disabled import has no remaining-work explanation; media review |
| 17 | Media library | Empty disclosure has no next action; shared Disclosure |
| 18 | Individual product editing | Empty selector and undifferentiated specialist fields; shared Disclosure |
| 19 | Module preset management | Save competes with secondary/destructive actions; FxPresetManageModal |
| 20 | Chain preset management | Existing manager lacks active-rack entry; same manager |
| 21 | Compact preset import | Generic action and disconnected invalid feedback; compact import |
| 22 | FX node deep editor | Pointer-only discovery and empty description; active rack/editor |
| 23 | Marketplace Module detail | Weak return/recovery navigation; detail view |
| 24 | Marketplace upload preparation | Publishing decision competes with drafting; upload view/Modal footer |
| 25 | Marketplace account/membership | Account context and purchase choices poorly grouped; account view |

## Scoped similarity searches and evidence

- [Harness chat tasks](next25-batch2-harness.md)
- [Website editing tasks](next25-batch2-editor.md)
- [PadPilot and Marketplace tasks](next25-batch2-padpilot.md)
- Root four: [before report](../../.local/design-system/evidence/next25-batch2-root/before/report.json)
  and [after report](../../.local/design-system/evidence/next25-batch2-root/after/report.json).

The root scan covered `GlobalSearchView`, IDE find/replace call sites,
`TerminalSearch`, `TerminalTabs`, `terminalControlStyles`, terminal close/rename
callbacks, app header, HeaderActions, ConnectionBanner and NotificationInbox.
The same ActionButton/Button defaults already serve these tasks; no new public
primitive is needed. Terminal input/action targets share local geometry because
both existing tasks failed when controls competed for reading width. Selection
now uses the semantic selection surface rather than accent behind muted text.

The IDE search removes the nonfunctional Replace affordance; its existing
controller fields remain compatible. Idle, loading and completed-empty states
are distinct. Search options expose pressed state. Results retain full paths and
line destinations. Terminal rename has a visible keyboard-reachable action;
Escape cancels without a blur-triggered save.

Short-height review found a shared-owner defect: Popover's `14rem` minimum and
ActionMenu's `12rem` minimum exceeded a 390px viewport at 200% text. Popup minimum,
maximum and scroll bounds now follow the viewport; menu labels wrap in explicit
icon/label/shortcut columns. Current consumers include Harness workspace actions,
Editor Project Home file actions and the shared showcase. The
[preserved failure](../../.local/design-system/evidence/next25-batch2-root/before/command-menu-overflow-scaled.png)
and [corrected menu](../../.local/design-system/evidence/next25-batch2-root/after/command-bar-short-menu.png)
are checked with actual popup bounds, keyboard return and pointer reachability.
No new variant or public component was added.

## Replay and boundary

```powershell
bun apps/harness/ui/src/components/chat-panel.browser-build.ts .local/design-system/batch2-root-after apps/harness/ui/src/ide/visual-review/batch2-fixture.tsx
bun apps/harness/scripts/build-ui.ts
bun packages/ui/scripts/design-system/next25-batch2/capture.ts
```

The root matrix uses 1440, 820, 390 and 390px/200% root text. Header evidence uses
the managed app with intercepted workspace events; IDE and terminal evidence uses
production components with disposable callbacks. No terminal, account, provider,
publication or filesystem operation is issued by the fixtures. Native PadPilot
acceptance remains separate. Final integration results follow.

## Integration results

- Harness existing app/IDE/terminal tests: 67 pass / 196 assertions.
- Chat/attachments, Markdown and eight focused search/terminal regressions:
  89 pass / 233 assertions, including review-discovered focus and stale-result fixes.
- Website: 9 pass / 63 assertions; scoped TypeScript and build pass.
- PadPilot: 22 focused tests pass; PadPilot and Marketplace TypeScript pass.
- Shared ActionMenu/Popover: 3 pass / 19 assertions. Shared showcase passes
  1440/820/390, keyboard, coarse pointer, light/dark, error/disabled/loading,
  large-list and 200% text checks.
- Harness TypeScript/build, shared UI build and targeted lint pass. Process policy
  passes (3297 files, zero violations). The scoped suites above total 190 tests.
- Repository source structure remains blocked by the pre-existing evaluator
  directory count (38, baseline 36). No exception was raised.
- Broad package TypeScript remains blocked by existing creative-preset timeline
  types, older 3D capture runtime imports and input-binding capture element types;
  this is not a repository-wide green gate.

The root comparison has 16 before/after cases plus four recovery captures and a
390x480 menu. At 390px/200% the command bar shrinks from 386px to 225px (42%).
The desktop bar grows from 54px to 62px to retain larger action geometry; the
ordinary 390px bar is effectively unchanged (112px to 114px). This is targeted
recovery of enlarged-text task space, not a claim that every layout became smaller.

Baseline IDE fixture rendering omitted shell theme variables; the after fixture
corrects that host wrapper. Compare structure, paths, controls and reachability,
not that incidental background-color difference. All text scaling here is root
font scaling, not native browser zoom. Full host reconnect and native acceptance
remain explicit in the debt inventory.

The final [root report](../../.local/design-system/evidence/next25-batch2-root/after/report.json) records
completion and zero page errors. The [shared showcase report](../../.local/design-system/evidence/next25-batch2-root/showcase-report.json)
provides the independent shared-control matrix. The menu regression is preserved
before the primitive fix; its updated bounds check passes in the full Harness.
