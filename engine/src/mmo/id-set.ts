export type MmoIdSet = Record<string, boolean>;

export type MmoIdSetInput = string | MmoIdSet | Iterable<string> | null | undefined;

function isIterableIds(value: MmoIdSetInput): value is Iterable<string> {
  return Boolean(value && typeof (value as Iterable<string>)[Symbol.iterator] === "function");
}

function emptyIdSet(): MmoIdSet {
  return Object.create(null) as MmoIdSet;
}

function setId(flags: MmoIdSet, id: string) {
  Object.defineProperty(flags, id, {
    value: true,
    configurable: true,
    enumerable: true,
    writable: true
  });
}

export function parseMmoIdSet(input: MmoIdSetInput): MmoIdSet {
  const flags = emptyIdSet();
  if (!input) return flags;
  if (typeof input === "string") {
    if (input) setId(flags, input);
    return flags;
  }
  if (isIterableIds(input)) {
    for (const id of input) {
      if (id) setId(flags, id);
    }
    return flags;
  }
  for (const [id, enabled] of Object.entries(input)) {
    if (enabled) setId(flags, id);
  }
  return flags;
}

export function hasMmoId(flags: MmoIdSet | undefined, id: string): boolean {
  return Boolean(id && flags && Object.prototype.hasOwnProperty.call(flags, id) && flags[id] === true);
}

export function addMmoId(flags: MmoIdSet, id: string): MmoIdSet {
  if (id) setId(flags, id);
  return flags;
}

export function removeMmoId(flags: MmoIdSet, id: string): MmoIdSet {
  if (id) delete flags[id];
  return flags;
}
