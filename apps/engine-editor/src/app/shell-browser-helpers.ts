let announcementTimer: number | undefined;
export function trapFocus(root: HTMLElement, onEscape: () => void) {
  const handler = (event: KeyboardEvent) => {
    if (event.key === "Escape") { onEscape(); return; }
    if (event.key !== "Tab") return;
    const items = [...root.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')];
    if (!items.length) return;
    const first = items[0];
    const last = items.at(-1)!;
    if (event.shiftKey && document.activeElement === first) { last.focus(); event.preventDefault(); }
    else if (!event.shiftKey && document.activeElement === last) { first.focus(); event.preventDefault(); }
  };
  root.addEventListener("keydown", handler);
  return () => root.removeEventListener("keydown", handler);
}

export function fileInput(accept: string, multiple: boolean) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = accept;
  input.multiple = multiple;
  input.hidden = true;
  return input;
}

export function download(name: string, value: string | Uint8Array, type: string) {
  const contents = typeof value === "string" ? value : new Uint8Array(value);
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function appendConsole(message: string) {
  const output = required("#editor-console-output");
  const row = document.createElement("div");
  row.textContent = `${new Date().toLocaleTimeString()}  ${message}`;
  output.prepend(row);
}

export function showError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  appendConsole(`✕ ${message}`);
  document.dispatchEvent(new CustomEvent("hyperfocus:console-open"));
  announce(message, "error");
}

export function announce(message: string, tone: "status" | "error" = "status") {
  let live = document.querySelector<HTMLElement>("#editor-announcer");
  if (!live) {
    live = document.createElement("div");
    live.id = "editor-announcer";
    live.className = "sr-only";
    live.setAttribute("aria-live", "polite");
    document.body.append(live);
  }
  live.textContent = message;
  let toast = document.querySelector<HTMLElement>("#editor-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "editor-toast";
    toast.setAttribute("role", "status");
    document.body.append(toast);
  }
  toast.className = `editor-toast is-visible ${tone === "error" ? "is-error" : ""}`;
  toast.textContent = message;
  if (announcementTimer !== undefined) clearTimeout(announcementTimer);
  announcementTimer = window.setTimeout(() => toast?.classList.remove("is-visible"), 3_200);
}

export function required<T extends Element = HTMLElement>(selector: string, root: ParentNode = document): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Editor shell is missing ${selector}`);
  return element;
}

export function setText(selector: string, value: string) { required(selector).textContent = value; }
export function slug(value: string) { return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "game"; }
export function formatBytes(value: number) { if (value < 1024) return `${value} B`; if (value < 1048576) return `${(value / 1024).toFixed(1)} KB`; return `${(value / 1024 / 1024).toFixed(1)} MB`; }
export function escapeHtml(value: unknown) { return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!); }
