import { inspectWindowsProcessTrees } from '@hyperfocus/desktop-runtime/automation/windows-inspection';
export { inspectWindowsProcessTrees, selectOwnedWindowsProcesses } from '@hyperfocus/desktop-runtime/automation/windows-inspection';

if (import.meta.main) {
  const report = inspectWindowsProcessTrees({ rootPids: process.argv.slice(2).map(Number) });
  console.log(JSON.stringify(report, null, 2));
  if (report.visibleWindows.length > 0) process.exitCode = 1;
}
