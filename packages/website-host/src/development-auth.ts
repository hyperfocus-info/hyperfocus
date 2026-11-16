/** Hosts must bind development servers to loopback. No cookies or tokens are issued. */
export function createDevelopmentSession({ env, origin }: {
  env: Record<string, string | undefined>; origin: string;
}) {
  const url = new URL(origin);
  if (env.NODE_ENV !== 'development' || env.HYPERFOCUS_DEV_AUTH === '0'
    || Object.entries(env).some(([name, value]) => name.startsWith('RAILWAY_') && value)
    || url.origin !== origin || !['http:', 'https:'].includes(url.protocol)
    || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return undefined;
  const user = Object.freeze({ id: 'user_localDevelopment', fullName: 'Local developer', email: undefined, emailVerified: false });
  return (request: Request) => {
    const supplied = request.headers.get('origin');
    if (new URL(request.url).origin !== origin || (supplied !== null && supplied !== origin)
      || (!['GET', 'HEAD'].includes(request.method) && supplied !== origin)
      || ['cross-site', 'same-site'].includes(request.headers.get('sec-fetch-site') ?? '')) return null;
    return user;
  };
}
