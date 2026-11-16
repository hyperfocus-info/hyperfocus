import type { UploadCommand, UploadResponse } from '@hyperfocus/touch-of-death/uploads/protocol';

/** Gallery actions and background outfit reads share the connection's single request lane. */
export function createUploadRequestQueue(options: { identity(): string; request(command: UploadCommand): Promise<UploadResponse> }) {
  let lane: Promise<unknown> = Promise.resolve(), count = 0;
  return (command: UploadCommand): Promise<UploadResponse> => {
    const identity = options.identity();
    if (!identity) return Promise.reject(new Error('Join a room before managing pictures.'));
    if (count >= 16) return Promise.reject(new Error('Too many picture actions. Wait and retry.'));
    const captured = structuredClone(command);count++;
    const task = lane.then(async () => {
      if (options.identity() !== identity) throw new Error('The room changed. Refresh and retry.');
      const response = await options.request(captured);
      if (options.identity() !== identity) throw new Error('The room changed. Refresh and retry.');
      return response;
    }).finally(() => { count--; });
    lane = task.catch(() => undefined);return task;
  };
}
