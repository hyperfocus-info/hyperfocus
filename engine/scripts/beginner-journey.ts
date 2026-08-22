import { existsSync } from "node:fs";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readHyperfocusProjectPair } from "../src/project/filesystem.ts";
import { createPlayableWorld } from "../src/project/runtime-2d.ts";
import type { EditorProject } from "../../apps/engine-editor/src/project.ts";
import { buildPortableProject } from "./build-project.ts";
import { createProjectStarter } from "./create-project.ts";
import { startProjectDevServer, type ProjectDevServer } from "./dev-project.ts";
import { setProjectPlayerSpeed } from "./edit-project.ts";

export type BeginnerJourneyEvidence = {
  steps: ["create", "serve", "input", "edit", "live-reload", "error-recovery", "release-build"];
  initialProjectFileCount: 2;
  canonicalFileCountAfterEdit: 2;
  inputDeltaBeforeEdit: number;
  inputDeltaAfterEdit: number;
  editedSpeed: number;
  reloadEvents: number;
  errorEvents: number;
  recoveredLastGoodBuild: boolean;
  releaseFileCount: 1;
  standaloneBytes: number;
  workspaceRemoved: boolean;
};

export type BeginnerJourneyOptions = {
  keepWorkspace?: boolean;
  logger?: Pick<Console, "log" | "error">;
};

/** End-to-end acceptance for the documented first-game path in a clean temp directory. */
export async function runBeginnerJourney(options: BeginnerJourneyOptions = {}): Promise<BeginnerJourneyEvidence> {
  const workspace = await mkdtemp(join(tmpdir(), "hyperfocus-beginner-journey-"));
  const projectRoot = join(workspace, "first-game");
  const logger = options.logger ?? { log() {}, error() {} };
  let dev: ProjectDevServer | undefined;
  let events: LiveEventCapture | undefined;
  let evidence: Omit<BeginnerJourneyEvidence, "workspaceRemoved"> | undefined;
  try {
    await createProjectStarter({ template: "top-down", outputDirectory: projectRoot, name: "My First Hyperfocus Game" });
    const initialFiles = await filesBelow(projectRoot);
    if (initialFiles.length !== 2 || initialFiles[0] !== ".hyperfocus/assets.hfp" || initialFiles[1] !== ".hyperfocus/project.json") {
      throw new Error(`Beginner starter created unexpected files: ${initialFiles.join(", ")}`);
    }

    dev = await startProjectDevServer({ projectDirectory: projectRoot, hostname: "127.0.0.1", port: 0, debounceMs: 25, logger });
    const firstResponse = await fetch(dev.url);
    const firstHtml = await firstResponse.text();
    if (!firstResponse.ok || !firstHtml.includes("data-hyperfocus-live-reload") || !firstHtml.includes("hyperfocus-project-pair")) {
      throw new Error("Development server did not serve the playable portable snapshot with live reload.");
    }
    events = await captureLiveEvents(new URL("/__hyperfocus/events", dev.url).toString());

    const beforeEdit = await readHyperfocusProjectPair<EditorProject>(projectRoot);
    const inputDeltaBeforeEdit = proveRightInput(beforeEdit.project);
    if (!(inputDeltaBeforeEdit > 0)) throw new Error("Starter player did not move for its documented right input.");

    const beforeEditBuild = dev.status().buildNumber;
    await setProjectPlayerSpeed(projectRoot, 360);
    await waitFor(() => Boolean(dev && dev.status().state === "ready" && dev.status().buildNumber > beforeEditBuild), "live rebuild after data edit");
    await events.waitFor("reload", 1);
    const edited = await readHyperfocusProjectPair<EditorProject>(projectRoot);
    const inputDeltaAfterEdit = proveRightInput(edited.project);
    if (!(inputDeltaAfterEdit > inputDeltaBeforeEdit)) throw new Error("Player-speed edit did not increase playable movement.");
    const canonicalAfterEdit = (await readdir(join(projectRoot, ".hyperfocus"))).sort();
    if (canonicalAfterEdit.join(",") !== "assets.hfp,project.json") throw new Error(`Data edit polluted canonical storage: ${canonicalAfterEdit.join(", ")}`);
    const secondHtml = await (await fetch(dev.url)).text();
    if (secondHtml === firstHtml) throw new Error("Development server did not replace its snapshot after the supported data edit.");

    const lastGoodBuild = dev.status().buildNumber;
    const validProjectJson = await readFile(join(projectRoot, ".hyperfocus", "project.json"));
    await writeFile(join(projectRoot, ".hyperfocus", "project.json"), "{ invalid beginner edit");
    await waitFor(() => dev?.status().state === "error", "actionable invalid-project diagnostic");
    await events.waitFor("error", 1);
    if (dev.status().buildNumber !== lastGoodBuild || !dev.status().lastError) throw new Error("Failed rebuild did not retain the last good snapshot and diagnostic.");
    if (await (await fetch(dev.url)).text() !== secondHtml) throw new Error("Failed rebuild replaced the last good playable snapshot.");
    await writeFile(join(projectRoot, ".hyperfocus", "project.json"), validProjectJson);
    await waitFor(() => Boolean(dev && dev.status().state === "ready" && dev.status().buildNumber > lastGoodBuild), "automatic recovery after fixing project JSON");
    await events.waitFor("reload", 2);

    const reloadEvents = events.count("reload");
    const errorEvents = events.count("error");
    await events.stop();
    events = undefined;
    await dev.stop();
    dev = undefined;
    const build = await buildPortableProject(projectRoot);
    const releaseFiles = await filesBelow(join(projectRoot, "dist"));
    if (releaseFiles.length !== 1 || !releaseFiles[0].endsWith(".html")) throw new Error(`Release build did not produce exactly one standalone HTML file: ${releaseFiles.join(", ")}`);
    const standalone = await readFile(build.outputPath, "utf8");
    if (!standalone.includes("hyperfocus-project-pair") || /<script\s+src=|<link\s+[^>]*href=/i.test(standalone)) throw new Error("Release output is not a self-contained portable standalone game.");

    evidence = {
      steps: ["create", "serve", "input", "edit", "live-reload", "error-recovery", "release-build"],
      initialProjectFileCount: 2,
      canonicalFileCountAfterEdit: 2,
      inputDeltaBeforeEdit,
      inputDeltaAfterEdit,
      editedSpeed: 360,
      reloadEvents,
      errorEvents,
      recoveredLastGoodBuild: true,
      releaseFileCount: 1,
      standaloneBytes: build.bytes,
    };
  } finally {
    await events?.stop();
    await dev?.stop();
    if (!options.keepWorkspace) await rm(workspace, { recursive: true, force: true });
  }
  if (!evidence) throw new Error("Beginner journey ended without acceptance evidence.");
  return { ...evidence, workspaceRemoved: options.keepWorkspace ? false : !existsSync(workspace) };
}

function proveRightInput(project: EditorProject): number {
  const world = createPlayableWorld(project);
  const before = world.getEntity("player");
  if (!before) throw new Error("Starter active scene has no player entity.");
  world.step({ bindings: ["KeyD"] });
  const after = world.getEntity("player");
  if (!after) throw new Error("Starter player disappeared after input.");
  return after.x - before.x;
}

type LiveEventCapture = {
  waitFor(event: "reload" | "error", count: number): Promise<void>;
  count(event: "reload" | "error"): number;
  stop(): Promise<void>;
};

async function captureLiveEvents(url: string): Promise<LiveEventCapture> {
  const abort = new AbortController();
  const response = await fetch(url, { signal: abort.signal });
  if (!response.ok || !response.body) throw new Error(`Live-reload endpoint failed with HTTP ${response.status}.`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let transcript = "";
  const pump = (async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        transcript += decoder.decode(value, { stream: true });
      }
    } catch (cause) {
      if (!abort.signal.aborted) throw cause;
    }
  })();
  return {
    waitFor: async (event, count) => {
      await waitFor(() => countOccurrences(transcript, `event: ${event}\n`) >= count, `${event} live-reload event`);
    },
    count: (event) => countOccurrences(transcript, `event: ${event}\n`),
    stop: async () => {
      abort.abort();
      await reader.cancel().catch(() => undefined);
      await pump.catch(() => undefined);
    },
  };
}

function countOccurrences(value: string, pattern: string): number {
  let count = 0;
  let offset = 0;
  while ((offset = value.indexOf(pattern, offset)) >= 0) {
    count += 1;
    offset += pattern.length;
  }
  return count;
}

async function waitFor(predicate: () => boolean, label: string, timeoutMs = 8_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await Bun.sleep(25);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

async function filesBelow(root: string, prefix = ""): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await filesBelow(join(root, entry.name), path));
    else files.push(path.replace(/\\/g, "/"));
  }
  return files.sort();
}

if (import.meta.main) {
  try {
    console.log(JSON.stringify(await runBeginnerJourney(), null, 2));
  } catch (cause) {
    console.error(`Beginner journey failed: ${cause instanceof Error ? cause.stack ?? cause.message : String(cause)}`);
    process.exitCode = 1;
  }
}
