
export function formatSignedValue(value: number) {
  return (Math.round(value * 100) / 100).toFixed(2);
}
