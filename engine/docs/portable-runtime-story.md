# Portable localization, dialogue, and quests

Content-heavy 2D projects can declare first-party story data under `extensions.hyperfocusStory` in `.hyperfocus/project.json`. Locale bundles, dialogue graphs, quest graphs, variables, flags, and action mappings remain ordinary JSON. Hyperfocus does not generate a file per conversation, quest, node, or language; `project.json` and `assets.hfp` remain the only canonical files.

The `narrative-rpg` starter is the smallest complete reference:

```sh
bun run create:project -- narrative-rpg ./my-story
bun run build:game -- --project ./my-story
```

Its declaration uses this shape:

```json
{
  "extensions": {
    "hyperfocusStory": {
      "version": 1,
      "source": {
        "defaultLocale": "en",
        "locales": [],
        "dialogues": [],
        "quests": []
      },
      "locale": "es",
      "variables": { "name": "Mara" },
      "flags": {},
      "entryDialogue": "archivist",
      "activeQuests": ["lost-relic"],
      "advanceAction": "interact",
      "choiceActions": [
        { "dialogueId": "archivist", "nodeId": "offer", "choiceId": "accept", "action": "choose-accept" }
      ],
      "questEventActions": [
        { "questId": "lost-relic", "event": "accepted", "action": "quest-accept" }
      ]
    }
  }
}
```

## Runtime semantics

- Localization looks in the selected locale first and falls back to `source.defaultLocale` per missing message. `{variable}` placeholders require a declared scalar value. Plural messages select `zero`, `one`, or `other` from a finite numeric `count`.
- Dialogue lines advance on the rising edge of `advanceAction`. Choice mappings select one exact graph/node/choice on their own rising-edge project action. Holding a key cannot repeat a choice.
- Action nodes emit bounded portable commands and settle deterministically until the next line, choice, or end node. Commands are data for the host; arbitrary code and filesystem module paths are never evaluated.
- Quest event mappings send one declared event to one active quest. Optional scalar flags participate in transition conditions. Ambiguous events are rejected while authoring.
- Story snapshots contain the dialogue node, all active quest states/revisions, prior action edges, locale, and pending commands. The save controller includes this state under the `story` provider key in the same checksummed profile as the world snapshot.
- Editor Play and standalone builds execute the same story controller. `editorPlay: reset/restore` applies to story and world state together, while standalone `save/load` restores them atomically.

## Validation and limits

Build preflight constructs the first-party `StoryCatalog` and rejects missing default text, duplicate IDs, missing dialogue/quest targets, unavailable choice references, unmapped project actions, ambiguous action ownership, non-scalar variables/flags, and non-portable command data.

Portable projects are capped at 16 locales, 10,000 messages per locale, 256 dialogues and quests, 512 nodes per dialogue, 256 states per quest, 16 choices per choice node, 32 commands per transition, and 512 choice or quest action mappings. Pending runtime commands are capped at 4,096 until the host drains them.

Other engines can directly consume the locale and graph JSON. The action mapping layer is deliberately separate from physical keys, and snapshots contain IDs and scalar data rather than Hyperfocus object instances.
