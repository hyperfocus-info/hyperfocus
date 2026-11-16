import { expect, test } from "bun:test";
import { appendFileSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, statSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { runDevProcess } from "./dev-process";

test("scoped source changes replace the owned process and ignore generated sibling work", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "dev-process-"));
  const source = path.join(root, "src");
  const shared = path.join(root, "packages/shared");
  const log = path.join(root, "starts.jsonl");
  mkdirSync(source, { recursive: true }); mkdirSync(shared, { recursive: true });
  writeFileSync(path.join(source, "value.txt"), "initial");
  const old = new Date(Date.now() - 7_200_000);
  utimesSync(path.join(source, "value.txt"), old, old);
  writeFileSync(path.join(shared, "value.txt"), "shared");
  const entry = path.join(root, "backend.ts");
  writeFileSync(entry, `import{appendFileSync}from'node:fs';appendFileSync(${JSON.stringify(log)},JSON.stringify({pid:process.pid})+String.fromCharCode(10));setInterval(()=>{},1000);`);
  const controller = new AbortController();
  const filteredChanges: string[] = [];
  const records = () => existsSync(log) ? readFileSync(log, "utf8").trim().split("\n").filter(Boolean).map((line) => {
    const record: unknown = JSON.parse(line);
    if (!record || typeof record !== "object" || !("pid" in record) || typeof record.pid !== "number") {
      throw new Error("Process start record must contain a numeric pid.");
    }
    return { pid: record.pid };
  }) : [];
  const waitForStarts = async (count: number) => {
    const deadline = Date.now() + 5_000;
    while (records().length < count && Date.now() < deadline) await Bun.sleep(20);
    expect(records()).toHaveLength(count);
  };
  const running = runDevProcess({
    cmd: [process.execPath, entry], cwd: root,
    watchPaths: [{ path: root, recursive: false }, source, shared],
    isWatchPath: (file) => {
      if (file.endsWith("value.txt")) filteredChanges.push(file);
      return file.endsWith(".txt");
    },
    signal: controller.signal, debounceScheduleMs: [30],
  });
  try {
    await waitForStarts(1);
    const initial = statSync(path.join(source, "value.txt"));
    readFileSync(path.join(source, "value.txt"));
    // Deterministic metadata-only notification even on no-atime filesystems.
    utimesSync(path.join(source, "value.txt"), new Date(), initial.mtime);
    mkdirSync(path.join(root, ".local/branchfs/flood"), { recursive: true });
    writeFileSync(path.join(root, ".local/branchfs/flood/copy.ts"), "ignored");
    writeFileSync(path.join(source, "fixture.test.ts"), "ignored test");
    await Bun.sleep(120);
    expect(records()).toHaveLength(1);
    expect(filteredChanges).toEqual([]);
    appendFileSync(path.join(source, "value.txt"), " changed");
    await waitForStarts(2);
    expect(() => process.kill(records()[0]!.pid, 0)).toThrow();
    appendFileSync(path.join(shared, "value.txt"), " changed");
    await waitForStarts(3);
    expect(() => process.kill(records()[1]!.pid, 0)).toThrow();
  } finally {
    controller.abort();
    expect(await running).toBe(0);
    const last = records().at(-1);
    if (last) expect(() => process.kill(last.pid, 0)).toThrow();
    rmSync(root, { recursive: true, force: true });
  }
}, 15_000);

test("reports an unexpected child exit and rejects competing watch owners", async () => {
  expect(await runDevProcess({ cmd: [process.execPath, "-e", "process.exit(7)"], cwd: process.cwd(), watchPaths: [] })).toBe(7);
  await expect(runDevProcess({ cmd: [process.execPath, "--hot", "entry.ts"], cwd: process.cwd(), watchPaths: ["src"] })).rejects.toThrow("owns watching");
});

test("returns a successful child exit with source watches enabled", async () => {
  const controller = new AbortController();
  const running = runDevProcess({
    cmd: [process.execPath, "-e", "process.exit(0)"], cwd: process.cwd(),
    watchPaths: [import.meta.path], signal: controller.signal,
  });
  try {
    expect(await Promise.race([running, Bun.sleep(500).then(() => "still watching")])).toBe(0);
  } finally {
    controller.abort();
    await running;
  }
});

test("keeps scoped watches after a syntax error and recovers on the next edit", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "dev-process-recovery-"));
  const entry = path.join(root, "backend.ts");
  const log = path.join(root, "starts.jsonl");
  const controller = new AbortController();
  writeFileSync(entry, "const broken = ;");
  let settled = false;
  const running = runDevProcess({
    cmd: [process.execPath, entry], cwd: root, watchPaths: [entry],
    signal: controller.signal, debounceScheduleMs: [30],
  }).finally(() => { settled = true; });
  let childPid: number | undefined;
  try {
    await Bun.sleep(350);
    expect(settled).toBe(false);
    expect(existsSync(log)).toBe(false);
    writeFileSync(entry, `import{appendFileSync}from'node:fs';appendFileSync(${JSON.stringify(log)},String(process.pid)+'\\n');setInterval(()=>{},1000);`);
    const deadline = Date.now() + 5_000;
    while (!existsSync(log) && Date.now() < deadline) await Bun.sleep(20);
    expect(existsSync(log)).toBe(true);
    childPid = Number(readFileSync(log, "utf8").trim());
    await Bun.sleep(150);
    expect(readFileSync(log, "utf8").trim().split("\n")).toHaveLength(1);
  } finally {
    controller.abort();
    const exitCode = await running;
    rmSync(root, { recursive: true, force: true });
    expect(exitCode).toBe(0);
    const exitedPid = childPid;
    if (exitedPid) expect(() => process.kill(exitedPid, 0)).toThrow();
  }
}, 10_000);
