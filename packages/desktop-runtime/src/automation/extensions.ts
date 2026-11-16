/** Host launch policy shared by visible and headless owned browsers. It never
 * edits the user's Chrome profile or extension installation. */
export type BrowserExtensions = 'disabled' | 'enabled';
export function browserExtensionArguments(options: { extensions?: BrowserExtensions; args?: readonly string[] } = {}) {
  const extensions = options.extensions ?? 'disabled';
  if (extensions !== 'disabled' && extensions !== 'enabled') throw new Error('Unknown browser extension policy.');
  const args = [...options.args ?? []];
  if (extensions === 'disabled' && args.some(arg => /^--(?:load-extension|load-component-extension|disable-extensions-except|enable-extensions)(?:=|$)/.test(arg))) {
    throw new Error('Extension launch arguments require extensions: enabled.');
  }
  const disabledFlags = ['--disable-extensions', '--disable-component-extensions-with-background-pages'];
  if (extensions === 'enabled' && args.some(arg => disabledFlags.some(flag => arg === flag || arg.startsWith(`${flag}=`)))) throw new Error('Conflicting browser extension policy.');
  if (extensions === 'disabled') {
    for (const flag of disabledFlags) {
      if (args.some(arg => arg.startsWith(`${flag}=`))) throw new Error('Do not override the disabled extension policy.');
      if (!args.includes(flag)) args.push(flag);
    }
  }
  return args;
}
