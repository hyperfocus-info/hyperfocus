import { isRecord } from '@hyperfocus/utilities/records';

/** One wrong primitive type at a time, with the untouched source as the oracle.
 * Optional undefined remains valid and is intentionally skipped. */
export function* corruptStructuralLeaves(value: unknown, path = ''): Generator<{ path: string; value: unknown }> {
  if (Array.isArray(value)) {
    for (const [index, child] of value.entries()) for (const corrupt of corruptStructuralLeaves(child, `${path}/${index}`)) {
      const copy: unknown[] = [...value];copy[index] = corrupt.value;yield { path: corrupt.path, value: copy };
    }
  } else if (isRecord(value)) {
    for (const [key, child] of Object.entries(value)) for (const corrupt of corruptStructuralLeaves(child, `${path}/${key}`)) yield { path: corrupt.path, value: { ...value, [key]: corrupt.value } };
  } else if (value !== undefined) yield { path, value: typeof value === 'number' ? 'not-a-number' : typeof value === 'string' || typeof value === 'boolean' ? 42 : {} };
}
