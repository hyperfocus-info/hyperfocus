import { afterEach, expect, test } from "bun:test";
import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import { PreferencesSurface } from "./preferences";
import type { PreferenceDefinition, PreferenceValues } from "./model";

const disposers: Array<() => void> = [];
afterEach(() => { for (const dispose of disposers.splice(0)) dispose(); document.body.replaceChildren(); });
const definitions: PreferenceDefinition[] = [
  { id: "name", sectionId: "main", scope: "project", title: "Project name", description: "Portable project title", control: { kind: "text" }, defaultValue: "Before" },
  { id: "motion", sectionId: "main", scope: "shared-user", title: "Reduce motion", description: "Reduce decorative transitions", control: { kind: "toggle" }, defaultValue: false },
  { id: "scale", sectionId: "main", scope: "shared-user", title: "UI scale", description: "Application text size", control: { kind: "range", minimum: 1, maximum: 2, step: 0.1 }, defaultValue: 1 },
  { id: "endpoint", sectionId: "other", scope: "app-user", title: "Endpoint", description: "Optional remote connection", control: { kind: "text" }, defaultValue: "localhost" },
];

test("Save error stays associated while its tooltip opens and closes", async () => {
  disposers.push(render(() => <PreferencesSurface sections={[{ id: "main", title: "Main", description: "Project preferences" }]} definitions={definitions} values={{}}
    onChange={() => {}} onSave={() => {}} saveError="Storage is unavailable. Try again." />, document.body));
  const save = [...document.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "Save changes")!;
  const error = document.querySelector('[role="alert"]')!;
  expect(save.getAttribute("aria-describedby")).toBe(error.id);
  save.focus(); await Bun.sleep(0);
  const ids = save.getAttribute("aria-describedby")!.split(" ");
  expect(ids).toContain(error.id);
  expect(ids.some(id => document.getElementById(id)?.getAttribute("role") === "tooltip")).toBe(true);
  save.blur();
  expect(save.getAttribute("aria-describedby")).toBe(error.id);
});

function mount() {
  const [values, setValues] = createSignal<PreferenceValues>({ name: "Before", motion: false, scale: 1, endpoint: "localhost" });
  let saves = 0;
  let resets = 0;
  const host = document.createElement("div");
  document.body.append(host);
  disposers.push(render(() => <PreferencesSurface sections={[{ id: "main", title: "Main", description: "Primary preferences" }, { id: "other", title: "Other", description: "Other preferences" }]} definitions={definitions} values={values()} onChange={(id, value) => setValues(previous => ({ ...previous, [id]: value }))} onSave={() => { saves++; }} onReset={() => { resets++; }} />, host));
  return { host, values, saves: () => saves, resets: () => resets };
}

test("reactive text and range edits preserve focused controls without implicitly saving", () => {
  const ui = mount();
  for (const [id, value] of [["name", "Changed project"], ["scale", "1.5"]]) {
    const input = ui.host.querySelector<HTMLInputElement>(`[data-preference-id="${id}"] input`)!;
    input.focus();
    input.value = value!;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(ui.host.querySelector(`[data-preference-id="${id}"] input`) === input).toBe(true);
    expect(document.activeElement === input).toBe(true);
    expect(input.value).toBe(value!);
  }
  expect(ui.values()).toMatchObject({ name: "Changed project", scale: 1.5 });
  expect(ui.saves()).toBe(0);
});

test("toggle, range and text inputs have preference names and linked descriptions", () => {
  const ui = mount();
  for (const [id, title] of [["name", "Project name"], ["motion", "Reduce motion"], ["scale", "UI scale"]]) {
    const input = ui.host.querySelector<HTMLInputElement>(`[data-preference-id="${id}"] input`)!;
    expect(input.getAttribute("aria-label")).toBe(title!);
    const description = input.getAttribute("aria-describedby");
    expect(Boolean(description && document.getElementById(description)?.textContent)).toBe(true);
  }
  const toggle = ui.host.querySelector<HTMLInputElement>('[data-preference-id="motion"] input')!;
  toggle.checked = true;
  toggle.dispatchEvent(new Event("change", { bubbles: true }));
  expect(ui.values().motion).toBe(true);
  expect(ui.saves()).toBe(0);
});

test("setting help is a tooltip without hiding controls or changing drafts", async () => {
  const ui = mount();
  const row = ui.host.querySelector('[data-preference-id="name"]')!;
  const help = row.querySelector<HTMLElement>('[data-preference-help]')!;
  const input = row.querySelector('input')!;
  expect(row.querySelector('details')).toBeNull();
  expect(help.contains(input)).toBe(false);
  expect(help.textContent).toContain('Project name');
  help.focus(); await Bun.sleep(0);
  expect(document.querySelector('[role="tooltip"]')?.textContent).toBe('Portable project title');
  expect(document.getElementById(input.getAttribute('aria-describedby')!)?.textContent).toBe('Portable project title');
  expect(ui.values().name).toBe('Before');
  expect(ui.saves()).toBe(0);
});

test("section and search navigation recover empty results without saving or resetting drafts", () => {
  const ui = mount();
  const search = ui.host.querySelector<HTMLInputElement>('input[type="search"]')!;
  search.value = "remote connection";
  search.dispatchEvent(new Event("input", { bubbles: true }));
  expect(ui.host.querySelector('[data-preference-id="endpoint"]')).not.toBeNull();
  search.value = "nomatch-at-all";
  search.dispatchEvent(new Event("input", { bubbles: true }));
  expect(ui.host.querySelector("[data-preference-id]")).toBeNull();
  const clear = ui.host.querySelector<HTMLButtonElement>('[aria-label="Clear search"]')!;
  clear.click();
  expect(search.value).toBe("");
  expect(document.activeElement === search).toBe(true);
  expect(ui.host.querySelector('[data-preference-id="name"]')).not.toBeNull();
  const other = [...ui.host.querySelectorAll<HTMLButtonElement>("nav button")].find(button => button.textContent?.includes("Other"))!;
  other.click();
  expect(ui.host.querySelector('[data-preference-id="endpoint"]')).not.toBeNull();
  expect(ui.host.querySelector('[data-preference-id="name"]')).toBeNull();
  expect(ui.saves()).toBe(0);
  expect(ui.resets()).toBe(0);
});

test("Reset invokes only its explicit callback and Save is an explicit separate action", () => {
  const ui = mount();
  const reset = [...ui.host.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.includes("Reset"))!;
  reset.click();
  expect(ui.resets()).toBe(1);
  expect(ui.saves()).toBe(0);
  const save = [...ui.host.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.includes("Save"))!;
  save.click();
  expect(ui.saves()).toBe(1);
});

test("compact section picker switches the visible settings without saving drafts", () => {
  const ui = mount();
  const trigger = ui.host.querySelector<HTMLButtonElement>('[aria-label="Preference section"]')!;
  trigger.click();
  const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(node => node.textContent?.includes("Other"))!;
  option.click();
  expect(ui.host.querySelector('[data-preference-id="endpoint"]')).not.toBeNull();
  expect(ui.host.querySelector('[data-preference-id="name"]')).toBeNull();
  expect(ui.saves()).toBe(0);
  expect(ui.resets()).toBe(0);
});
