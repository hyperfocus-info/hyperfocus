import { afterEach, describe, expect, test } from "bun:test";
import { render } from "solid-js/web";
import { createDefaultProject, type EditorAsset } from "@hyperfocus/engine/project";
import { SelectionInspector, type SelectionInspectorSelection } from "./selection-inspector.tsx";

afterEach(() => document.body.replaceChildren());

function mount(selection: SelectionInspectorSelection, configure?: (project: ReturnType<typeof createDefaultProject>) => void) {
  const project = createDefaultProject("Inspector test");
  configure?.(project);
  const host = document.createElement("div");
  document.body.append(host);
  const dispose = render(() => <SelectionInspector project={project} selection={selection} />, host);
  return { project, host, dispose };
}

describe("SelectionInspector", () => {
  test("renders an accessible empty state without legacy HTML injection", () => {
    const mounted = mount({ kind: "none" });

    expect(mounted.host.querySelector('[data-selection-inspector]')?.getAttribute("aria-label")).toBe("Selection inspector");
    expect(mounted.host.querySelector("[data-empty-state] strong")?.textContent).toBe("Nothing selected");
    expect(mounted.host.textContent).toContain("Select an entity to inspect its properties and components.");
    expect(mounted.host.querySelector("script")).toBeNull();
    mounted.dispose();
  });

  test("renders asset metadata, usages, audio state, and stable actions", () => {
    const asset: EditorAsset = {
      id: "audio-theme",
      name: "Theme.ogg",
      kind: "audio",
      mimeType: "audio/ogg",
      size: 2048,
      lastModified: 1,
      source: "imported",
      sha256: "a".repeat(64),
    };
    const selection: SelectionInspectorSelection = {
      kind: "asset",
      asset,
      audition: { assetId: asset.id, phase: "playing", message: "Playing Theme.ogg" },
    };
    const mounted = mount(selection, (project) => {
      project.assets.push(asset);
      project.timeline.audioTracks.push({ id: "music", name: "Main theme", assetId: asset.id, startFrame: 0, durationFrames: 60, trimStart: 0, trimEnd: 60, fadeIn: 0, fadeOut: 0, loopStart: 0, loopEnd: 60, volume: 1, pan: 0, muted: false, solo: false });
    });

    expect(mounted.host.querySelector("h3")?.textContent).toBe("Theme.ogg");
    expect(mounted.host.textContent).toContain("2.0 KB");
    expect(mounted.host.textContent).toContain("Audio track Main theme");
    expect(mounted.host.querySelector('[data-editor-action="audition-audio-asset"]')?.hasAttribute("disabled")).toBe(true);
    expect(mounted.host.querySelector('[data-editor-action="stop-audio-audition"]')?.hasAttribute("disabled")).toBe(false);
    expect(mounted.host.querySelector("#asset-audio-audition-status")?.textContent).toBe("Playing Theme.ogg");
    expect(mounted.host.querySelector('[data-editor-action="replace-asset"][data-asset-id="audio-theme"]')).not.toBeNull();
    mounted.dispose();
  });

  test("renders typed entity properties and keyed component cards with compatibility hooks", () => {
    const project = createDefaultProject();
    const entity = project.scenes[0].entities.find((candidate) => candidate.id === "player-01")!;
    const mounted = mount({ kind: "entity", entity }, (target) => Object.assign(target, project));

    expect(mounted.host.querySelector<HTMLInputElement>('[data-entity-property="label"]')?.value).toBe("Player_01");
    expect(mounted.host.querySelector('[data-entity-property="opacity"]')?.getAttribute("max")).toBe("1");
    expect(mounted.host.querySelectorAll("[data-component-card]").length).toBe(entity.components.length);
    expect(mounted.host.querySelector('[data-component-card="input-player"] [data-component-key="action"]')).not.toBeNull();
    expect(mounted.host.querySelector('[data-component-card="collider-player"] [data-component-key="shape"]')).not.toBeNull();
    expect(mounted.host.querySelector('[data-component-card="collider-player"] [data-component-key="solid"]')?.getAttribute("role")).toBe("switch");
    expect(mounted.host.querySelector('[data-component-card="player-01-sprite"] [data-component-key="tint"]')?.getAttribute("type")).toBe("color");
    expect(mounted.host.querySelector<HTMLButtonElement>('[aria-label="transform component actions"]')).not.toBeNull();
    expect(mounted.host.querySelector('[data-editor-action="add-selected-component"]')).not.toBeNull();
    expect(mounted.host.querySelector(".generated-code")?.textContent).toContain('scene.entity("player-01")');
    mounted.dispose();
  });

  test("keeps audio asset, trigger, bus, gain, pan, and loop adapters editor-local", () => {
    const project = createDefaultProject();
    const entity = project.scenes[0].entities.find((candidate) => candidate.id === "player-01")!;
    project.assets.push({ id: "step-audio", name: "Step.wav", kind: "audio", mimeType: "audio/wav", size: 512, lastModified: 1, source: "imported" });
    entity.components.push({ id: "player-audio", type: "audio", enabled: true, values: { assetId: "step-audio", trigger: "action:move-right", bus: "sfx", gain: 0.75, pan: -0.25, loop: true } });
    const mounted = mount({ kind: "entity", entity }, (target) => Object.assign(target, project));
    const card = mounted.host.querySelector('[data-component-card="player-audio"]')!;

    expect(card.querySelector<HTMLButtonElement>('[data-component-key="assetId"]')?.dataset.selectValue).toBe("step-audio");
    expect(card.querySelector('[data-component-key="trigger"]')?.textContent).toContain("Action · move-right");
    expect(card.querySelector<HTMLButtonElement>('[data-component-key="bus"]')?.dataset.selectValue).toBe("sfx");
    expect(card.querySelector('[data-component-key="gain"]')?.getAttribute("max")).toBe("4");
    expect(card.querySelector<HTMLInputElement>('[data-component-key="pan"]')?.value).toBe("-0.25");
    expect(card.querySelector<HTMLInputElement>('[data-component-key="loop"]')?.checked).toBe(true);
    mounted.dispose();
  });

  test("maps built-in behavior definitions into grouped controls and source actions", () => {
    const project = createDefaultProject();
    const entity = project.scenes[0].entities.find((candidate) => candidate.id === "sentinel-a")!;
    const behavior = entity.components.find((component) => component.type === "behavior")!;
    const mounted = mount({ kind: "entity", entity }, (target) => Object.assign(target, project));
    const card = mounted.host.querySelector(`[data-component-card="${behavior.id}"]`)!;

    expect(card.querySelector("summary")?.textContent).toContain("built-in");
    expect(card.querySelector(".behavior-public-properties")).not.toBeNull();
    expect(card.querySelector('[data-component-key="speed"]')?.getAttribute("data-value-kind")).toBe("number");
    expect(card.querySelector('[data-editor-action="create-behavior-extension"]')).not.toBeNull();
    expect(card.querySelector('[data-editor-action="remove-behavior-variable"][data-component-key="speed"]')).not.toBeNull();
    expect(card.querySelector(".behavior-binding [data-component-key=module]")).not.toBeNull();
    mounted.dispose();
  });
});
