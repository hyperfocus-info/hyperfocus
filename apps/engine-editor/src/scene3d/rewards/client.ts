import { rewardCommandSchema, rewardResponseSchema, socialProgressSchema, type RewardCommand } from '@hyperfocus/touch-of-death/rewards/model';

export function createRewardClient(options: { send(command: RewardCommand): boolean }) {
  let latest: ReturnType<typeof rewardResponseSchema.parse> | undefined;
  let socialProgress: ReturnType<typeof socialProgressSchema.parse> | undefined;
  let pending: { id: string; resolve(value: ReturnType<typeof rewardResponseSchema.parse>): void; reject(reason: Error): void; timer: ReturnType<typeof setTimeout> } | undefined;
  function interrupt(reason = 'Rewards interrupted. Rejoin and retry.') { latest = undefined;socialProgress = undefined;if (pending) { clearTimeout(pending.timer);pending.reject(Error(reason));pending = undefined; } }
  return {
    interrupt,
    get latest() { return latest; },
    get socialProgress() { return socialProgress; },
    receive(raw: unknown) {
      const activity = socialProgressSchema.safeParse(raw);if (activity.success) { socialProgress = activity.data;return; }
      const parsed = rewardResponseSchema.safeParse(raw);if (!parsed.success) return;
      if (parsed.data.requestId === 'social-progress') { latest = parsed.data;return; }
      if (pending?.id !== parsed.data.requestId) return;
      latest = parsed.data;
      const current = pending;pending = undefined;clearTimeout(current.timer);
      if (parsed.data.error) current.reject(Object.assign(Error(parsed.data.error), { definitive: !parsed.data.retryable }));else current.resolve(parsed.data);
    },
    request(raw: RewardCommand) {
      const command = rewardCommandSchema.parse(raw);
      if (pending) return Promise.reject(Error('Wait for the current reward request.'));
      return new Promise<ReturnType<typeof rewardResponseSchema.parse>>((resolve, reject) => {
        pending = { id: command.requestId, resolve, reject, timer: setTimeout(() => interrupt('Reward request timed out. Retry the same action.'), 10000) };
        try { if (!options.send(command)) interrupt('Connect to a supporting host to use account rewards.'); }
        catch (cause) { interrupt(cause instanceof Error ? cause.message : 'Could not send rewards. Retry the same action.'); }
      });
    },
  };
}
