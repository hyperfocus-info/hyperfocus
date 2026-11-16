import type { PlayableComponent2D } from "@hyperfocus/engine/project/runtime-2d";

export type StandaloneSceneContent = { id: string; text: string; action?: string };

/** Retains authored reading order and action identity for the responsive delivery shell. */
export function standaloneScenePresentation(options: {
  entities: readonly { id: string; opacity?: number; components?: readonly PlayableComponent2D[] }[];
}) {
  const content: StandaloneSceneContent[] = [];
  const ownedActions = new Set<string>(), availableActions = new Set<string>(), actionLabels = new Map<string, string>();
  for (const entity of options.entities) {
    for (const component of entity.components ?? []) {
      if (!["ui", "sprite"].includes(component.type)) continue;
      const action = typeof component.values.pointerAction === "string" ? component.values.pointerAction.trim() : undefined;
      if (action) ownedActions.add(action);
      if (!component.enabled || component.values.visible === false || (entity.opacity ?? 1) <= 0) continue;
      const text = String(component.values[component.type === "sprite" ? "altText" : "text"] ?? "");
      if (action) { availableActions.add(action); if (text.trim()) actionLabels.set(action, text); }
      if (!text.trim() || component.values.transcript === "exclude") continue;
      content.push({ id: `${entity.id}/${component.id}`, text, ...(action ? { action } : {}) });
    }
  }
  return { content, ownedActions, availableActions, actionLabels };
}
