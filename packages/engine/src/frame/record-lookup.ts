export type FrameRecordLookupStrategy = 'linear' | 'slots';
export type FrameRecordLookupWork = {
  requests: number; linearVisits: number; slotChecks: number; indexBuilds: number; indexVisits: number;
  typedBytes: number; retainedIds: number;
};
export type FrameRecordLookup = {
  get<T extends { id: string }>(records: readonly T[], id: string): T | undefined;
  readonly work: Readonly<FrameRecordLookupWork>;
  resetWork(): void;
};

/** A bounded lookup plan for uniquely identified records. Retains authored IDs
 * and numeric slots, never the input array or its records. Every cached hit
 * validates the current record ID. Missing/reordered slots rebuild the numeric
 * index; IDs outside the plan use the ordinary first-match scan. Inputs may be
 * detached, reordered or partial between calls; duplicate IDs are unsupported.
 * Counters are optional and typedBytes excludes engine-dependent Map storage.
 */
export function createFrameRecordLookup(options: { ids: readonly string[]; strategy: FrameRecordLookupStrategy; diagnostics?: boolean }): FrameRecordLookup {
  if (options.strategy !== 'linear' && options.strategy !== 'slots') throw new Error('Unsupported frame record lookup strategy.');
  if (new Set(options.ids).size !== options.ids.length) throw new Error('Frame lookup authored IDs must be unique.');
  const diagnostics = options.diagnostics === true;
  const indices = options.strategy === 'slots' ? new Map(options.ids.map((id, index) => [id, index])) : undefined;
  const slots = indices ? Int32Array.from({ length: indices.size }, (_, index) => index) : undefined;
  const work: FrameRecordLookupWork = { requests: 0, linearVisits: 0, slotChecks: 0, indexBuilds: 0, indexVisits: 0, typedBytes: slots?.byteLength ?? 0, retainedIds: indices?.size ?? 0 };
  function linear<T extends { id: string }>(records: readonly T[], id: string): T | undefined {
    for (let index = 0; index < records.length; index++) {
      const record = records[index]!;
      if (record.id === id) { if (diagnostics) work.linearVisits += index + 1;return record; }
    }
    if (diagnostics) work.linearVisits += records.length;
    return undefined;
  }
  function indexed<T extends { id: string }>(records: readonly T[], id: string): T | undefined {
    const planned = indices!.get(id);
    if (planned === undefined) return linear(records, id);
    const slot = slots![planned]!, current = slot >= 0 ? records[slot] : undefined;
    if (diagnostics) work.slotChecks++;
    if (current?.id === id) return current;
    slots!.fill(-1);
    for (let index = 0; index < records.length; index++) {
      const plannedIndex = indices!.get(records[index]!.id);
      if (plannedIndex !== undefined && slots![plannedIndex] === -1) slots![plannedIndex] = index;
    }
    if (diagnostics) { work.indexBuilds++;work.indexVisits += records.length; }
    const next = slots![planned]!;
    return next < 0 ? undefined : records[next];
  }
  const read = indices ? indexed : linear;
  const get: FrameRecordLookup['get'] = diagnostics ? (records, id) => { work.requests++;return read(records, id); } : read;
  return { get, work, resetWork() { work.requests = work.linearVisits = work.slotChecks = work.indexBuilds = work.indexVisits = 0; } };
}
