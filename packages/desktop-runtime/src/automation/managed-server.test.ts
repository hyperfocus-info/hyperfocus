import { afterEach, expect, mock, spyOn, test } from "bun:test";
import * as spawning from "../process/spawn";
import * as termination from "../process/terminate";
import { startManagedServer } from "./managed-server";

afterEach(() => mock.restore());

test("isolated CLI client validates startup rows and stops only its returned ID", async () => {
  const child = {
    pid: 21, exitCode: null, exited: Promise.resolve(0), processGroup: false, stdin: null,
    stdout: new Blob(['starting\n{"id":12,"url":"http://invalid"}\n{"id":"owned-id","url":"http://127.0.0.1:8812","extra":"ignored"}\n']).stream(),
    stderr: new Blob([]).stream(), kill() {}, ref() {}, unref() {},
  };
  const stopped = { ...child, pid: 22, exitCode: 0, stdout: new Blob([]).stream(), stderr: new Blob([]).stream() };
  const spawn = spyOn(spawning, "spawnBackgroundProcess").mockReturnValueOnce(child).mockReturnValueOnce(stopped);
  const terminate = spyOn(termination, "terminateProcessTree").mockResolvedValue(undefined);
  const fetch = spyOn(globalThis, "fetch").mockResolvedValue(new Response("healthy"));
  const supervisor = { command: ["bun", "/existing/supervisor.ts"], cwd: "/repo" };
  const site = await startManagedServer({ supervisor, surface: "books", env: { ONLY_FIXTURE: "yes" }, inheritEnvironment: false });
  expect(site).toMatchObject({ id: "owned-id", url: "http://127.0.0.1:8812", pid: 21 });
  expect(spawn.mock.calls[0]?.[0]).toEqual({ cmd: ["bun", "/existing/supervisor.ts", "start", "books", "--isolated", "--json"], cwd: "/repo", env: { ONLY_FIXTURE: "yes" }, stdout: "pipe", stderr: "pipe" });
  expect(fetch.mock.calls[0]?.[0]).toEqual(new URL("http://127.0.0.1:8812/healthz"));
  await site.close();
  expect(spawn.mock.calls[1]?.[0]).toEqual({ cmd: ["bun", "/existing/supervisor.ts", "stop", "owned-id", "--json"], cwd: "/repo", stdout: "pipe", stderr: "pipe" });
  expect(terminate).toHaveBeenCalledWith({ process: child });
});

test("an exited supervisor preserves its startup failure without an unrelated stop", async () => {
  const child = {
    pid: 23, exitCode: 1, exited: Promise.resolve(1), processGroup: false, stdin: null,
    stdout: new Blob([]).stream(), stderr: new Blob([]).stream(), kill() {}, ref() {}, unref() {},
  };
  const spawn = spyOn(spawning, "spawnBackgroundProcess").mockReturnValue(child);
  const terminate = spyOn(termination, "terminateProcessTree").mockResolvedValue(undefined);
  await expect(startManagedServer({ supervisor: { command: ["bun", "/existing/supervisor.ts"], cwd: "/repo" }, surface: "books", env: {} })).rejects.toThrow("Server exited:");
  expect(spawn).toHaveBeenCalledTimes(1);
  expect(terminate).not.toHaveBeenCalled();
});

test("readiness timeout stops the identified server and cleans its CLI process", async () => {
  const child = {
    pid: 24, exitCode: null, exited: Promise.resolve(0), processGroup: false, stdin: null,
    stdout: new Blob(['{"id":"not-ready","url":"http://127.0.0.1:8812"}\n']).stream(),
    stderr: new Blob([]).stream(), kill() {}, ref() {}, unref() {},
  };
  const stopped = { ...child, pid: 25, exitCode: 0, stdout: new Blob([]).stream(), stderr: new Blob([]).stream() };
  const spawn = spyOn(spawning, "spawnBackgroundProcess").mockReturnValueOnce(child).mockReturnValueOnce(stopped);
  const terminate = spyOn(termination, "terminateProcessTree").mockResolvedValue(undefined);
  spyOn(globalThis, "fetch").mockResolvedValue(new Response("not ready", { status: 503 }));
  let now = 0, sleeps = 0;
  spyOn(Date, "now").mockImplementation(() => now);
  spyOn(Bun, "sleep").mockImplementation(async () => { if (++sleeps > 1) now = 90001; });
  await expect(startManagedServer({ supervisor: { command: ["bun", "/existing/supervisor.ts"], cwd: "/repo" }, surface: "books", env: {} })).rejects.toThrow("Server did not become ready:");
  expect(spawn.mock.calls[1]?.[0].cmd).toEqual(["bun", "/existing/supervisor.ts", "stop", "not-ready", "--json"]);
  expect(terminate).toHaveBeenCalledWith({ process: child });
});

test('local auth is an explicit supervisor capability forwarded on isolated starts only', async () => {
  const child = { pid: 30, exitCode: null, exited: Promise.resolve(0), processGroup: false, stdin: null,
    stdout: new Blob(['{"id":"local-auth-id","url":"http://127.0.0.1:8812"}\n']).stream(),
    stderr: new Blob([]).stream(), kill() {}, ref() {}, unref() {} };
  const stopped = { ...child, exitCode: 0, stdout: new Blob([]).stream(), stderr: new Blob([]).stream() };
  const spawn = spyOn(spawning, 'spawnBackgroundProcess').mockReturnValueOnce(child).mockReturnValueOnce(stopped);
  spyOn(termination, 'terminateProcessTree').mockResolvedValue(undefined);
  spyOn(globalThis, 'fetch').mockResolvedValue(new Response('healthy'));
  const site = await startManagedServer({ supervisor: { command: ['bun', '/supervisor.ts'], cwd: '/repo' }, surface: 'books', env: {}, inheritEnvironment: false, localAuth: true });
  expect(spawn.mock.calls[0]?.[0].cmd).toEqual(['bun', '/supervisor.ts', 'start', 'books', '--isolated', '--local-auth', '--json']);
  expect(spawn.mock.calls[0]?.[0].env).toEqual({});
  await site.close();
});
