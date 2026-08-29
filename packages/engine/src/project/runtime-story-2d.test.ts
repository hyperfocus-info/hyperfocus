import { describe, expect, test } from "bun:test";
import { createInMemorySaveStorage } from "../save/index.ts";
import type { PlayableProject2D } from "./runtime-2d-contracts.ts";
import { createPlayableWorld } from "./runtime-world-2d.ts";
import { createPlayableSaveController2D } from "./runtime-save-2d.ts";
import { createPlayableStoryController2D, validatePlayableStoryProject2D, type PlayableStoryProject2D } from "./runtime-story-2d.ts";

describe("portable story runtime", () => {
  test("branches from rising-edge actions with locale fallback and variables", () => {
    const project = storyProject();
    const story = createPlayableStoryController2D(project);
    expect(story.view()).toEqual({ id: "hello", type: "line", speaker: "Archivist", text: "Hola, Mara." });
    story.step(["interact"]);
    expect(story.view()).toEqual({ id: "offer", type: "choice", options: [
      { id: "accept", text: "I will recover it." },
      { id: "decline", text: "Ahora no." },
    ] });
    const accepted = story.step(["choose-accept"]);
    expect(accepted.commands).toEqual([{ type: "quest.offer", data: { questId: "lost-relic" } }]);
    expect(accepted.view.type).toBe("end");
    expect(story.step(["choose-accept"]).commands).toEqual([]);
  });

  test("transitions quests and round-trips story state through the checksummed world save", async () => {
    const project = storyProject();
    const storage = createInMemorySaveStorage();
    const firstWorld = createPlayableWorld(project);
    const firstStory = createPlayableStoryController2D(project);
    firstStory.step(["quest-accept"]);
    expect(firstStory.questSnapshot("lost-relic")).toMatchObject({ stateId: "searching", revision: 1 });
    const firstSaves = createPlayableSaveController2D(project, firstWorld, storage, { stateProviders: [firstStory.saveStateProvider()] })!;
    await firstSaves.save();
    firstStory.step([]);
    firstStory.step(["quest-complete"]);
    expect(firstStory.questSnapshot("lost-relic")).toMatchObject({ stateId: "complete", complete: true });

    const restoredWorld = createPlayableWorld(project);
    const restoredStory = createPlayableStoryController2D(project);
    const restoredSaves = createPlayableSaveController2D(project, restoredWorld, storage, { stateProviders: [restoredStory.saveStateProvider()] })!;
    expect(await restoredSaves.restoreOnBoot()).toBe(true);
    expect(restoredStory.questSnapshot("lost-relic")).toMatchObject({ stateId: "searching", revision: 1, complete: false });
    restoredStory.step([]);
    const completed = restoredStory.step(["quest-complete"]);
    expect(completed.quests).toMatchObject([{ stateId: "complete", complete: true, revision: 2 }]);
    expect(completed.commands).toEqual([{ type: "inventory.add", data: { relics: 1 } }]);
  });

  test("rejects broken references, unmapped actions, and ambiguous action ownership", () => {
    const missingChoice = storyProject();
    missingChoice.extensions!.hyperfocusStory.choiceActions[0].choiceId = "missing";
    expect(() => validatePlayableStoryProject2D(missingChoice)).toThrow("missing choice");
    const unmapped = storyProject();
    unmapped.extensions!.hyperfocusStory.questEventActions[0].action = "not-mapped";
    expect(() => validatePlayableStoryProject2D(unmapped)).toThrow("unmapped project action");
    const duplicate = storyProject();
    duplicate.extensions!.hyperfocusStory.choiceActions[0].action = "interact";
    expect(() => validatePlayableStoryProject2D(duplicate)).toThrow("distinct project actions");
  });

  test("rejects malformed restored quest counters and command payloads", () => {
    const story = createPlayableStoryController2D(storyProject());
    const snapshot = story.snapshot();

    expect(() => story.restore({ ...snapshot, quests: [{ ...snapshot.quests[0], revision: -1 }] })).toThrow("collections are invalid");
    expect(() => story.restore({ ...snapshot, pendingCommands: [{ type: "invalid", data: { value: undefined } }] })).toThrow("collections are invalid");
  });
});

type StoryTestProject = PlayableProject2D & {
  id: string;
  extensions: {
    hyperfocusSave: Record<string, unknown>;
    hyperfocusStory: {
      version: 1;
      source: ReturnType<typeof storySource>;
      locale: string;
      variables: Record<string, string | number | boolean | null>;
      flags: Record<string, string | number | boolean | null>;
      entryDialogue: string;
      activeQuests: string[];
      advanceAction: string;
      choiceActions: Array<{ dialogueId: string; nodeId: string; choiceId: string; action: string }>;
      questEventActions: Array<{ questId: string; event: string; action: string; flags?: Record<string, string | number | boolean | null> }>;
    };
  };
};

function storyProject(): StoryTestProject & PlayableStoryProject2D {
  return {
    id: "narrative-test",
    activeSceneId: "main",
    scenes: [{ id: "main", entities: [] }],
    tilemap: { columns: 1, rows: 1, tileSize: 16, values: [0] },
    settings: { input: [
      { action: "interact", bindings: ["KeyE"] },
      { action: "choose-accept", bindings: ["Digit1"] },
      { action: "choose-decline", bindings: ["Digit2"] },
      { action: "quest-accept", bindings: ["KeyQ"] },
      { action: "quest-complete", bindings: ["KeyR"] },
    ] },
    extensions: {
      hyperfocusSave: { schema: "portable-world-snapshot-v1", dataVersion: 0, slotPolicy: "single", slots: ["auto"], defaultSlot: "auto", restoreOnBoot: true, editorPlay: "reset", maxBytes: 262_144 },
      hyperfocusStory: {
        version: 1,
        source: storySource(),
        locale: "es",
        variables: { name: "Mara" },
        flags: {},
        entryDialogue: "archivist",
        activeQuests: ["lost-relic"],
        advanceAction: "interact",
        choiceActions: [
          { dialogueId: "archivist", nodeId: "offer", choiceId: "accept", action: "choose-accept" },
          { dialogueId: "archivist", nodeId: "offer", choiceId: "decline", action: "choose-decline" },
        ],
        questEventActions: [
          { questId: "lost-relic", event: "accepted", action: "quest-accept" },
          { questId: "lost-relic", event: "relic-found", action: "quest-complete" },
        ],
      },
    },
  };
}

function storySource() {
  return {
    defaultLocale: "en",
    locales: [
      { locale: "en", messages: { greeting: "Hello, {name}.", accept: "I will recover it.", decline: "Not now." } },
      { locale: "es", messages: { greeting: "Hola, {name}.", decline: "Ahora no." } },
    ],
    dialogues: [{
      id: "archivist", start: "hello", nodes: [
        { id: "hello", type: "line" as const, textKey: "greeting", speaker: "Archivist", next: "offer" },
        { id: "offer", type: "choice" as const, options: [
          { id: "accept", textKey: "accept", next: "grant" },
          { id: "decline", textKey: "decline", next: "end" },
        ] },
        { id: "grant", type: "action" as const, command: { type: "quest.offer", data: { questId: "lost-relic" } }, next: "end" },
        { id: "end", type: "end" as const },
      ],
    }],
    quests: [{ id: "lost-relic", start: "offered", states: [
      { id: "offered", transitions: [{ event: "accepted", target: "searching" }] },
      { id: "searching", transitions: [{ event: "relic-found", target: "complete", commands: [{ type: "inventory.add", data: { relics: 1 } }] }] },
      { id: "complete", terminal: true },
    ] }],
  };
}
