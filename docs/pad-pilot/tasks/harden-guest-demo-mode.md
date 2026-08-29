# Harden Guest/Demo Mode

- Owner: Product/licensing and native runtime maintainers
- Deadline: Before guest-mode degradation is relied on as a paid production entitlement boundary
- Status: Open; current UI heuristic is explicitly non-security enforcement

## Problem

`GuestModeEnforcer` changes FX wet/dry from client-visible UI code. An open-source client can patch or bypass that behavior, and an editor lifecycle failure can also make product policy mutate canonical audio state unexpectedly.

Until this task is complete, guest-mode degradation must be described as a demo affordance, not tamper-resistant licensing or authorization.

## Exit Criteria

- Product policy defines which guest limitations are server-enforced, native-enforced, or intentionally advisory in an open-source client.
- Entitlement decisions use authenticated, expiring, replay-resistant evidence and fail predictably while offline.
- Enforcement does not persist degradation values into user Presets or DAW project state.
- Editor close/reopen, Module switch, project restore, login/logout, and network-loss tests prove original audio state is restored exactly once.
- Threat-model documentation states what a user controlling the client binary can still bypass.
- The temporary `GuestModeEnforcer` FX mutation path and its special-case app-shell routing are removed.
