# @hyperfocus/ui

Presentational Solid components styled with StyleX. It contains buttons, tabs, segmented controls, panels, action menus, trees, overlays, chat composition and transcript rendering, an xterm surface, workbench layout mechanics, a descriptor-driven `PanelGroup`, and a CodeMirror source editor.

Shared components own interaction and accessibility mechanics, not application commands. For example, `ActionMenu` owns focus and overlay behavior while an application adapter maps selected items to domain actions; `PanelGroup` owns pointer and keyboard resizing while the host owns durable layout state.

`registerOverlay` and `isTopOverlay` expose the shared dismissal stack for branded wrappers that cannot use the stock dialog shell. They guarantee that Escape reaches only the topmost overlay; wrappers remain responsible for focus trapping and restoring their opener. `Popover` owns viewport clamping, outside-click dismissal, Escape handling, and optional focus return, with `contentClass` available for product skins.

`ChatTranscript` safely renders Markdown through a measured, variable-height window. Its Fenwick prefix model keeps measurement updates logarithmic and DOM/Markdown work bounded as history grows. The simple path only needs `messages` and retains the newest 512 presentation rows; advanced hosts can tune that bound, estimated row height, overscan, stick-to-end behavior, and the pending-stream render interval. `hasPrevious` plus `onRequestPrevious` expose host-owned durable paging without moving persistence into this package. Pending rows coalesce source revisions and reconcile Markdown without replacing their stable row. Retained-window shifts preserve one reactive index per stable message key, preventing duplicate message owners as old rows leave the window. Optional application callbacks expose applied-revision counts for structural performance evidence.

`bun run bench:measured-window` records prefix writes, typed-array allocations, tree writes, and environment-labeled timing. The browser transcript test gates on mounted-node, unique-message, Markdown-update, and applied-revision counts at 100 and 10,000 messages; its elapsed time is diagnostic only.

It intentionally has no filesystem, process, persistence, credential, agent-runtime, engine-project, or AI execution ownership. Those capabilities are injected by application hosts.

`bun run build` emits Solid DOM modules and extracted StyleX CSS to `dist/`. The build fails if a React JSX fallback or uncompiled `stylex.create` call reaches any JavaScript entrypoint.

Related: [shared UI user stories](user-stories.md), [application design standard](../../DESIGN.md), [StyleX integration](../../docs/stylex.md), [package testing](../../docs/package-testing.md), and [architecture](../../docs/architecture.md).
