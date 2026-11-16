import { usePreferencesPanel } from "./state/panel-context";
/** @jsxImportSource solid-js */
import { Input } from "@hyperfocus/ui";
import { tokens } from "@hyperfocus/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { AlertTriangle,Keyboard,Plus,RotateCcw,Search,X } from "lucide-solid";
import { For,Index,Show } from "solid-js";
import { appHotkeySettings,DEFAULT_APP_HOTKEY_PREFERENCES,isValidAppHotkey,normalizeAppHotkeyPreferences } from "../../lib/app-hotkeys";
import { ActionButton } from "../action-button";
import { PreferenceSection } from "./preferences-controls";
import { chordsMatch,formatHotkeyForDisplay,formatRecordedChord,keybindRowElementId } from "./preferences-hotkey-utils";
import { preferenceStyles } from "./preferences.styles";

const keybindStyles = stylex.create({
  row: { paddingBlock: tokens.space3, borderBottomColor: tokens.border, borderBottomStyle: "solid", borderBottomWidth: tokens.borderWidth },
  layout: { gap: tokens.space3, display: "grid", minWidth: 0, },
  title: { fontSize: tokens.fontBody, fontWeight: 600, overflowWrap: "anywhere" },
  description: { color: tokens.muted, fontSize: tokens.fontCaption, overflowWrap: "anywhere", },
  error: { color: tokens.danger, flexBasis: "100%", fontSize: tokens.fontCaption, overflowWrap: "anywhere", },
  chip: { borderColor: tokens.border, borderRadius: tokens.radiusSmall, borderStyle: "solid", borderWidth: tokens.borderWidth, alignItems: "center", backgroundColor: tokens.panelRaised, display: "inline-flex", maxWidth: "100%", minWidth: 0 },
  input: { borderWidth: 0, paddingInline: tokens.space2, backgroundColor: "transparent", boxShadow: "none", textAlign: "center", minWidth: 0 },
  remove: { padding: 0, borderRadius: tokens.radiusSmall, flexShrink: 0, minWidth: tokens.controlCompact },
});

export function PreferencesKeybinds() {
  const panel = usePreferencesPanel();
  const { state, store, keybindSearchQuery, setKeybindSearchQuery, setHotkeyDrafts } = panel.model;
  const { handleSave } = panel.persistence;
    const preferences = () => normalizeAppHotkeyPreferences(state.appHotkeyPreferences);
    const filteredSettings = () => {
      const query = keybindSearchQuery().trim().toLowerCase();
      if (!query) {
        return appHotkeySettings;
      }
      return appHotkeySettings.filter((setting) =>
        [setting.label, setting.description, preferences()[setting.id].join(" ")].some((value) =>
          value.toLowerCase().includes(query)
        )
      );
    };

    return (
      <PreferenceSection title="Keybinds" description="Customize app and IDE hotkeys for this browser. Focus a binding and press a combination to save it. Tab moves on; Escape restores the saved binding.">
        <div id="keyboard-shortcuts" tabIndex={-1} class={stylex.attrs(preferenceStyles.grid, preferenceStyles.gap4).class}>
          <div class={stylex.attrs(preferenceStyles.flex, preferenceStyles.flexWrap, preferenceStyles.itemsCenter, preferenceStyles.justifyBetween, preferenceStyles.gap3, preferenceStyles.borderBottom, preferenceStyles.borderDefault, preferenceStyles.paddingBottom3).class}>
            <div class={stylex.attrs(preferenceStyles.text0675, preferenceStyles.leading5, preferenceStyles.colorMuted).class}>{filteredSettings().length} keybindings</div>
            <div class={stylex.attrs(preferenceStyles.flex, preferenceStyles.minWidth0, preferenceStyles.flexWrap, preferenceStyles.itemsCenter, preferenceStyles.gap2).class}>
              <label class={stylex.attrs(preferenceStyles.relative, preferenceStyles.minWidth0, preferenceStyles.flex1).class}>
                <Search class={stylex.attrs(preferenceStyles.pointerEventsNone, preferenceStyles.absolute, preferenceStyles.left3, preferenceStyles.topHalf, preferenceStyles.height35, preferenceStyles.width35, preferenceStyles.translateYHalfNegative, preferenceStyles.colorMuted).class} />
                <Input
                  class={stylex.attrs(preferenceStyles.height9, preferenceStyles.paddingLeft8).class}
                  aria-label="Search keybindings"
                  value={keybindSearchQuery()}
                  placeholder="Search keybindings..."
                  onInput={(event) => setKeybindSearchQuery(event.currentTarget.value)}
                />
              </label>
            </div>
          </div>

          <div class={stylex.attrs(preferenceStyles.grid, preferenceStyles.gap4).class}>
            <Show when={filteredSettings().length === 0}><p role="status">No shortcuts match. Try a command name or key combination.</p></Show>
            <PreferencesHotkeyGroup title="App keybinds" settings={filteredSettings().filter((setting) => setting.scope !== "ide")} />
            <PreferencesHotkeyGroup title="IDE keybinds" settings={filteredSettings().filter((setting) => setting.scope === "ide")} />
          </div>

          <div>
            <ActionButton
              tooltip="Restore default keyboard shortcuts"
              variant="secondary"
              icon={<RotateCcw class={stylex.attrs(preferenceStyles.height4, preferenceStyles.width4).class} />}
              onClick={() => {
                setHotkeyDrafts({ ...DEFAULT_APP_HOTKEY_PREFERENCES });
                for (const setting of appHotkeySettings) {
                  store.setAppHotkeyPreference(setting.id, DEFAULT_APP_HOTKEY_PREFERENCES[setting.id]);
                }
                handleSave();
              }}
            >
              Restore shortcuts
            </ActionButton>
          </div>
        </div>
      </PreferenceSection>
    );
  }

function PreferencesHotkeyGroup(props: { title: string; settings: typeof appHotkeySettings; }) {
  const panel = usePreferencesPanel();
  const { title } = props;
  const { state, hotkeyDrafts } = panel.model;
  const { saveHotkeyPreference, addHotkeyDraft, updateHotkeyDraft, deleteHotkeyPreference } = panel.hotkeys;
    const preferences = () => normalizeAppHotkeyPreferences(state.appHotkeyPreferences);
    return (
      <section class={stylex.attrs(preferenceStyles.grid, preferenceStyles.gap2).class} data-test-keybind-group={title.toLowerCase().replace(/\s+/g, "-")}>
        <div class={stylex.attrs(preferenceStyles.text062, preferenceStyles.fontSemibold, preferenceStyles.uppercase, preferenceStyles.tracking018, preferenceStyles.colorMuted).class}>{title}</div>
        <For each={props.settings}>
              {(setting) => {
                const draftValue = () => hotkeyDrafts()[setting.id];
                const duplicate = () =>
                  preferences()[setting.id].some((hotkey, hotkeyIndex) =>
                    appHotkeySettings.some((candidate) =>
                      preferences()[candidate.id].some((candidateHotkey, candidateIndex) => {
                        if (candidate.id === setting.id && candidateIndex === hotkeyIndex) {
                          return false;
                        }
                        return chordsMatch(candidateHotkey, hotkey);
                      })
                    )
                  );
                return (
                  <div
                    id={keybindRowElementId(setting.id)}
                    data-test-keybind-row={setting.id}
                    tabIndex={-1}
                    class={stylex.attrs(keybindStyles.row).class}
                  >
                    <div class={stylex.attrs(keybindStyles.layout).class}>
                      <div class={stylex.attrs(preferenceStyles.minWidth0).class}>
                        <div class={stylex.attrs(preferenceStyles.flex, preferenceStyles.minWidth0, preferenceStyles.itemsCenter, preferenceStyles.gap2).class}>
                          <Keyboard class={stylex.attrs(preferenceStyles.height35, preferenceStyles.width35, preferenceStyles.shrink0, preferenceStyles.colorMuted).class} />
                          <h4 class={stylex.attrs(keybindStyles.title).class}>{setting.label}</h4>
                        </div>
                        <p class={stylex.attrs(keybindStyles.description).class}>{setting.description}</p>
                      </div>
                      <div class={stylex.attrs(preferenceStyles.minWidth0).class}>
                        <div class={stylex.attrs(preferenceStyles.flex, preferenceStyles.minWidth0, preferenceStyles.flexWrap, preferenceStyles.itemsCenter, preferenceStyles.gap25).class}>
                          <Index each={draftValue()}>
                            {(hotkey, index) => (<>
                              <div class={stylex.attrs(keybindStyles.chip).class} role="group" aria-label={`${setting.label} binding`}>
                                <Input
                                  aria-label={`${setting.label} hotkey`}
                                  aria-invalid={Boolean(hotkey() && !isValidAppHotkey(hotkey())) || undefined}
                                  aria-describedby={hotkey() && !isValidAppHotkey(hotkey()) ? `${keybindRowElementId(setting.id)}-invalid-${index}` : undefined}
                                  value={formatHotkeyForDisplay(hotkey())}
                                  placeholder="Press keys..."
                                  class={stylex.attrs(keybindStyles.input).class}
                                  style={{ width: `${Math.max(9, formatHotkeyForDisplay(hotkey()).length + 2)}ch` }}
                                  onKeyDown={(event) => {
                                    if (event.key === "Tab") return;
                                    if (event.key === "Escape") {
                                      event.preventDefault();
                                      event.stopPropagation();
                                      updateHotkeyDraft(setting.id, index, preferences()[setting.id][index] ?? "");
                                      return;
                                    }
                                    event.preventDefault();
                                    event.stopPropagation();
                                    const chord = formatRecordedChord(event);
                                    updateHotkeyDraft(setting.id, index, chord);
                                    saveHotkeyPreference(setting.id, index, chord);
                                  }}
                                  onInput={(event) => updateHotkeyDraft(setting.id, index, event.currentTarget.value)}
                                  onBlur={(event) => {
                                    if (isValidAppHotkey(event.currentTarget.value)) {
                                      saveHotkeyPreference(setting.id, index, event.currentTarget.value);
                                    }
                                  }}
                                />
                                <ActionButton
                                  tooltip="Delete keybinding"
                                  ariaLabel={`Delete ${setting.label} keybinding`}
                                  variant="ghost"
                                  size="icon"
                                  class={stylex.attrs(keybindStyles.remove).class}
                                  icon={<X class={stylex.attrs(preferenceStyles.height3, preferenceStyles.width3).class} />}
                                  onClick={() => deleteHotkeyPreference(setting.id, index)}
                                />
                              </div>
                              <Show when={hotkey() && !isValidAppHotkey(hotkey())}><p class={stylex.attrs(keybindStyles.error).class} id={`${keybindRowElementId(setting.id)}-invalid-${index}`} role="alert">Press a complete key combination, or Escape to restore.</p></Show>
                            </>)}
                          </Index>
                          <ActionButton
                            tooltip={`Add ${setting.label} keybinding`}
                            ariaLabel={`Add ${setting.label} keybinding`}
                            variant="secondary"
                            size="icon"
                            class={stylex.attrs(preferenceStyles.height10, preferenceStyles.width10).class}
                            icon={<Plus class={stylex.attrs(preferenceStyles.height35, preferenceStyles.width35).class} />}
                            onClick={() => addHotkeyDraft(setting.id)}
                          />
                        </div>
                      </div>
                      <div class={stylex.attrs(preferenceStyles.flex, preferenceStyles.minWidth0, preferenceStyles.itemsCenter, preferenceStyles.justifyEnd, preferenceStyles.gap2).class}>
                        <Show when={duplicate()}>
                          <AlertTriangle class={stylex.attrs(preferenceStyles.height4, preferenceStyles.width4, preferenceStyles.colorAmber600).class} />
                          <span class={stylex.attrs(keybindStyles.description).class}>Shared shortcut: another command may handle it first.</span>
                        </Show>
                      </div>
                    </div>
                  </div>
                );
              }}
            </For>
      </section>
    );
  }
