import { formatBpm } from "./utils/host-bpm-button-values";
import * as stylex from "@stylexjs/stylex";
import { Clock3 } from "lucide-solid";
import { Button } from "../../components/elements/button";
import { host } from "../host";
import { primitiveStyles as styles } from "./primitives.stylex";

export interface HostBpmButtonProps {
  /** Tempo value sent to the PadPilot host bridge. */
  bpm: number;
  /** Optional visual class applied to the underlying button. */
  class?: string;
  /** Optional compact action label. */
  label?: string;
}



/** HostBpmButton locks PadPilot's host tempo cache to a generated template BPM. */
export function HostBpmButton(props: HostBpmButtonProps) {
  return (
    <Button
      class={`${stylex.props(styles.hostBpmButton).className ?? ""} ${props.class ?? ""}`.trim()}
      icon={Clock3}
      onClick={() => host.setTempo(props.bpm)}
      tooltip={`${props.label ?? "Set host tempo"}: ${formatBpm(props.bpm)}`}
      variant="secondary"
    />
  );
}
