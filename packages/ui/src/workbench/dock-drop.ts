import type { DockDropPosition } from './dock-layout';

/** Edge intent uses the nearest normalized edge; the central area joins the group. */
export function dockDropPosition(x: number, y: number, width: number, height: number): DockDropPosition {
  if (width <= 0 || height <= 0) return 'center';
  const horizontal = x / width, vertical = y / height;
  const edge = Math.min(horizontal, 1 - horizontal, vertical, 1 - vertical);
  if (edge > 0.24) return 'center';
  if (edge === horizontal) return 'left';
  if (edge === 1 - horizontal) return 'right';
  return edge === vertical ? 'top' : 'bottom';
}
