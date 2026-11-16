import * as stylex from "@stylexjs/stylex";
import { createMemo, For, Show, type JSX } from "solid-js";
import { Input } from "../form/input";
import { Button } from "../primitives/button";
import { SelectControl } from "../primitives/selection/select-control";
import { sharedStyles } from "../theme/styles";
import { tokens } from "../theme/tokens.stylex";
import { typography } from "../theme/typography";

const styles = stylex.create({
  root: { flex: "1", overflow: "hidden", backgroundColor: tokens.panel, color: tokens.foreground, containerType: "inline-size", display: "flex", flexDirection: "column", height: "100%", minHeight: 0, minWidth: 0, },
  header: { padding: tokens.space3, gap: tokens.space3, alignItems: "center", display: "flex", flexShrink: 0, justifyContent: "space-between", borderBottomColor: tokens.border, borderBottomStyle: "solid", borderBottomWidth: tokens.borderWidth, minWidth: 0, },
  title: { margin: 0, overflowWrap: "anywhere", minWidth: 0 },
  layout: { flex: "1", display: "grid", gridTemplateColumns: { default: "minmax(12rem, 15rem) minmax(0, 1fr)", "@container (max-width: 42rem)": "minmax(0, 1fr)" }, gridTemplateRows: { default: "minmax(0, 1fr)", "@container (max-width: 42rem)": "auto minmax(0, 1fr)" }, minHeight: 0, minWidth: 0, },
  sidebar: { padding: tokens.space3, gap: tokens.space3, alignContent: "start", borderInlineEndColor: tokens.border, borderInlineEndStyle: "solid", borderInlineEndWidth: { default: tokens.borderWidth, "@container (max-width: 42rem)": 0 }, display: "grid", borderBottomColor: tokens.border, borderBottomStyle: "solid", borderBottomWidth: { default: 0, "@container (max-width: 42rem)": tokens.borderWidth }, minHeight: 0, minWidth: 0, overflowY: "auto", },
  search: { gap: tokens.space1, alignItems: "center", display: "flex", minWidth: 0, },
  sections: { gap: tokens.space1, alignContent: "start", display: { default: "grid", "@container (max-width: 42rem)": "none" }, minWidth: 0, },
  section: { borderRadius: tokens.radiusSmall, borderWidth: 0, gap: tokens.space2, paddingBlock: tokens.space2, paddingInline: tokens.space2, alignItems: "center", backgroundColor: { default: "transparent", ":hover": tokens.selection }, color: tokens.foreground, cursor: "pointer", display: "flex", overflowWrap: "anywhere", textAlign: "start", minHeight: { default: tokens.controlStandard, "@media (pointer: coarse)": tokens.controlTouch }, minWidth: 0, },
  active: { backgroundColor: tokens.selection },
  icon: { alignItems: "center", display: "inline-flex", flexShrink: 0, justifyContent: "center", height: tokens.iconSmall, width: tokens.iconSmall, },
  compact: { display: { default: "none", "@container (max-width: 42rem)": "block" }, minWidth: 0 },
  content: { padding: { default: tokens.space4, "@container (max-width: 42rem)": tokens.space3 }, overflow: "auto", overscrollBehavior: "contain", minHeight: 0, minWidth: 0, },
});

/** Full-view settings chrome; hosts own section contents, filtering, routing and persistence. */
export function SettingsWorkspace(props: {
  title?: string;
  sections: readonly { id: string; label: string; icon?: JSX.Element }[];
  activeSection: string;
  onSectionChange: (id: string) => void;
  query?: string;
  onQueryChange?: (value: string) => void;
  onClose?: () => void;
  children: JSX.Element;
}) {
  let search!: HTMLInputElement;
  const options = createMemo(() => props.sections.map(section => ({ value: section.id, label: section.label, get icon() { return section.icon; } })));
  const select = (id: string) => { props.onQueryChange?.(""); props.onSectionChange(id); };
  return <section {...stylex.attrs(styles.root)} aria-label={props.title ?? "Preferences"} data-ui-settings-workspace="">
    <header {...stylex.attrs(styles.header)}>
      <h2 {...stylex.attrs(typography.section, styles.title)}>{props.title ?? "Preferences"}</h2>
      <Show when={props.onClose}><Button size="icon" variant="ghost" data-ui-settings-close="" aria-label="Close preferences" tooltip="Close preferences" onClick={() => props.onClose?.()}>×</Button></Show>
    </header>
    <div {...stylex.attrs(styles.layout)}>
      <aside {...stylex.attrs(styles.sidebar)}>
        <Show when={props.onQueryChange}>
          <div {...stylex.attrs(styles.search)}>
            <Input ref={search} type="search" aria-label="Search preferences" placeholder="Search preferences" value={props.query ?? ""} onInput={event => props.onQueryChange?.(event.currentTarget.value)} />
            <Show when={props.query}><Button size="icon" variant="ghost" aria-label="Clear search" tooltip="Clear search" onClick={() => { props.onQueryChange?.(""); search.focus(); }}>×</Button></Show>
          </div>
        </Show>
        <nav {...stylex.attrs(styles.sections)} aria-label="Preference sections">
          <For each={props.sections}>{section => <button type="button" {...stylex.attrs(typography.body, styles.section, sharedStyles.focusRing, !props.query?.trim() && props.activeSection === section.id && styles.active)}
            aria-current={!props.query?.trim() && props.activeSection === section.id ? "page" : undefined} onClick={() => select(section.id)}>
            <Show when={section.icon}><span {...stylex.attrs(styles.icon)} aria-hidden="true">{section.icon}</span></Show>{section.label}
          </button>}</For>
        </nav>
        <div {...stylex.attrs(styles.compact)}><SelectControl ariaLabel="Preference section" size="md" value={props.activeSection} options={options()} onChange={select} /></div>
      </aside>
      <div {...stylex.attrs(styles.content)} data-ui-settings-content="">{props.children}</div>
    </div>
  </section>;
}
