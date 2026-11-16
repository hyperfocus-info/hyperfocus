import { expect, test } from "bun:test";
import { parseDevArguments } from "./dev-arguments";

test("default launch and surface aliases coexist with explicit read-only commands", () => {
  expect(parseDevArguments({ argv: [] })).toEqual({ command: "start", args: [] });
  expect(parseDevArguments({ argv: ["status", "--json"] })).toEqual({ command: "status", args: ["--json"] });
  expect(parseDevArguments({ argv: ["--isolated"] })).toEqual({ command: "start", args: ["--isolated"] });
  expect(parseDevArguments({ argv: ["editor", "--port", "8799"] }).command).toBe("start");
  expect(parseDevArguments({ argv: ["status", "--", "editor"] }).args).toEqual(["editor"]);
});

test("malformed launch commands fail before process side effects", () => {
  for (const argv of [["start", "harness", "status", "--json"], ["start", "editor", "--isolted"], ["start", "--port"], ["start", "--port", "0"], ["start", "--port", "65536"], ["status", "--port", "8787"], ["stop", "editor", "--all"], ["start", "--json", "--json"]]) {
    expect(() => parseDevArguments({ argv })).toThrow();
  }
});

test("root dev script dispatches supplied subcommands without injecting start", async () => {
  const manifest = await Bun.file(new URL("../../../../package.json", import.meta.url)).json();
  expect(manifest.scripts.dev).toBe("bun .agents/skills/dev-server/scripts/dev.ts");
});

test("invalid error updates are rejected before registry reconciliation", () => {
  for (const argv of [["error", "0", "fixed"], ["error", "1e2", "open"], ["error", "9007199254740992", "fixed"], ["error", "1", "typo"]]) {
    expect(() => parseDevArguments({ argv })).toThrow();
  }
  expect(parseDevArguments({ argv: ["error", "1", "fix"] }).command).toBe("error");
  expect(parseDevArguments({ argv: ["logs", "--lines", "100000"] }).command).toBe("logs");
});

test('local authentication requires explicit isolated supported startup before registry access', () => {
  for (const surface of ['books', 'trade-bot', 'pad-pilot', 'marketplace', 'pad-pilot-marketplace']) {
    expect(parseDevArguments({ argv: ['start', surface, '--isolated', '--local-auth', '--json'] }).command).toBe('start');
    expect(() => parseDevArguments({ argv: ['start', surface, '--local-auth'] })).toThrow('--isolated');
  }
  for (const argv of [['start', 'harness', '--isolated', '--local-auth'], ['start', 'editor', '--isolated', '--local-auth'], ['start', '--isolated', '--local-auth'], ['status', '--local-auth']]) {
    expect(() => parseDevArguments({ argv })).toThrow();
  }
});
