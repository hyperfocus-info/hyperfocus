import { escapeRegExp } from "@hyperfocus/utilities/text";
import { usePreferencesPanel } from "./state/panel-context";
/** @jsxImportSource solid-js */
import * as stylex from "@stylexjs/stylex";
import { createMemo,For,Show } from "solid-js";
import { PreferenceSection } from "./preferences-controls";
import { preferenceStyles } from "./preferences.styles";


function Highlight(props: { value: string; query: string }) {
  const normalizedQuery = () => props.query.trim();
  const parts = createMemo(() => {
    if (!normalizedQuery()) {
      return [props.value];
    }
    return props.value.split(new RegExp(`(${escapeRegExp(normalizedQuery())})`, "ig"));
  });
  return <><For each={parts()}>{(part) => part.toLowerCase() === normalizedQuery().toLowerCase() ? <mark class={stylex.attrs(preferenceStyles.rounded, preferenceStyles.backgroundAmber100, preferenceStyles.paddingInline05, preferenceStyles.colorForeground).class}>{part}</mark> : part}</For></>;
}

export function PreferencesSearchResults() {
  const panel = usePreferencesPanel();
  const { searchQuery, searchResults, groupedSearchResults } = panel.model;
  return (
    <PreferenceSection title="Search results" description={`${searchResults().length} matching settings`}>
      <Show when={searchResults().length > 0} fallback={<div class={stylex.attrs(preferenceStyles.roundedXl, preferenceStyles.border, preferenceStyles.borderDashed, preferenceStyles.borderDefault, preferenceStyles.backgroundWhite45, preferenceStyles.padding4, preferenceStyles.textXs, preferenceStyles.colorMuted).class}>No matching settings.</div>}>
        <div class={stylex.attrs(preferenceStyles.grid, preferenceStyles.gap4).class}>
          <For each={groupedSearchResults()}>
            {(group) => (
              <section class={stylex.attrs(preferenceStyles.grid, preferenceStyles.gap2).class}>
                <div class={stylex.attrs(preferenceStyles.text07, preferenceStyles.fontSemibold, preferenceStyles.tracking014, preferenceStyles.colorMuted).class}>{group.section.label}</div>
                <div class={stylex.attrs(preferenceStyles.grid, preferenceStyles.gap2).class}>
                  <For each={group.results}>
                    {(setting) => (
                      <button type="button" class={stylex.attrs(preferenceStyles.cursorPointer, preferenceStyles.roundedXl, preferenceStyles.border, preferenceStyles.borderDefault, preferenceStyles.backgroundWhite60, preferenceStyles.padding3, preferenceStyles.textLeft, preferenceStyles.transition, preferenceStyles.hoverBackgroundWhite80).class} onClick={() => panel.onOpen(setting)}>
                        <div class={stylex.attrs(preferenceStyles.textSm, preferenceStyles.fontSemibold, preferenceStyles.colorForeground).class}><Highlight value={setting.title} query={searchQuery()} /></div>
                        <div class={stylex.attrs(preferenceStyles.marginTop1, preferenceStyles.textXs, preferenceStyles.leading5, preferenceStyles.colorMuted).class}><Highlight value={setting.description} query={searchQuery()} /></div>
                      </button>
                    )}
                  </For>
                </div>
              </section>
            )}
          </For>
        </div>
      </Show>
    </PreferenceSection>
  );
}
