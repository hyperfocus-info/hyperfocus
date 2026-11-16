import { readFileSync } from 'node:fs';
import type { Plugin } from 'esbuild';

/** Compact authored GLSL without changing identifier/operator tokens or directive lines. */
export function compactShaderSource(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\r\n]*/g, '')
    .split(/\r?\n/).map(line => line.trim()).filter(Boolean)
    .reduce((result, line) => result + (line.startsWith('#') ? line + '\n' : line.replace(/\s+/g, ' ').replace(/\s*([;{},()\[\]])\s*/g, '$1')), '');
}

/** Shader templates are the only non-JavaScript source payload in this module. */
export const compactWebGlShaders: Plugin = {
  name: 'compact-webgl-shaders',
  setup(api) {
    api.onLoad({ filter: /[\\/]render[\\/]webgl2[\\/]shaders\.ts$/ }, args => ({
      loader: 'ts',
      contents: readFileSync(args.path, 'utf8').replace(/`([^`]+)`/g, (_, shader: string) => '`' + compactShaderSource(shader) + '`'),
    }));
  },
};
