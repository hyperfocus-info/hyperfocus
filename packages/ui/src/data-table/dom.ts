import { compareTableValues, normalizeTablePreferences, type TableColumn, type TablePreferences } from './model';

/** Enhance a semantic table. Hosts supply raw sort values and own persistence. */
export function createDataTable(options: {
  table: HTMLTableElement; id: string; label: string; columns: readonly TableColumn[];
  preferences?: unknown; onChange?: (value: TablePreferences) => void;
  /** Optional host toolbar slot. Only the generated controls are removed on disposal. */
  toolbar?: HTMLElement;
}) {
  const { table, columns } = options;
  const header = table.tHead?.rows[0], body = table.tBodies[0];
  if (!header || !body || header.cells.length !== columns.length) throw new Error('Data table headers must match declared columns');
  const head = header;
  let preference = normalizeTablePreferences({ columns, value: options.preferences });
  const originalRows = [...body.rows];
  for (const row of [head, ...originalRows]) {
    if (row.cells.length !== columns.length) throw new Error('Data table rows must match declared columns');
    [...row.cells].forEach((cell, index) => { cell.dataset.column = columns[index]!.id; });
  }
  table.dataset.hfTable = options.id;
  table.setAttribute('aria-label', options.label);
  const toolbar = document.createElement('div'); toolbar.className = 'hf-table-toolbar';
  const summary = document.createElement('span'); summary.setAttribute('aria-live', 'polite');
  const trigger = button('Columns', () => dialog.showModal()); trigger.setAttribute('aria-label', `${options.label} columns`);
  toolbar.append(summary, trigger);
  trigger.dataset.hfTableCommand = 'columns';
  if (options.toolbar) { toolbar.dataset.inline = 'true'; options.toolbar.append(toolbar); }
  else table.parentElement?.before(toolbar);
  const dialog = document.createElement('dialog'); dialog.dataset.tableColumnsDialog = options.id; dialog.className = 'hf-table-columns';
  dialog.setAttribute('aria-label', `${options.label} column layout`);
  const title = document.createElement('h2'); title.textContent = 'Columns';
  const search = document.createElement('input'); search.type = 'search'; search.placeholder = 'Find a column'; search.setAttribute('aria-label', 'Find columns'); search.className = 'hf-table-column-search';
  const count = document.createElement('p'); count.className = 'hf-table-column-count';
  const footer = document.createElement('div'); footer.className = 'hf-table-column-footer';
  let draggingColumn: string | undefined;
  const list = document.createElement('ol');
  const reset = button('Reset table layout', () => { preference = normalizeTablePreferences({ columns, value: { sort: preference.sort } }); changed(); renderList(); });
  const close = button('Done', () => dialog.close()); close.className = 'hf-table-done';
  footer.append(reset, close); dialog.append(title, search, count, list, footer); document.body.append(dialog);
  search.oninput = renderList;
  const onClose = () => { trigger.focus(); document.dispatchEvent(new CustomEvent('hf-table-layout-close', { detail: { id: options.id } })); };
  dialog.addEventListener('close', onClose);
  trigger.addEventListener('click', renderList);
  for (const column of columns) {
    const cell = [...head.cells].find(cell => cell.dataset.column === column.id)!;
    if (column.sortable === false) continue;
    const sortButton = button(column.label, () => {
      const previous = preference.sort;
      preference.sort = previous?.id === column.id ? previous.direction === 'asc' ? { id: column.id, direction: 'desc' } : null : { id: column.id, direction: 'asc' };
      changed();
    });
    if (column.description) sortButton.title = column.description;
    cell.replaceChildren(sortButton);
  }
  function apply() {
    for (const row of [head, ...originalRows]) for (const [index, id] of preference.order.entries()) {
      const cell = [...row.cells].find(cell => cell.dataset.column === id)!;
      cell.hidden = preference.hidden.includes(id);
      if (row.cells[index] !== cell) row.insertBefore(cell, row.cells[index] ?? null);
    }
    for (const column of columns) {
      const cell = [...head.cells].find(cell => cell.dataset.column === column.id)!;
      const direction = preference.sort?.id === column.id ? preference.sort.direction : null;
      if (column.sortable !== false) {
        cell.setAttribute('aria-sort', direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : 'none');
        const control = cell.querySelector('button')!;
        const icon = document.createElement('span'); icon.className = 'hf-table-sort'; icon.setAttribute('aria-hidden', 'true'); icon.dataset.active = String(Boolean(direction)); icon.textContent = direction === 'asc' ? '↑' : direction === 'desc' ? '↓' : '↕';
        control.replaceChildren(document.createTextNode(column.label), icon);
        control.setAttribute('aria-label', `Sort ${column.label}: ${direction === 'asc' ? 'descending' : direction === 'desc' ? 'original order' : 'ascending'}`);
      }
    }
    const sort = preference.sort;
    const column = columns.find(c => c.id === sort?.id);
    const value = (row: HTMLTableRowElement) => {
      const cell = [...row.cells].find(c => c.dataset.column === sort?.id);
      const raw = cell?.dataset.sortValue ?? cell?.textContent?.trim() ?? '';
      return raw === '' ? null : column?.numeric ? Number(raw) : raw;
    };
    const rows = sort ? originalRows.map((row, index) => ({ row, index })).sort((a, b) => compareTableValues(value(a.row), value(b.row), sort.direction) || a.index - b.index).map(item => item.row) : originalRows;
    body.append(...rows);
    summary.textContent = `${columns.length - preference.hidden.length}/${columns.length} columns · ${sort ? `${column?.label} ${sort.direction === 'asc' ? 'ascending' : 'descending'}` : 'Original order'}`;
    trigger.title = summary.textContent;
  }
  function changed() { apply(); options.onChange?.(structuredClone(preference)); }
  function renderList() {
    const focused = document.activeElement instanceof HTMLElement ? { id: document.activeElement.dataset.column, action: document.activeElement.dataset.layoutAction } : null;
    list.replaceChildren();
    count.textContent = `${columns.length - preference.hidden.length} of ${columns.length} visible`;
    preference.order.forEach((id, index) => {
      const column = columns.find(column => column.id === id)!;
      if (search.value && !`${column.label} ${column.description ?? ''}`.toLowerCase().includes(search.value.toLowerCase())) return;
      const row = document.createElement('li'), label = document.createElement('label'), checkbox = document.createElement('input');
      checkbox.type = 'checkbox'; checkbox.checked = !preference.hidden.includes(id); checkbox.disabled = column.hideable === false;
      checkbox.setAttribute('aria-label', `Show ${column.label}`);
      checkbox.onchange = () => { preference.hidden = checkbox.checked ? preference.hidden.filter(value => value !== id) : [...preference.hidden, id]; changed(); };
      label.append(checkbox, document.createTextNode(column.label));
      if (column.description) label.title = column.description;
      const move = (delta: number) => {
        const target = index + delta; if (target < 0 || target >= preference.order.length) return;
        preference.order.splice(index, 1); preference.order.splice(target, 0, id); changed(); renderList();
      };
      const up = button('↑', () => move(-1)), down = button('↓', () => move(1));
      for (const [control, direction] of [[up, 'earlier'], [down, 'later']] as const) {
        control.dataset.column = id; control.dataset.layoutAction = direction; control.setAttribute('aria-label', `Move ${column.label} ${direction}`);
      }
      up.disabled = index === 0; down.disabled = index === preference.order.length - 1;
      const grip = document.createElement('span'); grip.textContent = '⠿'; grip.className = 'hf-table-column-grip'; grip.setAttribute('aria-hidden', 'true'); grip.title = `Drag ${column.label}; use the arrow buttons to move by keyboard`; grip.draggable = true;
      grip.ondragstart = event => { draggingColumn = id; event.dataTransfer?.setData('text/plain', id); };
      grip.ondragend = () => { draggingColumn = undefined; };
      row.ondragover = event => { if (draggingColumn && draggingColumn !== id) event.preventDefault(); };
      row.ondrop = event => { event.preventDefault(); if (!draggingColumn || draggingColumn === id) return; const next = preference.order.filter(value => value !== draggingColumn); next.splice(next.indexOf(id), 0, draggingColumn); preference.order = next; draggingColumn = undefined; changed(); renderList(); };
      row.append(grip, label, up, down); list.append(row);
    });
    if (focused?.id && focused.action) {
      const controls = [...list.querySelectorAll<HTMLButtonElement>('button')].filter(b => b.dataset.column === focused.id && !b.disabled);
      (controls.find(b => b.dataset.layoutAction === focused.action) ?? controls[0])?.focus();
    }
  }
  apply();
  return { get preferences() { return structuredClone(preference); }, dispose() { dialog.removeEventListener('close', onClose); dialog.close(); dialog.remove(); toolbar.remove(); } };
}
function button(label: string, click: () => void) { const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.onclick = click; return button; }
