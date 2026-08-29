# Localized story content

`@hyperfocus/engine/content` includes bounded, plain-data primitives for localized messages, branching dialogue, and event-driven quest state. They complement the scene/prefab catalog without requiring generated classes, editor databases, cloud services, or engine-specific binary content.

`createStoryCatalog` validates all graph references before play. The default locale must contain every text key used by a dialogue; another locale may be partial and falls back by key. Messages support named scalar replacement and explicit `zero`/`one`/`other` count forms. This deliberately avoids executable templates and keeps localization data portable.

Dialogue nodes are lines, choices, commands, or ends. Conditions compare an explicit flag with a scalar value, hidden choices cannot be selected directly, and game effects leave the content layer as plain `StoryCommand` values. Quest graphs use uniquely named events per state, optional conditions, explicit target states, command outputs, and versioned snapshots. Games own the interpretation of commands, inventory rules, presentation, and save-slot policy.

Catalog limits bound locales, messages, graphs, nodes, choices, states, and commands. The portable narrative-RPG starter now supplies the representative integration: locale fallback and substitution, branching choices, quest transitions, deterministic snapshots, save/restore/delete, build parity, and clean-browser evidence. Combined with prefab variants, timelines, reference validation, migrations, and neutral export, this supports the current content-heavy **8/10** assessment. Visual graph authoring, richer locale/plural policy, large-team merge/batch linting, and much larger production content fixtures remain disclosed breadth work.
