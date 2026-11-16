
export function normalizeSignedZero(value: number) {
  return value === 0 ? 0 : value;
}

export function requirePort(port: number | undefined): number {
  if (port === undefined) throw new Error("Benchmark server port was not allocated.");
  return port;
}

export function required(argv: string[], index: number, flag: string) {
  const value = argv[index];
  if (!value) throw new Error(`${flag} requires value`);
  return value;
}
