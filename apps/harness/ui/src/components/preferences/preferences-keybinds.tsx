/** @jsxImportSource solid-js */
import { For, Show } from "solid-js";
import * as stylex from "@stylexjs/stylex";
import { AlertTriangle, HelpCircle, Keyboard, Plus, RotateCcw, Search, X } from "lucide-solid";
import { appHotkeySettings, DEFAULT_APP_HOTKEY_PREFERENCES, isValidAppHotkey, normalizeAppHotkeyPreferences } from "../../lib/app-hotkeys";
import type { PreferencesPanelModel } from "../preferences-modal";
import { ActionButton } from "../action-button";
import { Input } from "../primitives/input";
import { PreferenceSection } from "./preferences-controls";
import type { PreferencesHotkeyActions } from "./preferences-hotkey-actions";
import { chordsMatch, formatHotkeyForDisplay, formatRecordedChord, keybindRowElementId } from "./preferences-hotkey-utils";
import { preferenceStyles } from "./preferences.styles";

export function PreferencesKeybinds(props: { model: PreferencesPanelModel; actions: PreferencesHotkeyActions; handleSave: () => void }) {
  const { state, store, keybindSearchQuery, setKeybindSearchQuery, setHotkeyDrafts } = props.model;
  const { handleSave } = props;
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
      <PreferenceSection title="Keybinds" description="Customize app and IDE hotkeys for this browser.">
        <div id="keyboard-shortcuts" tabIndex={-1} class={stylex.attrs(preferenceStyles.grid, preferenceStyles.gap4).class}>
          <div class={stylex.attrs(preferenceStyles.flex, preferenceStyles.flexWrap, preferenceStyles.itemsCenter, preferenceStyles.justifyBetween, preferenceStyles.gap3, preferenceStyles.borderBottom, preferenceStyles.borderDefault, preferenceStyles.paddingBottom3).class}>
            <div class={stylex.attrs(preferenceStyles.text0675, preferenceStyles.leading5, preferenceStyles.colorMuted).class}>{filteredSettings().length} keybindings</div>
            <div class={stylex.attrs(preferenceStyles.flex, preferenceStyles.minWidth0, preferenceStyles.flexWrap, preferenceStyles.itemsCenter, preferenceStyles.gap2).class}>
              <label class={stylex.attrs(preferenceStyles.relative, preferenceStyles.minWidth48, preferenceStyles.flex1).class}>
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
            <PreferencesHotkeyGroup title="App keybinds" settings={filteredSettings().filter((setting) => setting.scope !== "ide")} model={props.model} actions={props.actions} />
            <PreferencesHotkeyGroup title="IDE keybinds" settings={filteredSettings().filter((setting) => setting.scope === "ide")} model={props.model} actions={props.actions} />
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

function PreferencesHotkeyGroup(props: { title: string; settings: typeof appHotkeySettings; model: PreferencesPanelModel; actions: PreferencesHotkeyActions }) {
  const { title, settings } = props;
  const { state, hotkeyDrafts } = props.model;
  const { saveHotkeyPreference, addHotkeyDraft, updateHotkeyDraft, deleteHotkeyPreference } = props.actions;
    const preferences = () => normalizeAppHotkeyPreferences(state.appHotkeyPreferences);
    return (
      <section class={stylex.attrs(preferenceStyles.grid, preferenceStyles.gap2).class} data-test-keybind-group={title.toLowerCase().replace(/\s+/g, "-")}>
        <div class={stylex.attrs(preferenceStyles.text062, preferenceStyles.fontSemibold, preferenceStyles.uppercase, preferenceStyles.tracking018, preferenceStyles.colorMuted).class}>{title}</div>
        <For each={settings}>
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
                    class={stylex.attrs(preferenceStyles.rounded2xl, preferenceStyles.border, preferenceStyles.borderDefault, preferenceStyles.backgroundWhite55, preferenceStyles.paddingInline4, preferenceStyles.paddingBlock3, preferenceStyles.shadowSm, preferenceStyles.transition, preferenceStyles.hoverBackgroundWhite70).class}
                  >
                    <div class={stylex.attrs(preferenceStyles.grid, preferenceStyles.itemsCenter, preferenceStyles.gap4, preferenceStyles.mdGridColumnsKeybind).class}>
                      <div class={stylex.attrs(preferenceStyles.minWidth0).class}>
                        <div class={stylex.attrs(preferenceStyles.flex, preferenceStyles.minWidth0, preferenceStyles.itemsCenter, preferenceStyles.gap2).class}>
                          <Keyboard class={stylex.attrs(preferenceStyles.height35, preferenceStyles.width35, preferenceStyles.shrink0, preferenceStyles.colorMuted).class} />
                          <h4 class={stylex.attrs(preferenceStyles.truncate, preferenceStyles.text062, preferenceStyles.fontSemibold, preferenceStyles.tracking016, preferenceStyles.colorMuted).class}>{setting.label}</h4>
                          <ActionButton
                            tooltip={setting.description}
                            ariaLabel={`${setting.label} description`}
                            variant="ghost"
                            size="icon"
                            class={stylex.attrs(preferenceStyles.height6, preferenceStyles.width6, preferenceStyles.roundedLg, preferenceStyles.colorMuted).class}
                            icon={<HelpCircle class={stylex.attrs(preferenceStyles.height35, preferenceStyles.width35).class} />}
                          />
                        </div>
                      </div>
                      <div class={stylex.attrs(preferenceStyles.minWidth0).class}>
                        <div class={stylex.attrs(preferenceStyles.flex, preferenceStyles.minWidth0, preferenceStyles.flexWrap, preferenceStyles.itemsCenter, preferenceStyles.gap25).class}>
                          <For each={draftValue()}>
                            {(hotkey, index) => (
                              <label class={stylex.attrs(preferenceStyles.relative, preferenceStyles.inlineFlex, preferenceStyles.minWidth0, preferenceStyles.roundedXl).class}>
                                <Input
                                  aria-label={`${setting.label} hotkey`}
                                  value={formatHotkeyForDisplay(hotkey)}
                                  placeholder="Press keys..."
                                  class={stylex.attrs(preferenceStyles.height10, preferenceStyles.roundedXl, preferenceStyles.borderDefault, preferenceStyles.backgroundWhite, preferenceStyles.paddingInline4, preferenceStyles.paddingRight8, preferenceStyles.textCenter, preferenceStyles.text072, preferenceStyles.fontSemibold, preferenceStyles.shadowMd).class}
                                  style={{ width: `${Math.max(9, formatHotkeyForDisplay(hotkey).length + 4)}ch`, "min-width": "7.5rem" }}
                                  onKeyDown={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    const chord = formatRecordedChord(event);
                                    updateHotkeyDraft(setting.id, index(), chord);
                                    saveHotkeyPreference(setting.id, index(), chord);
                                  }}
                                  onInput={(event) => updateHotkeyDraft(setting.id, index(), event.currentTarget.value)}
                                  onBlur={(event) => {
                                    if (isValidAppHotkey(event.currentTarget.value)) {
                                      saveHotkeyPreference(setting.id, index(), event.currentTarget.value);
                                    }
                                  }}
                                />
                                <ActionButton
                                  tooltip="Delete keybinding"
                                  ariaLabel={`Delete ${setting.label} keybinding`}
                                  variant="ghost"
                                  size="icon"
                                  class={stylex.attrs(preferenceStyles.absolute, preferenceStyles.rightNegative2, preferenceStyles.topNegative2, preferenceStyles.height5, preferenceStyles.width5, preferenceStyles.roundedFull, preferenceStyles.border, preferenceStyles.borderDefault, preferenceStyles.backgroundPanel, preferenceStyles.padding0, preferenceStyles.shadowSm).class}
                                  icon={<X class={stylex.attrs(preferenceStyles.height3, preferenceStyles.width3).class} />}
                                  onClick={() => deleteHotkeyPreference(setting.id, index())}
                                />
                              </label>
                            )}
                          </For>
                          <ActionButton
                            tooltip={`Add ${setting.label} keybinding`}
                            ariaLabel={`Add ${setting.label} keybinding`}
                            variant="secondary"
                            size="icon"
                            class={stylex.attrs(preferenceStyles.height10, preferenceStyles.width10, preferenceStyles.roundedXl, preferenceStyles.shadowSm).class}
                            icon={<Plus class={stylex.attrs(preferenceStyles.height35, preferenceStyles.width35).class} />}
                            onClick={() => addHotkeyDraft(setting.id)}
                          />
                        </div>
                      </div>
                      <div class={stylex.attrs(preferenceStyles.flex, preferenceStyles.minWidth0, preferenceStyles.itemsCenter, preferenceStyles.justifyEnd, preferenceStyles.gap2).class}>
                        <Show when={duplicate()}>
                          <AlertTriangle class={stylex.attrs(preferenceStyles.height4, preferenceStyles.width4, preferenceStyles.colorAmber600).class} />
                        </Show>
                        <div class={stylex.attrs(preferenceStyles.roundedXl, preferenceStyles.border, preferenceStyles.borderDefault, preferenceStyles.backgroundWhite60, preferenceStyles.paddingInline3, preferenceStyles.paddingBlock2, preferenceStyles.text0675, preferenceStyles.fontMedium, preferenceStyles.colorMuted).class}>Always</div>
                      </div>
                    </div>
                  </div>
                );
              }}
            </For>
      </section>
    );
  }

