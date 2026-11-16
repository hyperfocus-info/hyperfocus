
export function required(argv: string[], index: number, flag: string) {
  const value = argv[index];
  if (!value) throw new Error(`${flag} requires a value`);
  return value;
}
