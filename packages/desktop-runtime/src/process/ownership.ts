import { terminateProcessTreeSync, type OwnedProcess } from "./terminate";

const children = new Set<OwnedProcess>();
let registered = false;

export function ownBackgroundProcess(child: OwnedProcess) {
  if (!child.pid) return;
  children.add(child);
  void child.exited.then(() => children.delete(child), () => children.delete(child));
  if (registered) return;
  registered = true;
  process.once("exit", cleanup);
  process.once("SIGINT", () => stop("SIGINT", 130));
  process.once("SIGTERM", () => stop("SIGTERM", 143));
}

function cleanup() {
  for (const child of children) terminateProcessTreeSync({ process: child });
  children.clear();
}

function stop(signal: NodeJS.Signals, exitCode: number) {
  cleanup();
  // Existing server shutdown handlers own their graceful completion. A plain
  // command runner still needs the normal signal exit behavior after cleanup.
  if (process.listenerCount(signal) === 0) process.exit(exitCode);
}
