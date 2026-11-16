import { brandingSchema, socialSchema, validateLogo, type Branding, type SocialMetadata } from './model';

export const escapeMarkup = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] ?? char));
const marks = {
  spark: '<path d="M32 10 38 25 54 32 38 39 32 54 25 39 10 32 25 25Z"/>',
  book: '<path d="M12 15q11-4 20 3 9-7 20-3v32q-11-4-20 3-9-7-20-3Z" fill="none" stroke="currentColor" stroke-width="4"/><path d="M32 18v32" stroke="currentColor" stroke-width="4"/>',
  chart: '<path d="M13 46V31h8v15Zm15 0V22h8v24Zm15 0V12h8v34Z"/>',
  grid: '<rect x="12" y="12" width="16" height="16" rx="4"/><rect x="36" y="12" width="16" height="16" rx="4"/><rect x="12" y="36" width="16" height="16" rx="4"/><rect x="36" y="36" width="16" height="16" rx="4"/>',
  play: '<path d="M23 13 50 32 23 51Z"/>',
  leaf: '<path d="M13 44C8 21 29 9 51 12c3 23-10 42-30 38L42 25Z"/>',
  orbit: '<circle cx="32" cy="32" r="8"/><ellipse cx="32" cy="32" rx="26" ry="12" transform="rotate(-35 32 32)" fill="none" stroke="currentColor" stroke-width="4"/>',
  shield: '<path d="M32 9 51 17v15c0 12-12 20-19 24-7-4-19-12-19-24V17Zm-9 22 7 7 13-15" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/>',
  wave: '<path d="M10 32h6l6-18 10 36 10-36 6 18h6" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>',
  controller: '<path d="M20 20h24c7 0 12 23 7 26-4 2-9-7-13-7H26c-4 0-9 9-13 7-5-3 0-26 7-26Z" fill="none" stroke="currentColor" stroke-width="4"/><path d="M18 29h12m-6-6v12" stroke="currentColor" stroke-width="3"/><circle cx="43" cy="28" r="3"/>',
};

export function logoSvg({ branding }: { branding: Branding }) {
  const brand = brandingSchema.parse(branding);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" color="${brand.color}" fill="currentColor">${marks[brand.mark]}</svg>`;
}

export function logoDataUrl({ branding }: { branding: Branding }) {
  const asset = branding.logo ? validateLogo(branding.logo) : null;
  return asset ? `data:${asset.mime};base64,${asset.data}` : `data:image/svg+xml,${encodeURIComponent(logoSvg({ branding }))}`;
}

export function brandHead({ name, title, description, social, assetBase = '/brand' }: { name: string; title: string; description: string; branding: Branding; social: SocialMetadata; assetBase?: string }) {
  const meta = socialSchema.parse(social);
  const image = meta.image || (meta.canonicalUrl ? new URL('./brand/social.png', meta.canonicalUrl).href : '');
  const tags = { 'og:type': meta.type, 'og:site_name': meta.siteName || name, 'og:title': meta.title || title, 'og:description': meta.description || description, 'og:locale': meta.locale, 'og:url': meta.canonicalUrl, 'og:image': image, 'og:image:alt': meta.imageAlt || `${name} logo`, 'twitter:card': image ? 'summary_large_image' : 'summary', 'twitter:title': meta.title || title, 'twitter:description': meta.description || description, 'twitter:image': image, 'twitter:image:alt': meta.imageAlt || `${name} logo` };
  return `<link rel="icon" type="image/svg+xml" href="${escapeMarkup(assetBase)}/favicon.svg"><link rel="icon" type="image/png" sizes="32x32" href="${escapeMarkup(assetBase)}/favicon-32.png"><link rel="apple-touch-icon" href="${escapeMarkup(assetBase)}/apple-touch-icon.png"><link rel="manifest" href="${escapeMarkup(assetBase)}/site.webmanifest">${meta.canonicalUrl ? `<link rel="canonical" href="${escapeMarkup(meta.canonicalUrl)}">` : ''}${Object.entries(tags).filter(([, value]) => value).map(([key, value]) => `<meta ${key.startsWith('og:') ? 'property' : 'name'}="${key}" content="${escapeMarkup(value)}">`).join('')}`;
}
