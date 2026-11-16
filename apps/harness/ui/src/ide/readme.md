# Harness IDE

The IDE surface is a local-first workbench for project navigation, search, source control, editor context, terminal evidence, and agent handoff. It should feel like a focused coding cockpit, not a full cloud IDE clone.

## Current Pass

- Activity bar for Explorer, Search, and Source Control.
- Collapsible, resizable sidebar and resizable terminal/editor groups.
- Editor tabs with dirty state, breadcrumbs, status bar, command palette, context menus, skeleton loading, local theme switching, shortcut interception, and bottom-right IDE notifications.
- Real project file tree, editable text buffers, terminal-to-file navigation, global content search, and Git branch/change status through typed local backend contracts.
- Project switches clear project-owned trees, tabs, buffers, and pending operations; delayed reads, writes, searches, and Git responses are accepted only by the project and request that initiated them.
- Each selected project starts one initial tree and Git request. Refresh keeps already loaded tree entries and editor buffers visible and editable while the replacement request is pending.
- Global search shows full file/line destinations, pressed-state regex/case/word options, and distinct idle/loading/no-match states. Replace is not exposed until it has a working edit operation.
- Save writes the active text buffer through the project-owned backend contract and reports completion; reload restores the saved content.

## Research Notes

- VS Code treats command palette, keyboard shortcuts, sidebar/panel toggles, terminal, source control, split editors, status-bar branch switching, and context-menu staging as core habits.
- JetBrains positions code navigation, refactoring, debugging, analysis, version control, and local history as IDE-level trust features.
- Developer survey signals point to trust and verification pressure around AI tools: usage is broad, but accuracy distrust and "almost right" output remain major pain.
- AI-native IDE research points toward persistent artifacts, explicit context control, and autonomy negotiation as the next layer above normal editor chrome.

## Next Bets

Search and terminal controls have [narrow/enlarged-text evidence](../../../../../docs/design-system/next25-batch2-surfaces.md).
Terminal rename is keyboard reachable, returns focus after Enter/Escape, and keeps
the existing double-click shortcut. Preserve these callbacks and focus behavior
when changing the workbench shell.

- Extend editor model integration with diagnostics and diff views.
- Add agent handoff actions from selected file, selection, terminal output, and search result.
- Add local history/checkpoint restore before remote or multi-user behavior.
- Keep themes, shortcuts, menus, and notifications shared with harness preferences once backend contracts exist.

Sources: [VS Code docs](https://code.visualstudio.com/docs), [VS Code tips](https://code.visualstudio.com/docs/getstarted/tips-and-tricks/), [VS Code Settings Sync](https://code.visualstudio.com/docs/configure/settings-sync), [IntelliJ IDEA overview](https://www.jetbrains.com/help/idea/discover-intellij-idea.html), [Stack Overflow Developer Survey 2025](https://survey.stackoverflow.co/2025/), [Programming by Chat](https://arxiv.org/abs/2604.00436).
