# Coverage Matrix

Maps every shipped user story from [user-stories.md](user-stories.md) to covering tests under `apps/harness/**/*.test.{ts,tsx}`.

**Depth legend**

- `unit` — colocated unit test at the component or function level
- `integration` — backend websocket or cross-boundary integration
- `unit+integration` — both layers
- `schema-only` — payload shape validated but behavior not asserted
- `none` — no test file touches it

**Gap legend**

- `OK` — covered at appropriate depth
- `GAP-LOW` — thin but exercised indirectly; raise only if behavior drifts
- `GAP-MED` — happy path only; edge / corner cases untested
- `GAP-HIGH` — no test file touches the story; highest priority to close

Roadmap stories are tracked in [user-stories.md](user-stories.md) and excluded from the coverage matrix until they ship.

New `US-*` stories start as `GAP-HIGH` here until at least one colocated or integration test covers them. See [../.agents/skills/update-apps/harness/SKILL.md](../.agents/skills/update-apps/harness/SKILL.md) `User Stories And Coverage`.

---

## WORKSPACE

| Story ID | Covered by | Depth | Gap |
|----------|-----------|-------|-----|
| US-WORKSPACE-001 | apps/harness/cli/src/workspace-repository.test.ts, apps/harness/cli/src/server.test.ts | integration | OK |
| US-WORKSPACE-002 | apps/harness/cli/src/workspace-repository.test.ts, apps/harness/cli/src/server.test.ts, apps/harness/ui/src/store/store.test.ts | unit+integration | OK |
| US-WORKSPACE-003 | apps/harness/cli/src/server.test.ts | integration | GAP-MED |
| US-WORKSPACE-004 | apps/harness/cli/src/branchfs-subagent-integration.test.ts | integration | GAP-MED |
| US-WORKSPACE-005 | apps/harness/cli/src/workspace-repository.test.ts, apps/harness/cli/src/server.test.ts, apps/harness/ui/src/store/store.test.ts | unit+integration | OK |
| US-WORKSPACE-006 | apps/harness/ui/src/components/project-switcher-dialog.test.tsx | unit | OK |
| US-WORKSPACE-007 | apps/harness/cli/src/project-search-service.test.ts, apps/harness/cli/src/server.test.ts | integration | OK |
| US-WORKSPACE-008 | apps/harness/cli/src/server.test.ts | integration | OK |
| US-WORKSPACE-009 | apps/harness/cli/src/server.test.ts | integration | OK |

## THREADS

| Story ID | Covered by | Depth | Gap |
|----------|-----------|-------|-----|
| US-THREADS-001 | apps/harness/cli/src/workspace-repository.test.ts, apps/harness/cli/src/server.test.ts | integration | OK |
| US-THREADS-002 | apps/harness/ui/src/components/project-sidebar.test.tsx | unit | GAP-MED |
| US-THREADS-003 | apps/harness/cli/src/workspace-repository.test.ts | integration | OK |
| US-THREADS-004 | apps/harness/cli/src/workspace-repository.test.ts | integration | OK |
| US-THREADS-005 | apps/harness/cli/src/workspace-repository.test.ts | integration | GAP-MED |
| US-THREADS-006 | apps/harness/ui/src/components/chat-panel.test.tsx, apps/harness/cli/src/server.projects-and-history.test.ts | unit+integration | OK |
| US-THREADS-007 | apps/harness/cli/src/server.projects-and-history.test.ts, apps/harness/ui/src/components/project-sidebar.test.tsx, apps/harness/ui/src/store/store.test.ts, apps/harness/cli/src/stream-pump.test.ts | unit+integration | OK |
| US-THREADS-008 | apps/harness/cli/src/protocol.test.ts, apps/harness/cli/src/run-milestone-windows.test.ts, apps/harness/cli/src/run-progress-heartbeats.test.ts, apps/harness/cli/src/server.subagents.test.ts, apps/harness/cli/src/stream-pump.test.ts, apps/harness/ui/src/store/store.test.ts, apps/harness/ui/src/components/chat-panel.test.tsx, apps/harness/ui/src/components/chat-panel.browser.test.ts, apps/harness/ui/src/components/primitives/virtual-list.browser.test.ts | unit+integration | OK |
| US-THREADS-009 | apps/harness/ui/src/components/project-sidebar.test.tsx | unit | OK |
| US-THREADS-010 | apps/harness/cli/src/workspace-repository.test.ts, apps/harness/cli/src/server.projects-and-history.test.ts, apps/harness/ui/src/components/project-sidebar.test.tsx, apps/harness/ui/src/store/store.test.ts | unit+integration | OK |

## PLANNING

| Story ID | Covered by | Depth | Gap |
|----------|-----------|-------|-----|
| US-PLANNING-001 | apps/harness/cli/src/server.test.ts | integration | GAP-MED |
| US-PLANNING-002 | apps/harness/cli/src/server.test.ts, apps/harness/ui/src/components/chat-panel.test.tsx | unit+integration | GAP-MED |
| US-PLANNING-003 | apps/harness/cli/src/server.test.ts, apps/harness/cli/src/workspace-repository.test.ts, apps/harness/ui/src/components/chat-panel.test.tsx | unit+integration | OK |
| US-PLANNING-004 | apps/harness/ui/src/components/chat-panel.test.tsx, apps/harness/ui/src/components/trace-panel.test.tsx | unit | OK |
| US-PLANNING-005 | apps/harness/cli/src/server.test.ts, apps/harness/ui/src/store/store.test.ts | unit+integration | GAP-MED |
| US-PLANNING-006 | apps/harness/ui/src/components/chat-panel.integration.test.tsx | unit | OK |
| US-PLANNING-007 | apps/harness/cli/src/workspace-repository.test.ts, apps/harness/cli/src/server.execution-main.test.ts, apps/harness/cli/src/server.test.ts | integration | OK |
| US-PLANNING-008 | apps/harness/cli/src/server.test.ts, apps/harness/ui/src/components/chat-panel.test.tsx | unit+integration | OK |
| US-PLANNING-009 | apps/harness/ui/src/components/execution-plan-dialog.test.tsx | unit | OK |
| US-PLANNING-010 | apps/harness/cli/src/pi-orchestrator.test.ts, apps/harness/cli/src/server.subagents.test.ts | unit+integration | OK |

## RUNS

| Story ID | Covered by | Depth | Gap |
|----------|-----------|-------|-----|
| US-RUNS-001 | apps/harness/cli/src/server.test.ts, apps/harness/ui/src/store/store.test.ts | unit+integration | OK |
| US-RUNS-002 | apps/harness/cli/src/server.test.ts, apps/harness/cli/src/workspace-repository.test.ts, apps/harness/ui/src/components/chat-panel.test.tsx | unit+integration | OK |
| US-RUNS-003 | apps/harness/cli/src/server.test.ts, apps/harness/cli/src/workspace-repository.test.ts, apps/harness/ui/src/components/chat-panel.test.tsx | unit+integration | OK |
| US-RUNS-004 | apps/harness/cli/src/server.projects-and-history.test.ts, apps/harness/ui/src/components/trace-panel.test.tsx | unit+integration | OK |
| US-RUNS-005 | apps/harness/cli/src/git-preflight.test.ts, apps/harness/cli/src/server.test.ts, apps/harness/ui/src/components/preferences-modal.test.tsx | unit+integration | OK |
| US-RUNS-006 | apps/harness/ui/src/components/followup-reset.integration.test.tsx, apps/harness/ui/src/store/store.test.ts | unit | OK |
| US-RUNS-007 | apps/harness/cli/src/branchfs-manager.test.ts, apps/harness/ui/src/components/chat-panel.test.tsx | unit+integration | GAP-MED |
| US-RUNS-008 | apps/harness/cli/src/server.test.ts, apps/harness/cli/src/protocol.test.ts, apps/harness/ui/src/components/chat-panel.test.tsx | unit+integration | OK |
| US-RUNS-009 | apps/harness/cli/src/protocol.test.ts, apps/harness/cli/src/server.test.ts, apps/harness/ui/src/store/store.test.ts | unit+integration | OK |
| US-RUNS-010 | apps/harness/cli/src/server.test.ts, apps/harness/ui/src/store/store.test.ts | unit+integration | OK |
| US-RUNS-011 | apps/harness/cli/src/server.test.ts | integration | GAP-MED |
| US-RUNS-012 | apps/harness/cli/src/server.test.ts, apps/harness/cli/src/server.execution-main.test.ts, apps/harness/cli/src/server.execution-main-1.test.ts, apps/harness/cli/src/workspace-repository.test.ts, apps/harness/cli/src/prompt-cache.test.ts, apps/harness/cli/src/gemini-cached-contents.test.ts, apps/harness/ui/src/store/store.test.ts | unit+integration | OK |
| US-RUNS-013 | apps/harness/cli/src/server.projects-and-history.test.ts, apps/harness/cli/src/server.test.ts | integration | OK |
| US-RUNS-014 | apps/harness/cli/src/git-preflight.test.ts, apps/harness/cli/src/server.execution-main.test.ts, apps/harness/ui/src/store/store.test.ts | unit+integration | OK |
| US-RUNS-015 | apps/harness/cli/src/protocol.test.ts, apps/harness/cli/src/workspace-repository.test.ts, apps/harness/cli/src/pi-orchestrator.test.ts, apps/harness/cli/src/pi-subagents.test.ts, apps/harness/cli/src/server.test.ts | unit+integration | OK |
| US-RUNS-016 | apps/harness/cli/src/protocol.test.ts, apps/harness/cli/src/server.test.ts | unit+integration | OK |

## PROVIDERS

| Story ID | Covered by | Depth | Gap |
|----------|-----------|-------|-----|
| US-PROVIDERS-001 | apps/harness/ui/src/store/store.test.ts | unit | GAP-MED |
| US-PROVIDERS-002 | apps/harness/cli/src/agent-runtimes/codex-cli-runtime.test.ts, apps/harness/cli/src/agent-runtimes/codex-sdk-adapter.test.ts, apps/harness/cli/src/pi-orchestrator.test.ts | unit | OK |
| US-PROVIDERS-003 | apps/harness/cli/src/server.test.ts | integration | OK |
| US-PROVIDERS-004 | apps/harness/cli/src/server.test.ts | integration | OK |
| US-PROVIDERS-005 | apps/harness/cli/src/subagent-defaults.test.ts, apps/harness/cli/src/agent-runtimes/codex-cli-runtime.test.ts, apps/harness/cli/src/server.test.ts | unit+integration | OK |
| US-PROVIDERS-006 | apps/harness/cli/src/workspace-repository.test.ts, apps/harness/cli/src/pi-agent-adapter.test.ts, apps/harness/ui/src/components/preferences-modal.test.tsx | unit+integration | OK |
| US-PROVIDERS-007 | apps/harness/ui/src/components/preferences-modal.test.tsx | unit | GAP-MED |

## RUNTIMES

| Story ID | Covered by | Depth | Gap |
|----------|-----------|-------|-----|
| US-RUNTIMES-001 | apps/harness/cli/src/agent-runtimes/codex-installation.test.ts, apps/harness/cli/src/agent-runtimes/codex-cli-runtime.test.ts, apps/harness/cli/src/agent-runtimes/codex-sdk-adapter.test.ts, apps/harness/cli/src/agent-runtimes/cli-health.test.ts, apps/harness/cli/src/pi-agent-adapter.test.ts | unit | OK |
| US-RUNTIMES-002 | apps/harness/cli/src/agent-runtimes/codex-installation.test.ts, apps/harness/cli/src/agent-runtimes/codex-sandbox-policy.test.ts, apps/harness/cli/src/agent-runtimes/codex-cli-runtime.test.ts, apps/harness/cli/src/agent-runtimes/codex-sdk-adapter.test.ts, apps/harness/cli/src/agent-runtimes/codex-sdk-live.test.ts, apps/harness/cli/src/agent-runtimes/cli-process-manager.test.ts, apps/harness/cli/src/bounded-output-buffer.test.ts, apps/harness/cli/src/pi-orchestrator.test.ts, apps/harness/cli/src/server.test.ts | unit/integration | OK |
| US-RUNTIMES-003 | apps/harness/cli/src/protocol.test.ts, apps/harness/cli/src/agent-runtimes/cli-session-manager.test.ts, apps/harness/cli/src/agent-runtimes/cli-process-manager.test.ts, apps/harness/cli/src/stream-pump.test.ts, apps/harness/ui/src/terminal/terminal-drawer.test.tsx | unit | OK |
| US-RUNTIMES-004 | apps/harness/cli/src/agent-runtimes/codex-sdk-adapter.test.ts, apps/harness/cli/src/pi-agent-adapter.test.ts | unit | GAP-MED |
| US-RUNTIMES-005 | apps/harness/cli/src/protocol.test.ts, apps/harness/cli/src/agent-runtimes/cli-session-manager.test.ts, apps/harness/ui/src/store/store.test.ts | unit | OK |
| US-RUNTIMES-006 | apps/harness/ui/src/components/chat-panel.test.tsx, apps/harness/ui/src/store/store.test.ts, apps/harness/cli/src/agent-runtimes/codex-sdk-adapter.test.ts, apps/harness/cli/src/pi-agent-adapter.test.ts, apps/harness/cli/src/protocol.test.ts | unit | GAP-MED |

## WORKTREE

| Story ID | Covered by | Depth | Gap |
|----------|-----------|-------|-----|
| US-WORKTREE-001 | apps/harness/cli/src/branchfs-manager.test.ts | integration | OK |
| US-WORKTREE-002 | apps/harness/cli/src/branchfs-subagent-integration.test.ts | integration | OK |
| US-WORKTREE-003 | apps/harness/cli/src/branchfs-subagent-integration.test.ts | integration | OK |
| US-WORKTREE-004 | apps/harness/cli/src/pi-subagents.test.ts, apps/harness/cli/src/pi-orchestrator.test.ts, apps/harness/cli/src/server.subagents.test.ts, apps/harness/cli/src/pi-planner.test.ts | unit+integration | OK |
| US-WORKTREE-005 | apps/harness/cli/src/pi-subagents.test.ts, apps/harness/cli/src/pi-orchestrator.test.ts, apps/harness/cli/src/server.subagents.test.ts, apps/harness/cli/src/pi-planner.test.ts | unit+integration | OK |
| US-WORKTREE-006 | apps/harness/cli/src/branchfs-subagent-integration.test.ts, apps/harness/cli/src/pi-orchestrator.test.ts | unit+integration | OK |
| US-WORKTREE-007 | apps/harness/cli/src/branchfs-subagent-integration.test.ts, apps/harness/cli/src/pi-subagents.test.ts, apps/harness/cli/src/pi-orchestrator.test.ts | unit+integration | OK |
| US-WORKTREE-008 | apps/harness/cli/src/branchfs-subagent-integration.test.ts | integration | OK |
| US-WORKTREE-009 | apps/harness/cli/src/pi-subagents.test.ts | unit | OK |
| US-WORKTREE-010 | apps/harness/cli/src/pi-subagents.test.ts, apps/harness/cli/src/pi-orchestrator.test.ts | unit | GAP-MED |
| US-WORKTREE-011 | apps/harness/cli/src/branchfs-cleanup.test.ts, apps/harness/cli/src/branchfs-manager.test.ts, apps/harness/cli/src/protocol.test.ts, apps/harness/ui/src/store/store.test.ts | unit+integration | OK |

## ATTACHMENTS

| Story ID | Covered by | Depth | Gap |
|----------|-----------|-------|-----|
| US-ATTACHMENTS-001 | apps/harness/cli/src/chat-attachment-prompt.test.ts, apps/harness/shared/chat-attachments.test.ts, apps/harness/cli/src/server.subagents.test.ts, apps/harness/cli/src/protocol.test.ts | unit+integration | OK |
| US-ATTACHMENTS-002 | apps/harness/ui/src/components/chat-panel-attachments.test.tsx, apps/harness/cli/src/document-extractors/document-extractors.test.ts, apps/harness/cli/src/server.subagents.test.ts | unit+integration | OK |
| US-ATTACHMENTS-003 | apps/harness/cli/src/workspace-repository.test.ts, apps/harness/cli/src/chat-attachment-prompt.test.ts, apps/harness/cli/src/protocol.test.ts | unit+integration | OK |
| US-ATTACHMENTS-004 | apps/harness/cli/src/document-extractors/document-extractors.test.ts | unit | OK |

## MODES

| Story ID | Covered by | Depth | Gap |
|----------|-----------|-------|-----|
| US-MODES-001 | apps/harness/cli/src/server.test.ts, apps/harness/shared/mode-intent.test.ts | unit+integration | GAP-MED |
| US-MODES-002 | apps/harness/shared/mode-intent.test.ts, apps/harness/cli/src/workspace-path-intent.test.ts, apps/harness/cli/src/pi-planner.test.ts, apps/harness/cli/src/pi-orchestrator.test.ts, apps/harness/cli/src/server.test.ts | unit+integration | OK |
| US-MODES-003 | apps/harness/cli/src/server.test.ts, apps/harness/ui/src/components/chat-panel.test.tsx | unit+integration | OK |
| US-MODES-004 | apps/harness/shared/mode-intent.test.ts, apps/harness/cli/src/server.test.ts | unit+integration | OK |
| US-MODES-005 | apps/harness/cli/src/protocol.test.ts | schema-only | GAP-MED |
| US-MODES-006 | apps/harness/cli/src/pi-orchestrator.test.ts, apps/harness/cli/src/server.test.ts, apps/harness/cli/src/workspace-repository.test.ts | unit+integration | OK |
| US-MODES-007 | apps/harness/cli/src/protocol.test.ts | schema-only | OK |
| US-MODES-008 | apps/harness/cli/src/global-skills.test.ts, apps/harness/cli/src/assistant-capabilities.test.ts, apps/harness/cli/src/pi-subagents.test.ts | unit | OK |

## ASSISTANTS

| Story ID | Covered by | Depth | Gap |
|----------|-----------|-------|-----|
| US-ASSISTANTS-001 | apps/harness/shared/protocol.test.ts, apps/harness/shared/intent-contract.test.ts, apps/harness/cli/src/assistant-capabilities.test.ts, apps/harness/cli/src/assistant-intent.test.ts, apps/harness/cli/src/assistant-chat-actions.test.ts, apps/harness/cli/src/assistant-question-policy.test.ts, apps/harness/cli/src/assistant-factory.test.ts, apps/harness/cli/src/background-job-executor.test.ts, apps/harness/cli/src/server.assistant-chat-actions.test.ts, apps/harness/cli/src/server.preferences-and-modes.test.ts, apps/harness/cli/src/workspace-repository.test.ts, apps/harness/ui/src/components/chat-panel.test.tsx, apps/harness/ui/src/components/assistants-panel.test.tsx, apps/harness/ui/src/components/preferences-modal.test.tsx, apps/harness/ui/src/store/store.test.ts | unit+integration | OK |
| US-ASSISTANTS-002 | apps/harness/shared/protocol.test.ts, apps/harness/cli/src/workspace-repository.test.ts, apps/harness/cli/src/server.preferences-and-modes.test.ts, apps/harness/ui/src/components/assistants-panel.test.tsx, apps/harness/ui/src/store/store.test.ts | unit+integration | OK |
| US-ASSISTANTS-003 | apps/harness/shared/protocol.test.ts, apps/harness/shared/intent-contract.test.ts, apps/harness/cli/src/workspace-repository.test.ts, apps/harness/cli/src/assistant-manager.test.ts, apps/harness/cli/src/assistant-factory.test.ts, apps/harness/cli/src/background-job-executor.test.ts | unit+integration | OK |
| US-ASSISTANTS-004 | apps/harness/cli/src/workspace-repository.test.ts, apps/harness/cli/src/assistant-factory.test.ts, apps/harness/cli/src/background-job-executor.test.ts, apps/harness/cli/src/server.assistant-chat-actions.test.ts, apps/harness/ui/src/components/assistants-panel.test.tsx | unit+integration | GAP-MED |
| US-ASSISTANTS-005 | apps/harness/cli/src/assistant-question-policy.test.ts, apps/harness/cli/src/assistant-manager.test.ts, apps/harness/cli/src/server.assistant-chat-actions.test.ts | unit+integration | OK |
| US-ASSISTANTS-006 | apps/harness/cli/src/assistant-manager.test.ts, apps/harness/cli/src/assistant-job-bootstrap.test.ts, apps/harness/cli/src/protocol.test.ts, apps/harness/ui/src/components/notification-inbox.test.tsx | unit+integration | OK |
| US-ASSISTANTS-007 | apps/harness/shared/protocol.test.ts, apps/harness/cli/src/assistant-todo-policy.test.ts, apps/harness/cli/src/workspace-repository.test.ts, apps/harness/cli/src/assistant-manager.test.ts, apps/harness/cli/src/assistant-job-bootstrap.test.ts, apps/harness/cli/src/background-job-executor.test.ts, apps/harness/cli/src/pi-planner.test.ts, apps/harness/ui/src/components/assistants-panel.test.tsx | unit+integration | OK |

## JOBS

| Story ID | Covered by | Depth | Gap |
|----------|-----------|-------|-----|
| US-JOBS-001 | apps/harness/shared/intent-contract.test.ts, apps/harness/cli/src/ansi-storage.test.ts, apps/harness/cli/src/background-job-schedule.test.ts, apps/harness/cli/src/background-job-scheduler.test.ts, apps/harness/cli/src/background-job-executor.test.ts, apps/harness/cli/src/assistant-question-policy.test.ts, apps/harness/cli/src/workspace-repository.test.ts, apps/harness/cli/src/background-job-command-guards.test.ts, apps/harness/cli/src/run-diagnostics.test.ts, apps/harness/cli/src/run-failure-classification.test.ts, apps/harness/cli/src/server.preferences-and-modes.test.ts, apps/harness/ui/src/components/background-jobs-panel.test.tsx, apps/harness/ui/src/components/preferences-modal.test.tsx | unit+integration | OK |
| US-JOBS-002 | apps/harness/ui/src/app.test.tsx, apps/harness/cli/src/background-job-executor.test.ts, apps/harness/ui/src/components/background-jobs-panel.test.tsx | unit | GAP-MED |
| US-JOBS-003 | apps/harness/cli/src/background-job-scheduler.test.ts, apps/harness/cli/src/background-job-command-guards.test.ts, apps/harness/cli/src/server.projects-and-history.test.ts | integration | OK |
| US-JOBS-004 | apps/harness/cli/src/background-job-schedule.test.ts, apps/harness/cli/src/background-job-scheduler.test.ts, apps/harness/cli/src/background-job-command-guards.test.ts, apps/harness/cli/src/background-job-executor.test.ts, apps/harness/cli/src/bounded-output-buffer.test.ts, apps/harness/cli/src/server.preferences-and-modes.test.ts | unit+integration | OK |

## NOTIFICATIONS

| Story ID | Covered by | Depth | Gap |
|----------|-----------|-------|-----|
| US-NOTIFICATIONS-001 | apps/harness/cli/src/server.background-run-notifications.test.ts, apps/harness/ui/src/components/notification-inbox.test.tsx | unit | OK |
| US-NOTIFICATIONS-002 | apps/harness/cli/src/notification-ids.test.ts, apps/harness/cli/src/protocol.test.ts, apps/harness/ui/src/components/notification-inbox.test.tsx | unit+integration | OK |
| US-NOTIFICATIONS-003 | apps/harness/ui/src/components/primitives/overlay-stack.test.ts, apps/harness/ui/src/components/primitives/portal-scale.test.tsx, apps/harness/ui/src/components/primitives/dialog.test.tsx, apps/harness/ui/src/components/primitives/sheet.test.tsx | unit | OK |

## BROWSER

| Story ID | Covered by | Depth | Gap |
|----------|-----------|-------|-----|
| US-BROWSER-001 | apps/harness/cli/src/browser-session-state.test.ts, apps/harness/cli/src/server.browser-approvals.test.ts, apps/harness/ui/src/components/trace-panel.test.tsx | unit+integration | OK |
| US-BROWSER-002 | apps/harness/ui/src/components/trace-panel.test.tsx | unit | GAP-MED |
| US-BROWSER-003 | apps/harness/cli/src/browser-session-state.test.ts, apps/harness/cli/src/server.browser-approvals.test.ts, apps/harness/cli/src/workspace-repository.test.ts | unit+integration | OK |

## ACTIVATION

| Story ID | Covered by | Depth | Gap |
|----------|-----------|-------|-----|
| US-ACTIVATION-001 | — | none | GAP-HIGH |
| US-ACTIVATION-002 | apps/harness/ui/src/components/setup-checklist-card.test.tsx, apps/harness/cli/src/setup-health.test.ts | unit | OK |
| US-ACTIVATION-003 | apps/harness/ui/src/components/setup-checklist-card.test.tsx, apps/harness/cli/src/setup-health.test.ts | unit | OK |
| US-ACTIVATION-004 | apps/harness/ui/src/components/help-tutorial-dialog.test.tsx, apps/harness/ui/src/components/tutorial-overlay.test.tsx | unit | OK |
| US-ACTIVATION-005 | apps/harness/ui/src/components/project-switcher-dialog.test.tsx | unit | OK |
| US-ACTIVATION-006 | apps/harness/cli/src/server.test.ts | integration | GAP-MED |
| US-ACTIVATION-007 | apps/harness/cli/src/server.preferences-and-modes.test.ts, apps/harness/ui/src/components/chat-panel.test.tsx | unit+integration | OK |

## UI

| Story ID | Covered by | Depth | Gap |
|----------|-----------|-------|-----|
| US-UI-001 | apps/harness/ui/src/app.test.tsx | unit | OK |
| US-UI-002 | apps/harness/ui/src/components/primitives/dialog.test.tsx, apps/harness/ui/src/components/primitives/sheet.test.tsx, apps/harness/ui/src/components/primitives/dropdown.test.tsx, apps/harness/ui/src/components/primitives/overlay-stack.test.ts, apps/harness/ui/src/components/primitives/portal-scale.test.tsx, apps/harness/ui/src/components/modal-dismiss.integration.test.tsx, apps/harness/ui/src/toast-store.test.ts | unit+integration | OK |
| US-UI-003 | apps/harness/ui/src/components/preferences-modal.test.tsx | unit | GAP-MED |
| US-UI-004 | — | none | GAP-LOW |
| US-UI-005 | apps/harness/ui/src/components/ui-primitive-guard.test.ts | unit | OK |
| US-UI-006 | apps/harness/ui/src/app.test.tsx | unit | OK |
| US-UI-007 | apps/harness/ui/src/components/chat-panel.test.tsx | unit | OK |
| US-UI-008 | apps/harness/ui/src/components/chat-panel.test.tsx | unit | GAP-MED |
| US-UI-009 | apps/harness/ui/src/components/chat-panel.test.tsx | unit | OK |
| US-UI-010 | apps/harness/ui/src/components/markdown-content.test.tsx | unit | OK |
| US-UI-011 | apps/harness/ui/src/components/primitives/dialog.test.tsx, apps/harness/ui/src/components/primitives/sheet.test.tsx | unit | OK |
| US-UI-012 | apps/harness/ui/src/components/project-sidebar.test.tsx | unit | OK |
| US-UI-013 | apps/harness/ui/src/toast-store.test.ts, apps/harness/ui/src/components/markdown-content.test.tsx | unit | OK |
| US-UI-014 | apps/harness/ui/src/app.test.tsx | unit | OK |
| US-UI-015 | apps/harness/cli/src/run-milestone-windows.test.ts, apps/harness/cli/src/server.subagents.test.ts, apps/harness/ui/src/components/chat-panel.test.tsx, apps/harness/ui/src/components/trace-panel.test.tsx, apps/harness/ui/src/components/primitives/virtual-list.browser.test.ts | unit+integration | OK |
| US-UI-016 | apps/harness/cli/src/protocol.test.ts, apps/harness/ui/src/store/store.test.ts, apps/harness/ui/src/components/chat-panel.test.tsx | unit | OK |
| US-UI-017 | apps/harness/ui/src/components/chat-panel.test.tsx, apps/harness/ui/src/components/trace-panel.test.tsx, apps/harness/ui/src/components/primitives/virtual-list.browser.test.ts | unit | GAP-MED |
| US-UI-018 | apps/harness/ui/src/components/notification-inbox.test.tsx | unit | GAP-MED |
| US-UI-019 | apps/harness/ui/src/store/store.test.ts | unit | OK |
| US-UI-020 | apps/harness/cli/src/tool-activity-state.test.ts, apps/harness/ui/src/components/chat-panel.test.tsx, apps/harness/ui/src/components/trace-panel.test.tsx | unit | GAP-MED |
| US-UI-021 | apps/harness/ui/src/lib/trace-panel-model.test.ts, apps/harness/ui/src/components/trace-panel.test.tsx | unit | OK |
| US-UI-022 | apps/harness/cli/src/ide-project-service.test.ts, apps/harness/cli/src/protocol.test.ts, apps/harness/ui/src/ide/ide-workbench.test.tsx, apps/harness/ui/src/app.test.tsx | unit | GAP-MED |
| US-UI-023 | apps/harness/cli/src/protocol.test.ts, apps/harness/cli/src/terminal/terminal-session-manager.test.ts, apps/harness/ui/src/app.test.tsx, apps/harness/ui/src/terminal/terminal-drawer.test.tsx, apps/harness/ui/src/terminal/terminal-links.test.ts, apps/harness/ui/src/terminal/renderers/terminal-renderer-benchmark.test.ts | unit | GAP-MED |
| US-UI-024 | apps/harness/cli/src/protocol.test.ts, apps/harness/cli/src/terminal/terminal-session-manager.test.ts, apps/harness/cli/src/terminal/terminal-ws-mock-client.test.ts, apps/harness/ui/src/components/chat-panel.test.tsx, apps/harness/ui/src/components/trace-panel.test.tsx, apps/harness/ui/src/terminal/terminal-drawer.test.tsx, apps/harness/ui/src/terminal/terminal-store.test.ts, apps/harness/ui/src/terminal/terminal-keybindings.test.ts | unit+integration | OK |

## PERSISTENCE

| Story ID | Covered by | Depth | Gap |
|----------|-----------|-------|-----|
| US-PERSISTENCE-001 | apps/harness/cli/src/workspace-repository.test.ts | integration | OK |
| US-PERSISTENCE-002 | apps/harness/cli/src/workspace-repository.test.ts, apps/harness/cli/src/server.test.ts | integration | OK |
| US-PERSISTENCE-003 | apps/harness/cli/src/server.test.ts | integration | OK |
| US-PERSISTENCE-004 | apps/harness/cli/src/server.test.ts | integration | OK |
| US-PERSISTENCE-005 | apps/harness/cli/src/server.test.ts | integration | OK |
| US-PERSISTENCE-006 | apps/harness/cli/src/workspace-repository.test.ts | integration | GAP-MED |
| US-PERSISTENCE-007 | apps/harness/cli/src/workspace-repository.test.ts, apps/harness/cli/src/server.projects-and-history.test.ts, apps/harness/cli/src/protocol.test.ts, apps/harness/ui/src/store/store.test.ts, apps/harness/ui/src/components/chat-panel.test.tsx | unit+integration | OK |
| US-PERSISTENCE-008 | apps/harness/cli/src/browser-session-state.test.ts, apps/harness/ui/src/store/store.test.ts | unit | OK |
| US-PERSISTENCE-009 | apps/harness/cli/src/browser-session-state.test.ts, apps/harness/ui/src/store/store.test.ts | unit | OK |
| US-PERSISTENCE-010 | apps/harness/cli/src/workspace-repository.test.ts | integration | OK |
| US-PERSISTENCE-011 | apps/harness/ui/src/store/store.test.ts | unit | OK |
| US-PERSISTENCE-012 | apps/harness/ui/src/store/store.test.ts | unit | OK |
| US-PERSISTENCE-013 | apps/harness/ui/src/store/store.test.ts | unit | GAP-MED |
| US-PERSISTENCE-014 | apps/harness/cli/src/browser-session-state.test.ts | unit | OK |
| US-PERSISTENCE-015 | apps/harness/ui/src/store/store.test.ts | unit | GAP-MED |
| US-PERSISTENCE-016 | apps/harness/cli/src/harness-paths.test.ts, apps/harness/cli/src/workspace-repository.test.ts | unit | OK |

## PREFERENCES

| Story ID | Covered by | Depth | Gap |
|----------|-----------|-------|-----|
| US-PREFERENCES-001 | apps/harness/cli/src/server.test.ts, apps/harness/cli/src/protocol.test.ts, apps/harness/cli/src/workspace-repository.test.ts, apps/harness/ui/src/components/preferences-modal.test.tsx, apps/harness/ui/src/harness-websocket.test.ts | unit+integration | OK |
| US-PREFERENCES-002 | apps/harness/cli/src/pi-agent-adapter.test.ts, apps/harness/cli/src/workspace-repository.test.ts | integration | OK |
| US-PREFERENCES-003 | apps/harness/ui/src/store/store.test.ts | unit | OK |

## DEV

| Story ID | Covered by | Depth | Gap |
|----------|-----------|-------|-----|
| US-DEV-001 | apps/harness/cli/src/launch-harness.test.ts, apps/harness/cli/src/websocket-compression.test.ts | unit+integration | OK |
| US-DEV-002 | apps/harness/cli/src/cli-options.test.ts, apps/harness/cli/src/cli-entry.test.ts | unit | GAP-MED |
| US-DEV-003 | apps/harness/cli/src/launch-harness.test.ts, apps/harness/cli/src/server.startup.test.ts, apps/harness/cli/src/ui-build.test.ts, apps/harness/ui/src/mount-app.test.tsx | unit+integration | OK |
| US-DEV-004 | apps/harness/cli/src/launch-harness.test.ts, apps/harness/cli/src/server.startup.test.ts | integration | GAP-LOW |
| US-DEV-005 | apps/harness/cli/src/launch-harness.test.ts | integration | OK |
| US-DEV-006 | apps/harness/cli/src/ui-build.test.ts | integration | OK |
| US-DEV-007 | apps/harness/cli/src/cli-options.test.ts, apps/harness/cli/src/cli-entry.test.ts, apps/harness/cli/src/doctor-cleanup.test.ts | unit | GAP-MED |
| US-DEV-008 | apps/harness/cli/src/cli-entry.test.ts, apps/harness/cli/src/cli-options.test.ts, apps/harness/cli/src/fatal-startup-log.test.ts | unit | OK |
| US-DEV-009 | apps/harness/cli/src/ui-build.test.ts | integration | OK |
| US-DEV-010 | scripts/test-runner.test.ts, scripts/coverage-matrix.test.ts | unit | OK |
| US-DEV-011 | — | none | GAP-LOW |
| US-DEV-012 | apps/harness/cli/src/launch-harness.test.ts, apps/harness/cli/src/dev-db-recovery.test.ts | integration | OK |
| US-DEV-013 | apps/harness/cli/src/dev-db-recovery.test.ts, apps/harness/cli/src/launch-harness.test.ts | integration | OK |
| US-DEV-014 | apps/harness/cli/src/workspace-repository.test.ts | integration | OK |
| US-DEV-015 | apps/harness/cli/src/dev-db-recovery.test.ts, apps/harness/cli/src/launch-harness.test.ts | integration | OK |
| US-DEV-016 | apps/harness/cli/src/workspace-repository.test.ts | integration | OK |
| US-DEV-017 | apps/harness/ui/src/utils/tests/test-harness.ts, apps/harness/ui/src/components/primitives/virtual-list.browser.test.ts | integration | OK |
| US-DEV-018 | apps/harness/cli/src/protocol.test.ts, apps/harness/cli/src/server.test.ts | unit+integration | OK |
| US-DEV-019 | apps/harness/cli/src/pi-agent-adapter.test.ts, apps/harness/cli/src/pi-orchestrator.test.ts | unit | OK |
| US-DEV-020 | apps/harness/cli/src/pi-orchestrator.test.ts, apps/harness/cli/src/trace-timestamps.test.ts, apps/harness/ui/src/lib/trace-panel-model.test.ts, apps/harness/ui/src/components/trace-panel.test.tsx | unit | GAP-MED |
| US-DEV-021 | apps/harness/cli/src/development-telemetry.test.ts | unit | OK |
| US-DEV-022 | apps/harness/ui/src/components/ui-primitive-guard.test.ts | unit | OK |
| US-DEV-023 | scripts/screenshot.test.ts, apps/harness/cli/src/bounded-output-buffer.test.ts | unit | OK |
| US-DEV-024 | apps/harness/cli/src/startup-telemetry.test.ts, apps/harness/cli/src/launch-harness.test.ts, apps/harness/cli/src/server.test.ts | unit+integration | OK |
| US-DEV-025 | apps/harness/cli/src/agent-runtimes/toolchain.test.ts, apps/harness/cli/src/pi-subagents.test.ts, apps/harness/cli/src/pi-orchestrator.test.ts | unit | OK |
| US-DEV-026 | apps/harness/cli/src/server.startup.test.ts | integration | GAP-MED |

## SEARCH

| Story ID | Covered by | Depth | Gap |
|----------|-----------|-------|-----|
| US-SEARCH-001 | apps/harness/cli/src/project-search-service.test.ts, apps/harness/ui/src/components/project-switcher-dialog.test.tsx, apps/harness/ui/src/app.test.tsx | unit+integration | OK |
| US-SEARCH-002 | apps/harness/ui/src/components/project-switcher-dialog.test.tsx | unit | OK |
| US-SEARCH-003 | apps/harness/cli/src/server.projects-and-history.test.ts, apps/harness/ui/src/components/project-switcher-dialog.test.tsx | unit+integration | OK |

## MARKDOWN

| Story ID | Covered by | Depth | Gap |
|----------|-----------|-------|-----|
| US-MARKDOWN-001 | apps/harness/ui/src/components/markdown-content.test.tsx | unit | OK |
| US-MARKDOWN-002 | apps/harness/ui/src/components/markdown-content.test.tsx | unit | OK |

---

## Priority gaps

### Very high priority left open

- **US-ACTIVATION-001 / US-DEV-002 / US-DEV-007** - activation, bootstrap, doctor, and portable launcher packaging need end-to-end release-path coverage.

### Other GAP-MED (happy path only)

- US-WORKSPACE-003 / -004, US-THREADS-002 / -005, US-PLANNING-001 / -002 / -005, US-RUNS-007 / -011, US-PROVIDERS-001 / -007, US-RUNTIMES-004 / -006, US-WORKTREE-010, US-MODES-001 / -005, US-ASSISTANTS-004, US-JOBS-002, US-BROWSER-002, US-ACTIVATION-006, US-UI-003 / -008 / -017 / -018 / -020 / -022 / -023, US-PERSISTENCE-006 / -013 / -015, US-DEV-020 / -026

### GAP-LOW (exercised indirectly, raise only on drift)

- US-UI-004 (lucide icon consistency), US-DEV-011 (`bun run typecheck` invocation)

