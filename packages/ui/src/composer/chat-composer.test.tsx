import { expect, test } from "bun:test";
import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import { ChatComposer, type ComposerOption } from "./chat-composer";

test("asynchronous catalog controls appear, select, disappear, and recover", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const [providers, setProviders] = createSignal<readonly ComposerOption[]>();
  const [provider, setProvider] = createSignal("openai");
  const selections: string[] = [];
  const dispose = render(() => <ChatComposer value="" modeLabel="Reasoning" onInput={() => undefined} onSubmit={() => undefined}
    options={{ providers: providers(), modes: [{ id: "minimal", label: "Minimal" }] }} selected={{ provider: provider() }}
    onSelect={(kind, id) => { selections.push(`${kind}:${id}`); setProvider(id); }} />, host);
  try {
    expect(host.querySelector('[aria-label="Select provider"]')).toBeNull();
    expect(host.querySelector('[aria-label="Select reasoning"]')).not.toBeNull();
    await Promise.resolve();
    setProviders([{ id: "openai", label: "OpenAI" }, { id: "google", label: "Google" }]);
    const trigger = host.querySelector<HTMLButtonElement>('[aria-label="Select provider"]');
    expect(trigger).not.toBeNull();
    trigger!.click();
    await new Promise(resolve => setTimeout(resolve, 0));
    const google = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="option"]')).find(option => option.textContent?.includes("Google"));
    expect(google).not.toBeUndefined();
    google!.click();
    expect(selections).toEqual(["provider:google"]);
    expect(trigger!.textContent).toContain("Google");
    setProviders([]);
    expect(host.querySelector('[aria-label="Select provider"]')).toBeNull();
    setProviders([{ id: "google", label: "Google restored" }]);
    expect(host.querySelector('[aria-label="Select provider"]')?.textContent).toContain("Google restored");
  } finally { dispose(); host.remove(); }
});
