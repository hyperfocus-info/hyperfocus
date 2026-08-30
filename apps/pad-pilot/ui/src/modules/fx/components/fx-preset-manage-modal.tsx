import { Plus, Save, Settings2, Star, Trash2 } from "lucide-solid";
import { PadPilot } from "../../../padpilot/index";
import styles from "../styles/fx-module.stylex";

export type FxPresetManageModalProps = {
  canDelete?: boolean;
  canOverwrite: boolean;
  favoriteLabel: string;
  isFavorite: boolean;
  name: string;
  onClose: () => void;
  onCreate: () => void;
  onDelete?: () => void;
  onNameChange: (value: string) => void;
  onRename: () => void;
  onToggleFavorite: () => void;
  onOverwrite: () => void;
  open: boolean;
  title: string;
};

export function FxPresetManageModal(props: FxPresetManageModalProps) {
  return (
    <PadPilot.Modal
      open={props.open}
      onClose={props.onClose}
      title={props.title}
      description="Use searchable selection for browsing. Management actions stay here."
      footer={
        <PadPilot.ButtonGroup collapseWidth={420}>
          <PadPilot.ButtonGroup.Item icon={<Plus size={14} />} onClick={props.onCreate} tooltip="Save as a new preset">
            Save New
          </PadPilot.ButtonGroup.Item>
          <PadPilot.ButtonGroup.Item disabled={!props.canOverwrite} icon={<Save size={14} />} onClick={props.onOverwrite} tooltip="Overwrite the selected preset">
            Overwrite
          </PadPilot.ButtonGroup.Item>
          <PadPilot.ButtonGroup.Item disabled={!props.canOverwrite} icon={<Settings2 size={14} />} onClick={props.onRename} tooltip="Rename the selected preset">
            Rename
          </PadPilot.ButtonGroup.Item>
          <PadPilot.ButtonGroup.Item icon={<Star size={14} />} onClick={props.onToggleFavorite} tooltip={props.favoriteLabel}>
            {props.isFavorite ? "Unfavorite" : "Favorite"}
          </PadPilot.ButtonGroup.Item>
          <PadPilot.ButtonGroup.Item
            disabled={!props.canDelete}
            icon={<Trash2 size={14} />}
            onClick={props.onDelete}
            tooltip={props.canDelete ? "Delete the selected preset" : "Delete is not available for this preset source"}
          >
            Delete
          </PadPilot.ButtonGroup.Item>
        </PadPilot.ButtonGroup>
      }
    >
      <PadPilot.TextField class={styles["modal-field"]} controlClass={styles["modal-field-input"]} label="Name" value={props.name} onInput={(event) => props.onNameChange(event.currentTarget.value)} />
    </PadPilot.Modal>
  );
}
