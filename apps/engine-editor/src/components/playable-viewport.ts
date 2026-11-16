/** The authored map determines the same bounded logical canvas in every 2D host. */
export function resolvePlayableViewport(options: { tilemap: { columns: number; rows: number; tileSize: number } }) {
  const { columns, rows, tileSize } = options.tilemap;
  return { width: Math.min(1920, Math.max(320, Math.ceil(columns * tileSize))), height: Math.min(1080, Math.max(240, Math.ceil(rows * tileSize))) };
}
