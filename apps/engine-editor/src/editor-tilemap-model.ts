import type { EditorProject } from "@hyperfocus/engine/project";

export function resizeEditorTilemap(project: EditorProject, columns: number, rows: number, anchor: "top-left" | "center" = "top-left"): void {
  assertDimension(columns, "columns");
  assertDimension(rows, "rows");
  if (columns * rows > 1_048_576) throw new Error("Tilemap may contain at most 1,048,576 cells.");
  const previous = project.tilemap;
  const values = Array<number>(columns * rows).fill(0);
  const offsetX = anchor === "center" ? Math.floor((columns - previous.columns) / 2) : 0;
  const offsetY = anchor === "center" ? Math.floor((rows - previous.rows) / 2) : 0;
  for (let y = 0; y < previous.rows; y += 1) for (let x = 0; x < previous.columns; x += 1) {
    const nextX = x + offsetX;
    const nextY = y + offsetY;
    if (nextX >= 0 && nextY >= 0 && nextX < columns && nextY < rows) values[nextY * columns + nextX] = previous.values[y * previous.columns + x] ?? 0;
  }
  previous.columns = columns;
  previous.rows = rows;
  previous.values = values;
}

export function setEditorTile(project: EditorProject, column: number, row: number, value: number): void {
  assertCell(project, column, row);
  assertTile(value);
  project.tilemap.values[row * project.tilemap.columns + column] = value;
}

export function fillEditorTiles(project: EditorProject, value: number): void {
  assertTile(value);
  project.tilemap.values.fill(value);
}

export function setEditorTileSolid(project: EditorProject, value: number, solid: boolean): void {
  assertTile(value);
  const values = new Set(project.tilemap.solidValues);
  if (solid) values.add(value); else values.delete(value);
  project.tilemap.solidValues = [...values].sort((a, b) => a - b);
}

export function commitExtractedTileCollision(project: EditorProject, solidValues: readonly number[]): void {
  if (solidValues.length > 256) throw new Error("Tile collision metadata supports at most 256 solid values.");
  const unique = new Set<number>();
  for (const value of solidValues) { assertTile(value); unique.add(value); }
  project.tilemap.solidValues = [...unique].sort((a, b) => a - b);
}

export function assignEditorTileset(project: EditorProject, assetId: string): void {
  const asset = project.assets.find((candidate) => candidate.id === assetId);
  if (!asset) throw new Error(`Asset does not exist: ${assetId}`);
  if (asset.kind !== "image") throw new Error(`${asset.name} is not an image tileset.`);
  project.tilemap.sourceAssetId = asset.id;
}

function assertCell(project: EditorProject, column: number, row: number) {
  if (!Number.isInteger(column) || !Number.isInteger(row) || column < 0 || row < 0 || column >= project.tilemap.columns || row >= project.tilemap.rows) throw new Error(`Tile cell is outside the ${project.tilemap.columns} × ${project.tilemap.rows} map.`);
}

function assertDimension(value: number, label: string) {
  if (!Number.isInteger(value) || value < 1 || value > 1_024) throw new Error(`Tilemap ${label} must be an integer from 1 through 1024.`);
}

function assertTile(value: number) {
  if (!Number.isInteger(value) || value < 0 || value > 65_535) throw new Error("Tile value must be an integer from 0 through 65535.");
}
