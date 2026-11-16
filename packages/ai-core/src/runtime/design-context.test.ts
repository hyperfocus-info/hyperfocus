import { expect, test } from "bun:test";
import { aiDesignGuidanceForTask } from "./design-context";
import { sharedAiPreferencesSchema } from "./user-preferences";

test("requests expressed as needs and explicit mixed CLI/UI tasks receive bounded guidance", () => {
  for (const task of ["I want an app to track stock", "We need a project planning app", "Build a CLI and a dashboard", "Build a backend service; create a dashboard", "Create an app with a CLI and a web app"]) {
    expect(aiDesignGuidanceForTask({ task })).toContain("Interface guidance for this task:");
  }
  expect(aiDesignGuidanceForTask({ task: "Build a CLI to parse dashboard logs" })).toBe("");
  expect(aiDesignGuidanceForTask({ task: "Build a CLI without a dashboard" })).toBe("");
});

test("representative localized app creation phrases preserve explicit stack precedence", () => {
  for (const task of ["Crea una aplicación de gastos", "Crée une application de facturation", "Erstelle eine App für Rechnungen"]) {
    expect(aiDesignGuidanceForTask({ task })).toContain("Interface guidance for this task:");
    const explicit = aiDesignGuidanceForTask({ task: `${task} React` });
    expect(explicit).toContain("Honor the requested stack");
    expect(explicit).not.toContain("Hyperfocus");
    expect(explicit.length).toBeLessThan(1500);
  }
});

test("unspecified app creation receives defaults without requiring UI vocabulary", () => {
  for (const task of ["Build an app that tracks expenses", "Create an application for invoices", "Make me a shopping app", "Improve the UI", "Fix form layout on phones", "Make a UI for my audio interface"]) {
    const hint = aiDesignGuidanceForTask({ task });
    expect(hint).toContain("Interface guidance for this task:");
    expect(hint).toContain("project's components");
    expect(hint).toContain("one primary action per active view");
    expect(hint).toContain("Omit routine subtitles");
    expect(hint).toContain("navbar logo/name returns home without losing drafts");
    expect(hint).toContain("unique grouped navbar actions, no subtext");
    expect(hint).toContain("Settings is a view (Meta/Ctrl+,)");
    expect(hint).toContain("Escape closes only the newest overlay");
    expect(hint).toContain("Inputs use normal weight");
    expect(hint).not.toContain("Hyperfocus");
    expect(hint).toContain("unresolved preferences that materially change the outcome");
    expect(hint.length).toBeLessThan(1500);
  }
});

test("audio work, backend work and explicitly excluded UI add no context", () => {
  for (const task of ["Design an ambient pad", "Change the song layout", "Map controller buttons to drum pads", "Configure my audio interface", "Connect two MIDI interfaces", "Build a CLI app to read UI logs", "Build a backend-only app for dashboard metrics", "Build an API-only application", "Build an API app", "Build an app without a UI", "Fix the database; do not change the UI", "Add a TypeScript interface for invoices"]) {
    expect(aiDesignGuidanceForTask({ task })).toBe("");
  }
});

test("explicit stacks and visual references stay authoritative without a brand default", () => {
  for (const task of ["Build an app in React with Bootstrap", "Build an app using SolidJS", "Build a website in plain HTML and CSS", "Build a website matching this Figma mockup", "Build a dashboard using our design system", "Build an app that looks like Stripe", "Build a website; don't use the Hyperfocus design system", "Build an app without Hyperfocus"]) {
    const hint = aiDesignGuidanceForTask({ task });
    expect(hint).toContain("Honor the requested stack and visual references");
    expect(hint).not.toContain("Hyperfocus");
  }
});

test("project context constrains style but does not trigger intent or branches", () => {
  const projectContext = "React dashboard with forms, navigation and media components";
  expect(aiDesignGuidanceForTask({ task: "Fix the database transaction", projectContext })).toBe("");
  const hint = aiDesignGuidanceForTask({ task: "Build an app", projectContext });
  expect(hint).toContain("Honor the requested stack");
  for (const branch of ["Forms:", "Data:", "Navigation:", "Media:"]) expect(hint).not.toContain(branch);
});

test("only requirements evidenced by the task add branches", () => {
  const form = aiDesignGuidanceForTask({ task: "Build an app with signup forms" });
  expect(form).toContain("Forms:");
  for (const branch of ["Data:", "Navigation:", "Media:"]) expect(form).not.toContain(branch);
  const data = aiDesignGuidanceForTask({ task: "Build an app that tracks invoices" });
  expect(data).toContain("Data:");
  expect(data).not.toContain("Forms:");
  const media = aiDesignGuidanceForTask({ task: "Build a video app with sidebar navigation" });
  expect(media).toContain("Navigation:");
  expect(media).toContain("Media:");
  expect(media).not.toContain("Data:");
  expect(aiDesignGuidanceForTask({ task: "Build an app with forms, invoices, sidebar navigation and media playback" }).length).toBeLessThan(1500);
});

test("retired persisted opt-out has no bearing on intent and copied context is not duplicated", () => {
  expect(sharedAiPreferencesSchema.parse({ version: 1, designGuidance: "none" })).toEqual({ version: 1 });
  const task = "Build an app that tracks inventory";
  const hint = aiDesignGuidanceForTask({ task });
  expect(hint).toContain("Interface guidance for this task:");
  expect(aiDesignGuidanceForTask({ task: task + hint })).toBe("");
});

test("menu and learning requests select bounded compositions without requiring UI vocabulary", () => {
  for (const task of ["Build a pause menu", "Fix the game menu system", "Redesign the rewards screen", "Build a title menu in React"]) {
    const hint = aiDesignGuidanceForTask({ task });
    expect(hint).toContain("Composition: intent, surface type, canonical composition, semantic content, validation.");
    expect(hint).toContain("Game menus:");expect(hint).toContain("audience and availability");expect(hint).toContain("modal focus return");
    expect(hint).not.toContain("Tutorials:");expect(hint).not.toContain("@hyperfocus");expect(hint).not.toContain("Touch of Death");
  }
  for (const task of ["Add an interactive tutorial", "Fix tutorials in my game", "Build a first-fight tutorial", "Add in-app onboarding", "Fix tutorial timing and feedback"]) {
    const hint = aiDesignGuidanceForTask({ task });
    expect(hint).toContain("Tutorials:");expect(hint).toContain("Auto-complete from host evidence");
    expect(hint).toContain("never earn progress");expect(hint).toContain("Paused/background time");
    expect(hint).not.toContain("Game menus:");expect(hint.length).toBeLessThan(1500);
  }
  const combined = aiDesignGuidanceForTask({ task: "Build game menus and interactive tutorials, with settings, data tables, navigation and media playback" });
  expect(combined).toContain("Game menus:");expect(combined).toContain("Tutorials:");expect(combined.length).toBeLessThan(2100);
});

test("composition routing avoids prose, engine internals, negated surfaces and unrelated project context", () => {
  for (const task of ["Write a tutorial about building a game", "Write a tutorial about how to build an app", "Translate the tutorial documentation", "Make a restaurant menu", "Fix the headless tutorial simulation", "Build a game without menus or tutorials", "Fix collision; do not change the pause menu", "Add a tutorial completion API", "Build a CLI to inspect game menu logs"]) {
    expect(aiDesignGuidanceForTask({ task }), task).toBe("");
  }
  const projectContext = "Game menus, tutorial timing and completion, interactive onboarding";
  expect(aiDesignGuidanceForTask({ task: "Repair the collision kernel", projectContext })).toBe("");
  const hint = aiDesignGuidanceForTask({ task: "Build an app", projectContext });
  expect(hint).not.toContain("Tutorials:");expect(hint).not.toContain("Game menus:");
  expect(hint).toContain("approved choices");expect(hint).toContain("not taste approval");
});
