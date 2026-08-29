import * as stylex from "@stylexjs/stylex";
import { createMemo, createSignal, For, Show } from "solid-js";
import { Button } from "../primitives/button";
import { StatusChip } from "../primitives/status-chip";
import { tokens } from "../theme/tokens.stylex";
import { filterPreferences, type PreferenceDefinition, type PreferenceSectionDefinition, type PreferenceValue, type PreferenceValues } from "./model";

const styles = stylex.create({
  root: { backgroundColor: tokens.panel, color: tokens.foreground, display: "grid", gridTemplateColumns: { default: "minmax(12rem, 15rem) minmax(0, 1fr)", "@media (max-width: 760px)": "minmax(0, 1fr)" }, minHeight: "30rem", minWidth: 0 },
  navigation: { padding: tokens.space3, backgroundColor: tokens.background, display: "flex", flexDirection: "column", borderBottomColor: { default: "transparent", "@media (max-width: 760px)": tokens.border }, borderBottomStyle: "solid", borderBottomWidth: { default: 0, "@media (max-width: 760px)": "1px" }, borderRightColor: tokens.border, borderRightStyle: "solid", borderRightWidth: { default: "1px", "@media (max-width: 760px)": 0 }, minWidth: 0, },
  searchLabel: { display: "block" },
  search: { borderColor: tokens.border, borderRadius: tokens.radiusSmall, borderStyle: "solid", borderWidth: "1px", outline: { default: "none", ":focus": `2px solid ${tokens.focus}` }, paddingInline: tokens.space3, backgroundColor: tokens.panelRaised, color: tokens.foreground, fontFamily: tokens.fontUi, minHeight: "2.35rem", width: "100%", },
  sectionList: { gap: tokens.space1, display: { default: "grid", "@media (max-width: 760px)": "flex" }, marginTop: tokens.space3, overflowX: { default: "visible", "@media (max-width: 760px)": "auto" }, },
  sectionButton: { padding: tokens.space2, borderColor: "transparent", borderRadius: tokens.radiusSmall, borderStyle: "solid", borderWidth: "1px", gap: tokens.space2, alignItems: "center", backgroundColor: { default: "transparent", ":hover": tokens.selection }, color: tokens.muted, cursor: "pointer", display: "flex", flexShrink: 0, justifyContent: "space-between", textAlign: "left", minHeight: "3.25rem", minWidth: { default: 0, "@media (max-width: 760px)": "10rem" }, width: { default: "100%", "@media (max-width: 760px)": "auto" }, },
  sectionCopy: { gap: "0.18rem", display: "grid", lineHeight: 1.25, minWidth: 0, },
  activeSection: { borderColor: tokens.borderStrong, backgroundColor: tokens.selection, color: tokens.foreground, },
  count: { fontFamily: tokens.fontMono, fontSize: "0.68rem", fontVariantNumeric: tokens.numericVariant },
  content: { display: "flex", flexDirection: "column", minHeight: 0, minWidth: 0 },
  header: { padding: tokens.space4, gap: tokens.space3, alignItems: "flex-start", display: "flex", flexWrap: "wrap", justifyContent: "space-between", borderBottomColor: tokens.border, borderBottomStyle: "solid", borderBottomWidth: "1px", },
  eyebrow: { color: tokens.accent, fontFamily: tokens.fontMono, fontSize: "0.62rem", fontWeight: 750, letterSpacing: "0.1em" },
  title: { marginBlock: "0.3rem", fontFamily: tokens.fontUi, fontSize: "1.2rem", },
  description: { margin: 0, color: tokens.muted, fontSize: "0.78rem", lineHeight: 1.5, },
  rows: { overflow: "auto", display: "grid", minHeight: 0, },
  row: { padding: tokens.space4, gap: tokens.space4, alignItems: "center", display: "grid", gridTemplateColumns: { default: "minmax(12rem, 1fr) minmax(12rem, auto)", "@media (max-width: 760px)": "minmax(0, 1fr)" }, borderBottomColor: tokens.border, borderBottomStyle: "solid", borderBottomWidth: "1px", },
  copy: { minWidth: 0 },
  rowTitle: { gap: tokens.space2, alignItems: "center", display: "flex", flexWrap: "wrap", },
  control: { alignItems: "center", display: "flex", justifyContent: { default: "flex-end", "@media (max-width: 760px)": "flex-start" }, minWidth: 0 },
  toggle: { gap: tokens.space2, alignItems: "center", cursor: "pointer", display: "inline-flex", },
  range: { gap: tokens.space2, alignItems: "center", display: "grid", gridTemplateColumns: "4.5rem minmax(8rem, 13rem)", },
  select: { borderColor: tokens.border, borderRadius: tokens.radiusSmall, borderStyle: "solid", borderWidth: "1px", paddingInline: tokens.space2, backgroundColor: tokens.panelRaised, color: tokens.foreground, minHeight: "2.25rem", minWidth: "12rem", },
  segmented: { borderColor: tokens.border, borderRadius: tokens.radiusSmall, borderStyle: "solid", borderWidth: "1px", overflow: "hidden", alignItems: "center", display: "inline-flex", },
  textInput: { borderColor: tokens.border, borderRadius: tokens.radiusSmall, borderStyle: "solid", borderWidth: "1px", paddingInline: tokens.space2, backgroundColor: tokens.panelRaised, color: tokens.foreground, minHeight: "2.25rem", minWidth: "14rem", },
  disclosure: { borderBottomColor: tokens.border, borderBottomStyle: "solid", borderBottomWidth: "1px" },
  advancedRows: { display: "grid" },
  empty: { padding: tokens.space4, gap: tokens.space2, alignItems: "center", color: tokens.muted, display: "grid", justifyItems: "center", minHeight: "14rem", },
  footer: { padding: tokens.space4, display: "flex", justifyContent: "flex-end", borderTopColor: tokens.border, borderTopStyle: "solid", borderTopWidth: "1px", },
  visuallyHidden: { overflow: "hidden", clip: "rect(0 0 0 0)", clipPath: "inset(50%)", position: "absolute", whiteSpace: "nowrap", height: "1px", width: "1px", },
});

export function PreferencesSurface(props: {
  title?: string;
  sections: readonly PreferenceSectionDefinition[];
  definitions: readonly PreferenceDefinition[];
  values: PreferenceValues;
  onChange: (id: string, value: PreferenceValue) => void;
  onReset?: (scope?: PreferenceDefinition["scope"]) => void;
  onSave?: () => void;
  saveLabel?: string;
}) {
  const [query, setQuery] = createSignal("");
  const [activeSection, setActiveSection] = createSignal(props.sections[0]?.id ?? "");
  const matches = createMemo(() => filterPreferences(props.definitions, query()));
  const visible = createMemo(() => query().trim()
    ? matches()
    : matches().filter((definition) => definition.sectionId === activeSection()));
  const currentSection = createMemo(() => props.sections.find((section) => section.id === activeSection()));
  const standard = createMemo(() => visible().filter((definition) => !definition.advanced));
  const advanced = createMemo(() => visible().filter((definition) => definition.advanced));

  return (
    <section {...stylex.attrs(styles.root)} aria-label={props.title ?? "Preferences"} data-test-preferences-surface="">
      <aside {...stylex.attrs(styles.navigation)}>
        <label {...stylex.attrs(styles.searchLabel)}>
          <span {...stylex.attrs(styles.visuallyHidden)}>Search preferences</span>
          <input
            {...stylex.attrs(styles.search)}
            type="search"
            value={query()}
            placeholder="Search preferences"
            onInput={(event) => setQuery(event.currentTarget.value)}
          />
        </label>
        <nav {...stylex.attrs(styles.sectionList)} aria-label="Preference sections">
          <For each={props.sections}>{(section) => {
            const count = () => props.definitions.filter((definition) => definition.sectionId === section.id).length;
            return (
              <button
                {...stylex.attrs(styles.sectionButton, !query() && activeSection() === section.id && styles.activeSection)}
                type="button"
                aria-current={!query() && activeSection() === section.id ? "page" : undefined}
                onClick={() => { setQuery(""); setActiveSection(section.id); }}
              >
                <span {...stylex.attrs(styles.sectionCopy)}><strong>{section.title}</strong><small>{section.description}</small></span>
                <span {...stylex.attrs(styles.count)}>{count()}</span>
              </button>
            );
          }}</For>
        </nav>
      </aside>
      <main {...stylex.attrs(styles.content)}>
        <header {...stylex.attrs(styles.header)}>
          <div>
            <span {...stylex.attrs(styles.eyebrow)}>{query() ? "SEARCH RESULTS" : "PREFERENCES"}</span>
            <h2 {...stylex.attrs(styles.title)}>{query() ? `Results for “${query()}”` : currentSection()?.title ?? props.title ?? "Preferences"}</h2>
            <p {...stylex.attrs(styles.description)}>{query() ? `${visible().length} matching settings` : currentSection()?.description}</p>
          </div>
          <Show when={props.onReset}>
            <Button variant="ghost" size="small" tooltip="Reset the visible preference values" onClick={() => props.onReset?.()}>Reset</Button>
          </Show>
        </header>
        <div {...stylex.attrs(styles.rows)}>
          <For each={standard()}>{(definition) => <PreferenceRow definition={definition} value={props.values[definition.id]} onChange={props.onChange} />}</For>
          <Show when={advanced().length > 0}>
            <details {...stylex.attrs(styles.disclosure)}>
              <summary>Advanced <span>{advanced().length}</span></summary>
              <div {...stylex.attrs(styles.advancedRows)}>
                <For each={advanced()}>{(definition) => <PreferenceRow definition={definition} value={props.values[definition.id]} onChange={props.onChange} />}</For>
              </div>
            </details>
          </Show>
          <Show when={visible().length === 0}>
            <div {...stylex.attrs(styles.empty)} role="status"><strong>No matching preferences</strong><span>Try a broader search term.</span></div>
          </Show>
        </div>
        <Show when={props.onSave}>
          <footer {...stylex.attrs(styles.footer)}>
            <Button variant="primary" size="medium" tooltip={props.saveLabel ?? "Save preference changes"} onClick={() => props.onSave?.()}>{props.saveLabel ?? "Save changes"}</Button>
          </footer>
        </Show>
      </main>
    </section>
  );
}

export function PreferenceRow(props: { definition: PreferenceDefinition; value: PreferenceValue | undefined; onChange: (id: string, value: PreferenceValue) => void }) {
  const value = () => props.value ?? props.definition.defaultValue;
  return (
    <div {...stylex.attrs(styles.row)} data-preference-id={props.definition.id}>
      <div {...stylex.attrs(styles.copy)}>
        <div {...stylex.attrs(styles.rowTitle)}><strong>{props.definition.title}</strong><StatusChip tone={scopeTone(props.definition.scope)}>{scopeLabel(props.definition.scope)}</StatusChip></div>
        <p>{props.definition.description}</p>
      </div>
      <div {...stylex.attrs(styles.control)}>{renderControl(props.definition, value(), props.onChange)}</div>
    </div>
  );
}

function renderControl(definition: PreferenceDefinition, value: PreferenceValue, onChange: (id: string, value: PreferenceValue) => void) {
  const control = definition.control;
  if (control.kind === "toggle") {
    return <label {...stylex.attrs(styles.toggle)}><input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(definition.id, event.currentTarget.checked)} /><span aria-hidden="true" /><b>{Boolean(value) ? "On" : "Off"}</b></label>;
  }
  if (control.kind === "range") {
    return <label {...stylex.attrs(styles.range)}><output>{Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}{control.unit ?? ""}</output><input type="range" min={control.minimum} max={control.maximum} step={control.step} value={Number(value)} onInput={(event) => onChange(definition.id, Number(event.currentTarget.value))} /></label>;
  }
  if (control.kind === "select") {
    return <select {...stylex.attrs(styles.select)} value={String(value)} aria-label={definition.title} onChange={(event) => onChange(definition.id, event.currentTarget.value)}><For each={control.options}>{(option) => <option value={option.value}>{option.label}</option>}</For></select>;
  }
  if (control.kind === "segmented") {
    return <div {...stylex.attrs(styles.segmented)} role="group" aria-label={definition.title}><For each={control.options}>{(option) => <Button variant={String(value) === option.value ? "secondary" : "ghost"} size="small" tooltip={option.description ?? `Set ${definition.title} to ${option.label}`} aria-pressed={String(value) === option.value} onClick={() => onChange(definition.id, option.value)}>{option.label}</Button>}</For></div>;
  }
  return <input {...stylex.attrs(styles.textInput)} type="text" value={String(value)} placeholder={control.placeholder} aria-label={definition.title} onInput={(event) => onChange(definition.id, event.currentTarget.value)} />;
}

function scopeLabel(scope: PreferenceDefinition["scope"]) {
  if (scope === "shared-user") return "Hyperfocus";
  if (scope === "app-user") return "This app";
  if (scope === "project") return "Project";
  return "Session";
}

function scopeTone(scope: PreferenceDefinition["scope"]): "neutral" | "info" | "warning" {
  if (scope === "shared-user") return "info";
  if (scope === "project") return "warning";
  return "neutral";
}
