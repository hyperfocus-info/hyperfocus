import { describe, expect, test } from "bun:test";
import type { ClientCommand } from "@hyperfocus/ai-core/protocol";
import { consumeIdeLaunchRequest, parseIdeLaunchRequest } from "./ide-launch";

describe("IDE desktop launch", () => {
  test("parses folder and file launch URLs", () => {
    expect(parseIdeLaunchRequest("http://127.0.0.1:8787/?ideProject=project-1")).toEqual({ projectId: "project-1" });
    expect(parseIdeLaunchRequest("http://127.0.0.1:8787/?ideProject=project-1&ideFile=src%2Fmain.ts")).toEqual({
      projectId: "project-1",
      filePath: "src/main.ts"
    });
  });

  test("opens the IDE and file after hydration, then consumes the URL", () => {
    const commands: ClientCommand[] = [];
    const opened: string[] = [];
    const replaced: string[] = [];
    expect(consumeIdeLaunchRequest({
      url: "http://127.0.0.1:8787/?ideProject=project-1&ideFile=src%2Fmain.ts&keep=1",
      activeProjectId: "project-1",
      sendCommand: (command) => commands.push(command),
      openIde: () => opened.push("ide"),
      openFile: (filePath) => opened.push(filePath),
      replaceUrl: (url) => replaced.push(url)
    })).toBe(true);
    expect(commands).toEqual([]);
    expect(opened).toEqual(["ide", "src/main.ts"]);
    expect(replaced).toEqual(["/?keep=1"]);
  });

  test("activates a different requested project", () => {
    const commands: ClientCommand[] = [];
    consumeIdeLaunchRequest({
      url: "http://127.0.0.1:8787/?ideProject=project-2",
      activeProjectId: "project-1",
      sendCommand: (command) => commands.push(command),
      openIde() {},
      openFile() {}
    });
    expect(commands[0]).toMatchObject({ type: "project.activate", payload: { projectId: "project-2" } });
  });
});
