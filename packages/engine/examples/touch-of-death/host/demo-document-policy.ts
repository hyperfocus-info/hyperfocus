/** Deployment-owned amendment of the canonical export policy; project/runtime bytes stay intact. */
export function hostedClerkDocument(options: { html: string; origin: string }): string {
  let origin: URL;
  try { origin = new URL(options.origin); } catch { throw Error('Clerk frontend origin must be an exact HTTPS origin.'); }
  if (origin.protocol !== 'https:' || origin.origin !== options.origin || origin.username || origin.password
    || !/^[a-z0-9.-]+$/.test(origin.hostname) || !origin.hostname.includes('.')) throw Error('Clerk frontend origin must be an exact HTTPS origin.');
  const metas = [...options.html.matchAll(/<meta\b[^>]*\bhttp-equiv\s*=\s*(["'])Content-Security-Policy\1[^>]*>/gi)];
  if (metas.length !== 1) throw Error('Clerk hosting requires one canonical export security policy.');
  const meta = metas[0]![0], match = /^<meta http-equiv="Content-Security-Policy" content="([^"]*)">$/.exec(meta);
  if (!match) throw Error('Clerk hosting requires the canonical export security policy format.');
  const directives = new Map<string, string[]>();
  for (const value of match[1]!.split(';')) {
    const [name, ...sources] = value.trim().split(/\s+/);
    if (!name || directives.has(name)) throw Error('Invalid exported security policy.');
    directives.set(name, sources);
  }
  const scripts = directives.get('script-src'), connections = directives.get('connect-src');
  if (directives.get('default-src')?.join(' ') !== "'none'" || !scripts?.includes("'unsafe-inline'")
    || !connections?.includes("'self'") || !connections.includes('wss:') || connections.includes("'none'")) throw Error('Clerk hosting requires a network-enabled combat export.');
  for (const sources of [scripts, connections]) if (!sources.includes(options.origin)) sources.push(options.origin);
  const policy = [...directives].map(([name, sources]) => `${name} ${sources.join(' ')}`).join('; ');
  return options.html.replace(meta, () => `<meta http-equiv="Content-Security-Policy" content="${policy}">`);
}
