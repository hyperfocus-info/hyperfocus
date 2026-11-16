

export function makeItems(count: number): TestItem[] {
  return Array.from({ length: count }, (_, index) => ({ id: `row-${index}`, label: `Row ${index}` }));
}

export type TestItem = {
  id: string;
  label: string;
};
