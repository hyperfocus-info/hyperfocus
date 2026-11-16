import { dirname, extname, basename, resolve } from 'node:path';
import { z } from 'zod';
import { validateLogo } from './model';
import { brandHead } from './render';
import { writeBrandAssets } from './build';

export { brandConfigSchema } from './model';
import { brandConfigSchema } from './model';
export async function readBrandConfig({ configPath, logoPath }: { configPath: string; logoPath?: string }) {
  const config = brandConfigSchema.parse(await Bun.file(configPath).json());
  const source = logoPath || (config.logoPath ? resolve(dirname(configPath), config.logoPath) : undefined);
  if (source) {
    const types: Record<string, string> = { '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
    config.branding.logo = validateLogo({ name: basename(source), mime: types[extname(source).toLowerCase()], data: Buffer.from(await Bun.file(source).bytes()).toString('base64') });
  }
  return config;
}

export function applyBrandHead({ html, config, assetBase = './brand' }: { html: string; config: z.infer<typeof brandConfigSchema>; assetBase?: string }) {
  const head = `<!-- app-brand:start -->${brandHead({ name: config.name, title: config.name, description: config.description, branding: config.branding, social: config.social, assetBase })}<!-- app-brand:end -->`;
  if (html.includes('<!-- app-brand:start -->')) return html.replace(/<!-- app-brand:start -->[\s\S]*?<!-- app-brand:end -->/, head);
  return html.replace(/<link\b[^>]*rel=["'](?:icon|shortcut icon|apple-touch-icon|manifest|canonical)["'][^>]*>/gi, '')
    .replace(/<meta\b(?=[^>]*(?:property|name)=["'](?:og:|twitter:))[^>]*>/gi, '').replace('</head>', `${head}</head>`);
}

export async function buildConfiguredBrand({ configPath, directory, htmlPath, assetBase, logoPath }: { configPath: string; directory: string; htmlPath?: string; assetBase?: string; logoPath?: string }) {
  const config = await readBrandConfig({ configPath, logoPath });
  const result = await writeBrandAssets({ directory, name: config.name, branding: config.branding, social: config.social });
  if (htmlPath) { const before = await Bun.file(htmlPath).text(), after = applyBrandHead({ html: before, config, assetBase }); if (before !== after) await Bun.write(htmlPath, after); }
  return result;
}
