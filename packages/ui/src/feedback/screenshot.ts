import type { BugReportScreenshot } from './report';

const maximumBytes = 2097152;
async function canvasScreenshot(source: CanvasImageSource, width: number, height: number): Promise<BugReportScreenshot> {
  if (!width || !height || width * height > 40_000_000) throw new Error('Choose an image below 40 megapixels.');
  const scale = Math.min(1, 1920 / Math.max(width, height));
  const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext('2d'); if (!context) throw new Error('Screenshot capture is unavailable.');
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL('image/png');
  if (dataUrl.length > maximumBytes * 4 / 3) throw new Error('This screenshot is too large. Crop it and attach it again (maximum 2 MB).');
  return { name: 'screenshot.png', dataUrl };
}

/** Re-encode selected images to PNG, stripping source metadata. No files leave the browser here. */
export async function readReportScreenshot(file: File) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 10485760) throw new Error('Choose a PNG, JPEG or WebP image below 10 MB.');
  const image = await createImageBitmap(file);
  try { return await canvasScreenshot(image, image.width, image.height); }
  finally { image.close(); }
}

/** Native chooser requires an explicit gesture; stop every acquired track after one frame. */
export async function captureReportScreenshot() {
  if (!navigator.mediaDevices?.getDisplayMedia) throw new Error('Screen capture is unavailable here. Attach a screenshot instead.');
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  const video = document.createElement('video'); video.muted = true; video.srcObject = stream;
  try { await video.play(); return await canvasScreenshot(video, video.videoWidth, video.videoHeight); }
  finally { stream.getTracks().forEach(track => track.stop()); video.srcObject = null; }
}
