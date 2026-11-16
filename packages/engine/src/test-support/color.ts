export function createFakeColor(value: unknown) {
  const color = { r: 1, g: 1, b: 1 };
  if (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value)) return color;
  color.r = Number.parseInt(value.slice(1, 3), 16) / 255;
  color.g = Number.parseInt(value.slice(3, 5), 16) / 255;
  color.b = Number.parseInt(value.slice(5, 7), 16) / 255;
  return color;
}
