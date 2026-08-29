const PROCESS_REAP_TIMEOUT_MS = 5_000;

type BoundedSubprocess = {
  exited: Promise<number>;
  kill: () => void;
};

export async function terminateAndReapProcess(
  subprocess: BoundedSubprocess,
  timeoutMs: number,
  label: string,
  terminate: () => void = () => subprocess.kill(),
) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error("Process reap deadline must be a positive integer.");
  }
  try {
    terminate();
  } catch {}

  let reapDeadline: ReturnType<typeof setTimeout> | null = null;
  try {
    const outcome = await Promise.race([
      subprocess.exited.then((exitCode) => ({ exitCode, reaped: true } as const)),
      new Promise<{ readonly reaped: false }>((resolve) => {
        reapDeadline = setTimeout(() => resolve({ reaped: false }), timeoutMs);
      }),
    ]);
    if (!outcome.reaped) {
      throw new Error(`${label} did not exit within ${timeoutMs} ms after termination.`);
    }
    return outcome.exitCode;
  } finally {
    if (reapDeadline) clearTimeout(reapDeadline);
  }
}

export async function waitForProcessWithDeadline(
  subprocess: BoundedSubprocess,
  timeoutMs: number,
  label: string,
  terminate?: () => void,
) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error("Process deadline must be a positive integer.");
  }

  let deadline: ReturnType<typeof setTimeout> | null = null;
  try {
    const outcome = await Promise.race([
      subprocess.exited.then((exitCode) => ({ exitCode, timedOut: false } as const)),
      new Promise<{ readonly timedOut: true }>((resolve) => {
        deadline = setTimeout(() => resolve({ timedOut: true }), timeoutMs);
      }),
    ]);
    if ("exitCode" in outcome) return outcome.exitCode;
  } finally {
    if (deadline) clearTimeout(deadline);
  }

  await terminateAndReapProcess(subprocess, PROCESS_REAP_TIMEOUT_MS, label, terminate);
  throw new Error(`${label} timed out after ${timeoutMs} ms.`);
}
