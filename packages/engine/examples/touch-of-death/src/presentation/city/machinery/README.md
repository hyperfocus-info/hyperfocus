# Transfer carriage

`authorCityMachineStop({ declaration, combat })` binds the existing transfer deck
to an ordinary impact transformation. Its orange motor and blue power lamp stop
with the deck; the lamp disappears and a broken motor cover becomes visible.
The deck remains solid at the impact position, providing a persistent traversal
surface. Round recovery and save/restore retain the jam. A new match restores it.

The helper is deterministic and idempotent. It adds four render-only pieces,
preserves the carriage route, and uses the shared `stopMotionIds` contract rather
than a special machinery simulation. The focused test uses an ordinary Heavy,
checks retained collision, advances 300 frames, and restores both moving and
stopped snapshots. Browser evidence belongs to the exact exported candidate.

This is one jammed carriage, not a general power grid or machinery repair system.
