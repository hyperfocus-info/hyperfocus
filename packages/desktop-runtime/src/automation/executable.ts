import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
export function browserExecutable() {
  const candidates = [process.env.CHROME_PATH,
    process.env.PROGRAMFILES && resolve(process.env.PROGRAMFILES, "Google/Chrome/Application/chrome.exe"),
    process.env["PROGRAMFILES(X86)"] && resolve(process.env["PROGRAMFILES(X86)"], "Microsoft/Edge/Application/msedge.exe"),
    process.env.LOCALAPPDATA && resolve(process.env.LOCALAPPDATA, "Google/Chrome/Application/chrome.exe"),
    "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ];
  const executable = candidates.find((candidate) => candidate && existsSync(candidate));
  if (!executable) throw new Error("Browser verification requires Chrome or Edge. Set CHROME_PATH to its executable.");
  return executable;
}
