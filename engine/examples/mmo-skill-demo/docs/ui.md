# UI

This file is the living UI map for the MMO Skill Demo. Update it whenever player-facing UI, control prompts, HUD behavior, panel contents, map behavior, login flow, debug surfaces, or interaction readbacks change.

Related context: ./README.md, ./docs/world-player-progression.md, ./docs/world-travel.md, ./docs/world-gathering-and-crafting.md, and ./docs/combat-feel.md.

## Purpose

The UI should keep active play first. Canvas HUD, prompts, and feedback carry the moment-to-moment loop; DOM panels stay compact, collapsible, and secondary. Only one optional panel should be open at a time, and the player should always have one reachable next goal visible during active play.

Controller support is a first-class UI path. Prompts, focus, and settings should keep keyboard, mouse, and controller play understandable without requiring analog-only interaction.

## Entry And Connection

The login overlay asks for a character name, stores it locally, and connects that character to the authoritative room. URL parameters can auto-login, choose the room or room type, open an initial panel, enable telemetry, or enable the client-side dev toolbar affordance.

The status line reports readiness, connection state, and debug or telemetry detail when enabled. Client errors open the log area so failures are visible without inspecting the browser console.

## Active Play HUD

The canvas HUD shows:

- Room label and connection readback.
- HP and mana bars.
- Current zone, gold, renown, online count, mastery, active contract, and skill levels.
- Daily objective, next goal, and world-event progress.
- Combat hotbar for LMB, RMB, Space, Q, E, and R.
- Energy meter for ultimate readiness.
- Current interaction prompt for nearby loot, resources, or support NPCs.
- Temporary NPC dialog after talk, travel, bank, or trade actions.

The first-10-minute HUD follows a one-action rule: one primary objective, one fallback, and a compact Return strip that names the active quest, current progress, nearest target, last proof, and next payoff. The strip is derived from current quest and inventory state, so returning players recover the route without a forced panel.

Ability slots show lock state, cooldowns, selected ability names, active-slot highlight, and R energy readiness. Hovering a slot with the mouse shows ability details. Failed ability attempts can show short cooldown or energy readback near aim.

## Controls And Input

Movement supports WASD, arrow keys, and controller left stick. Aim supports mouse and controller right stick. Combat uses LMB/RMB, Space, Q, E, and R, with controller trigger and face-button mappings. Interact uses Z, L1, or Alt+P.

The game hides the pointer when controller input becomes preferred and restores pointer behavior as soon as mouse movement resumes. Audio unlocks after the first keyboard, pointer, or login gesture.

## Maps

N toggles the minimap. The minimap follows the player, rotates with heading, shows nearby threats, resources, loot, support NPCs, towns, dungeons, and route lines. Hovered map nodes use the shared tooltip outlet to summarize names and vital state. The minimap resource layer can be filtered so resource hunting can switch between forage focus and cleaner navigation.

M opens the full world map, and Escape or M closes it. The world map hides the DOM shell while open, supports pointer pan and wheel zoom, shows major route anchors, live support NPCs, the player marker, zone labels, routes, legend, gatherable filtering through the legend, hover tooltips, and close prompt.

## Panels

The compact toolbar exposes these panels and route controls:

- Quest: optional First Arms proving contract, follow-up lesson contracts, daily objective, branch choices when ready, accepted quests, contract state, and major quest progress.
- Event: current world event name, phase, progress, reward, and objective.
- Bag: currencies, resources, consumables, and owned key items. Consumables can be used; owned weapons can be equipped.
- Gear: read-only equipment slot summary for weapon, tools, feet, armor, trinket, and relic.
- Skills: weapon picker and known ability picker for each combat slot.
- Stats: HP, mana, combat, gathering, mastery, weapon, loadout, entity count, and controller deadzone slider.
- Codex: faction, bestiary, reputation reward, and crafting-material reference tabs.
- Craft: recipe picker, inputs, outputs, station readiness, and station action when the matching NPC is close enough.
- W, D, C: confirmed route changes for shared world, dungeon, and cottage.

When dev mode is requested in the URL, the toolbar can show a heal button. The server still requires dev cheats to be enabled before applying dev actions.

## Interaction Feedback

The UI uses shape, text, color, motion, and sound together:

- Floating text for damage, gains, cooldown denial, quest updates, loot, level, rank, and death.
- Rings, beams, bursts, particles, and reticles for combat, gathering starts, travel, interaction, daily objective anchors, hazards, and pickups.
- SFX for attacks, spells, hits, hurt, kill, boss, gather, loot, quest, level, hazard, interact, and death.

Confirmed combat hits use a shared impact grammar so every weapon family has readable light, medium, heavy, and ultimate feedback. Hitstop is client-side visual hold only; control loss comes from explicit crowd-control states. Boss stagger should remain large and persistent enough to read during group combat.

Critical play information should not rely on sound alone. Must-react cues should remain readable near focal play space or be duplicated through map, HUD, reticle, or visible world telegraph.

## Maintenance Rules

Keep this file high-level. Use it to describe UI responsibilities, expected player-facing behavior, and maintenance boundaries. Avoid code-heavy implementation notes.

Update this file when:

- Toolbar actions, panels, map behavior, login flow, HUD readbacks, controls, or settings change.
- A new player-facing prompt, dialog, feedback channel, or debug surface is added.
- A UI feature becomes required for progression, travel, crafting, combat, or controller play.
- A stale UI description would mislead future contributors or playtest audits.
