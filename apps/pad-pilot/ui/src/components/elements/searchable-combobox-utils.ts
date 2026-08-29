/**
 * Filters and sorts combobox items using the shared PadPilot combobox ordering rules.
 */
export function filterSearchableComboboxItems<T extends { description?: string; favorite?: boolean; keywords?: readonly string[]; kind?: string; label: string }>(items: T[], query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  const source = normalizedQuery
    ? items.filter((item) => [item.label, item.description ?? "", ...(item.keywords ?? [])]
        .some((value) => value.toLowerCase().includes(normalizedQuery)))
    : items;

  return [...source].sort((left, right) => {
    if ((left.favorite ?? false) !== (right.favorite ?? false)) {
      return left.favorite ? -1 : 1;
    }

    if ((left.kind ?? "") !== (right.kind ?? "")) {
      return left.kind === "factory" ? -1 : 1;
    }

    return left.label.localeCompare(right.label);
  });
}

export function resolveSearchableComboboxItemId<T extends { id: string; label: string }>(
  items: readonly T[],
  value: string,
) {
  return items.find((item) => item.id === value || item.label === value)?.id;
}
