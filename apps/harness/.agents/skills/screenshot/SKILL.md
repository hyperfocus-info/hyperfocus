---
name: screenshot
description: Capture and inspect a running browser interface when a screenshot or visual diagnosis is requested. Supplies evidence; use ui-audit for a broader audit and improve-ux for requested design changes.
---

# Screenshot

Use the active project's capture command or an available browser tool. Discover
the URL and setup from its README, tasks, or running services; this skill bundles
no server launcher or screenshot executable. Start a server when the task needs
it and the project's lifecycle permits it. Reuse a healthy server when available.

Capture the requested route, state, and viewport, and inspect the image before
diagnosing. Add a narrow viewport when responsive behavior is in scope; a single
capture does not require an application-wide audit. For a deep state, deterministic
fixture setup is useful, but still exercise the visible interaction being checked.

Keep automation headless with an owned temporary profile and hidden background
processes. Register cleanup before startup/CDP waits; clean up owned processes and
profiles on success, failure, or timeout. Preserve reused servers and personal
browsers. On Windows verify actual visible windows and surviving processes, not
just launch flags; follow the project's process contract.

Return the capture path and state inspected. After a requested visual fix, capture
the affected state again. Distinguish observed defects from inferred causes and
report any state or cleanup that could not be verified.
