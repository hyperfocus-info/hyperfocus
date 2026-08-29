# @hyperfocus/pad-pilot

Portable public contracts for PadPilot Module authors and non-native consumers.

The package owns stable Module/capability identities, factory Module metadata,
shared validation schemas, file limits, semantic-version handling, and bounded
I/O helpers. It does not own JUCE, QuickJS execution, host persistence, the
Solid UI adapter, or Audio Thread work; those remain in `apps/pad-pilot`.

Import only declared package exports. Browser consumers must not import the
Bun-oriented `bounded-file` or `subprocess` entries.
