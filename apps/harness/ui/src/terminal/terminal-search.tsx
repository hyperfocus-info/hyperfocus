import { ArrowDown, ArrowUp, X } from "lucide-solid";
import * as stylex from "@stylexjs/stylex";
import { terminalStore } from "./terminal-store";
import { ActionButton } from "../components/action-button";
import { Input } from "../components/primitives/input";
import { resolveTerminalKeyboardAction } from "./terminal-keybindings";
import { closeTerminalSearch, toggleTerminalSearch } from "./terminal-search-actions";
import { terminalStyles as styles, terminalUtilities as utilities } from "./terminal.styles";

export function TerminalSearch(props: { onNext: () => void; onPrevious: () => void }) {
  return (
    <div class={stylex.attrs(styles.sidebar, utilities.flex, utilities.minW0, utilities.itemsCenter, utilities.gap1, utilities.roundedLg, utilities.border, utilities.px2, utilities.py1, utilities.shadowSm).class}>
      <Input
        aria-label="Search terminal"
        class={stylex.attrs(styles.searchInput, utilities.h7, utilities.w44, utilities.roundedLg, utilities.px1, utilities.py1).class}
        value={terminalStore.state.searchQuery}
        placeholder="Find..."
        onInput={(event) => terminalStore.setSearch(true, event.currentTarget.value)}
        onKeyDown={(event) => {
          if (resolveTerminalKeyboardAction(event) === "toggle-search") {
            event.preventDefault();
            event.stopPropagation();
            toggleTerminalSearch();
            return;
          }
          if (event.key === "Enter") {
            event.preventDefault();
            event.shiftKey ? props.onPrevious() : props.onNext();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            closeTerminalSearch();
          }
        }}
      />
      <ActionButton tooltip="Previous terminal match" ariaLabel="Previous terminal match" variant="ghost" size="icon" class={stylex.attrs(styles.action, utilities.h7, utilities.w7, utilities.roundedLg).class} icon={<ArrowUp class={stylex.attrs(utilities.h35, utilities.w35).class} />} onClick={props.onPrevious} />
      <ActionButton tooltip="Next terminal match" ariaLabel="Next terminal match" variant="ghost" size="icon" class={stylex.attrs(styles.action, utilities.h7, utilities.w7, utilities.roundedLg).class} icon={<ArrowDown class={stylex.attrs(utilities.h35, utilities.w35).class} />} onClick={props.onNext} />
      <ActionButton tooltip="Close terminal search" ariaLabel="Close terminal search" variant="ghost" size="icon" class={stylex.attrs(styles.action, utilities.h7, utilities.w7, utilities.roundedLg).class} icon={<X class={stylex.attrs(utilities.h35, utilities.w35).class} />} onClick={closeTerminalSearch} />
    </div>
  );
}
