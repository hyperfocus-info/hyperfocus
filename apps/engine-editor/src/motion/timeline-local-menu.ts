export type TimelineMenuAction = { label: string; danger?: boolean; run(): void };

export function openTimelineLocalMenu(x: number, y: number, actions: readonly TimelineMenuAction[]) {
  document.querySelector("#sequence-local-menu")?.remove();
  const menu = document.createElement("div");
  menu.id = "sequence-local-menu";
  menu.className = "resource-menu sequence-local-menu";
  menu.setAttribute("role", "menu");
  menu.style.left = `${Math.min(x, innerWidth - 180)}px`;
  menu.style.top = `${Math.min(y, innerHeight - actions.length * 36 - 12)}px`;
  const dismiss = () => { menu.remove(); window.removeEventListener("pointerdown", close, true); window.removeEventListener("keydown", closeOnEscape); };
  const close = (event: PointerEvent) => { if (!(event.target instanceof Node) || !menu.contains(event.target)) dismiss(); };
  const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") { dismiss(); event.preventDefault(); } };
  for (const action of actions) {
    const button = document.createElement("button");
    button.type = "button"; button.setAttribute("role", "menuitem"); button.textContent = action.label;
    if (action.danger) button.classList.add("is-danger");
    button.addEventListener("click", () => { dismiss(); action.run(); });
    menu.append(button);
  }
  document.body.append(menu);
  menu.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
  window.addEventListener("pointerdown", close, true);
  window.addEventListener("keydown", closeOnEscape);
}
