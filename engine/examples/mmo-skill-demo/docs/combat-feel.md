# Combat Feel

Combat should sit halfway between weighty MMOARPG impact and snappy arcade response. Inputs stay responsive and server-authoritative; impact weight is expressed through client-side feedback layers rather than broad gameplay pauses.

Related context: ./docs/ui.md and ./docs/world-player-progression.md.

## Impact Grammar

Every confirmed hit should answer four questions quickly:

- Did contact happen?
- How strong was it?
- What weapon identity caused it?
- What can the player do next?

Use four impact weights: light, medium, heavy, and ultimate. Light hits confirm contact with short visual hold, small particles, and little or no camera impulse. Heavy hits add longer visual hold, stronger burst shape, and mild directional shake. Ultimates can feel larger, but still preserve target, lane, and recovery readability.

## Weapon Identity

Mace and blade hits can feel heavier. Bow and twin-blade hits should stay sharper and shorter. Staff and wand hits should lean on ring, beam, and spell-color readback rather than blunt shake. Projectile hits should mostly hold the target, not the attacker.

All weapon families should share the same hierarchy so stronger hits read stronger, but no ordinary hit should use boss-level feedback.

## Hitstop And Control

Hitstop is visual-only in this demo. The server simulation, cooldowns, movement, and combat authority keep running. The local client may briefly hold the struck actor pose and, for local melee hits, the attacker pose. This creates impact without adding control loss.

Crowd control remains a gameplay rule and should stay explicit: stun, slow, knockback, guard breaks, boss staggers, and interrupts are not hidden inside the impact layer.

## Boss Stagger

Boss stagger needs a large, persistent read. A boss in stun should show a clear stagger ring and label while vulnerable, plus a large burst when the stagger begins. The goal is to make the opening visible in busy group play without requiring players to read small text.

## Camera And Scene Safety

Screen shake should stay mild by default. Use small directional impulses near the impact, cap amplitude tightly, and avoid shaking offscreen hits. Critical combat cues must remain readable through shape, position, text, and VFX, not sound or shake alone.
