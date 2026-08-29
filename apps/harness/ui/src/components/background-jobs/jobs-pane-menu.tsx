import * as stylex from "@stylexjs/stylex";
import { BriefcaseBusiness, Clock3, ShieldCheck } from "lucide-solid";
import { harnessStore } from "../../harness-store";
import type { LeftPaneSearchMenuItem } from "../primitives/left-pane";
import { backgroundJobsStyles as styles } from "../background-jobs.styles";

export function jobsPaneSegmentItems(
  segment: "jobs" | "inbox" | "health",
  allowSegmentSwitch: boolean
): LeftPaneSearchMenuItem[] {
  if (!allowSegmentSwitch) return [];
  const setPreferences = harnessStore.setJobsPanePreferences;
  return [
    {
      kind: "submenu",
      label: "View",
      value: segment === "jobs" ? "Jobs" : segment === "inbox" ? "Runs" : "Health",
      icon: <BriefcaseBusiness class={stylex.attrs(styles.iconSm).class} />,
      items: [
        {
          kind: "option",
          label: "Jobs",
          icon: <BriefcaseBusiness class={stylex.attrs(styles.iconSm).class} />,
          selected: segment === "jobs",
          onSelect: () => setPreferences({ segment: "jobs" })
        },
        {
          kind: "option",
          label: "Runs",
          icon: <Clock3 class={stylex.attrs(styles.iconSm).class} />,
          selected: segment === "inbox",
          onSelect: () => setPreferences({ segment: "inbox" })
        },
        {
          kind: "option",
          label: "Health",
          icon: <ShieldCheck class={stylex.attrs(styles.iconSm).class} />,
          selected: segment === "health",
          onSelect: () => setPreferences({ segment: "health" })
        }
      ]
    }
  ];
}
