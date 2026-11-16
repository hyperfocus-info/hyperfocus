/**
 * Select fixed authored identities from freshly evaluated records without rescanning
 * the scene. IDs must be unique within each input. Cached slots are checked on every
 * call; missing/reordered slots rebuild one temporary index. Output is a fresh array
 * in requested-ID order containing live input references, never copied records.
 * Retained storage is bounded by requested IDs and holds no previous frame objects.
 */
export function createFrameRecordSelection(options: { ids: readonly string[]; diagnostics?: boolean }) {
  const ids = [...options.ids], slots = new Int32Array(ids.length).fill(-1);
  if (new Set(ids).size !== ids.length) throw new Error('Frame selection IDs must be unique.');
  const work = { slotChecks: 0, indexBuilds: 0, indexVisits: 0, recordReads: 0, selectedRecords: 0, slotBytes: slots.byteLength };
  const select = <T extends { id: string }>(records: readonly T[]): T[] => {
    if (options.diagnostics) work.slotChecks = work.indexBuilds = work.indexVisits = work.recordReads = work.selectedRecords = 0;
    const selected: T[] = [];
    let lookup: Map<string, number> | undefined;
    for (let i = 0; i < ids.length; i++) {
      if (options.diagnostics) { work.slotChecks++;work.recordReads++; }
      const id = ids[i]!, previous = records[slots[i]!];
      if (previous?.id === id) { selected.push(previous);continue; }
      if (!lookup) {
        lookup = new Map();
        if (options.diagnostics) { work.indexBuilds++;work.indexVisits += records.length;work.recordReads += records.length; }
        for (let j = 0; j < records.length; j++) lookup.set(records[j]!.id, j);
      }
      const slot = lookup.get(id) ?? -1;
      slots[i] = slot;
      if (slot >= 0) { selected.push(records[slot]!);if (options.diagnostics) work.recordReads++; }
    }
    if (options.diagnostics) work.selectedRecords = selected.length;
    return selected;
  };
  // Borrowed per-call counts. Retain a copy to compare calls; no clock or frame
  // references are retained by diagnostics.
  return Object.assign(select, { readWork: (): Readonly<typeof work> => work });
}

/** Select an explicitly ordered set of slots, preserving duplicate IDs. This
 * primitive certifies only the requested slots, not that they form a complete
 * predicate result. Its owner must rebuild the plan when membership/layout
 * changes. A mismatched slot returns undefined, never stale or partial records.
 * Retains IDs and numeric slots only; output borrows current record references. */
export function createOrderedFrameRecordSelection(options: { indices: readonly number[]; ids: readonly string[]; diagnostics?: boolean }) {
  if (options.indices.length !== options.ids.length) throw Error('Ordered selection indices and IDs must have equal lengths.');
  let previous = -1;
  for (const index of options.indices) {
    if (!Number.isInteger(index) || index <= previous || index > 0x7fffffff) throw Error('Ordered selection indices must be increasing nonnegative integers.');
    previous = index;
  }
  const slots = Int32Array.from(options.indices), ids = [...options.ids];
  const work = { slotChecks: 0, recordReads: 0, selectedRecords: 0, mismatches: 0, bindingEntries: slots.length, slotBytes: slots.byteLength };
  const select = <T extends { id: string }>(records: readonly T[]): T[] | undefined => {
    if (options.diagnostics) work.slotChecks = work.recordReads = work.selectedRecords = work.mismatches = 0;
    const selected: T[] = [];
    for (let index = 0; index < slots.length; index++) {
      const record = records[slots[index]!];
      if (options.diagnostics) { work.slotChecks++;work.recordReads++; }
      if (!record || record.id !== ids[index]) { if (options.diagnostics) work.mismatches++;return; }
      selected.push(record);
    }
    if (options.diagnostics) work.selectedRecords = selected.length;
    return selected;
  };
  return Object.assign(select, { readWork: (): Readonly<typeof work> => work });
}
