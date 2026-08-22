# StyleX

The integration follows StyleX's official [Bun setup](https://stylexjs.com/docs/learn/installation/bun) and compile-time model. Shared tokens use [`stylex.defineVars`](https://stylexjs.com/docs/learn/theming/defining-variables), and Solid components spread [`stylex.attrs`](https://stylexjs.com/docs/api/javascript/props/) onto DOM elements.

New shared UI is authored locally with `stylex.create`, uses named design tokens from `.stylex.ts` files, applies styles with `stylex.attrs` for Solid, and emits one build-time CSS bundle.

The repository's [`stylexSolidPlugin`](../scripts/stylex-solid-plugin.ts) runs the StyleX and Solid Babel transforms in one Bun `onLoad` hook. Bun stops after the first matching loader hook, so independently composing the Solid and StyleX adapters can either compile JSX as React calls or leave `stylex.create` in the browser bundle. The combined transform preserves StyleX's normal Babel extraction while producing Solid DOM code in the same pass. Browser verification guards this integration.

The compiler uses namespaced CSS layers. Reset and compatibility CSS come before StyleX atomic layers. ESLint checks valid styles and unused definitions.

The imported harness was a large Tailwind application. Its Tailwind packages and build plugin have been removed. A checked-in compiled compatibility stylesheet preserves the current screen while components are transferred into `@hyperfocus/ui`; it is not an authoring surface and receives no new rules. Remaining class-based harness components are tracked as migration debt in [Migration status](migration/status.md).

This follows StyleX's documented preference for colocated styles, type-safe shared variables, direct classes on the styled element, deterministic composition, and build-time compilation.
