export function dispatchInspectorChange(event: Event, handlers: {
 editEntityProperty(property: string, value: string): void;
 editComponentValue(input: HTMLInputElement | HTMLSelectElement | HTMLButtonElement): void;
 edit3DField(field: string, value: string): void;
}) {
 const target = event.target;
 if (target instanceof HTMLButtonElement && target.dataset.selectValue !== undefined) {
  if (target.dataset.componentId && target.dataset.componentKey) return handlers.editComponentValue(target);
  if (target.dataset["3dField"]) return handlers.edit3DField(target.dataset["3dField"], target.dataset.selectValue);
 }
 if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
 if (target.dataset.entityProperty) return handlers.editEntityProperty(target.dataset.entityProperty, target.value);
 if (target.dataset.componentId && target.dataset.componentKey) return handlers.editComponentValue(target);
 if (target.dataset["3dField"]) return handlers.edit3DField(target.dataset["3dField"], target instanceof HTMLInputElement && target.type === "checkbox" ? String(target.checked) : target.value);
}
