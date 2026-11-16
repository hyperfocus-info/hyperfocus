import { inspectUploadSource, maxUploadSourceBytes } from './source.ts';
import { maxUploadDimension, readUploadRaster, uploadRasterBytes, type UploadRaster } from './raster.ts';

/** Browser owns native decoding; no encoded input, metadata or URL enters the upload contract. */
export async function prepareUploadRaster(options: { file: Blob; signal?: AbortSignal }): Promise<UploadRaster> {
  options.signal?.throwIfAborted();
  if (options.file.size > maxUploadSourceBytes) throw new Error('Choose a PNG or JPEG image under 2 MiB.');
  const bytes = new Uint8Array(await options.file.arrayBuffer());
  options.signal?.throwIfAborted();
  const source = inspectUploadSource(bytes);
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(new Blob([bytes], { type: source.mime })); }
  catch { throw new Error('This image could not be decoded. Choose another PNG or JPEG.'); }
  try {
    options.signal?.throwIfAborted();
    if (!(bitmap.width === source.width && bitmap.height === source.height
      || bitmap.width === source.height && bitmap.height === source.width)) throw new Error('Decoded image dimensions do not match its header.');
    const scale = Math.min(1, maxUploadDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale)), height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');canvas.width = width;canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Image preview is unavailable in this browser.');
    context.drawImage(bitmap, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height).data;
    let binary = '';
    for (const byte of pixels) binary += String.fromCharCode(byte);
    return readUploadRaster({ width, height, rgba: btoa(binary) });
  } finally { bitmap.close(); }
}

export function drawUploadRaster(options: { canvas: HTMLCanvasElement; raster: UploadRaster }) {
  const raster = readUploadRaster(options.raster), pixels = uploadRasterBytes(raster);
  options.canvas.width = raster.width;options.canvas.height = raster.height;
  const context = options.canvas.getContext('2d');
  if (!context) throw new Error('Image preview is unavailable in this browser.');
  context.putImageData(new ImageData(pixels, raster.width, raster.height), 0, 0);
}
