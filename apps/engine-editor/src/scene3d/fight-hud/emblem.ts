import { drawUploadRaster } from '@hyperfocus/touch-of-death/uploads/browser';
import type { UploadRaster } from '@hyperfocus/touch-of-death/uploads/raster';

/** Approved account artwork is presentation-only; hide/revoke releases canvas pixels immediately. */
export function createFighterEmblem(options: { draw?: typeof drawUploadRaster } = {}) {
  const canvas = document.createElement('canvas');canvas.dataset.fighterEmblem = '';canvas.hidden = true;canvas.width = canvas.height = 1;canvas.setAttribute('aria-hidden', 'true');
  let current: Readonly<UploadRaster> | undefined;
  return {
    canvas,
    render(raster?: Readonly<UploadRaster>) {
      if (raster === current) return !canvas.hidden;
      current = raster;
      if (!raster) { canvas.hidden = true;canvas.width = canvas.height = 1;return false; }
      try { (options.draw ?? drawUploadRaster)({canvas,raster});canvas.hidden = false;return true; }
      catch { canvas.hidden = true;canvas.width = canvas.height = 1;return false; }
    },
  };
}
