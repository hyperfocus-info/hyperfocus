# Practice composition contract

Owner: `apps/engine-editor/src/scene3d/fight-hud/practice`. Reuse the shared
game-menu actions, category navigation and modal boundary; combat evidence stays
in the host. This is a training composition, not developer AI tooling.

On October 4, 2026 the owner explicitly chose **“Clear arena; optional readouts”**
over a persistent technical lab. Lessons retain the previously approved **live
arena with compact coaching**. These are directional approvals, not approval of
every screenshot or subsequent revision.

## Authoring path

**Training intent → setup or observed feedback → canonical workspace → real
commands/evidence → input and rendered validation.**

| Slot | Constraint |
| --- | --- |
| Live dock | Current dummy behavior, one short cue, Training setup / Readouts / Reset. No diagnostic checklist over play. |
| Setup | Technique lessons, dummy behavior, launch/recovery, reset, readouts and opponent routine. Every preset has a player-facing label and purpose. Selection replaces the current preset and resumes play. |
| Instrument | At most one pinned readout; hitbox visualization is independent. The optional Timing + inputs instrument combines both observations from the same attempt. Timing/inputs, attempt review and arena groups remove inactive choices from navigation. |
| Evidence | Actual simulation frames, presses/releases and recorded outcomes. Input names use current device bindings. No invented scores, success or frame advantage. |
| Configuration/review | Native modal pauses a directly opened arena, consumes input, and returns focus to play. Opened from Pause, it stays paused and restores the invoking setup action. |
| Short viewport | Keep Training setup and Readouts reachable. Reset stays in setup; captured readout data remains in the review panel. Do not shrink targets or cover the fight with instrumentation. |
| Tutorial handoff | The canonical tutorial coach becomes the instruction owner. Hide the free-practice dock and pinned readout; retain choices for returning to free practice. Examples cannot feed player history. |
| Lifecycle | Stable native controls, 44px targets, safe insets, wrapping text, bounded scrolling, one activation per press and cleared instruments on session exit. |

A fresh Free practice entry starts with the neutral dummy. In-session Reset and
snapshot restoration retain the selected setup; a previous lesson cannot silently
replace the title's Free practice intent.
The standalone opponent-routine dock names its active loop instead of presenting
the old dummy label. Its controls and saved local situations are owned by
[the replay/practice controllers](../../apps/engine-editor/src/scene3d/replay/README.md).
Observe input/attack evidence at committed simulation steps, not only rendered
frames: a slow render can skip the exact recovery tick needed to distinguish a
completed miss from an interruption.

`practice-catalog.ts` owns semantic preset/instrument content;
`createPracticeWorkspace` owns placement, selection and focus;
`createPracticeDiagnostics` supplies read-only observations. The standalone host
owns pause, reset, input exclusion and commands. Do not put simulation or saves in
the composition. `practice-workspace-theme.ts` owns Touch of Death appearance.
Editor Play reuses the instrument/review boundary with a compact launcher and its
existing setup/coaching controls. Both hosts capture enabled input/combo evidence
after committed simulation steps and own their own pause state.

```ts
const workspace = createPracticeWorkspace({ canvas,
  setup: openTrainingSetup, reset: resetCurrentAttempt,
  opened: pauseIfPlaying, closed: restorePriorPauseState });
workspace.render({ active: true, preset: 'guard', cue: '', paused: false });
// Feed actual observations into the selected instrument; preserve native nodes.
workspace.content.get('attempts')!.textContent = observedAttempt;
workspace.updatePreview();
```

The composition is proven by free practice, fixed dummy behavior and tutorial
handoffs. Its main recurring failure prevention is keeping configuration, live
coaching and diagnostic output from becoming three competing interfaces. Existing
foundation primitives already provide categories, bounded actions and modal input
ownership. Do not promote the fighter-specific preset catalog or visual skin into
universal Hyperfocus infrastructure.

## Evidence and limits

The [verification script](../../apps/engine-editor/scripts/practice-composition/README.md)
owns reproduction. Immutable original HTML/screenshots live in
`.local/touch-of-death/practice-composition/before`; candidate/actual-host captures
and machine-readable results are kept separately. The visual review found a short
viewport that passed element bounds but obscured play; short layouts now defer
readout detail into review. A native-modal return race also required restoring
arena focus after shared modal restoration.

Automated controller samples exercise the real navigator. They do not certify a
physical controller. Enlarged text and reflow are not browser-chrome zoom. No
training mechanics, economy, characters, arenas or additional game modes changed.

Delivered locally at `http://127.0.0.1:8797/game/`, HTML SHA-256
`e769b5a7e9bb00fbc93c991ef24c31ba55b29e9ebdbfd28a8ee8ccf606a54aeb`.
The final served build passes 99 Practice and 42 tutorial browser checks; the
actual Editor Play adapter passes eight fixture checks. Focused UI/controller and
engine suites pass 156 tests. Engine source and editor source/test typechecks,
guidance and process-policy checks pass. `delivery.json` records served bytes and
preservation of all 42 audio files; original HTML/manifest remain in
`original-export/`. Only the local playable HTML/manifest were adopted.

The broad repository gate remains blocked by existing code-style debt and the
unrelated PadPilot evaluator directory-count baseline. No baseline was increased.
The new screenshots remain candidates within the owner-approved direction.
