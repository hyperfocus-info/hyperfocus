import { expect, test } from 'bun:test';
import { browserExtensionArguments } from './extensions';
import { launchHeadlessBrowser } from './index';

test('owned browsers disable extensions by default without changing caller arguments', () => {
  const args = ['--window-size=1366,768'];
  const disabled = ['--disable-extensions', '--disable-component-extensions-with-background-pages'];
  expect(browserExtensionArguments({args})).toEqual([...args,...disabled]);
  expect(args).toEqual(['--window-size=1366,768']);
  expect(browserExtensionArguments({args:disabled})).toEqual(disabled);
  expect(browserExtensionArguments({extensions:'enabled',args:['--load-extension=fixture']})).toEqual(['--load-extension=fixture']);
});
test('conflicting extension policy fails before creating a browser or profile', async () => {
  for(const arg of ['--enable-extensions','--load-extension=fixture','--load-component-extension=fixture','--disable-extensions-except=fixture','--disable-extensions=false','--disable-component-extensions-with-background-pages=false']) {
    await expect(launchHeadlessBrowser({executable:'unused',args:[arg]})).rejects.toThrow();
  }
  expect(()=>browserExtensionArguments({extensions:'enabled',args:['--disable-extensions']})).toThrow('Conflicting');
});
