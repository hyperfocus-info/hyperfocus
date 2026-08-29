#!/usr/bin/env bun

import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import net from "node:net";
import { createPersona } from "./persona-modifiers.ts";

/** CLI configuration for the target, scenario, browser, viewport, and evidence directory. */
const options = parseArgs(process.argv.slice(2));

if (options.help) {
  printHelp();
  process.exit(0);
}
if (!options.scenario) throw new Error("Missing --scenario <path>.");
if (!options.surface) throw new Error("Missing --surface <product>.");
if (!options.goal) throw new Error("Missing --goal <outcome>.");
/** CDP client loaded only for real runs so `--help` remains dependency-light. */
const { default: CDP } = await import("chrome-remote-interface");

/** Scenario module supplied by the current audit. */
const scenarioPath = path.resolve(options.scenario);
/** Browser executable selected explicitly or discovered locally. */
const chromePath = await resolveChromePath(options.chrome);
/** Identifier shared by all evidence from this run. */
const runId = `user-audit-${Date.now()}`;
/** Folder containing screenshots and machine-readable evidence. */
const outDir = path.resolve(options.out ?? path.join(".local", "screenshots", runId));
await mkdir(outDir, { recursive: true });
/** Randomized but replayable simulated user applied to flows without an explicit persona. */
const runPersona = await createPersona({
  surface: options.surface,
  goal: options.goal,
  seed: options.seed,
  minModifiers: options.minModifiers,
  maxModifiers: options.maxModifiers
});
await writeFile(path.join(outDir, "persona-run.json"), JSON.stringify(runPersona, null, 2));

/** Promise-based delay for browser readiness and UI settling. */
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
/** Ephemeral debug port that avoids collision with existing browser sessions. */
const port = await reservePort();
/** Disposable browser profile that isolates audit state from the user's profile. */
const userDataDir = await mkdtemp(path.join(tmpdir(), "user-audit-cdp-"));
/** Headless Chromium process controlled through CDP. */
const chrome = spawn(chromePath, [
  "--headless=new", "--disable-gpu", "--disable-dev-shm-usage", "--no-first-run",
  "--no-default-browser-check", `--remote-debugging-port=${port}`, `--user-data-dir=${userDataDir}`, "about:blank"
], { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });

try {
  await waitForCdp(port, sleep);
} catch (error) {
  await terminateProcessTree(chrome);
  await rm(userDataDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 125 });
  throw error;
}

/** Dedicated browser target used only for this audit. */
const target = await CDP.New({ port });
/** Connected DevTools client. */
const client = await CDP({ port, target });
const { Runtime, Page, Emulation, Input, Log } = client;
await Promise.all([Runtime.enable(), Page.enable(), Log.enable()]);

/** Console output gathered across the complete scenario sequence. */
const consoleEntries = [];
/** Captured flow results in execution order. */
const flows = [];

Runtime.consoleAPICalled((event) => {
  consoleEntries.push({
    type: event.type,
    text: event.args.map((argument) => argument.value ?? argument.description ?? "").join(" "),
    stack: event.stackTrace?.callFrames?.map((frame) => ({
      functionName: frame.functionName,
      url: frame.url,
      lineNumber: frame.lineNumber,
      columnNumber: frame.columnNumber
    })) ?? []
  });
});
Log.entryAdded((event) => consoleEntries.push({ type: event.entry.level, text: event.entry.text }));

/** Evaluate JavaScript in the audited page and return a serializable result. */
async function evaluate(expression) {
  const result = await Runtime.evaluate({ expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  return result.result.value;
}

/** Set the browser viewport and allow responsive layout to settle. */
async function setViewport(width, height) {
  await Emulation.setDeviceMetricsOverride({ width, height, deviceScaleFactor: 1, mobile: false });
  await sleep(200);
}

/** Poll a page expression until it becomes truthy or times out. */
async function waitFor(expression, timeoutMs = 15_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await evaluate(`Boolean(${expression})`)) return true;
    await sleep(100);
  }
  return false;
}

/** Click one element selected by CSS. */
async function clickSelector(selector) {
  return evaluate(`(() => { const e=document.querySelector(${JSON.stringify(selector)}); if(!e) return {ok:false,reason:'missing selector'}; e.focus(); e.click(); return {ok:true,text:(e.innerText||e.getAttribute('aria-label')||'').trim().slice(0,160)}; })()`);
}

/** Click one visible accessible label using exact or substring matching. */
async function clickAria(label, contains = false) {
  return evaluate(`(() => { const q=${JSON.stringify(label)}.toLowerCase(); const all=[...document.querySelectorAll('[aria-label]')].filter((e)=>e.getClientRects().length); const e=all.find((candidate)=>{const value=(candidate.getAttribute('aria-label')||'').toLowerCase();return ${contains ? "value.includes(q)" : "value===q"};}); if(!e) return {ok:false,reason:'missing aria',label:q}; e.focus(); e.click(); return {ok:true,aria:e.getAttribute('aria-label')}; })()`);
}

/** Click a visible button, tab, or link by text. */
async function clickText(value, contains = true) {
  return evaluate(`(() => { const q=${JSON.stringify(value)}.toLowerCase(); const all=[...document.querySelectorAll('button,[role="button"],[role="tab"],a')].filter((e)=>e.getClientRects().length&&!e.disabled); const e=all.find((candidate)=>{const text=(candidate.innerText||'').trim().toLowerCase();return ${contains ? "text.includes(q)" : "text===q"};}); if(!e) return {ok:false,reason:'missing text',text:q}; e.focus(); e.click(); return {ok:true,text:(e.innerText||'').trim().slice(0,160),aria:e.getAttribute('aria-label')}; })()`);
}

/** Set an input through its native setter so reactive frameworks receive the change. */
async function typeInto(selector, value) {
  return evaluate(`(() => { const e=document.querySelector(${JSON.stringify(selector)}); if(!e) return {ok:false,reason:'missing input'}; e.focus(); const proto=e instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto,'value').set.call(e,${JSON.stringify(value)}); e.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:${JSON.stringify(value)}})); e.dispatchEvent(new Event('change',{bubbles:true})); return {ok:true}; })()`);
}

/** Select one native option so reactive frameworks receive input and change events. */
async function selectOption(selector, value) {
  return evaluate(`(() => { const e=document.querySelector(${JSON.stringify(selector)}); if(!(e instanceof HTMLSelectElement)) return {ok:false,reason:'missing select'}; const option=[...e.options].find((candidate)=>candidate.value===${JSON.stringify(value)}); if(!option) return {ok:false,reason:'missing option',value:${JSON.stringify(value)}}; e.focus(); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,option.value); e.dispatchEvent(new Event('input',{bubbles:true})); e.dispatchEvent(new Event('change',{bubbles:true})); return {ok:true,value:e.value,label:option.textContent?.trim()??''}; })()`);
}

/** Dispatch one keyboard key through CDP. */
async function press(key) {
  const definitions: Record<string, { key: string; code: string; keyCode: number; text?: string }> = {
    Escape: { key: "Escape", code: "Escape", keyCode: 27 },
    Enter: { key: "Enter", code: "Enter", keyCode: 13, text: "\r" },
    Tab: { key: "Tab", code: "Tab", keyCode: 9 },
    Space: { key: " ", code: "Space", keyCode: 32, text: " " },
    " ": { key: " ", code: "Space", keyCode: 32, text: " " },
    ArrowUp: { key: "ArrowUp", code: "ArrowUp", keyCode: 38 },
    ArrowDown: { key: "ArrowDown", code: "ArrowDown", keyCode: 40 },
    ArrowLeft: { key: "ArrowLeft", code: "ArrowLeft", keyCode: 37 },
    ArrowRight: { key: "ArrowRight", code: "ArrowRight", keyCode: 39 },
  };
  const definition = definitions[key] ?? { key, code: key, keyCode: 0 };
  const common = { key: definition.key, code: definition.code, windowsVirtualKeyCode: definition.keyCode, nativeVirtualKeyCode: definition.keyCode };
  await Input.dispatchKeyEvent({ type: definition.text ? "keyDown" : "rawKeyDown", ...common, text: definition.text, unmodifiedText: definition.text });
  await Input.dispatchKeyEvent({ type: "keyUp", ...common });
  await sleep(150);
}

/** Collect visible semantics and layout diagnostics without exposing password values. */
async function snapshotState() {
  return evaluate(String.raw`(() => {
    const visible=(e)=>e instanceof HTMLElement&&e.getClientRects().length>0;
    const controls=[...document.querySelectorAll('button,[role="button"],[role="tab"]')].filter(visible);
    const inputs=[...document.querySelectorAll('input,textarea,select')].filter(visible);
    const overflow=[...document.querySelectorAll('body *')].filter(visible).filter((e)=>e.scrollWidth>e.clientWidth+2).slice(0,50).map((e)=>({tag:e.tagName,cls:String(e.className).slice(0,140),aria:e.getAttribute('aria-label'),text:(e.innerText||'').trim().replace(/\s+/g,' ').slice(0,120),clientWidth:e.clientWidth,scrollWidth:e.scrollWidth}));
    return {
      title:document.title,url:location.href,viewport:{width:innerWidth,height:innerHeight},
      activeElement:document.activeElement?{tag:document.activeElement.tagName,aria:document.activeElement.getAttribute('aria-label'),text:(document.activeElement.innerText||'').trim().replace(/\s+/g,' ').slice(0,140)}:null,
      bodyText:(document.body.innerText||'').replace(/\n{3,}/g,'\n\n').slice(0,40000),
      dialogs:[...document.querySelectorAll('[role="dialog"]')].filter(visible).map((e)=>e.getAttribute('aria-label')||(e.innerText||'').slice(0,160)),
      controls:controls.map((e)=>({text:(e.innerText||'').trim().replace(/\s+/g,' ').slice(0,140),aria:e.getAttribute('aria-label'),disabled:Boolean(e.disabled)})).slice(0,300),
      inputs:inputs.map((e)=>({tag:e.tagName,aria:e.getAttribute('aria-label'),placeholder:e.getAttribute('placeholder'),value:e.type==='password'?'[redacted]':String(e.value||'').slice(0,140)})).slice(0,120),
      unlabeledControls:controls.filter((e)=>!(e.innerText||'').trim()&&!e.getAttribute('aria-label')).length,
      documentOverflow:{clientWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,clientHeight:document.documentElement.clientHeight,scrollHeight:document.documentElement.scrollHeight},overflow
    };
  })()`);
}

/** Execute one scenario and capture evidence even when an action partially fails. */
async function flow(metadata, action) {
  const consoleStartIndex = consoleEntries.length;
  const startedAt = Date.now();
  const actionResults = [];
  try {
    await action(actionResults);
    await sleep(metadata.settleMs ?? 400);
  } catch (error) {
    actionResults.push({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
  const state = await snapshotState();
  const id = flows.length + 1;
  const slug = metadata.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const fileName = `${String(id).padStart(2, "0")}-${slug}.png`;
  const screenshotPath = path.join(outDir, fileName);
  const screenshot = await Page.captureScreenshot({ format: "png", fromSurface: true, captureBeyondViewport: false });
  await writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));
  flows.push({
    id,
    ...metadata,
    computerSkill: runPersona.computerSkill,
    aiFamiliarity: runPersona.aiFamiliarity,
    persona: runPersona,
    durationMs: Date.now() - startedAt,
    actionResults,
    consoleEntries: consoleEntries.slice(consoleStartIndex),
    screenshot: path.relative(process.cwd(), screenshotPath).replaceAll("\\", "/"),
    state
  });
  console.log(`[flow ${id}] ${metadata.name} | ${runPersona.computerSkill}/${runPersona.aiFamiliarity} | ${runPersona.id}`);
}

try {
  const loadPromise = new Promise((resolve) => Page.loadEventFired(resolve));
  await Page.navigate({ url: options.baseUrl });
  await loadPromise;
  await setViewport(options.width, options.height);

  const scenario = await import(`${pathToFileURL(scenarioPath).href}?run=${Date.now()}`);
  if (typeof scenario.run !== "function") throw new Error("Scenario must export async function run(audit).");
  await scenario.run({ evaluate, setViewport, waitFor, clickSelector, clickAria, clickText, typeInto, selectOption, press, sleep, flow });

  const actionFailures = flows.flatMap((entry) => entry.actionResults.filter((result) => result?.ok === false).map((result) => ({ flowId: entry.id, flowName: entry.name, result })));
  const report = {
    runId,
    baseUrl: options.baseUrl,
    scenario: scenarioPath,
    browser: chromePath,
    mission: runPersona.mission,
    persona: runPersona,
    summary: { flowCount: flows.length, actionFailureCount: actionFailures.length, consoleEntryCount: consoleEntries.length },
    actionFailures,
    flows,
    consoleEntries
  };
  await writeFile(path.join(outDir, "results.json"), JSON.stringify(report, null, 2));
  await writeFile(path.join(outDir, "dom-text.md"), flows.map((entry) => `# ${entry.id}. ${entry.name}\n\nSurface: ${entry.persona.mission.surface}\n\nGoal: ${entry.persona.mission.goal}\n\nComputer skill: ${entry.computerSkill}; AI familiarity: ${entry.aiFamiliarity}\n\nPersona: ${entry.persona.id} (${entry.persona.modifierCount} modifiers)\n\n${entry.persona.modifiers.map((modifier) => `- ${modifier.statement}`).join("\n")}\n\nScreenshot: ${entry.screenshot}\n\n\`\`\`text\n${entry.state.bodyText}\n\`\`\``).join("\n\n"));
  console.log(`USER_AUDIT_DIR=${outDir}`);
  console.log(`FLOW_COUNT=${flows.length}`);
  console.log(`ACTION_FAILURES=${actionFailures.length}`);
  console.log(`CONSOLE_ENTRIES=${consoleEntries.length}`);
  console.log(`PERSONA_SEED=${runPersona.seed}`);
  console.log(`PRODUCT_SURFACE=${runPersona.mission.surface}`);
  if (actionFailures.length > 0) process.exitCode = 1;
} finally {
  await client.close().catch(() => undefined);
  await CDP.Close({ port, id: target.id }).catch(() => undefined);
  await terminateProcessTree(chrome);
  await rm(userDataDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 125 });
}

/** Stop only the Chromium tree launched by this audit and wait for its exit. */
async function terminateProcessTree(child) {
  if (!child?.pid || child.exitCode !== null) return;
  if (process.platform === "win32") {
    const killer = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true
    });
    await new Promise((resolve, reject) => {
      killer.once("error", reject);
      killer.once("exit", resolve);
    });
  } else {
    child.kill("SIGTERM");
  }

  if (!(await waitForProcessExit(child, 5_000))) {
    child.kill("SIGKILL");
    if (!(await waitForProcessExit(child, 2_000))) {
      throw new Error(`Audit Chromium tree ${child.pid} did not exit`);
    }
  }
}

async function waitForProcessExit(child, timeoutMs) {
  if (child.exitCode !== null) return true;
  return await Promise.race([
    new Promise((resolve) => child.once("exit", () => resolve(true))),
    new Promise((resolve) => setTimeout(() => resolve(child.exitCode !== null), timeoutMs))
  ]);
}

/** Parse supported runner flags without another dependency. */
function parseArgs(values) {
  const parsed = { baseUrl: "http://localhost:8791", width: 1440, height: 900, minModifiers: 3, maxModifiers: 8, help: false };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--help" || value === "-h") parsed.help = true;
    else if (value === "--base-url") parsed.baseUrl = values[++index];
    else if (value === "--scenario") parsed.scenario = values[++index];
    else if (value === "--out") parsed.out = values[++index];
    else if (value === "--chrome") parsed.chrome = values[++index];
    else if (value === "--width") parsed.width = Number(values[++index]);
    else if (value === "--height") parsed.height = Number(values[++index]);
    else if (value === "--seed") parsed.seed = values[++index];
    else if (value === "--surface") parsed.surface = values[++index];
    else if (value === "--goal") parsed.goal = values[++index];
    else if (value === "--min-modifiers") parsed.minModifiers = Number(values[++index]);
    else if (value === "--max-modifiers") parsed.maxModifiers = Number(values[++index]);
    else throw new Error(`Unknown argument: ${value}`);
  }
  return parsed;
}

/** Print the stable runner interface without requiring a browser. */
function printHelp() {
  console.log("Usage: bun run-cdp-audit.ts --scenario <module> --surface <product> --goal <outcome> [--base-url <url>] [--out <dir>] [--chrome <path>] [--width <px>] [--height <px>] [--seed <text>] [--min-modifiers <n>] [--max-modifiers <n>]");
}

/** Reserve and release a loopback port for Chromium debugging. */
function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const selectedPort = typeof address === "object" && address ? address.port : undefined;
      server.close(() => selectedPort ? resolve(selectedPort) : reject(new Error("Unable to reserve a CDP port.")));
    });
  });
}

/** Wait until Chromium exposes its DevTools endpoint. */
async function waitForCdp(debugPort, delay) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      await CDP.Version({ port: debugPort });
      return;
    } catch {
      await delay(50);
    }
  }
  throw new Error("Chromium did not expose CDP in time.");
}

/** Resolve Chromium from explicit, environment, Playwright, or Chrome locations. */
async function resolveChromePath(explicitPath) {
  for (const candidate of [explicitPath, process.env.CHROME_PATH].filter(Boolean)) {
    if (existsSync(candidate)) return candidate;
  }
  const localAppData = process.env.LOCALAPPDATA;
  if (localAppData) {
    const playwrightRoot = path.join(localAppData, "ms-playwright");
    if (existsSync(playwrightRoot)) {
      const versions = (await readdir(playwrightRoot)).filter((entry) => entry.startsWith("chromium_headless_shell-")).sort().reverse();
      for (const version of versions) {
        const candidate = path.join(playwrightRoot, version, "chrome-headless-shell-win64", "chrome-headless-shell.exe");
        if (existsSync(candidate)) return candidate;
      }
    }
  }
  for (const root of [process.env.PROGRAMFILES, process.env["PROGRAMFILES(X86)"]].filter(Boolean)) {
    const candidate = path.join(root, "Google", "Chrome", "Application", "chrome.exe");
    if (existsSync(candidate)) return candidate;
  }
  throw new Error("No Chromium browser found. Pass --chrome or set CHROME_PATH.");
}
