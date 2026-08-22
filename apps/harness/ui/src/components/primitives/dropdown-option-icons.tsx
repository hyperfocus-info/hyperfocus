import { Bot, Brain, Clipboard, ClipboardList, Cpu, Radar, Play, RefreshCcw, Split, MessageSquareMore } from "lucide-solid";
import * as stylex from "@stylexjs/stylex";

const iconProps = () => stylex.attrs(styles.icon);

export function getModeDropdownIcon(modeId: string) {
  switch (modeId) {
    case "auto":
      return <Radar {...iconProps()} />;
    case "ask":
      return <MessageSquareMore {...iconProps()} />;
    case "plan":
      return <ClipboardList {...iconProps()} />;
    case "implement":
      return <Play {...iconProps()} />;
    case "debug":
      return <RefreshCcw {...iconProps()} />;
    case "review":
      return <Clipboard {...iconProps()} />;
    default:
      return <Split {...iconProps()} />;
  }
}

export function getAgentDropdownIcon(agentId: string) {
  switch (agentId) {
    case "pi":
      return <Brain {...iconProps()} />;
    case "copilot-cli":
      return <Bot {...iconProps()} />;
    case "codex-cli":
      return <Cpu {...iconProps()} />;
    default:
      return <Bot {...iconProps()} />;
  }
}

const styles = stylex.create({ icon: { height: "0.75rem", width: "0.75rem" } });
