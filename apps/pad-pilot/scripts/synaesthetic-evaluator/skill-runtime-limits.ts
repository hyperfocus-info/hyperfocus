export const DEFAULT_SKILL_TIMEOUT_MS = 5_000;
export const MAX_SKILL_TIMEOUT_MS = 60_000;
export const MAX_SKILL_WEIGHT = 100;

export function normalizeSkillWeight(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  return Math.min(MAX_SKILL_WEIGHT, Math.max(0, value));
}

export function normalizeSkillTimeout(value: number | undefined) {
  if (value === undefined) {
    return DEFAULT_SKILL_TIMEOUT_MS;
  }
  if (!Number.isFinite(value)) {
    throw new Error("Skill timeout must be finite.");
  }
  return Math.min(MAX_SKILL_TIMEOUT_MS, Math.max(1, Math.floor(value)));
}

export function withSkillDeadline<T>(operation: PromiseLike<T> | T, timeoutMs: number, name: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${name} timed out after ${timeoutMs}ms.`));
    }, timeoutMs);
    Promise.resolve(operation).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
