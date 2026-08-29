import { createEffect, createSignal, createUniqueId } from "solid-js";
import { Plus, X } from "lucide-solid";
import { Button } from "./elements/button";
import { Modal } from "./elements/modal";
import { TextField } from "./elements/text-field";

export type CreateModuleModalProps = {
  /** Controlled open state. */
  open: boolean;
  /** Called when creation is cancelled or the modal requests dismissal. */
  onClose: () => void;
  /** Called with the normalized module name when the form is submitted. */
  onCreate: (name: string) => void;
};

/** Collects the name required by the public create-module host capability. */
export function CreateModuleModal(props: CreateModuleModalProps) {
  const [name, setName] = createSignal("");
  const formId = createUniqueId();
  let nameInputRef: HTMLInputElement | undefined;

  createEffect(() => {
    if (props.open) {
      setName("");
    }
  });

  const normalizedName = () => name().trim();

  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title="Create New Module"
      description="PadPilot will scaffold a user-installable TypeScript Module."
      initialFocusRef={() => nameInputRef}
      footer={
        <>
          <Button type="button" variant="ghost" icon={X} onClick={props.onClose}>
            Cancel
          </Button>
          <Button form={formId} type="submit" variant="primary" icon={Plus} disabled={normalizedName().length === 0}>
            Create module
          </Button>
        </>
      }
    >
      <form
        id={formId}
        onSubmit={(event) => {
          event.preventDefault();
          const nextName = normalizedName();
          if (nextName) {
            props.onCreate(nextName);
          }
        }}
      >
        <TextField
          ref={nameInputRef}
          label="Module name"
          value={name()}
          onInput={(event) => setName(event.currentTarget.value)}
          autocomplete="off"
          placeholder="My Module"
        />
      </form>
    </Modal>
  );
}
