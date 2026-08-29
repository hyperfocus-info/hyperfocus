import { afterEach, beforeEach, expect, it } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { createUiTest } from "../../../../../utils/tests/test-harness";
import { PadPilotProvider } from "../../../padpilot/provider";
import { GeneratorDashboard } from "./generator-dashboard";
import { createEmptyGeneratorFields, type GeneratorDashboardFields } from "../utils/generator-options";

createUiTest("GeneratorDashboard", () => {
  const originalRandom = Math.random;

  function lcg(seed = 0x9e3779b9) {
    let state = seed >>> 0;
    return () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 0x100000000;
    };
  }

  const clearGeneratorStorage = () => {
    window.localStorage.removeItem("padpilot.generator.chaos-risk");
    window.localStorage.removeItem("padpilot.generator.theme-mode");
  };

  beforeEach(() => {
    Math.random = originalRandom;
    clearGeneratorStorage();
  });
  afterEach(() => {
    Math.random = originalRandom;
    clearGeneratorStorage();
  });

  it("fills empty selectors and submits optional fields from the home action row", () => {
    const submissions: GeneratorDashboardFields[] = [];
    render(() => (
      <PadPilotProvider>
        <GeneratorDashboard onGenerate={(fields) => {
          submissions.push(fields);
        }} />
      </PadPilotProvider>
    ));

    const magicButton = screen.getByRole("button", { name: "Suggest" });
    const generateButton = screen.getByRole("button", { name: "Generate / Send" });
    fireEvent.click(screen.getByRole("button", { name: "Generator settings" }));
    expect(screen.getByRole("slider", { name: "Chaos/Risk" }).getAttribute("aria-valuenow")).toBe("0.18");
    expect(screen.getByRole("slider", { name: "Creativity" }).getAttribute("aria-valuenow")).toBe("0.65");
    expect(screen.getByRole("slider", { name: "Temperature" }).getAttribute("aria-valuenow")).toBe("0.7");
    expect(screen.getByRole("slider", { name: "Density" }).getAttribute("aria-valuenow")).toBe("0.55");
    expect(screen.getByRole("slider", { name: "Humanize" }).getAttribute("aria-valuenow")).toBe("0.35");
    expect(screen.getByRole("slider", { name: "Bar Length" }).getAttribute("aria-valuenow")).toBe("4");
    expect(screen.getByText("4 BARS")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Lock Chaos/Risk" })).toBeNull();
    expect(screen.getByRole("button", { name: "Clear / Reset" }).getAttribute("data-icon-only")).toBe("true");
    expect(screen.getByRole("button", { name: "Suggest" }).getAttribute("data-icon-only")).toBe("true");
    expect(screen.getByRole("button", { name: "Random" }).getAttribute("data-icon-only")).toBe("true");
    expect(screen.getByRole("button", { name: "Generate / Send" }).getAttribute("data-icon-only")).toBe("true");
    expect(magicButton.getAttribute("data-icon-only")).toBe("true");
    expect(generateButton.getAttribute("data-icon-only")).toBe("true");

    fireEvent.click(magicButton);

    expect((screen.getByLabelText("Genre") as HTMLInputElement).value.length).toBeGreaterThan(0);
    expect((screen.getByLabelText("Mood / Vibe") as HTMLInputElement).value.length).toBeGreaterThan(0);

    fireEvent.click(generateButton);

    expect(submissions[0]?.genre.length).toBeGreaterThan(0);
    expect(submissions[0]?.mood.length).toBeGreaterThan(0);
    expect(submissions[0]).toHaveProperty("magicProvenance");
    const magicProvenance = (submissions[0] as GeneratorDashboardFields & { magicProvenance?: { reroll: number } }).magicProvenance;
    expect(magicProvenance?.reroll).toBe(1);
    expect(magicProvenance).not.toHaveProperty("seed");
  });

  it("exposes combobox semantics and keyboard-operable sliders", () => {
    const submissions: GeneratorDashboardFields[] = [];
    render(() => (
      <PadPilotProvider>
        <GeneratorDashboard onGenerate={(fields) => submissions.push(fields)} />
      </PadPilotProvider>
    ));

    const genre = screen.getByRole("combobox", { name: "Genre" });
    const creativity = screen.getByRole("slider", { name: "Creativity" });

    expect(genre.getAttribute("aria-expanded")).toBe("false");
    expect(genre.getAttribute("aria-controls")).toBeTruthy();

    fireEvent.keyDown(creativity, { key: "ArrowRight" });

    expect(Number(creativity.getAttribute("aria-valuenow"))).toBeGreaterThan(0.65);
  });

  it("cycles theme control through system, light, dark, and back to system", () => {
    render(() => (
      <PadPilotProvider>
        <GeneratorDashboard onGenerate={() => {}} />
      </PadPilotProvider>
    ));

    const dashboard = screen.getByRole("region", { name: "Generator dashboard" });
    fireEvent.click(screen.getByRole("button", { name: "Generator settings" }));
    fireEvent.click(screen.getByRole("button", { name: "Theme: system" }));
    expect(dashboard.getAttribute("data-theme")).toBe("light");
    expect(window.localStorage.getItem("padpilot.generator.theme-mode")).toBe("light");
    expect(screen.getByRole("button", { name: "Theme: light" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Theme: light" }));
    expect(dashboard.getAttribute("data-theme")).toBe("dark");
    expect(screen.getByRole("button", { name: "Theme: dark" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Theme: dark" }));
    expect(dashboard.getAttribute("data-theme-mode")).toBe("system");
    expect(dashboard.getAttribute("data-theme")).toMatch(/^(light|dark)$/);
    expect(screen.getByRole("button", { name: "Theme: system" })).toBeTruthy();
  });

  it("locks selectors against reset and full random actions", () => {
    render(() => (
      <PadPilotProvider>
        <GeneratorDashboard onGenerate={() => {}} />
      </PadPilotProvider>
    ));

    fireEvent.click(screen.getByRole("button", { name: "Suggest" }));
    const lockedGenre = (screen.getByLabelText("Genre") as HTMLInputElement).value;
    fireEvent.click(screen.getByRole("button", { name: "Lock Genre" }));

    fireEvent.click(screen.getByRole("button", { name: "Clear / Reset" }));

    expect((screen.getByLabelText("Genre") as HTMLInputElement).value).toBe(lockedGenre);
    expect((screen.getByLabelText("Mood / Vibe") as HTMLInputElement).value).toBe("");

    fireEvent.click(screen.getByRole("button", { name: "Random" }));

    expect((screen.getByLabelText("Genre") as HTMLInputElement).value).toBe(lockedGenre);
    expect((screen.getByLabelText("Mood / Vibe") as HTMLInputElement).value.length).toBeGreaterThan(0);
  });

  it("locks advanced controls against reset and random actions", () => {
    render(() => (
      <PadPilotProvider>
        <GeneratorDashboard onGenerate={() => {}} />
      </PadPilotProvider>
    ));

    fireEvent.click(screen.getByRole("button", { name: "Random" }));
    const lockedLength = screen.getByRole("slider", { name: "Bar Length" }).getAttribute("aria-valuenow");
    fireEvent.click(screen.getByRole("button", { name: "Lock Bar Length" }));

    fireEvent.click(screen.getByRole("button", { name: "Clear / Reset" }));

    expect(screen.getByRole("slider", { name: "Bar Length" }).getAttribute("aria-valuenow")).toBe(lockedLength);
    expect((screen.getByRole("slider", { name: "Creativity" }) as HTMLElement).getAttribute("aria-valuenow")).toBe("0.65");
  });

  it("unlocks locked controls when clear has nothing else to reset", () => {
    render(() => (
      <PadPilotProvider>
        <GeneratorDashboard onGenerate={() => {}} />
      </PadPilotProvider>
    ));

    fireEvent.click(screen.getByRole("button", { name: "Lock Genre" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear / Reset" }));

    expect(screen.getByRole("button", { name: "Lock Genre" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("submits typed dropdown text even when no menu option is clicked", () => {
    const submissions: GeneratorDashboardFields[] = [];
    render(() => (
      <PadPilotProvider>
        <GeneratorDashboard onGenerate={(fields) => submissions.push(fields)} />
      </PadPilotProvider>
    ));

    fireEvent.input(screen.getByLabelText("Genre"), { currentTarget: { value: "Custom Jungle" }, target: { value: "Custom Jungle" } });
    fireEvent.input(screen.getByLabelText("Scale / Mode"), { currentTarget: { value: "F# Major Pentatonic" }, target: { value: "F# Major Pentatonic" } });
    fireEvent.click(screen.getByRole("button", { name: "Generate / Send" }));

    expect(submissions[0]).toMatchObject({
      creativity: 0.65,
      genre: "Custom Jungle",
      lengthBars: 4,
      scaleKey: "F# Major Pentatonic",
    });
  });

  it("rerolls previously suggested fields while preserving user-entered genre", () => {
    Math.random = lcg(0x474747);
    render(() => (
      <PadPilotProvider>
        <GeneratorDashboard onGenerate={() => {}} />
      </PadPilotProvider>
    ));

    fireEvent.input(screen.getByLabelText("Genre"), { currentTarget: { value: "Gospel" }, target: { value: "Gospel" } });
    fireEvent.click(screen.getByRole("button", { name: "Suggest" }));
    const firstMood = (screen.getByLabelText("Mood / Vibe") as HTMLInputElement).value;
    const firstEra = (screen.getByLabelText("Era") as HTMLInputElement).value;

    fireEvent.click(screen.getByRole("button", { name: "Suggest" }));

    expect((screen.getByLabelText("Genre") as HTMLInputElement).value).toBe("Gospel");
    expect((screen.getByLabelText("Mood / Vibe") as HTMLInputElement).value).not.toBe(firstMood);
    expect((screen.getByLabelText("Era") as HTMLInputElement).value).not.toBe(firstEra);
  });

  it("ranges repeated high-chaos Acid Jazz suggestions through the button path", () => {
    Math.random = lcg(0x333333);
    window.localStorage.setItem("padpilot.generator.chaos-risk", "1");
    render(() => (
      <PadPilotProvider>
        <GeneratorDashboard onGenerate={() => {}} />
      </PadPilotProvider>
    ));

    fireEvent.input(screen.getByLabelText("Genre"), { currentTarget: { value: "Acid Jazz" }, target: { value: "Acid Jazz" } });
    const moods: string[] = [];
    for (let index = 0; index < 16; index += 1) {
      fireEvent.click(screen.getByRole("button", { name: "Suggest" }));
      moods.push((screen.getByLabelText("Mood / Vibe") as HTMLInputElement).value);
    }

    for (let index = 1; index < moods.length; index += 1) {
      expect(moods[index]).not.toBe(moods[index - 1]);
    }
    expect(new Set(moods).size).toBeGreaterThanOrEqual(8);
    expect(moods.filter((mood) => mood === "Warm").length).toBeLessThan(4);
  });

  it("replaces stale generated fields after the user changes the source genre", () => {
    Math.random = lcg(0x999999);
    window.localStorage.setItem("padpilot.generator.chaos-risk", "0.79");
    render(() => (
      <PadPilotProvider>
        <GeneratorDashboard
          initialState={{
            fields: {
              complexity: "Straight Groove",
              creativity: 0.65,
              density: 0.55,
              era: "Modern Worship 2019",
              genre: "Acid Jazz",
              humanize: 0.35,
              lengthBars: 4,
              mood: "Warm",
              notes: "",
              scaleKey: "Lydian Dominant",
              temperature: 0.7,
            },
          }}
          onGenerate={() => {}}
        />
      </PadPilotProvider>
    ));

    fireEvent.input(screen.getByLabelText("Genre"), { currentTarget: { value: "Acid Jazz" }, target: { value: "Acid Jazz" } });
    fireEvent.click(screen.getByRole("button", { name: "Suggest" }));

    expect((screen.getByLabelText("Genre") as HTMLInputElement).value).toBe("Acid Jazz");
    expect((screen.getByLabelText("Mood / Vibe") as HTMLInputElement).value).not.toBe("Warm");
  });

  it("submits the snapped bar length slider value", () => {
    const submissions: GeneratorDashboardFields[] = [];
    render(() => (
      <PadPilotProvider>
        <GeneratorDashboard onGenerate={(fields) => submissions.push(fields)} />
      </PadPilotProvider>
    ));

    fireEvent.keyDown(screen.getByRole("slider", { name: "Bar Length" }), { key: "PageUp" });
    fireEvent.click(screen.getByRole("button", { name: "Generate / Send" }));

    expect(submissions[0]?.lengthBars).toBe(8);
  });

  it("keeps bar length as an accessible 2 to 32 slider with per-row actions", () => {
    render(() => (
      <PadPilotProvider>
        <GeneratorDashboard onGenerate={() => {}} />
      </PadPilotProvider>
    ));

    const barLength = screen.getByRole("slider", { name: "Bar Length" });
    expect(barLength.getAttribute("aria-valuemin")).toBe("2");
    expect(barLength.getAttribute("aria-valuemax")).toBe("32");
    expect(screen.getByRole("button", { name: "Suggest Bar Length" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Randomize Bar Length" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Lock Bar Length" })).toBeTruthy();

    fireEvent.keyDown(barLength, { key: "End" });

    expect(screen.getByRole("slider", { name: "Bar Length" }).getAttribute("aria-valuenow")).toBe("32");
    expect(screen.getByText("32 BARS")).toBeTruthy();
  });

  it("freezes dashboard controls while generation is disabled", () => {
    const submissions: GeneratorDashboardFields[] = [];
    render(() => (
      <PadPilotProvider>
        <GeneratorDashboard disabled onGenerate={(fields) => submissions.push(fields)} />
      </PadPilotProvider>
    ));

    const generate = screen.getByRole("button", { name: "Generate / Send" });
    const genre = screen.getByLabelText("Genre") as HTMLInputElement;
    const notes = screen.getByPlaceholderText("Add any extra context, references, or instructions...") as HTMLTextAreaElement;
    const creativity = screen.getByRole("slider", { name: "Creativity" });
    const magic = screen.getByRole("button", { name: "Suggest" });
    fireEvent.input(genre, { currentTarget: { value: "Drill" }, target: { value: "Drill" } });
    fireEvent.input(notes, { currentTarget: { value: "mutate" }, target: { value: "mutate" } });
    fireEvent.click(magic);
    fireEvent.click(generate);

    expect(genre).toHaveProperty("disabled", true);
    expect(notes).toHaveProperty("disabled", true);
    expect(creativity.getAttribute("aria-disabled")).toBe("true");
    expect(magic).toHaveProperty("disabled", true);
    expect(generate).toHaveProperty("disabled", true);
    expect(submissions).toHaveLength(0);
  });

  it("reconciles authoritative dashboard state after mount", async () => {
    const [initialState, setInitialState] = createSignal({
      fields: { ...createEmptyGeneratorFields(), genre: "House" },
    });
    render(() => (
      <PadPilotProvider>
        <GeneratorDashboard initialState={initialState()} onGenerate={() => {}} />
      </PadPilotProvider>
    ));

    expect((screen.getByLabelText("Genre") as HTMLInputElement).value).toBe("House");
    setInitialState({ fields: { ...createEmptyGeneratorFields(), genre: "Techno" } });

    await waitFor(() => {
      expect((screen.getByLabelText("Genre") as HTMLInputElement).value).toBe("Techno");
    });
  });
});
