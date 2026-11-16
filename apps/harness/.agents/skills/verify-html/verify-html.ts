#!/usr/bin/env bun
import * as fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

export function verifyHtml(options: { file: string }) {
  const file = path.resolve(options.file);
  const errors: { code: string; message: string }[] = [];
  let scriptCount = 0;
  const diagnose = (code: string, message: unknown) => { if (errors.length < 8) errors.push({ code, message: String(message).slice(0, 400) }); };
  try {
    if (fs.statSync(file).size > 8388608) throw new Error('HTML exceeds the 8 MiB validation limit');
    const html = fs.readFileSync(file, 'utf8');
    for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
      const attrs = match[1];
      const type = /\btype\s*=\s*["']([^"']*)["']/i.exec(attrs)?.[1]?.toLowerCase();
      if (type && !['module', 'text/javascript', 'application/javascript'].includes(type)) continue;
      scriptCount++;
      if (type === 'module') { diagnose('module-build-required', 'Validate module scripts with the project build command.'); continue; }
      const src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1];
      let code = match[2];
      if (src) {
        if (/^(?:[a-z]+:)?\/\//i.test(src) || /^(?:data|blob):/i.test(src)) { diagnose('network-script', 'Offline artifact depends on a non-local script.'); continue; }
        const script = path.resolve(path.dirname(file), src.split(/[?#]/)[0]);
        const relative = path.relative(path.dirname(file), script);
        if (relative.startsWith('..') || path.isAbsolute(relative)) { diagnose('outside-artifact', 'Script is outside the artifact folder.'); continue; }
        if (!fs.existsSync(script)) { diagnose('missing-script', src); continue; }
        if (fs.statSync(script).size > 8388608) { diagnose('large-script', src); continue; }
        code = fs.readFileSync(script, 'utf8');
      }
      try { new vm.Script(code, { filename: src || `inline-script-${scriptCount}` }); }
      catch (error) { diagnose('javascript-syntax', error instanceof Error ? error.message : String(error)); }
    }
  } catch (error) { diagnose('artifact-read', error instanceof Error ? error.message : String(error)); }
  return { schema: 'html-validation-v1', file, ok: errors.length === 0, scriptCount, errors,
    scope: 'Classic-script syntax and local script presence only; browser behavior and domain correctness require acceptance.' };
}

if (import.meta.main) {
  if (process.argv.includes('--help')) console.log('Usage: bun verify-html.ts <html-file>\nBounded JSON; classic-script syntax and local script presence; no child processes.');
  else {
    const result = verifyHtml({ file: process.argv[2] || '' });
    console.log(JSON.stringify(result));
    process.exitCode = result.ok ? 0 : 1;
  }
}
