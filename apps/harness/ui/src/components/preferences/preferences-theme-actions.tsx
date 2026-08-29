/** @jsxImportSource solid-js */
import { For } from "solid-js";
import * as stylex from "@stylexjs/stylex";
import { Monitor, Moon, Palette, RotateCcw, Sun, Type } from "lucide-solid";
import {
  BUILT_IN_THEMES, CUSTOM_THEME_COLOR_VARIABLES, CUSTOM_THEME_FONT_VARIABLES, DEFAULT_CUSTOM_BASE_THEME_ID, THEME_OPTIONS, createDefaultCustomTheme,
  getCustomThemeFontOptions, isBuiltInThemeId, normalizeHexColor, normalizeThemeColorInput,
  normalizeThemeFontInput, resolveThemeMode, resolveThemeTokens, validateThemeContrast,
  withCustomThemeToken, type CustomThemeDefinition, type ThemeCssVariable, type ThemeModePreference,
} from "../../theme/theme-model";
import type { PreferencesPanelModel } from "../preferences-modal";
import { pushToast } from "../../toast-store";
import { ActionButton } from "../action-button";
import { DropdownControl } from "../primitives/dropdown";
import { Input } from "../primitives/input";
import { Tooltip } from "../primitives/tooltip";
import { preferenceStyles } from "./preferences.styles";

export type PreferencesThemeActions = ReturnType<typeof createPreferencesThemeActions>;

export function createPreferencesThemeActions(
  model: PreferencesPanelModel,
  updateSavedPreference: (update: () => void) => void,
  renderDetailRoot: () => void,
) {
  const { state, store } = model;
  function systemPrefersDark() {
    return typeof window !== "undefined" &&
      "matchMedia" in window &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  function resolvedThemeMode() {
    return resolveThemeMode(state.themePreference, systemPrefersDark());
  }

  function resolvedThemeTokens() {
    return resolveThemeTokens(state.themePreference, systemPrefersDark());
  }

  function customThemeDefinition(): CustomThemeDefinition {
    return state.themePreference.custom ?? createDefaultCustomTheme();
  }

  function themeOptions() {
    return THEME_OPTIONS.map((option) => ({
      value: option.value,
      label: option.label,
      description: option.description
    }));
  }

  function customBaseThemeOptions() {
    return BUILT_IN_THEMES.map((theme) => ({
      value: theme.id,
      label: theme.label,
      description: theme.description
    }));
  }

  function updateCustomThemeBase(value: string) {
    if (!isBuiltInThemeId(value)) {
      return;
    }
    store.setCustomTheme({
      ...customThemeDefinition(),
      baseThemeId: value
    });
  }

  function updateCustomThemeVariable(variable: ThemeCssVariable, value: string) {
    const currentTokens = resolvedThemeTokens();
    const fontVariable = CUSTOM_THEME_FONT_VARIABLES.some((entry) => entry.variable === variable);
    if (!fontVariable && !normalizeHexColor(value)) {
      pushToast("Invalid theme color", "Use a 3- or 6-digit hex color.", "error");
      return;
    }
    const normalizedValue = fontVariable
      ? normalizeThemeFontInput(variable, value, currentTokens[variable])
      : normalizeThemeColorInput(value, currentTokens[variable]);
    const nextPreference = withCustomThemeToken(
      state.themePreference,
      resolvedThemeMode(),
      variable,
      normalizedValue
    );
    const contrastFailures = validateThemeContrast(resolveThemeTokens(nextPreference, systemPrefersDark()));
    if (contrastFailures.length > 0) {
      const firstFailure = contrastFailures[0];
      pushToast(
        "Theme contrast too low",
        `${firstFailure.label} must stay at least ${firstFailure.minimum}:1.`,
        "error"
      );
      return;
    }
    store.setCustomTheme(nextPreference.custom ?? createDefaultCustomTheme());
  }

  function colorInputValue(variable: ThemeCssVariable) {
    return normalizeThemeColorInput(resolvedThemeTokens()[variable], "#000000");
  }

  const themeModeCycle: ThemeModePreference[] = ["system", "light", "dark"];

  function themeModeLabel(mode: ThemeModePreference) {
    switch (mode) {
      case "system":
        return "System";
      case "light":
        return "Light";
      case "dark":
        return "Dark";
    }
  }

  function nextThemeMode(mode: ThemeModePreference = state.themePreference.mode) {
    const currentIndex = themeModeCycle.indexOf(mode);
    return themeModeCycle[(currentIndex + 1) % themeModeCycle.length] ?? "system";
  }

  function themeModeIcon() {
    switch (state.themePreference.mode) {
      case "system":
        return <Monitor class={stylex.attrs(preferenceStyles.height4, preferenceStyles.width4).class} />;
      case "light":
        return <Sun class={stylex.attrs(preferenceStyles.height4, preferenceStyles.width4).class} />;
      case "dark":
        return <Moon class={stylex.attrs(preferenceStyles.height4, preferenceStyles.width4).class} />;
    }
  }

  function themeModeTooltip() {
    return `Theme mode: ${themeModeLabel(state.themePreference.mode)}. Click for ${themeModeLabel(nextThemeMode()).toLowerCase()} mode.`;
  }

  function cycleThemeMode() {
    store.setThemeMode(nextThemeMode());
    renderDetailRoot();
  }

  return {
    systemPrefersDark, resolvedThemeMode, resolvedThemeTokens, customThemeDefinition,
    themeOptions, customBaseThemeOptions, updateCustomThemeBase, updateCustomThemeVariable,
    colorInputValue, themeModeLabel, nextThemeMode, themeModeIcon, themeModeTooltip, cycleThemeMode,
  };
}

export function PreferencesThemePreview(props: { actions: PreferencesThemeActions }) {
  const { resolvedThemeTokens, resolvedThemeMode } = props.actions;
    const tokens = () => resolvedThemeTokens();
    const swatches = () => [
      { label: "Accent", value: tokens()["--accent"] },
      { label: "Info", value: tokens()["--info"] },
      { label: "Success", value: tokens()["--success"] },
      { label: "Warning", value: tokens()["--warning"] },
      { label: "Danger", value: tokens()["--danger"] }
    ];
    return (
      <div class={stylex.attrs(preferenceStyles.grid, preferenceStyles.gap2, preferenceStyles.roundedXl, preferenceStyles.border, preferenceStyles.borderDefault, preferenceStyles.backgroundPanelStrong, preferenceStyles.padding3, preferenceStyles.textXs).class}>
        <div class={stylex.attrs(preferenceStyles.grid, preferenceStyles.minWidth0, preferenceStyles.gap2, preferenceStyles.smFlex, preferenceStyles.smItemsCenter, preferenceStyles.smJustifyBetween, preferenceStyles.smGap3).class}>
          <div class={stylex.attrs(preferenceStyles.minWidth0).class}>
            <div class={stylex.attrs(preferenceStyles.fontSemibold, preferenceStyles.colorForeground).class}>Preview</div>
            <div class={stylex.attrs(preferenceStyles.text0675, preferenceStyles.leading4, preferenceStyles.colorMuted).class}>Resolved {resolvedThemeMode()} tokens and theme fonts.</div>
          </div>
          <div class={stylex.attrs(preferenceStyles.flex, preferenceStyles.shrink0, preferenceStyles.itemsCenter, preferenceStyles.gap15).class}>
            <For each={swatches()}>
              {(swatch) => (
                <Tooltip content={swatch.label}>
                  <span
                    class={stylex.attrs(preferenceStyles.height5, preferenceStyles.width5, preferenceStyles.roundedMd, preferenceStyles.border, preferenceStyles.borderDefault).class}
                    style={{ background: swatch.value }}
                  />
                </Tooltip>
              )}
            </For>
          </div>
        </div>
        <div class={stylex.attrs(preferenceStyles.grid, preferenceStyles.gap2, preferenceStyles.roundedLg, preferenceStyles.border, preferenceStyles.borderDefault, preferenceStyles.backgroundPanel, preferenceStyles.padding3).class}>
          <div class={stylex.attrs(preferenceStyles.fontDisplay, preferenceStyles.textSm, preferenceStyles.fontSemibold, preferenceStyles.colorForeground).class}>Workspace typography</div>
          <div class={stylex.attrs(preferenceStyles.text07, preferenceStyles.leading4, preferenceStyles.colorMuted).class}>Panel text, muted metadata, and accent controls stay readable.</div>
          <div class={stylex.attrs(preferenceStyles.flex, preferenceStyles.flexWrap, preferenceStyles.gap2).class}>
            <span class={stylex.attrs(preferenceStyles.roundedLg, preferenceStyles.backgroundAccent, preferenceStyles.paddingInline2, preferenceStyles.paddingBlock1, preferenceStyles.text0675, preferenceStyles.fontSemibold, preferenceStyles.colorAccentForeground).class}>Build</span>
            <span class={stylex.attrs(preferenceStyles.roundedLg, preferenceStyles.border, preferenceStyles.borderDefault, preferenceStyles.backgroundRow, preferenceStyles.paddingInline2, preferenceStyles.paddingBlock1, preferenceStyles.text0675, preferenceStyles.colorForeground).class}>Row surface</span>
          </div>
        </div>
      </div>
    );
  }

export function PreferencesCustomThemeEditor(props: { model: PreferencesPanelModel; actions: PreferencesThemeActions }) {
  const { store } = props.model;
  const { customThemeDefinition, customBaseThemeOptions, updateCustomThemeBase, updateCustomThemeVariable, colorInputValue, resolvedThemeTokens } = props.actions;
    const custom = () => customThemeDefinition();
    const baseThemeId = () => custom().baseThemeId ?? DEFAULT_CUSTOM_BASE_THEME_ID;
    return (
      <div class={stylex.attrs(preferenceStyles.grid, preferenceStyles.gap3, preferenceStyles.roundedXl, preferenceStyles.border, preferenceStyles.borderDefault, preferenceStyles.backgroundPanel, preferenceStyles.padding3).class} data-test-custom-theme-editor="">
        <div class={stylex.attrs(preferenceStyles.grid, preferenceStyles.gap2, preferenceStyles.smGridColumnsControl, preferenceStyles.smItemsCenter).class}>
          <DropdownControl
            kind="select"
            ariaLabel="Custom theme base"
            icon={<Palette class={stylex.attrs(preferenceStyles.height35, preferenceStyles.width35).class} />}
            size="md"
            class={stylex.attrs(preferenceStyles.widthFull).class}
            value={baseThemeId()}
            options={customBaseThemeOptions()}
            onChange={updateCustomThemeBase}
          />
          <ActionButton
            tooltip="Reset custom theme"
            ariaLabel="Reset custom theme"
            variant="secondary"
            icon={<RotateCcw class={stylex.attrs(preferenceStyles.height4, preferenceStyles.width4).class} />}
            onClick={() => store.resetCustomTheme()}
          >
            Reset
          </ActionButton>
        </div>
        <div class={stylex.attrs(preferenceStyles.grid, preferenceStyles.gap2, preferenceStyles.smGridColumns2, preferenceStyles.xlGridColumns3).class}>
          <For each={CUSTOM_THEME_COLOR_VARIABLES}>
            {(entry) => (
              <label class={stylex.attrs(preferenceStyles.grid, preferenceStyles.minWidth0, preferenceStyles.gap1, preferenceStyles.roundedLg, preferenceStyles.border, preferenceStyles.borderDefault, preferenceStyles.backgroundPanelStrong, preferenceStyles.padding2).class}>
                <span class={stylex.attrs(preferenceStyles.truncate, preferenceStyles.text0585, preferenceStyles.fontSemibold, preferenceStyles.tracking016, preferenceStyles.colorMuted).class}>{entry.label}</span>
                <div class={stylex.attrs(preferenceStyles.flex, preferenceStyles.minWidth0, preferenceStyles.itemsCenter, preferenceStyles.gap2).class}>
                  <input
                    aria-label={`${entry.label} color`}
                    class={stylex.attrs(preferenceStyles.height8, preferenceStyles.width10, preferenceStyles.shrink0, preferenceStyles.cursorPointer, preferenceStyles.roundedLg, preferenceStyles.border, preferenceStyles.borderDefault, preferenceStyles.backgroundTransparent, preferenceStyles.padding05).class}
                    type="color"
                    value={colorInputValue(entry.variable)}
                    onInput={(event) => updateCustomThemeVariable(entry.variable, event.currentTarget.value)}
                  />
                  <Input
                    aria-label={`${entry.label} hex`}
                    class={stylex.attrs(preferenceStyles.height8, preferenceStyles.minWidth0, preferenceStyles.fontMono, preferenceStyles.text0675).class}
                    value={colorInputValue(entry.variable).toUpperCase()}
                    onChange={(event) => updateCustomThemeVariable(entry.variable, event.currentTarget.value)}
                  />
                </div>
              </label>
            )}
          </For>
        </div>
        <div class={stylex.attrs(preferenceStyles.grid, preferenceStyles.gap2).class}>
          <For each={CUSTOM_THEME_FONT_VARIABLES}>
            {(entry) => (
              <div class={stylex.attrs(preferenceStyles.grid, preferenceStyles.gap1, preferenceStyles.roundedLg, preferenceStyles.border, preferenceStyles.borderDefault, preferenceStyles.backgroundPanelStrong, preferenceStyles.padding2).class}>
                <span class={stylex.attrs(preferenceStyles.flex, preferenceStyles.itemsCenter, preferenceStyles.gap15, preferenceStyles.text0585, preferenceStyles.fontSemibold, preferenceStyles.tracking016, preferenceStyles.colorMuted).class}>
                  <Type class={stylex.attrs(preferenceStyles.height35, preferenceStyles.width35).class} />
                  {entry.label}
                </span>
                <DropdownControl
                  kind="select"
                  ariaLabel={entry.label}
                  icon={<Type class={stylex.attrs(preferenceStyles.height35, preferenceStyles.width35).class} />}
                  size="md"
                  class={stylex.attrs(preferenceStyles.widthFull).class}
                  value={normalizeThemeFontInput(entry.variable, resolvedThemeTokens()[entry.variable], resolvedThemeTokens()[entry.variable])}
                  options={getCustomThemeFontOptions(entry.variable)}
                  onChange={(value) => updateCustomThemeVariable(entry.variable, value)}
                />
              </div>
            )}
          </For>
        </div>
      </div>
    );
  }
