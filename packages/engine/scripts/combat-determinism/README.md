# Combat cross-runtime determinism gate

From the repository root:

```sh
bun packages/engine/scripts/combat-determinism/verify.ts
```

Requires Chrome or Edge; set `CHROME_PATH` if it is outside the standard paths.
The command owns one hidden headless browser, creates no server, and closes its
browser in `finally`. It bundles the current engine source and compares each
complete simulation/solver checkpoint against Bun with exact equality, including
every physical contact. No global Math replacement or state tolerance is used.

Assertions require actual launcher/chase/follow-up contact, defensive steering,
held block, fresh parry, earned KO plus corpse contacts, raised-ground/wall tech,
and a failed low-level AI tech. Initial fixture geometry is authored before
simulation; health, stun and contact impulses are never fabricated. The surface
fixture applies only impulses emitted by the actual combat simulation and uses
the same rigid solver, surface forecast and AI as versus play.

A final test-only browser bundle substitutes native math for the simulation
facade and must diverge. This checks that the gate catches the failure which
motivated portable math. It does not alter the production bundle or Bun runtime.
Full exported-game set/rematch and network UI acceptance are separate gates.
