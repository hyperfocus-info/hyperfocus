/** Cardinal sibling navigation: never choose a diagonal just because it is next in the DOM. */
export function adjacentMenuTarget(options: { targets: readonly HTMLElement[]; current: HTMLElement; direction: 'up' | 'down' | 'left' | 'right' }) {
  const { targets, current, direction } = options;
  const bounds = (element: HTMLElement) => (element.matches('input,select,textarea') ? element.closest('label') ?? element : element).getBoundingClientRect();
  const source = bounds(current);
  const vertical = direction === 'up' || direction === 'down', sign = direction === 'up' || direction === 'left' ? -1 : 1;
  // DOM-only hosts have no layout. Keep vertical traversal usable there without
  // treating a horizontal press as an undocumented next/previous shortcut.
  if (!source.width || !source.height) return vertical ? targets[(targets.indexOf(current) + sign + targets.length) % targets.length] : current;
  const center = (rect: DOMRect, axis: boolean) => axis ? (rect.top + rect.bottom) / 2 : (rect.left + rect.right) / 2;
  const siblings = targets.filter(target => target !== current).map(target => ({ target, rect: bounds(target) })).filter(({ rect }) => rect.width > 0 && rect.height > 0 && (vertical
    ? Math.min(source.right, rect.right) - Math.max(source.left, rect.left) > 4
    : Math.min(source.bottom, rect.bottom) - Math.max(source.top, rect.top) > Math.min(source.height, rect.height) * .5));
  const ahead = siblings.filter(({ rect }) => (center(rect, vertical) - center(source, vertical)) * sign > 2);
  ahead.sort((a, b) => (center(a.rect, vertical) - center(b.rect, vertical)) * sign || Math.abs(center(a.rect, !vertical) - center(source, !vertical)) - Math.abs(center(b.rect, !vertical) - center(source, !vertical)));
  if (ahead[0]) return ahead[0].target;
  if (!vertical) return current;
  siblings.sort((a, b) => (center(a.rect, true) - center(b.rect, true)) * sign || Math.abs(center(a.rect, false) - center(source, false)) - Math.abs(center(b.rect, false) - center(source, false)));
  return siblings[0]?.target ?? current;
}
