import { expect, test } from 'bun:test';
import { brandingSchema, socialSchema, validateLogo } from './model';
import { brandHead } from './render';
import { createBrandFiles } from './build';

test('metadata resolves relative assets against the canonical URL and escapes authored text', () => {
  const html = brandHead({ name:'A & B', title:'<Title>', description:'A "description"', branding:brandingSchema.parse({}), social:socialSchema.parse({canonicalUrl:'https://example.com/app/'}), assetBase:'./brand' });
  expect(html).toContain('https://example.com/app/brand/social.png'); expect(html).toContain('&lt;Title&gt;');expect(html).toContain('A &amp; B');
  expect(() => socialSchema.parse({image:'javascript:alert(1)'})).toThrow();
});
test('custom wide logos preserve the source and generate square install icons plus a hashed asset manifest', async () => {
  const svg='<svg xmlns="http://www.w3.org/2000/svg" width="120" height="30"><rect width="120" height="30" fill="#ff0000"/></svg>';
  const logo=validateLogo({name:'own.svg',mime:'image/svg+xml',data:Buffer.from(svg).toString('base64')});
  const files=await createBrandFiles({name:'Custom',branding:brandingSchema.parse({logo})});
  expect(files['logo.svg']).toBe(svg);
  for(const [path,size] of [['icon-192.png',192],['icon-512.png',512],['apple-touch-icon.png',180]] as const){const bytes=files[path];if(!(bytes instanceof Uint8Array))throw new Error('Missing PNG');const png=Buffer.from(bytes);expect(png.readUInt32BE(16)).toBe(size);expect(png.readUInt32BE(20)).toBe(size);}
  const manifestText=files['assets.json'];if(typeof manifestText!=='string')throw new Error('Missing manifest');
  const manifest=JSON.parse(manifestText);expect(manifest.source).toBe('own.svg');
  for(const file of manifest.files)expect(new Bun.CryptoHasher('sha256').update(files[file.path]!).digest('hex')).toBe(file.sha256);
  expect(() => validateLogo({name:'unsafe.svg',mime:'image/svg+xml',data:Buffer.from('<svg><script>alert(1)</script></svg>').toString('base64')})).toThrow();
});
