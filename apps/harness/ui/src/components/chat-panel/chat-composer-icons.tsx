import * as stylex from "@stylexjs/stylex";
import {
  Activity,
  AlertTriangle,
  Brain,
  Bot,
  Briefcase,
  CalendarClock,
  ClipboardList,
  Clipboard,
  Cpu,
  Edit3,
  FolderOpen,
  Folder,
  Gauge,
  LoaderCircle,
  MessageSquareMore,
  Orbit,
  Paperclip,
  Pause,
  Play,
  RefreshCcw,
  Plus,
  ArrowDown,
  Check,
  File,
  FileCode,
  FileJson,
  FileText,
  Image,
  SendHorizontal,
  Settings,
  Terminal,
  WandSparkles,
  X,
  Split
} from "lucide-solid";
import { chatPanelStyles as styles } from "../chat-panel.styles";

export function getFileTypeIcon(filePath: string, size: "xs" | "sm") {
  const iconStyles = () => stylex.attrs(size === "sm" ? styles.iconSmall : styles.iconTiny, styles.iconMuted);
  const extension = filePath.split(".").at(-1)?.toLowerCase();
  if (!extension || extension === filePath.toLowerCase()) {
    return <File {...iconStyles()} />;
  }
  if (["png", "jpg", "jpeg", "gif", "webp", "avif", "svg", "ico"].includes(extension)) {
    return <Image {...iconStyles()} />;
  }
  if (["json", "jsonc"].includes(extension)) {
    return <FileJson {...iconStyles()} />;
  }
  if (["md", "markdown", "txt", "log", "csv"].includes(extension)) {
    return <FileText {...iconStyles()} />;
  }
  if (
    [
      "ts",
      "tsx",
      "js",
      "jsx",
      "mjs",
      "cjs",
      "css",
      "html",
      "py",
      "rb",
      "go",
      "rs",
      "java",
      "kt",
      "swift",
      "sql",
      "sh",
      "bash",
      "zsh"
    ].includes(extension)
  ) {
    return <FileCode {...iconStyles()} />;
  }
  return <File {...iconStyles()} />;
}

