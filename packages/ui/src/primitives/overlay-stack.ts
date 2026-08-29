type OverlayEntry = {
  id: string;
  close: () => void;
};

const stack: OverlayEntry[] = [];
let listening = false;

export function registerOverlay(entry: OverlayEntry) {
  stack.push(entry);
  ensureListener();
  return () => {
    const index = stack.findIndex((candidate) => candidate.id === entry.id);
    if (index >= 0) stack.splice(index, 1);
    if (stack.length === 0) removeListener();
  };
}

export function isTopOverlay(id: string) {
  return stack.at(-1)?.id === id;
}

function onKeyDown(event: KeyboardEvent) {
  if (event.key !== "Escape") return;
  const entry = stack.at(-1);
  if (!entry) return;
  event.preventDefault();
  event.stopPropagation();
  entry.close();
}

function ensureListener() {
  if (listening || typeof document === "undefined") return;
  document.addEventListener("keydown", onKeyDown, true);
  listening = true;
}

function removeListener() {
  if (!listening || typeof document === "undefined") return;
  document.removeEventListener("keydown", onKeyDown, true);
  listening = false;
}
