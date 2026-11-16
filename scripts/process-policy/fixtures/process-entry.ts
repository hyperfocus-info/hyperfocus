/** Windows inspection fixtures use a fixed month to express process ancestry. */
export function processEntry(pid: number, parentPid: number, day: string) {
  return { pid, parentPid, name: 'test.exe', commandLine: 'test', createdAt: `2026-09-${day}T00:00:00.0000000Z` };
}
