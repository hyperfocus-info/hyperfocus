import { afterEach, expect, test } from "bun:test";
import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import { TagPicker } from "./tag-picker";
import { FavoriteSelectControl } from "./favorite-select-control";

afterEach(() => document.body.replaceChildren());
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
function button(label: string) {
  const found = document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
}

test("tag picker keeps controlled multiple selections, searches, and restores keyboard focus", async () => {
  const [value, setValue] = createSignal(["tag-0"]);
  const options = Array.from({ length: 12 }, (_, index) => ({ value: `tag-${index}`, label: `Sound ${index}` }));
  const dispose = render(() => <TagPicker ariaLabel="Sound tags" options={options} value={value()} onChange={setValue} />, document.body);
  const trigger = button("Sound tags");
  trigger.focus(); trigger.click();
  await tick();
  const search = document.querySelector<HTMLInputElement>('input[type="search"]');
  if (!search) throw new Error("Missing search");
  expect(document.activeElement === search).toBe(true);
  search.value = "Sound 11"; search.dispatchEvent(new Event("input", { bubbles: true }));
  expect(document.querySelectorAll('input[type="checkbox"]').length).toBe(1);
  search.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
  const checkbox = document.querySelector<HTMLInputElement>('input[type="checkbox"]');
  if (!checkbox) throw new Error("Missing choice");
  expect(document.activeElement === checkbox).toBe(true);
  checkbox.click();
  expect(value()).toEqual(["tag-0", "tag-11"]);
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  checkbox.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await tick();
  expect(document.activeElement === trigger).toBe(true);
  button("Remove Sound 11").click();
  expect(value()).toEqual(["tag-0"]);
  dispose();
});

test("small tag sets omit search and rejected host changes preserve accepted chips", async () => {
  const dispose = render(() => <TagPicker ariaLabel="Kinds" options={[{ value: "a", label: "Audio" }, { value: "b", label: "Blocked", disabled: true }]} value={["a"]} onChange={() => undefined} />, document.body);
  button("Remove Audio").click();
  expect(button("Remove Audio")).toBeDefined();
  button("Kinds").click(); await tick();
  expect(document.querySelector('input[type="search"]')).toBeNull();
  expect(document.querySelectorAll('input[type="checkbox"]:disabled').length).toBe(1);
  const accepted = document.querySelector<HTMLInputElement>('input[type="checkbox"]:not(:disabled)');
  accepted?.click();
  expect(accepted?.checked).toBe(true);
  const done = Array.from(document.querySelectorAll("button")).find(item => item.textContent === "Done");
  done?.focus(); done?.click(); await tick();
  expect(document.activeElement === button("Kinds")).toBe(true);
  dispose();
});

test("favoriting preserves selected value and offers favorite and host tag filters", async () => {
  const [favorites, setFavorites] = createSignal<string[]>([]);
  const [value, setValue] = createSignal("m9");
  const options = Array.from({ length: 10 }, (_, index) => ({ value: `m${index}`, label: `Model ${index}`, tags: ["vision"] }));
  const dispose = render(() => <FavoriteSelectControl ariaLabel="Model" value={value()} onChange={setValue} options={options} favoriteValues={favorites()} onToggleFavorite={id => setFavorites(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id])} />, document.body);
  button("Model").click(); await tick();
  button("Favorite Model 9").click();
  expect(value()).toBe("m9");
  expect(favorites()).toEqual(["m9"]);
  expect(document.querySelector('[data-select-option="m9"]')).not.toBeNull();
  const favoriteFilter = Array.from(document.querySelectorAll("button")).find(item => item.textContent === "Favorites");
  expect(favoriteFilter).toBeDefined(); favoriteFilter?.click();
  expect(document.querySelectorAll('[data-select-option]').length).toBe(1);
  expect(document.querySelector('[data-select-option] button')).toBeNull();
  expect(document.body.textContent).toContain("vision");
  dispose();
});

test("small favorite catalogs expose filters without adding a search field", async () => {
  const dispose = render(() => <FavoriteSelectControl ariaLabel="Small catalog" value="a" onChange={() => undefined} options={[{ value: "a", label: "Audio" }, { value: "b", label: "Voice" }]} favoriteValues={["b"]} onToggleFavorite={() => undefined} />, document.body);
  button("Small catalog").click(); await tick();
  expect(document.querySelector('input[type="search"]')).toBeNull();
  const filter = Array.from(document.querySelectorAll("button")).find(item => item.textContent === "Favorites");
  expect(filter).toBeDefined(); filter?.click();
  expect(document.querySelectorAll('[data-select-option]').length).toBe(1);
  expect(document.querySelector('[data-select-option]')?.textContent).toContain("Voice");
  dispose();
});

test("hidden single choices do not leave an orphaned favorite action", () => {
  const [options, setOptions] = createSignal([{ value: "a", label: "Audio" }]);
  const dispose = render(() => <FavoriteSelectControl ariaLabel="Optional catalog" value="a" options={options()} onChange={() => undefined} favoriteValues={[]} onToggleFavorite={() => undefined} hideWhenSingleOption />, document.body);
  expect(document.querySelector("button")).toBeNull();
  setOptions([{ value: "a", label: "Audio" }, { value: "b", label: "Voice" }]);
  expect(button("Optional catalog")).toBeDefined();
  button("Optional catalog").click();
  expect(button("Favorite Audio")).toBeDefined();
  dispose();
});

test("option favorites retain focused action and selection while keyboard moves between both cells", async () => {
  const [favorites, setFavorites] = createSignal<string[]>([]); let changes = 0;
  const dispose = render(() => <FavoriteSelectControl ariaLabel="Kind" options={[{value: 'a', label: 'Alpha'}, {value: 'b', label: 'Beta'}]} value="a" onChange={() => changes++} favoriteValues={favorites()} onToggleFavorite={id => setFavorites([id])}/>, document.body);
  try {
    button('Kind').click(); await tick();
    const option = document.querySelector<HTMLButtonElement>('[data-select-option=b]'); if (!option) throw new Error('Missing beta');
    option.focus(); option.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    const action = button('Favorite Beta'); expect(document.activeElement === action).toBe(true);
    action.click(); expect(document.activeElement === action).toBe(true);
    expect(button('Unfavorite Beta') === action).toBe(true); expect(changes).toBe(0);
    expect(document.querySelector('[role=grid]')).not.toBeNull(); expect(document.querySelector('button button')).toBeNull();
    action.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); expect(document.activeElement === option).toBe(true);
  } finally { dispose(); }
});
