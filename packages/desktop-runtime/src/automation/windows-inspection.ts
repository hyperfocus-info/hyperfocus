import { spawnBackgroundProcessSync } from "../process/spawn";

type WindowsProcess = { pid: number; parentPid: number; name: string; commandLine: string; createdAt: string };
type WindowsWindow = { pid: number; handle: string; title: string; className: string };

/** Preserve creation identities when inspecting an owned browser after cleanup. */
export function inspectBrowserWindows({ pid, expectedProcesses }: {
  pid: number; expectedProcesses?: readonly Pick<WindowsProcess, "pid" | "createdAt">[];
}) {
  if (process.platform !== "win32") return { platform: process.platform, applicable: false, processes: [], visibleWindows: [] };
  if (expectedProcesses && !expectedProcesses.some(entry => entry.pid === pid && entry.createdAt)) throw new Error("Owned browser creation identity is missing.");
  return { ...inspectWindowsProcessTrees({ rootPids: [pid], expectedProcesses }), platform: process.platform, applicable: true,
    ...(expectedProcesses ? { expectedProcesses, identityVerified: true } : {}) };
}

const inspectionScript = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class HyperfocusWindowInspection {
  public delegate bool WindowCallback(IntPtr window, IntPtr parameter);
  [DllImport("user32.dll")] static extern bool EnumWindows(WindowCallback callback, IntPtr parameter);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr window);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr window, StringBuilder text, int maximum);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr window, StringBuilder text, int maximum);
  public static object[] Read() {
    var windows = new List<object>();
    EnumWindows((window, parameter) => {
      if (!IsWindowVisible(window)) return true;
      uint pid;
      GetWindowThreadProcessId(window, out pid);
      var title = new StringBuilder(2048);
      var className = new StringBuilder(256);
      GetWindowText(window, title, title.Capacity);
      GetClassName(window, className, className.Capacity);
      windows.Add(new { pid, handle = window.ToInt64().ToString(), title = title.ToString(), className = className.ToString() });
      return true;
    }, IntPtr.Zero);
    return windows.ToArray();
  }
}
'@
$taskProcesses = @(Get-CimInstance Win32_Process | ForEach-Object {
  @{ pid = [int]$_.ProcessId; parentPid = [int]$_.ParentProcessId; name = [string]$_.Name; commandLine = [string]$_.CommandLine; createdAt = $_.CreationDate.ToUniversalTime().ToString('o') }
})
@{ processes = $taskProcesses; windows = @([HyperfocusWindowInspection]::Read()) } | ConvertTo-Json -Compress -Depth 5
`;

/** Enumerates real visible HWNDs and scopes them to owned process trees, including conhost children. */
export function inspectWindowsProcessTrees(options: { rootPids: readonly number[]; expectedProcesses?: readonly Pick<WindowsProcess, "pid" | "createdAt">[] }) {
  if (process.platform !== "win32") throw new Error("Windows process inspection requires Windows.");
  if (options.rootPids.length === 0 || options.rootPids.some((pid) => !Number.isSafeInteger(pid) || pid <= 0)) {
    throw new Error("Process inspection requires at least one positive integer PID.");
  }
  const result = spawnBackgroundProcessSync({ cmd: ["powershell.exe", "-NoProfile", "-NonInteractive", "-EncodedCommand",
    Buffer.from(inspectionScript, "utf16le").toString("base64")], stdout: "pipe", stderr: "pipe", timeout: 15000 });
  if (result.error) throw result.error;
  if (result.exitCode !== 0) throw new Error(`Windows process inspection failed: ${(result.stderr?.toString() ?? '').trim()}`);
  const snapshot: unknown = JSON.parse(result.stdout?.toString() ?? '');
  if (!isSnapshot(snapshot)) throw new Error("Windows process inspection returned an invalid snapshot.");
  const processes = selectOwnedWindowsProcesses({ processes: snapshot.processes, ...options });
  const ownedPids = new Set(processes.map(entry => entry.pid));
  return {
    capturedAt: new Date().toISOString(),
    rootPids: [...options.rootPids],
    processes,
    visibleWindows: snapshot.windows.filter((entry) => ownedPids.has(entry.pid))
  };
}

/** Creation times prevent recycled PIDs from claiming unrelated processes. */
export function selectOwnedWindowsProcesses(options: {
  processes: readonly WindowsProcess[];
  rootPids: readonly number[];
  expectedProcesses?: readonly Pick<WindowsProcess, "pid" | "createdAt">[];
}) {
  const current = new Map(options.processes.map(entry => [entry.pid, entry]));
  const expected = new Map(options.expectedProcesses?.map(entry => [entry.pid, entry]));
  const owned = new Map<number, { createdAt: string; replacedAt?: string }>();
  for (const pid of options.rootPids) {
    const recorded = expected.get(pid);
    const live = current.get(pid);
    if (recorded) owned.set(pid, { createdAt: recorded.createdAt, replacedAt: live?.createdAt !== recorded.createdAt ? live?.createdAt : undefined });
    else if (live) owned.set(pid, { createdAt: live.createdAt });
  }
  let previousSize = -1;
  while (owned.size !== previousSize) {
    previousSize = owned.size;
    for (const child of options.processes) {
      const parent = owned.get(child.parentPid);
      if (!parent || child.createdAt < parent.createdAt || (parent.replacedAt && child.createdAt >= parent.replacedAt)) continue;
      if (!owned.has(child.pid)) owned.set(child.pid, { createdAt: child.createdAt });
    }
  }
  return options.processes.filter(entry => owned.get(entry.pid)?.createdAt === entry.createdAt);
}

function isSnapshot(value: unknown): value is { processes: WindowsProcess[]; windows: WindowsWindow[] } {
  if (!value || typeof value !== "object" || !("processes" in value) || !("windows" in value)
    || !Array.isArray(value.processes) || !Array.isArray(value.windows)) return false;
  return value.processes.every((entry) => entry && Number.isInteger(entry.pid) && Number.isInteger(entry.parentPid)
      && typeof entry.name === "string" && typeof entry.commandLine === "string" && typeof entry.createdAt === "string")
    && value.windows.every((entry) => entry && Number.isInteger(entry.pid) && typeof entry.handle === "string"
      && typeof entry.title === "string" && typeof entry.className === "string");
}

if (import.meta.main) {
  const report = inspectWindowsProcessTrees({ rootPids: process.argv.slice(2).map(Number) });
  console.log(JSON.stringify(report, null, 2));
  if (report.visibleWindows.length > 0) process.exitCode = 1;
}
