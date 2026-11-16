---
name: player-progression
description: Design or audit MMO Skill Demo onboarding, rewards, unlocks and longer-term player loops, or update its world-player-progression record. Use world-building for map content and player-skill-update for ability mechanics.
---

# Player progression

Start with the affected sections of `docs/world-player-progression.md` and their
runtime owners, relative to the example root. For an open-ended lifecycle audit,
run `bun.cmd .agents/skills/player-progression/scripts/progression-scan.ts --format markdown`.
A named mechanic fix can start directly at its data and consumers. Consult world,
travel or future-quest docs only when that boundary changes.

Use existing approved loops, play evidence and the user's brief to choose the
change. If target experience remains materially unclear, offer concrete choices
showing the reward/friction difference. Treat 10-second, 10-minute, 10-hour and
100-hour bands as useful design lenses, not mandatory scope for every request.
Choose a local intervention: introduce complexity after a demonstrated mastery
point; vary meaningful choices before adding systems or inflating numbers.

For a broad audit, a matrix of player goal, friction, reward and next unlock makes
missing transitions visible. Report only evidenced gaps and consequential open
questions; fixed section counts, fun-killer lists and WHY templates are optional.
For implementation, update the affected progression record and any changed world,
travel or quest meaning. Preserve the example's current runtime claim limits.

Check changed data/behavior with targeted tests and the example build. Add
screenshot evidence for changed visual guidance; scans do not prove play quality.
Read-only audits end with findings. Implementation ends with the requested loop
working and remaining playtest uncertainty stated, without automatic skill edits.
