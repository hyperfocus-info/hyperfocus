# StyleX

The integration follows StyleX's official [Bun setup](https://stylexjs.com/docs/learn/installation/bun) and compile-time model. Shared tokens use [`stylex.defineVars`](https://stylexjs.com/docs/learn/theming/defining-variables), and Solid components spread [`stylex.attrs`](https://stylexjs.com/docs/api/javascript/props/) onto DOM elements.

New shared UI is authored locally with `stylex.create`, uses named design tokens from `.stylex.ts` files, applies styles with `stylex.attrs` for Solid, and emits one build-time CSS bundle.

The repository's [`stylexSolidPlugin`](../scripts/stylex-solid-plugin.ts) runs the StyleX and Solid Babel transforms in one Bun `onLoad` hook. Bun stops after the first matching loader hook, so independently composing the Solid and StyleX adapters can either compile JSX as React calls or leave `stylex.create` in the browser bundle. The combined transform preserves StyleX's normal Babel extraction while producing Solid DOM code in the same pass. Browser verification guards this integration.

The compiler uses namespaced CSS layers. The reset layer comes before StyleX atomic layers. ESLint checks valid styles and unused definitions. StyleX 0.19's optional media-query order rewrite is disabled because it rejects valid responsive maps in the complete Solid module graph; authored mobile-first query order is preserved and covered by a multi-entry compiler regression.

The imported harness was a large Tailwind application. Its Tailwind packages, build plugin, utility strings, and 155 KB compiled compatibility stylesheet have been removed. Harness presentation is now extracted from colocated StyleX definitions. The only non-StyleX CSS boundaries are document-level variables/reset/scrollbars in `base.css`, the shared box-sizing reset, and Xterm's official vendor stylesheet imported by its renderer.

This follows StyleX's documented preference for colocated styles, type-safe shared variables, direct classes on the styled element, deterministic composition, and build-time compilation.
