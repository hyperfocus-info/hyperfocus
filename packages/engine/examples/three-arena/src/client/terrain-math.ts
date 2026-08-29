export function terrainSeed(ix: number, iz: number, salt = 0): number {
  const value = Math.sin(ix * 127.1 + iz * 311.7 + salt * 74.7) * 43758.5453123;
  return value - Math.floor(value);
}
