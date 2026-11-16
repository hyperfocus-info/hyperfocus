import { test } from "bun:test";
import { RuleTester } from "eslint";
import { padPilotModuleRule } from "./rule";

test("Module lint rejects the first-open race, unbounded roots and broken Show callbacks", () => {
  const entry = "apps/pad-pilot/ui/src/modules/blend/blend-module.tsx";
  new RuleTester({ languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } } }).run("padpilot-module", padPilotModuleRule, {
    valid: [
      { filename: "ui/src/padpilot/mastering/service.ts", code: 'new Worker(url, { type: "module" });' },
      { filename: entry, code: "export function BlendModule() { return <PadPilot.ModuleWorkspace><Show when={ready}>{value => <p>{value()}</p>}</Show></PadPilot.ModuleWorkspace>; }" },
      'const syncFromHost = host => { setState("activeModuleId", host.selectedModuleId); };',
      'function choose(id) { moduleSdk.selectModule(id); }',
      { filename: "apps/pad-pilot/ui/src/modules/blend/blend-module.stylex.ts", code: 'stylex.create({root: {overflow: "hidden"}, list: {overflowY: "auto"}});' },
    ],
    invalid: [
      { filename: "ui/src/padpilot/mastering/service.ts", code: 'new Worker(url);', errors: [{ messageId: "worker" }] },
      { code: 'function choose(id) { setState("activeModuleId", id); moduleSdk.selectModule(id); }', errors: [{ messageId: "selection" }] },
      { code: 'setState({activeModuleId: id});', errors: [{ messageId: "selection" }] },
      { code: '<Show when={ready}>{() => <div/>}</Show>', errors: [{ messageId: "show" }] },
      { filename: entry, code: 'export function BlendModule() { return <section/>; }', errors: [{ messageId: "workspace" }] },
      { filename: "apps/pad-pilot/ui/src/modules/blend/blend-module.stylex.ts", code: 'stylex.create({root: {overflowY: {default: "hidden", "@media (max-width: 900px)": "auto"}}});', errors: [{ messageId: "rootScroll" }] },
    ],
  });
});
