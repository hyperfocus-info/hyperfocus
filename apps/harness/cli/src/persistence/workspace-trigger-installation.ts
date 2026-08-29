import type { Database } from "bun:sqlite";
import { ensureMessageContentLimitTriggers, ensureThreadMessageRevisionTriggers } from "./message-content-policy";
import { ensureNotificationRevisionTriggers } from "./notification-persistence";
import { ensureWorkspacePageRevisionTriggers } from "./workspace-page-revisions";
import { ensureRunLifecycleSequences } from "./run-lifecycle-sequence";
import { withImmediateMigrationScope } from "./persistence-migrations";
import { ensureBrowserApprovalInvariant } from "./run/terminal-run-transition";

export function installWorkspaceMutationTriggers(db: Database, whileLocked?: () => void) {
  withImmediateMigrationScope(db, (scope) => {
    ensureNotificationRevisionTriggers(db); ensureMessageContentLimitTriggers(db);
    ensureThreadMessageRevisionTriggers(db); ensureRunLifecycleSequences(db, scope);
    ensureWorkspacePageRevisionTriggers(db); ensureBrowserApprovalInvariant(db, scope); whileLocked?.();
  });
}
