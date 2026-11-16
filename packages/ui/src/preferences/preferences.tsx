import { Tooltip } from "../primitives/tooltip";
import * as stylex from "@stylexjs/stylex";
import { createMemo, createSignal, createUniqueId, For, Show } from "solid-js";
import { CheckboxField } from "../form/form";
import { Input } from "../form/input";
import { SettingsWorkspace } from "./settings-workspace";
import { typography } from "../theme/typography";
import { sharedStyles } from "../theme/styles";
import { Button } from "../primitives/button";
import { SelectControl } from "../primitives/selection/select-control";
import { StatusChip } from "../primitives/status-chip";
import { SegmentedControl } from "../primitives/segmented-control";
import { tokens } from "../theme/tokens.stylex";
import { filterPreferences, type PreferenceDefinition, type PreferenceSectionDefinition, type PreferenceValue, type PreferenceValues } from "./model";

const styles = stylex.create({
  root: { backgroundColor: tokens.panel, color: tokens.foreground, containerType: "inline-size", display: "flex", flexDirection: "column", height: "100%", minHeight: 0, minWidth: 0, },
  content: { display: "grid", minWidth: 0 },
  header: { padding: tokens.space3, gap: tokens.space2, alignItems: "start", display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", minWidth: 0 },
  copy: { minWidth: 0 },
  headerCopy: { display: "contents" },
  headerDescription: { gridColumnEnd: '-1',
 gridColumnStart: '1' },
  title: { overflowWrap: "anywhere", marginBottom: tokens.space1, marginTop: 0, },
  description: { margin: 0, color: tokens.muted, overflowWrap: "anywhere" },
  rows: { display: "grid", minWidth: 0 },
  row: { padding: tokens.space3, gap: tokens.space3, alignItems: "center", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 18rem), 1fr))", borderBottomColor: tokens.border, borderBottomStyle: "solid", borderBottomWidth: tokens.borderWidth, minWidth: 0 },
  rowTitle: { cursor: "pointer", overflowWrap: "anywhere" },
  rowHelp: { overflow: "hidden", clipPath: "inset(50%)", position: "absolute", whiteSpace: "nowrap", height: 1, width: 1 },
  control: { display: "grid", minWidth: 0 },
  range: { gap: tokens.space2, display: "grid", minWidth: 0 },
  slider: { margin: 0, accentColor: tokens.accent, boxSizing: "border-box", minHeight: tokens.controlTouch, minWidth: 0, width: "100%", },
  disclosure: { borderBottomColor: tokens.border, borderBottomStyle: "solid", borderBottomWidth: tokens.borderWidth, minWidth: 0 },
  summary: { padding: tokens.space4, boxSizing: "border-box", cursor: "pointer", overflowWrap: "anywhere", minHeight: tokens.controlTouch, },
  empty: { padding: tokens.space4, gap: tokens.space2, color: tokens.muted, display: "grid", minWidth: 0 },
  footer: { padding: tokens.space4, gap: tokens.space3, display: "grid", justifyItems: "start", minWidth: 0 },
  error: { margin: 0, color: tokens.danger, overflowWrap: "anywhere" },
});

export function PreferencesSurface(props: {
  title?: string;
  onClose?: () => void;
  sections: readonly PreferenceSectionDefinition[];
  definitions: readonly PreferenceDefinition[];
  values: PreferenceValues;
  onChange: (id: string, value: PreferenceValue) => void;
  onReset?: (scope?: PreferenceDefinition["scope"]) => void;
  onSave?: () => void;
  saveLabel?: string;
  saveError?: string;
  resetDescription?: string;
}) {
  const saveErrorId = createUniqueId();
  const [query, setQuery] = createSignal("");
  const [activeSection, setActiveSection] = createSignal(props.sections[0]?.id ?? "");
  const sections = createMemo(() => props.sections.map(section => ({ id: section.id, label: section.title })));
  const matches = createMemo(() => filterPreferences(props.definitions, query()));
  const visible = createMemo(() => query().trim()
    ? matches()
    : matches().filter((definition) => definition.sectionId === activeSection()));
  const currentSection = createMemo(() => props.sections.find((section) => section.id === activeSection()));
  const standard = createMemo(() => visible().filter((definition) => !definition.advanced));
  const advanced = createMemo(() => visible().filter((definition) => definition.advanced));
  const commonScope = createMemo(() => {
    const first = visible()[0]?.scope;
    return first && visible().every(definition => definition.scope === first) ? first : undefined;
  });
  const headerScope = createMemo(() => {
    const scope = commonScope();
    return scope && scopeLabel(scope) !== currentSection()?.title ? scope : undefined;
  });

  return (
    <section {...stylex.attrs(styles.root)} aria-label={props.title ?? "Preferences"} data-test-preferences-surface="">
      <SettingsWorkspace title={props.title} sections={sections()} activeSection={activeSection()} onSectionChange={setActiveSection}
        query={query()} onQueryChange={setQuery} onClose={props.onClose}>
      <div {...stylex.attrs(styles.content)}>
        <header {...stylex.attrs(styles.header)}>
          <div {...stylex.attrs(styles.headerCopy)}>
            <h2 {...stylex.attrs(typography.section, styles.title)}>{query().trim() ? "Search results" : currentSection()?.title ?? props.title ?? "Preferences"}</h2>
            <Show when={headerScope()}>{scope => <div {...stylex.attrs(styles.headerDescription)}><StatusChip tone={scopeTone(scope())}>{scopeLabel(scope())}</StatusChip></div>}</Show>
            <p {...stylex.attrs(typography.caption, styles.description, styles.headerDescription)}>{query().trim() ? `${visible().length} matching settings` : currentSection()?.description}</p>
          </div>
        </header>
        <div {...stylex.attrs(styles.rows)}>
          <For each={standard()}>{(definition) => <PreferenceRow definition={definition} hideScope={Boolean(commonScope())} value={props.values[definition.id]} onChange={props.onChange} />}</For>
          <Show when={advanced().length > 0}>
            <details {...stylex.attrs(styles.disclosure)}>
              <summary {...stylex.attrs(typography.control, sharedStyles.focusRing, styles.summary)}>Advanced <span>{advanced().length}</span></summary>
              <div {...stylex.attrs(styles.rows)}>
                <For each={advanced()}>{(definition) => <PreferenceRow definition={definition} hideScope={Boolean(commonScope())} value={props.values[definition.id]} onChange={props.onChange} />}</For>
              </div>
            </details>
          </Show>
          <Show when={visible().length === 0}>
            <div {...stylex.attrs(styles.empty)} role="status"><strong {...stylex.attrs(typography.emphasis)}>No matching preferences</strong><span {...stylex.attrs(typography.body)}>Try a broader search term or clear the search.</span></div>
          </Show>
        </div>
        <Show when={props.onSave || props.onReset}>
          <footer {...stylex.attrs(styles.footer)}>
            <Show when={props.saveError}><p {...stylex.attrs(typography.body, styles.error)} role="alert" id={saveErrorId}>{props.saveError}</p></Show>
            <Show when={props.onSave}><Button aria-describedby={props.saveError ? saveErrorId : undefined} variant="primary" size="medium" tooltip={props.saveLabel ?? "Save preference changes"} onClick={() => props.onSave?.()}>{props.saveLabel ?? "Save changes"}</Button></Show>
            <Show when={props.onReset}><Button size="small" variant="ghost" tooltip={props.resetDescription ?? "Reset preferences to defaults"} onClick={() => props.onReset?.()}>Reset</Button></Show>
          </footer>
        </Show>
      </div>
      </SettingsWorkspace>
    </section>
  );
}

export function PreferenceRow(props: { definition: PreferenceDefinition; value: PreferenceValue | undefined; hideScope?: boolean; onChange: (id: string, value: PreferenceValue) => void }) {
  const descriptionId = createUniqueId();
  return (
    <div {...stylex.attrs(styles.row)} data-preference-id={props.definition.id}>
      <div {...stylex.attrs(styles.copy)}><Tooltip content={props.definition.description}>
        <span tabindex="0" aria-describedby={descriptionId} data-preference-help {...stylex.attrs(sharedStyles.focusRing, styles.rowTitle)}><strong {...stylex.attrs(typography.emphasis)}>{props.definition.title}</strong><Show when={!props.hideScope}> <StatusChip tone={scopeTone(props.definition.scope)}>{scopeLabel(props.definition.scope)}</StatusChip></Show></span></Tooltip>
        <p {...stylex.attrs(typography.body, styles.description, styles.rowHelp)} id={descriptionId}>{props.definition.description}</p>
      </div>
      <div {...stylex.attrs(styles.control)}><PreferenceControl definition={props.definition} value={props.value ?? props.definition.defaultValue} describedBy={descriptionId} onChange={props.onChange} /></div>
    </div>
  );
}

function PreferenceControl(props: { definition: PreferenceDefinition; value: PreferenceValue; describedBy: string; onChange: (id: string, value: PreferenceValue) => void }) {
  const control = props.definition.control;
  if (control.kind === "toggle") {
    return <CheckboxField label={Boolean(props.value) ? "On" : "Off"}><input type="checkbox" aria-label={props.definition.title} aria-describedby={props.describedBy} checked={Boolean(props.value)} onChange={event => props.onChange(props.definition.id, event.currentTarget.checked)} /></CheckboxField>;
  }
  if (control.kind === "range") {
    return <div {...stylex.attrs(styles.range)}><output {...stylex.attrs(typography.metadata)}>{Number(props.value).toLocaleString(undefined, { maximumFractionDigits: 2 })}{control.unit ?? ""}</output><input {...stylex.attrs(styles.slider, sharedStyles.focusRing)} type="range" aria-label={props.definition.title} aria-describedby={props.describedBy} min={control.minimum} max={control.maximum} step={control.step} value={Number(props.value)} onInput={event => props.onChange(props.definition.id, Number(event.currentTarget.value))} /></div>;
  }
  if (control.kind === "select") {
    return <SelectControl ariaLabel={props.definition.title} describedBy={props.describedBy} size="md" value={String(props.value)} options={control.options} onChange={next => props.onChange(props.definition.id, next)} />;
  }
  if (control.kind === "segmented") {
    return <SegmentedControl ariaLabel={props.definition.title} describedBy={props.describedBy} value={String(props.value)} options={control.options} onValueChange={value => props.onChange(props.definition.id, value)} />;
  }
  return <Input type="text" value={String(props.value)} placeholder={control.placeholder} aria-label={props.definition.title} aria-describedby={props.describedBy} onInput={event => props.onChange(props.definition.id, event.currentTarget.value)} />;
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
