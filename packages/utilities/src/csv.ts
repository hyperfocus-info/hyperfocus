/** Quoted CSV cell with optional spreadsheet formula neutralization. Numeric
 * negatives stay numeric; string negatives are neutralized by default. */
export function csvCell(value: string | number, { preventFormulas = true, stringNegatives = true, formulaPolicy = 'immediate', numeric = false }: {
  preventFormulas?: boolean; stringNegatives?: boolean; formulaPolicy?: 'immediate' | 'whitespace'; numeric?: boolean;
} = {}) {
  const output = String(value);
  const dangerous = formulaPolicy === 'whitespace' ? /^\s*[=+@-]/.test(output) || /^[\t\r\n]/.test(output)
    : /^[=+@\t\r]/.test(output) || stringNegatives && typeof value === 'string' && output.startsWith('-');
  const safe = preventFormulas && !numeric && dangerous ? `'${output}` : output;
  return `"${safe.replaceAll('"', '""')}"`;
}
