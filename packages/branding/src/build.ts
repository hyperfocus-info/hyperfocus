import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Resvg, initWasm } from '@resvg/resvg-wasm';
import { brandingSchema, socialSchema, validateLogo, type Branding, type SocialMetadata } from './model';
import { logoSvg } from './render';

const hash = (value: string | Uint8Array) => new Bun.CryptoHasher('sha256').update(value).digest('hex');
let initialized: Promise<void> | undefined;
export function brandRendererFile() { return Bun.resolveSync('@resvg/resvg-wasm/index_bg.wasm', import.meta.dir); }
async function initialize() {
  if (!initialized) initialized = (async () => {
    const adjacent = join(import.meta.dir, 'resvg.wasm');
    const path = await Bun.file(adjacent).exists() ? adjacent : brandRendererFile();
    await initWasm(await Bun.file(path).bytes());
  })();
  await initialized;
}

export async function createBrandFiles({ name, branding, social = socialSchema.parse({}), startUrl = '/' }: { name: string; branding: Branding; social?: SocialMetadata; startUrl?: string }) {
  await initialize();
  const brand = brandingSchema.parse(branding); socialSchema.parse(social);
  const asset = brand.logo ? validateLogo(brand.logo) : null;
  const source = asset?.mime === 'image/svg+xml' ? new TextDecoder().decode(Uint8Array.from(atob(asset.data), char => char.charCodeAt(0))) : asset ? `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><image href="data:${asset.mime};base64,${asset.data}" width="512" height="512" preserveAspectRatio="xMidYMid meet"/></svg>` : logoSvg({ branding: brand });
  const png = (svg: string, size: number) => {
    const renderer = new Resvg(svg, { fitTo: { mode: 'width', value: size }, font: { loadSystemFonts: false } });
    try { const result = renderer.render(); try { return result.asPng(); } finally { result.free(); } } finally { renderer.free(); }
  };
  const embedded = `data:image/svg+xml;base64,${Buffer.from(source).toString('base64')}`;
  const square = (padding: number) => `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="${brand.background}"/><image href="${embedded}" x="${padding}" y="${padding}" width="${512 - padding * 2}" height="${512 - padding * 2}"/></svg>`;
  const icon = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><image href="${embedded}" width="512" height="512" preserveAspectRatio="xMidYMid meet"/></svg>`;
  const small = png(icon, 32), ico = Buffer.alloc(22 + small.length);
  ico.writeUInt16LE(1, 2); ico.writeUInt16LE(1, 4); ico[6] = 32; ico[7] = 32; ico.writeUInt16LE(1, 10); ico.writeUInt16LE(32, 12); ico.writeUInt32LE(small.length, 14); ico.writeUInt32LE(22, 18); ico.set(small, 22);
  const socialSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="${brand.background}"/><image href="${embedded}" x="410" y="125" width="380" height="380"/></svg>`;
  const files: Record<string, string | Uint8Array> = {
    'logo.svg': source, 'favicon.svg': icon, 'favicon.ico': ico, 'favicon-32.png': small,
    'icon-192.png': png(icon, 192), 'icon-512.png': png(icon, 512), 'maskable-512.png': png(square(96), 512), 'apple-touch-icon.png': png(square(48), 180),
    'social.png': png(socialSvg, 1200),
    'site.webmanifest': JSON.stringify({ name, short_name: name.slice(0, 24), start_url: startUrl, display: 'standalone', background_color: brand.background, theme_color: brand.color, icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }, { src: 'icon-512.png', sizes: '512x512', type: 'image/png' }, { src: 'maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }] }, null, 2),
  };
  files['assets.json'] = JSON.stringify({ schema: 'hyperfocus-brand-assets-v1', name, source: asset?.name ?? `symbol:${brand.mark}`, sourceSha256: hash(source), customization: 'Replace the source logo in brand.json, then regenerate this directory. Do not edit renditions.', files: Object.entries(files).map(([path, bytes]) => ({ path, sha256: hash(bytes), bytes: typeof bytes === 'string' ? Buffer.byteLength(bytes) : bytes.length })) }, null, 2);
  return files;
}

export async function writeBrandAssets({ directory, ...options }: Parameters<typeof createBrandFiles>[0] & { directory: string }) {
  const files = await createBrandFiles(options); await mkdir(directory, { recursive: true });
  for (const [name, bytes] of Object.entries(files)) await Bun.write(join(directory, name), bytes);
  return { directory, files: Object.keys(files) };
}
