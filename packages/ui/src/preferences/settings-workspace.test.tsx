import { expect, test } from "bun:test";
import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import { SettingsWorkspace } from "./settings-workspace";

test("full-view settings navigation preserves host drafts and exposes one close action", () => {
  const host = document.createElement("div"); document.body.append(host);
  const [active, setActive] = createSignal("general");
  const [query, setQuery] = createSignal("");
  let closed = 0;
  const dispose = render(() => <SettingsWorkspace sections={[{ id: "general", label: "General" }, { id: "advanced", label: "Advanced" }]}
    activeSection={active()} onSectionChange={setActive} query={query()} onQueryChange={setQuery} onClose={() => { closed++; }}>
    <input aria-label="Draft" value="Kept" />
  </SettingsWorkspace>, host);
  try {
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(host.querySelectorAll('[data-ui-settings-workspace]')).toHaveLength(1);
    const draft = host.querySelector<HTMLInputElement>('[aria-label="Draft"]')!;
    draft.value = "Unsaved";
    const search = host.querySelector<HTMLInputElement>('[aria-label="Search preferences"]')!;
    search.value = "contrast"; search.dispatchEvent(new Event("input", { bubbles: true }));
    expect(query()).toBe("contrast");
    expect(host.querySelector('[aria-current="page"]')).toBeNull();
    host.querySelectorAll<HTMLButtonElement>("nav button")[1].click();
    expect(active()).toBe("advanced"); expect(query()).toBe("");
    expect(host.querySelector('[aria-current="page"]')?.textContent).toBe("Advanced");
    expect(host.querySelector('[aria-label="Draft"]')).toBe(draft); expect(draft.value).toBe("Unsaved");
    host.querySelector<HTMLButtonElement>('[data-ui-settings-close]')!.click();
    expect(closed).toBe(1);
  } finally { dispose(); host.remove(); }
});
