import { describe, expect, test } from "bun:test";
import {
  BUILT_IN_THEMES,
  DEFAULT_THEME_PREFERENCE,
  THEME_CSS_VARIABLES,
  createDefaultCustomTheme,
  getCustomThemeFontOptions,
  getContrastRatio,
  normalizeThemeColorInput,
  normalizeThemeFontInput,
  normalizeThemePreference,
  resolveThemeTokens,
  validateThemeContrast,
  withCustomThemeToken
} from "./theme-model";
import { blendHexColors } from "./theme-colors";

describe("theme model", () => {
  test("defines seven complete built-in themes with contrast-safe light and dark tokens", () => {
    expect(BUILT_IN_THEMES).toHaveLength(7);

    for (const theme of BUILT_IN_THEMES) {
      expect(theme.fonts.ui.length).toBeGreaterThan(0);
      expect(theme.fonts.display.length).toBeGreaterThan(0);
      expect(theme.fonts.mono.length).toBeGreaterThan(0);
      for (const mode of ["light", "dark"] as const) {
        for (const variable of THEME_CSS_VARIABLES) {
          expect(theme[mode][variable], `${theme.id} ${mode} ${variable}`).toBeTruthy();
        }
        expect(theme[mode]["--body-background"]).toMatch(/^#[0-9a-f]{6}$/);
        expect(theme[mode]["--app-background-grid"]).toBe("none");
        expect(validateThemeContrast(theme[mode]), `${theme.id} ${mode}`).toEqual([]);
      }
    }
  });

  test("repairs invalid stored preferences to the default", () => {
    expect(normalizeThemePreference({ themeId: "missing", mode: "sepia" })).toEqual(DEFAULT_THEME_PREFERENCE);
  });

  test("merges custom theme tokens from a base preset", () => {
    const preference = withCustomThemeToken(
      {
        themeId: "custom",
        mode: "light",
        custom: createDefaultCustomTheme("github")
      },
      "light",
      "--accent",
      "#123456"
    );
    const tokens = resolveThemeTokens(preference);

    expect(tokens["--accent"]).toBe("#123456");
    expect(tokens["--foreground"]).toBe(resolveThemeTokens({ themeId: "github", mode: "light" })["--foreground"]);
  });

  test("keeps button labels, hover labels, muted text and status chips readable", () => {
    for (const theme of BUILT_IN_THEMES) {
      for (const mode of ["light", "dark"] as const) {
        const tokens = theme[mode];
        for (const tone of ["accent", "warning", "danger"] as const) {
          for (const state of ["", "-strong"] as const) {
            expect(getContrastRatio(tokens[`--${tone}-foreground`], tokens[`--${tone}${state}`]), `${theme.id} ${mode} ${tone}${state}`).toBeGreaterThanOrEqual(4.5);
          }
        }
        for (const surface of ["--bg", "--panel", "--panel-strong", "--row"] as const) {
          expect(getContrastRatio(tokens["--muted"], tokens[surface]), `${theme.id} ${mode} muted ${surface}`).toBeGreaterThanOrEqual(4.5);
        }
        for (const [tone, mix] of [["success", 0.13], ["warning", 0.14], ["danger", 0.12], ["info", 0.12], ["accent", 0.14]] as const) {
          const background = blendHexColors(tokens["--panel-strong"], tokens[`--${tone}`], mix);
          expect(getContrastRatio(tokens[`--${tone}-strong`], background), `${theme.id} ${mode} ${tone} chip`).toBeGreaterThanOrEqual(4.5);
        }
        const sharedDangerHover = blendHexColors(tokens["--danger"], tokens["--foreground"], 0.12);
        expect(getContrastRatio(tokens["--danger-foreground"], sharedDangerHover), `${theme.id} ${mode} shared danger hover`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  test("keeps semantic roles protected from custom overrides without freezing dark-mode shades", () => {
    const tokens = resolveThemeTokens({
      themeId: "custom",
      mode: "light",
      custom: {
        baseThemeId: "github",
        light: {
          "--danger": "#000000"
        }
      }
    });
    expect(tokens["--danger"]).toBe(resolveThemeTokens({ themeId: "github", mode: "light" })["--danger"]);
    expect(resolveThemeTokens({ themeId: "github", mode: "dark" })["--danger"]).not.toBe(tokens["--danger"]);
  });

  test("rejects the audited normal-text, hover, muted and status contrast failures", () => {
    const tokens = resolveThemeTokens({ themeId: "harness", mode: "dark" });
    const whiteOnTeal = validateThemeContrast({ ...tokens, "--accent-foreground": "#ffffff", "--accent": "#2dd4bf" });
    expect(whiteOnTeal.some(issue => issue.label === "Accent controls" && issue.minimum === 4.5)).toBe(true);
    const hover = validateThemeContrast({ ...tokens, "--accent-strong": tokens["--accent-foreground"] });
    expect(hover.some(issue => issue.label === "Hovered accent controls")).toBe(true);
    const muted = validateThemeContrast({ ...tokens, "--muted": tokens["--panel"] });
    expect(muted.some(issue => issue.foreground === "--muted" && issue.background === "--panel")).toBe(true);
    const status = validateThemeContrast({ ...tokens, "--success": "#047857", "--success-strong": "#166534" });
    expect(status.some(issue => issue.label === "success status chip")).toBe(true);
  });

  test("preserves custom color input and reports an unreadable override for recovery", () => {
    const tokens = resolveThemeTokens({ themeId: "custom", mode: "light", custom: {
      baseThemeId: "github", light: { "--muted": "#ffffff" }
    } });
    expect(tokens["--muted"]).toBe("#ffffff");
    expect(validateThemeContrast(tokens).some(issue => issue.foreground === "--muted")).toBe(true);
  });

  test("repairs custom font tokens to selectable dropdown values", () => {
    const uiOption = getCustomThemeFontOptions("--font-ui")[2];
    expect(normalizeThemeFontInput("--font-ui", "missing font", uiOption.value)).toBe(uiOption.value);

    const tokens = resolveThemeTokens({
      themeId: "custom",
      mode: "light",
      custom: {
        baseThemeId: "graphite",
        light: {
          "--font-ui": uiOption.value
        }
      }
    });
    expect(tokens["--font-ui"]).toBe(uiOption.value);
  });

  test("normalizes color input and measures WCAG contrast", () => {
    expect(normalizeThemeColorInput("abc", "#000000")).toBe("#aabbcc");
    expect(normalizeThemeColorInput("not-a-color", "#123456")).toBe("#123456");
    expect(getContrastRatio("#000000", "#ffffff")).toBeGreaterThan(20);
  });
});
