export function id3Size(value: number, synchsafe: boolean) {
  const base = synchsafe ? 128 : 256;
  return [3, 2, 1, 0].map(power => Math.floor(value / base ** power) % base);
}

export function id3Frame(options: { version?: number; id?: string; payload?: number[]; flags?: number }) {
  const payload = options.payload ?? [3, 49, 50, 48];
  return [...Array.from(options.id ?? 'TBPM', char => char.charCodeAt(0)), ...id3Size(payload.length, options.version === 4), 0, options.flags ?? 0, ...payload];
}

export function id3Tag(options: { version?: number; body?: number[]; flags?: number } = {}) {
  const version = options.version ?? 3, body = options.body ?? id3Frame({ version });
  return new Uint8Array([73, 68, 51, version, 0, options.flags ?? 0, ...id3Size(body.length, true), ...body]);
}
