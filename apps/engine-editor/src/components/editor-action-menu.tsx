import { ActionMenu, MenuItem } from "@hyperfocus/ui";
import { For } from "solid-js";

export type EditorActionItem = Readonly<{
  label: string;
  action: string;
  data?: Readonly<Record<string, string>>;
  disabled?: boolean;
  danger?: boolean;
}>;

/**
 * Editor-local adapter between shared menu behavior and the shell's delegated
 * `data-editor-action` command surface.
 */
export function EditorActionMenu(props: { label: string; items: readonly EditorActionItem[] }) {
  return (
    <div class="resource-overflow">
      <ActionMenu
        ariaLabel={props.label}
        trigger={({ toggle, open, menuId }) => (
          <button
            type="button"
            class="resource-overflow-trigger"
            aria-label={props.label}
            title={props.label}
            aria-haspopup="menu"
            aria-expanded={open()}
            aria-controls={menuId}
            onClick={toggle}
          >•••</button>
        )}
      >
        <For each={props.items}>{(item) => (
          <MenuItem
            tone={item.danger ? "danger" : "default"}
            data-editor-action={item.action}
            disabled={item.disabled}
            {...editorDataAttributes(item.data)}
            onSelect={() => undefined}
          >{item.label}</MenuItem>
        )}</For>
      </ActionMenu>
    </div>
  );
}

export function editorDataAttributes(data?: Readonly<Record<string, string>>) {
  if (!data) return {};
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [
    `data-${key.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`)}`,
    value,
  ]));
}
