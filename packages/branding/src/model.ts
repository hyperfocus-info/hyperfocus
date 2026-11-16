import { z } from 'zod';

export const markNames = ['spark', 'book', 'chart', 'grid', 'play', 'leaf', 'orbit', 'shield', 'wave', 'controller'] as const;
export const colorSchema = z.string().regex(/^#[a-f0-9]{6}$/i);
export const logoAssetSchema = z.object({ name: z.string().min(1).max(120), mime: z.enum(['image/svg+xml', 'image/png', 'image/jpeg', 'image/webp']), data: z.string().min(1).max(4_194_304).regex(/^[A-Za-z0-9+/]+={0,2}$/) }).strict();
export const brandingSchema = z.object({ mark: z.enum(markNames).default('spark'), color: colorSchema.default('#8b5cf6'), background: colorSchema.default('#15131c'), logo: logoAssetSchema.nullable().default(null) }).strict();
const publicUrl = z.string().max(2048).refine(value => {
  if (!value) return true;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; }
}, 'Use an absolute https:// URL.');
export const socialSchema = z.object({ title: z.string().max(240).default(''), description: z.string().max(1000).default(''), image: publicUrl.default(''), imageAlt: z.string().max(240).default(''), canonicalUrl: publicUrl.default(''), siteName: z.string().max(120).default(''), type: z.enum(['website', 'article']).default('website'), locale: z.string().regex(/^[a-z]{2}_[A-Z]{2}$/).default('en_US') }).strict();
export type Branding = z.infer<typeof brandingSchema>;
export type LogoAsset = z.infer<typeof logoAssetSchema>;
export type SocialMetadata = z.infer<typeof socialSchema>;

export function validateSvg(source: string) {
  if (source.length > 1_000_000 || !/^\s*<svg\b/.test(source) || /<!|<\?|&|\b(?:href|style|on[a-z]+)\s*=/i.test(source)) throw new Error('Use a self-contained SVG without scripts, styles, links or entities.');
  const tags = new Set(['svg','g','path','circle','ellipse','rect','line','polyline','polygon','defs','linearGradient','radialGradient','stop','clipPath','title','desc']);
  for (const match of source.matchAll(/<\/?([\w:-]+)/g)) if (!tags.has(match[1] ?? '')) throw new Error('Unsupported SVG element. Use plain vector shapes or a PNG.');
  if (/url\((?!#[\w-]+\))/i.test(source)) throw new Error('SVG cannot load external resources.');
  return source;
}

export function validateLogo(asset: unknown) {
  const parsed = logoAssetSchema.parse(asset);
  const bytes = Uint8Array.from(atob(parsed.data), char => char.charCodeAt(0));
  if (parsed.mime === 'image/svg+xml') validateSvg(new TextDecoder().decode(bytes));
  else if (parsed.mime === 'image/png' && !(bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71)) throw new Error('Invalid PNG logo.');
  else if (parsed.mime === 'image/jpeg' && !(bytes[0] === 255 && bytes[1] === 216)) throw new Error('Invalid JPEG logo.');
  else if (parsed.mime === 'image/webp' && new TextDecoder().decode(bytes.slice(8, 12)) !== 'WEBP') throw new Error('Invalid WebP logo.');
  return parsed;
}

export const brandConfigSchema = z.object({ name: z.string().min(1).max(120), description: z.string().max(1000).default(''), logoPath: z.string().max(2048).optional(), branding: brandingSchema.default(brandingSchema.parse({})), social: socialSchema.default(socialSchema.parse({})) });
