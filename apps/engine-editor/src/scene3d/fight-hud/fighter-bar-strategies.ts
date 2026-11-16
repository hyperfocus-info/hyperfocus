export function readFighterBarWriteStrategy(value: unknown) {
  if (value !== 'original' && value !== 'changed-writes') throw Error(`Unsupported fighter bar write strategy: ${String(value)}`);
  return value;
}

export function readFighterBarEntityStrategy(value: unknown) {
  if (value !== 'original' && value !== 'selected') throw Error(`Unsupported fighter bar entity strategy: ${String(value)}`);
  return value;
}
