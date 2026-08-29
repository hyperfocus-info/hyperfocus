# Durable Learnings

## Reusable Patterns

- Dense dashboards should let data type drive form: bounded states become chips, comparable quantities use tabular figures, long temporal evidence reads better as timelines than tables.
- Progressive disclosure keeps dense rows usable: primary selection stays visible, secondary actions appear on hover or focus, and touch layouts keep controls reachable.
- Tooltips are part of dense UI infrastructure. Icon-only controls, ambiguous labels, disabled states, and compact metrics need shared tooltip copy.
- Selected states should use consistent rails, borders, or restrained tints. Avoid glow-heavy gradients, oversized uppercase eyebrows, and decorative status pills.
- Numeric right alignment helps place-value scanning for comparable counts and percentages, but this repo trials it behind `?number=right` before making it default.
- Responsive virtual workspaces need one usable primary pane at a time. Merely fitting the outer window is not enough when a fixed explorer or trace pane leaves the editor unusable; use an overlay or auto-collapse pattern on narrow screens.
- Cross-surface selection must preserve entity identity. A Runs selection, summary, developer trace, and proof bundle should all resolve the same run instead of independently falling back to the latest entity.
- Narrow evidence panes need explicit shrink and wrap contracts; action rails should wrap while list viewports suppress incidental horizontal scrolling.
- Performance conclusions must separate portable efficiency from local latency. Record algorithmic scaling, bytes copied, allocations, queue depth, cache behavior, DOM work, and operation counts alongside timings; a single fast run on one clock/power state is evidence for that environment, not a universal default.
- Capacity work must include contention tiers. An idle laptop, an unplugged or thermally limited laptop, and a host coordinating hundreds of agents have different latency, but bounded queues, linear or logarithmic scaling, backpressure, and adaptive configuration should remain valid across all three.

## Project Findings

- Harness dense surfaces are operator tools, not landing pages. Keep the visual base quiet, semantic, and compact so status, risk, owner, and next action remain first-read signals.
- Computer skill and AI familiarity are independent axes. Intent labels and readiness copy matter even for expert computer users who are new to agents, while trace and shortcut affordances must remain available to advanced AI operators.
- This repository is commonly developed on a mid-tier laptop whose power state changes CPU clocks. Local p95 values are diagnostic calibration data; promote designs from structural evidence plus repeated cross-load/cross-browser trials, and keep host-specific crossover thresholds configurable.
