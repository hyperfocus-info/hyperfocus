import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";

import { defaultEvaluationDatabasePath } from "./evaluation-library";

function serviceDirectory() {
  const databasePath = process.env.PADPILOT_EVALUATOR_DB_PATH ?? defaultEvaluationDatabasePath();
  return resolve(databasePath, "..");
}

function servicePort() {
  const port = Number(process.env.PADPILOT_EVALUATOR_PORT ?? "3217");
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PADPILOT_EVALUATOR_PORT must be an integer from 1 to 65535.");
  }
  return port;
}

async function dashboardReady(port: number) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/v1/library?limit=1`, {
      signal: AbortSignal.timeout(1_000),
    });
    await response.body?.cancel();
    return response.ok;
  } catch {
    return false;
  }
}

export async function startEvaluationService() {
  const port = servicePort();
  const origin = `http://127.0.0.1:${port}`;
  if (await dashboardReady(port)) {
    return { alreadyRunning: true, origin };
  }
  const directory = serviceDirectory();
  await mkdir(directory, { recursive: true });
  const cliPath = join(import.meta.dir, "evaluation-cli.ts");
  const child = Bun.spawn([process.execPath, "run", cliPath, "serve", "--port", String(port)], {
    cwd: resolve(import.meta.dir, "..", ".."),
    detached: true,
    stderr: Bun.file(join(directory, "server.stderr.log")),
    stdin: "ignore",
    stdout: Bun.file(join(directory, "server.stdout.log")),
    windowsHide: true,
  });
  child.unref();
  await Bun.write(join(directory, "server.json"), JSON.stringify({
    command: "synaesthetic:serve",
    origin,
    pid: child.pid,
    startedAt: new Date().toISOString(),
  }, null, 2));
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await dashboardReady(port)) return { alreadyRunning: false, origin, pid: child.pid };
    await Bun.sleep(500);
  }
  throw new Error(`Synaesthetic dashboard did not become ready. Check ${join(directory, "server.stderr.log")}.`);
}

if (import.meta.main) {
  const result = await startEvaluationService();
  console.log(`${result.alreadyRunning ? "Already running" : "Started"}: ${result.origin}`);
  if (result.pid) console.log(`PID: ${result.pid}`);
}
