import { spawnBackgroundProcess, terminateProcessTree } from "@hyperfocus/desktop-runtime/process";
import { cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runLauncherUiSmoke } from "../launcher-release";
import manifest from "../../package.json";
import { parseServerEventFrame } from "@hyperfocus/ai-core/protocol";

const root = resolve(import.meta.dir, "../../../..");

async function command(cmd: string[], cwd: string, env: Record<string, string> = {}) {
  const child = spawnBackgroundProcess({ cmd, cwd, env: { ...process.env, ...env }, stdout: "pipe", stderr: "pipe", timeout: 600000 });
  try {
    const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
    if (code !== 0) throw new Error(`${cmd.join(" ")} failed (${code}): ${stderr}\n${stdout}`);
    return stdout.trim();
  } finally { await terminateProcessTree({ process: child }); }
}

/** Build through the portable release owner, then pack a dependency-free npm manifest. Never publishes. */
export async function packageHarnessNpm() {
  if (process.platform !== "win32" || process.arch !== "x64") throw new Error("npm candidate validation currently requires Windows x64.");
  await command([process.execPath, "apps/harness/scripts/package-launcher.ts", "--target", "bun-windows-x64"], root);
  const output = join(root, ".local/harness-npm");
  await mkdir(output, { recursive: true });
  const staging = await mkdtemp(join(output, "staging-"));
  const consumer = await mkdtemp(join(tmpdir(), "hyperfocus-harness-npm-"));
  try {
    await cp(join(root, "release/bun-windows-x64"), join(staging, "runtime"), { recursive: true });
    // This source deliberately uses JavaScript-compatible TypeScript. Copy it so
    // bundling cannot bind __dirname to the build machine's source directory.
    await cp(join(import.meta.dir, "launcher.ts"), join(staging, "harness.cjs"));
    await cp(join(root, "LICENSE"), join(staging, "LICENSE"));
    await cp(join(root, "THIRD_PARTY_NOTICES.md"), join(staging, "THIRD_PARTY_NOTICES.md"));
    await Bun.write(join(staging, "package.json"), JSON.stringify({ name: manifest.name, version: manifest.version,
      description: "Hyperfocus Harness portable Windows launcher", license: "SEE LICENSE IN LICENSE",
      engines: { bun: ">=1.4.0" }, publishConfig: { access: "public" },
      os: ["win32"], cpu: ["x64"], bin: { harness: "harness.cjs" },
      files: ["harness.cjs", "runtime", "LICENSE", "THIRD_PARTY_NOTICES.md", "README.md"] }, null, 2));
    await Bun.write(join(staging, "README.md"), "# Hyperfocus Harness\n\nRun `bunx @hyperfocus/harness` on Windows x64 with Bun 1.4 or newer. No checkout is required. This candidate must first be published before that registry command is available. Provider use requires separate account setup. Use `--no-open` to print the local URL without opening a browser.\n");
    const filename = await command([process.execPath, "pm", "pack", "--ignore-scripts", "--destination", output, "--quiet"], staging);
    const artifact = resolve(staging, filename);
    await Bun.write(join(consumer, "package.json"), JSON.stringify({ private: true, dependencies: { [manifest.name]: artifact } }));
    await command([process.execPath, "install", "--ignore-scripts"], consumer, { BUN_INSTALL_CACHE_DIR: join(consumer, ".cache") });
    const installed = join(consumer, "node_modules/@hyperfocus/harness");
    const requiredFiles = ["harness.cjs", "runtime/pi-harness.exe", "runtime/agents.md", "runtime/dist/ui/index.html",
      "runtime/dist/ui/main.js", "runtime/bin/rg.exe", "runtime/bin/codex/x86_64-pc-windows-msvc/bin/codex.exe",
      "runtime/.agents/skills/assistant-actions/SKILL.md", "runtime/.agents/skills/verify-html/verify-html.ts"];
    for (const file of requiredFiles) if (!await Bun.file(join(installed, file)).exists()) throw new Error(`Packed runtime asset missing: ${file}`);
    const installedManifest = await Bun.file(join(installed, "package.json")).json();
    if (installedManifest.private || JSON.stringify(installedManifest).includes("workspace:")) throw new Error("Packed manifest is not independently installable.");
    // Same package-name binary lookup as the requested command, with network installation forbidden.
    const result = await runLauncherUiSmoke({ cmd: [process.execPath, "x", "--no-install", "@hyperfocus/harness", "--no-open"], cwd: consumer,
      verify: async ({ serverUrl }) => {
        const response = await fetch(`${serverUrl}/main.js`);
        if (!response.ok || !(await response.text()).length) throw new Error("Packed UI JavaScript is unavailable.");
        const html = await (await fetch(serverUrl)).text();
        const token = /name="harness-session-token" content="([^"]+)"/.exec(html)?.[1];
        if (!token) throw new Error("Packed UI has no session capability.");
        await new Promise<void>((accept, reject) => {
          const socket = new WebSocket(`${serverUrl.replace(/^http/, "ws")}/ws?harnessSession=${encodeURIComponent(token)}`);
          const timer = setTimeout(() => finish(new Error("Packed command channel timed out.")), 10000);
          function finish(error?: Error) { clearTimeout(timer); socket.close(); if (error) reject(error); else accept(); }
          socket.onerror = () => finish(new Error("Packed command channel failed."));
          socket.onmessage = event => {
            try {
              for (const value of parseServerEventFrame(JSON.parse(String(event.data)))) {
                if (value.type === "connection.ready") socket.send(JSON.stringify({ type: "connection.ping", requestId: "npm-smoke" }));
                if (value.type === "connection.pong" && value.requestId === "npm-smoke") socket.send(JSON.stringify({
                  type: "project.create", requestId: "npm-project", payload: { rootPath: join(consumer, "project") }
                }));
                if (value.type === "project.opened" && value.requestId === "npm-project") {
                  if (value.payload.project.rootPath !== join(consumer, "project")) throw new Error("Packed project root differs.");
                  socket.send(JSON.stringify({ type: "thread.create", requestId: "npm-thread", payload: { projectId: value.payload.project.id } }));
                }
                if (value.type === "thread.created" && value.requestId === "npm-thread") {
                  if (value.payload.project.threads.length < 2) throw new Error("Packed thread was not persisted.");
                  finish();
                }
                if (value.type === "command.rejected") throw new Error("Packed command was rejected.");
              }
            } catch { finish(new Error("Packed command channel returned invalid protocol.")); }
          };
        });
      } });
    if (result.exitCode !== 0 || !result.stdout.includes('id="root"')) throw new Error(`Packed npm launch failed: ${result.stderr}`);
    const evidence = { artifact, version: manifest.version, platform: process.platform, arch: process.arch,
      sha256: new Bun.CryptoHasher("sha256").update(await Bun.file(artifact).arrayBuffer()).digest("hex"),
      command: "bunx --no-install @hyperfocus/harness --no-open", consumer, requiredFiles, protocolPing: true,
      projectAndThreadCreated: true, passed: true, registryPublished: false };
    await Bun.write(join(output, "smoke.json"), JSON.stringify(evidence, null, 2));
    return evidence;
  } finally {
    await rm(staging, { recursive: true, force: true });
    await rm(consumer, { recursive: true, force: true });
  }
}

if (import.meta.main) console.log(JSON.stringify(await packageHarnessNpm(), null, 2));
