import { PadPilot } from "../../../padpilot/index";
import styles from "../fx-module.module.css";

export function FxDragPreview(props: { subtitle?: string; title: string; tone: "chain" | "node" }) {
  return (
    <PadPilot.DraggableCard
      class={props.tone === "chain" ? styles["chain-card"] : styles["node-card"]}
      dragHandle
      preview
      subtitle={props.subtitle}
      title={props.title}
      variant={props.tone}
      aria-hidden="true"
    />
  );
}
