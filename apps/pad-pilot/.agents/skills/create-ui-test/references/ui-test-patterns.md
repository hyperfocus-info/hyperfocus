# UI Test Patterns

## Tooltip tracer bullet

Use the tooltip pattern first when validating a new test setup:

- hidden initially
- visible on mouse enter
- hidden on mouse leave
- visible on focus in
- hidden on focus out

This proves the DOM harness, event dispatch, and cleanup path with one compact component.

## Element checklist

- renders expected visible content
- forwards important props and callbacks
- exposes accessible roles, labels, or testable semantics
- responds to the primary interaction path
- cleans up transient UI such as overlays or focus state

## Module checklist

- renders under the required provider or context shell
- exposes critical controls and labels
- changes visible state through public interactions
- emits public callbacks or bridge intent at the correct boundary

## Acceptable non-DOM tests

Prefer non-DOM tests only when the unit is genuinely non-visual:

- normalization helpers
- serialization and round-trip codecs
- sorting and mapping helpers
- store state transitions

Even then, assert behavior and outputs, not source text.
