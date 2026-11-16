import { describe, expect, test } from "bun:test";
import { ESLint, RuleTester } from "eslint";
import { runBunRuleTests } from "./bun-rule-tester";
import { foundationRule } from "./foundation";

describe("foundation lint catches the audited small text and adaptive foreground bypasses", () => {
  runBunRuleTests(new RuleTester({ languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } } }), "ui-foundation", foundationRule, {
    valid: [
      'const styles = { label: {fontSize: tokens.fontCaption}, action: {backgroundColor: tokens.accent, color: tokens.accentForeground} };',
      'const styles = {fontSize: "0.75rem", color: "white", backgroundColor: "#123456"};',
      'const styles = {fontSize: 12};',
      'const styles = {fontSize: "1em"};',
      'const styles = {backgroundColor: "var(--accent)", color: "var(--accent-foreground)"};',
      'const styles = {backgroundColor: tokens.selection, color: "inherit"};',
      'const styles = {font: "0.75rem/1.4 system-ui"};',
      'const styles = {fontSize: {default: tokens.fontControl, "@media (max-width: 400px)": "0.75rem"}};',
      'const styles = {backgroundColor: "var(--info)", color: "var(--info-foreground)"};',
      'const styles = {backgroundColor: tokens.accentStrong, color: tokens.accentForeground};',
      'const styles = {backgroundColor: {default: "#000", ":hover": tokens.accent}, color: {default: "white", ":hover": tokens.accentForeground}};',
      'const styles = {backgroundColor: {default: tokens.accent, ":hover": "#000"}, color: {default: tokens.accentForeground, ":hover": "white"}};',
    ],
    invalid: [
      { code: 'const styles = {fontSize: ".375rem"};', errors: [{ messageId: "typeFloor" }] },
      { code: 'const styles = {fontSize: "8.4px"};', errors: [{ messageId: "typeFloor" }] },
      { code: 'const styles = {fontSize: {default: tokens.fontControl, "@media (max-width: 400px)": ".6rem"}};', errors: [{ messageId: "typeFloor" }] },
      { code: '<span style={{fontSize: 9}}>Unavailable</span>', errors: [{ messageId: "typeFloor" }] },
      { code: 'const styles = {font: "600 0.72rem/1.4 system-ui"};', errors: [{ messageId: "typeFloor" }] },
      { code: 'const styles = {backgroundColor: "var(--accent)", color: "white"};', errors: [{ messageId: "foreground" }] },
      { code: 'const styles = {backgroundColor: tokens.accent, color: "#fff"};', errors: [{ messageId: "foreground" }] },
      { code: 'const styles = {backgroundColor: tokens.accent, color: {default: tokens.accentForeground, ":hover": "white"}};', errors: [{ messageId: "foreground" }] },
      { code: 'const styles = {backgroundColor: {default: tokens.danger, ":hover": "var(--danger-hover)"}, color: "rgb(255 255 255)"};', errors: [{ messageId: "foreground" }] },
      { code: 'const styles = {backgroundColor: "var(--success)", color: "white"};', errors: [{ messageId: "foreground" }] },
      { code: 'const styles = {backgroundColor: tokens.info, color: "#fff"};', errors: [{ messageId: "foreground" }] },
      { code: 'const styles = {backgroundColor: tokens.accentStrong, color: "white"};', errors: [{ messageId: "foreground" }] },
      { code: 'const styles = {backgroundColor: tokens.dangerStrong, color: "white"};', errors: [{ messageId: "foreground" }] },
      { code: 'const styles = {backgroundColor: tokens.warningStrong, color: "white"};', errors: [{ messageId: "foreground" }] },
      { code: 'const styles = {backgroundColor: tokens.infoStrong, color: "white"};', errors: [{ messageId: "foreground" }] },
      { code: 'const styles = {backgroundColor: tokens.successStrong, color: "white"};', errors: [{ messageId: "foreground" }] },
      { code: 'const styles = {backgroundColor: {default: "#000", ":hover": tokens.accent}, color: {default: "white", ":focus": tokens.accentForeground}};', errors: [{ messageId: "foreground" }] },
      { code: 'const styles = {backgroundColor: {default: tokens.accent}, color: {default: tokens.accentForeground, ":focus": "white"}};', errors: [{ messageId: "foreground" }] },
    ],
  });
});

test("repository lint enables foundation enforcement in shared and host control owners", async () => {
  const eslint = new ESLint();
  for (const filePath of ["packages/ui/src/primitives/button.tsx", "apps/pad-pilot/ui/src/components/elements/button.tsx", "apps/harness/ui/src/components/chat-panel.styles.ts"]) {
    const results = await eslint.lintText('export const regression = {fontSize: ".375rem", backgroundColor: "var(--accent)", color: "white"};', { filePath });
    expect(results.flatMap(result => result.messages.filter(message => message.ruleId === "hyperfocus/ui-foundation").map(message => message.messageId)).sort()).toEqual(["foreground", "typeFloor"]);
  }
});
