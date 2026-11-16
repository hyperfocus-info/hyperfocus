/** Borrowed for one synchronous presentation only. Remeasure after layout changes. */
export type CanvasGeometry = { width: number; height: number; left: number; top: number };

export function readCanvasGeometry(canvas: HTMLCanvasElement, into: CanvasGeometry): CanvasGeometry {
  into.width = canvas.clientWidth;into.height = canvas.clientHeight;
  into.left = canvas.offsetLeft;into.top = canvas.offsetTop;
  return into;
}
