import { createGameSelect, gameSelectStyles } from '@hyperfocus/ui/game-menu';

/** Visible controls for the same bounded save profile exposed by the standalone hook. */
export function createStandaloneSaveControls(options: {
  canvas: HTMLCanvasElement;
  slots: readonly string[];
  defaultSlot: string;
  maxBytes: number;
  save: (slot: string) => Promise<void>;
  restore: (slot: string) => Promise<boolean>;
  exportProfile: () => Promise<string>;
  importProfile: (source: string, overwrite: boolean) => Promise<void>;
}) {
  const host = document.createElement("details"), heading = document.createElement("summary");
  host.className = "playable-controls playable-saves";
  heading.textContent = "Save and restore progress";
  const status = document.createElement("p");
  status.setAttribute("role", "status");
  status.textContent = "Save here to keep progress on this device. Export a copy to move it elsewhere.";
  const slot = createGameSelect({ element: document.createElement('button'), ariaLabel: 'Save slot', value: options.defaultSlot, options: options.slots.map(value => ({ value, label: value })) });
  const slotLabel = document.createElement('label');slotLabel.textContent = 'Save slot ';slotLabel.append(slot.element);
  slotLabel.hidden = options.slots.length === 1;
  const style = document.createElement('style');style.textContent = gameSelectStyles;host.append(style);
  const controls: (HTMLButtonElement | HTMLInputElement)[] = [slot.element];
  let busy = false;
  const run = async (operation: () => Promise<string>) => {
    if (busy) return;
    busy = true; for (const control of controls) control.disabled = true;
    status.textContent = "Working…";
    try { status.textContent = await operation(); }
    catch (cause) { status.textContent = cause instanceof Error ? cause.message : String(cause); }
    finally { busy = false; for (const control of controls) control.disabled = false; }
  };
  const button = (label: string, operation: () => Promise<string>) => {
    const element = document.createElement("button"); element.type = "button"; element.textContent = label;
    element.addEventListener("click", () => { void run(operation); }); controls.push(element); host.append(element);
  };
  host.append(heading);
  if (options.slots.length > 1) host.append(slotLabel);
  button("Save progress", async () => { await options.save(slot.value); return "Progress saved on this device."; });
  button("Restore progress", async () => await options.restore(slot.value) ? "Saved progress restored." : "No saved progress in this slot yet.");
  button("Export progress", async () => {
    const source = await options.exportProfile();
    const url = URL.createObjectURL(new Blob([source], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = "progress.json"; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    return "Progress copy exported.";
  });
  const replace = document.createElement("input"), replaceLabel = document.createElement("label");
  replace.type = "checkbox"; replaceLabel.append(replace, " Allow imported progress to replace saved progress"); controls.push(replace);
  const file = document.createElement("input"), fileLabel = document.createElement("label");
  file.type = "file"; file.accept = ".json,application/json"; fileLabel.append("Import progress ", file); controls.push(file);
  file.addEventListener("change", () => {
    const selected = file.files?.[0]; if (!selected) return;
    void run(async () => {
      try {
        if (selected.size > options.maxBytes) throw new Error(`Progress file exceeds the ${options.maxBytes.toLocaleString()} byte limit.`);
        await options.importProfile(await selected.text(), replace.checked);
        return await options.restore(slot.value) ? "Imported progress restored." : "Progress imported. Choose its saved slot, then Restore progress.";
      } finally { file.value = ""; replace.checked = false; }
    });
  });
  host.append(document.createElement("br"), replaceLabel, document.createElement("br"), fileLabel, status);
  options.canvas.parentElement?.append(host);
  window.addEventListener("pagehide", () => { slot.dispose();host.remove(); }, { once: true });
}
