
export function argValue(argv: string[], name: string, fallback: string) {
  const equals = `--${name}=`;
  const index = argv.indexOf(`--${name}`);
  if (index >= 0) return argv[index + 1] ?? fallback;
  return argv.find((arg) => arg.startsWith(equals))?.slice(equals.length) ?? fallback;
}

export function numberArg(argv: string[], name: string, fallback: number) {
  const value = Number(argValue(argv, name, String(fallback)));
  if (!Number.isFinite(value) || value < 0) throw new Error(`--${name} must be a non-negative number`);
  return value;
}

export function percentDelta(value: number, baseline: number) {
  return ((value - baseline) / Math.max(0.001, baseline)) * 100;
}
