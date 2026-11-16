# Shared presentation guidance

Use [the README](README.md) for public primitives and validation commands, and
[the visual system](../../docs/design-system/README.md) for approved compositions.
Search existing controls, semantic tokens and `typography` roles before adding
variants. Hosts own commands and persistence; `@hyperfocus/ui` owns generic
presentation and interaction. Reset styles must not override shared foreground,
type or geometry.

For visual decisions, start from approved examples and existing host usage. Ask
for a concrete choice only when those references cannot resolve the requested
direction. Verify changed interaction and layout in a real consumer; isolated
component tests cannot catch a host cascade override. Include relevant desktop,
intermediate, narrow, coarse-pointer and enlarged-text states for layout changes.

For scrollable or virtualized surfaces, exercise actual rows and the destination
after hide/reveal. For overlays, measure bounds while open at narrow width with
enlarged text. A sized container or successful click alone proves neither case.
Regression evidence: [hidden surfaces](../../docs/design-system/next25-surfaces.md)
and [overlay bounds](../../docs/design-system/next25-batch2-surfaces.md).
