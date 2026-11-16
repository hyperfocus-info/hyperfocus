/** Transport grace runs before these terminal callbacks. Host interruption never concedes. */
export function concedesPlayedMatch(reason: string): boolean {
  return ['leave', 'duplicate-login', 'reconnect-timeout', 'connection-close'].includes(reason);
}
