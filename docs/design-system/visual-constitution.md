# Visual constitution

The quality foundation for real Hyperfocus interfaces. [DESIGN.md](../../DESIGN.md)
owns application contracts; this document owns the visual principles. Start with
the [audit and examples](README.md), then improve a real task before extracting.

1. **Protect attention.** Use the fewest useful words and elements, with at most
   one primary action per active view. Omit routine subtitles; disclose optional
   explanations locally. Follow [the attention contract](../../DESIGN.md#respect-limited-attention)
   for icons, essential context and brand navigation.
2. **Density needs rhythm.** Dense editors are welcome; ambiguous grouping is not.
   Use a small spacing scale, aligned labels, and readable semantic type roles.
   Do not shrink metadata below the caption role to fit more controls.
3. **Boundaries carry meaning.** Separate different tasks with space or one rule.
   Add a surface only for a real region, selection, or overlay. A box inside a box
   must explain something that proximity cannot.
4. **Repeat decisions, not CSS.** Search `@hyperfocus/ui` before inventing a
   control. Use semantic tokens and `typography` roles. Compose existing primitives;
   extract a new one only after naming real consumers and the repeated failure.
5. **Preserve priorities as space changes.** Keep the main task operable. Move
   secondary panes to explicit modes and lower-priority actions to a named menu.
   Respond to container width; never depend on arbitrary toolbar wrapping.
6. **Polish includes recovery.** Give controls names, visible focus, keyboard
   behavior, readable contrast, useful errors, and a next step in empty states.
   Touch targets reach 44px. Long names and 200% scaling are ordinary inputs.
   Color is never the only explanation of state.
7. **Motion explains change.** Use quick feedback, normal transitions, or major
   transitions only when they help orientation. Respect reduced motion. Static is
   the default when movement adds no information.
8. **Evidence outranks taste claims.** Capture the actual surface before and after
   at desktop, intermediate, and narrow widths. Check computed styles: importing
   tokens does not prove they won the cascade. Keep resets in the reset layer.
   Preserve each discovered regression before adding another rule.

Foundation means spacing, type roles, control mechanics, and responsive behavior.
The Hyperfocus theme supplies its neutral surfaces and teal accent. Project themes
may supply different identities through existing CSS properties; generated products
do not inherit a requirement to look like the editor. No theme engine is implied.
