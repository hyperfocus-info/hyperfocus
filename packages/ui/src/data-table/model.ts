export type TableColumn = { id: string; label: string; description?: string; sortable?: boolean; hideable?: boolean; numeric?: boolean };
export type TablePreferences = { version: 1; order: string[]; hidden: string[]; sort: { id: string; direction: 'asc' | 'desc' } | null };

export function normalizeTablePreferences(options: { columns: readonly TableColumn[]; value?: unknown }): TablePreferences {
  const ids = options.columns.map(column => column.id);
  if (!ids.length || new Set(ids).size !== ids.length || ids.some(id => !id.trim())) throw new Error('Table columns require unique nonempty IDs');
  const value = options.value && typeof options.value === 'object' ? options.value : {};
  const order = 'order' in value && Array.isArray(value.order) ? value.order.filter((id): id is string => typeof id === 'string' && ids.includes(id)) : [];
  const hidden = 'hidden' in value && Array.isArray(value.hidden) ? value.hidden.filter((id): id is string => typeof id === 'string' && options.columns.some(c => c.id === id && c.hideable !== false)) : [];
  const sort = 'sort' in value && value.sort && typeof value.sort === 'object' ? value.sort : null;
  return { version: 1, order: [...new Set([...order, ...ids])], hidden: [...new Set(hidden)],
    sort: sort && 'id' in sort && typeof sort.id === 'string' && options.columns.some(c => c.id === sort.id && c.sortable !== false)
      && 'direction' in sort && (sort.direction === 'asc' || sort.direction === 'desc') ? { id: sort.id, direction: sort.direction } : null };
}

export function compareTableValues(a: string | number | null, b: string | number | null, direction: 'asc' | 'desc') {
  const missingA = a === null || a === '' || typeof a === 'number' && !Number.isFinite(a);
  const missingB = b === null || b === '' || typeof b === 'number' && !Number.isFinite(b);
  if (missingA || missingB) return missingA === missingB ? 0 : missingA ? 1 : -1;
  const comparison = typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
  return direction === 'asc' ? comparison : -comparison;
}
