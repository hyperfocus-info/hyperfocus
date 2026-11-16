# Knockout checkpoint ownership

`capture`/`restore` remain portable corpse poses for project saves. They rebuild
the corpse world and do not preserve contact/constraint solver history.

`checkpoint()` returns an in-process rollback participant checkpoint with detached
hashable `state` and a `restore()` closure. The closure retains its original world
and complete rigid solver checkpoint. It cannot be serialized or transferred to
another runtime. Treat its state as read-only.

Checkpointed worlds never change topology: adding a subsequent corpse copies the
existing topology and solver state into a fresh world before adding bodies. Reset
abandons the current world without removing its bodies. Worlds remain reachable
only while retained checkpoints reference them; the caller must bound history.
This avoids preallocating and simulating inactive ragdolls in ordinary local play.

The component also changes host fighter collision masks and synchronizes corpse
positions back to host bodies. Restore this participant **before** restoring the
host runtime transforms and full host rigid checkpoint. That order preserves exact
host poses, velocities and contacts, including frames before the first knockout.
The host combat snapshot and round state are separate participants.

`checkpoint.test.ts` verifies exact solver replay through floor contacts, a second
knockout, round resets and portable restore. These are component tests supplying
defeated states directly, not validation of an earned combat conversion. Cross-JS
physics determinism, network recovery and audio confirmation require host tests.
