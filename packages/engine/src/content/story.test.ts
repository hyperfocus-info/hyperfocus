import { describe, expect, test } from "bun:test";
import { createStoryCatalog, type StorySource } from "./story.ts";

function fixture(): StorySource {
  return {
    defaultLocale: "en",
    locales: [
      { locale: "en", messages: {
        greeting: "Hello, {name}.",
        apples: { zero: "No apples", one: "{count} apple", other: "{count} apples" },
        accept: "I will help.",
        decline: "Not today.",
      } },
      { locale: "es", messages: { greeting: "Hola, {name}." } },
    ],
    dialogues: [{
      id: "merchant",
      start: "hello",
      nodes: [
        { id: "hello", type: "line", textKey: "greeting", speaker: "Merchant", next: "choice" },
        { id: "choice", type: "choice", options: [
          { id: "yes", textKey: "accept", next: "grant", condition: { key: "trusted", equals: true } },
          { id: "no", textKey: "decline", next: "end" },
        ] },
        { id: "grant", type: "action", command: { type: "quest.offer", data: { questId: "apples" } }, next: "end" },
        { id: "end", type: "end" },
      ],
    }],
    quests: [{
      id: "apples",
      start: "collecting",
      states: [
        { id: "collecting", transitions: [{ event: "collected", target: "return", condition: { key: "enough", equals: true } }] },
        { id: "return", transitions: [{ event: "turned-in", target: "complete", commands: [{ type: "inventory.add", data: { coins: 5 } }] }] },
        { id: "complete", terminal: true },
      ],
    }],
  };
}

describe("localized dialogue and quest primitives", () => {
  test("formats fallback messages, variables, and bounded plural forms", () => {
    const story = createStoryCatalog(fixture());
    expect(story.format("es", "greeting", { name: "Ana" })).toBe("Hola, Ana.");
    expect(story.format("es", "accept")).toBe("I will help.");
    expect(story.format("en", "apples", { count: 0 })).toBe("No apples");
    expect(story.format("en", "apples", { count: 2 })).toBe("2 apples");
    expect(() => story.format("en", "greeting")).toThrow(/name/);
  });

  test("executes dialogue choices and commands with explicit snapshots", () => {
    const session = createStoryCatalog(fixture()).startDialogue("merchant", { locale: "en", variables: { name: "Mara" }, flags: { trusted: true } });
    expect(session.view()).toEqual({ id: "hello", type: "line", text: "Hello, Mara.", speaker: "Merchant" });
    expect(session.advance()).toEqual([]);
    expect(session.view()).toMatchObject({ type: "choice", options: [{ id: "yes" }, { id: "no" }] });
    expect(session.advance("yes")).toEqual([]);
    expect(session.advance()).toEqual([{ type: "quest.offer", data: { questId: "apples" } }]);
    expect(session.snapshot()).toEqual({ version: 1, dialogueId: "merchant", nodeId: "end", complete: false });
    const restored = createStoryCatalog(fixture()).startDialogue("merchant", { snapshot: session.snapshot(), variables: { name: "Mara" } });
    expect(restored.view()).toEqual({ id: "end", type: "end" });
    session.advance();
    expect(session.snapshot().complete).toBe(true);
  });

  test("filters unavailable choices instead of accepting hidden ids", () => {
    const session = createStoryCatalog(fixture()).startDialogue("merchant", { variables: { name: "Mara" } });
    session.advance();
    expect(session.view()).toMatchObject({ type: "choice", options: [{ id: "no" }] });
    expect(() => session.advance("yes")).toThrow(/unavailable/);
  });

  test("advances quests deterministically and restores snapshots", () => {
    const story = createStoryCatalog(fixture());
    const quest = story.startQuest("apples");
    expect(quest.send("collected", { enough: false })).toEqual({ changed: false, commands: [] });
    expect(quest.send("collected", { enough: true })).toEqual({ changed: true, commands: [] });
    const snapshot = quest.snapshot();
    expect(snapshot).toMatchObject({ stateId: "return", revision: 1, complete: false });
    const restored = story.startQuest("apples", snapshot);
    expect(restored.send("turned-in")).toEqual({ changed: true, commands: [{ type: "inventory.add", data: { coins: 5 } }] });
    expect(restored.snapshot()).toMatchObject({ stateId: "complete", revision: 2, complete: true });
  });

  test("rejects broken graph references, missing text, and ambiguous quest events", () => {
    const missingText = fixture();
    missingText.dialogues![0].nodes[0] = { id: "hello", type: "line", textKey: "missing" };
    expect(() => createStoryCatalog(missingText)).toThrow(/missing default-locale/);

    const missingNode = fixture();
    const node = missingNode.dialogues?.[0]?.nodes[0];
    if (!node) throw new Error("Expected a dialogue node in the story fixture");
    Reflect.set(node, "next", "missing");
    expect(() => createStoryCatalog(missingNode)).toThrow(/missing id/);

    const ambiguous = fixture();
    ambiguous.quests![0].states[0].transitions!.push({ event: "collected", target: "complete" });
    expect(() => createStoryCatalog(ambiguous)).toThrow(/ambiguous event/);

    const nonPortable = fixture();
    const command = nonPortable.quests?.[0]?.states[1]?.transitions?.[0]?.commands?.[0];
    if (!command) throw new Error("Expected a quest command in the story fixture");
    Reflect.set(command, "data", { created: new Date() });
    expect(() => createStoryCatalog(nonPortable)).toThrow(/portable JSON/);
  });

  test("enforces locale, node, choice, state, and command bounds", () => {
    expect(() => createStoryCatalog(fixture(), { maxLocales: 1 })).toThrow(/Locale count/);
    expect(() => createStoryCatalog(fixture(), { maxNodesPerDialogue: 2 })).toThrow(/node count/);
    expect(() => createStoryCatalog(fixture(), { maxChoicesPerNode: 1 })).toThrow(/option count/);
    expect(() => createStoryCatalog(fixture(), { maxStatesPerQuest: 2 })).toThrow(/state count/);
    expect(() => createStoryCatalog(fixture(), { maxCommandsPerTransition: 0 })).toThrow(/positive/);
  });
});
