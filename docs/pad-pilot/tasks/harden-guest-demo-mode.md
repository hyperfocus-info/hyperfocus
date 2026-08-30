# Harden Guest/Demo Mode

- Owner: Product/licensing and native runtime maintainers
- Deadline: Before guest-mode degradation is relied on as a paid production entitlement boundary
- Status: Resolved for the current product policy on 2026-08-29

## Problem

The imported `GuestModeEnforcer` changed FX wet/dry from client-visible UI code.
An open-source client could bypass it, and editor lifecycle failure could mutate
canonical audio state unexpectedly.

PadPilot now treats guest mode as an account/marketplace state only. It never
degrades audio, writes a Preset, or mutates processor-owned Module state. A future
paid runtime entitlement must begin with a new threat model and native contract;
the removed heuristic is not an acceptable starting point.

## Resolution

- Guest restrictions remain limited to authenticated marketplace/account actions.
- The temporary `GuestModeEnforcer` and factory-FX special case are removed.
- Guest entry cannot write audio state, so editor and network lifecycle events have
  no degradation value to restore or accidentally persist.
