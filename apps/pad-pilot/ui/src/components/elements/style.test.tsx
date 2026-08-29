import { expect, it } from "bun:test";
import { render } from "@solidjs/testing-library";
import { createUiTest } from "../../../../utils/tests/test-harness";
import { Style, scopeCss } from "./style";
import { ModuleSurface } from "../../padpilot/provider";

createUiTest("Style", () => {
  it("prefixes selectors through the public scope helper", () => {
    expect(scopeCss(".button { color: red; }", "demo")).toContain('[data-pp-module-scope="demo"] .button');
  });

  it("injects scoped css into the active module container", () => {
    render(() => (
      <ModuleSurface scopeId="demo">
        <Style css=".button { color: red; }" />
        <button type="button" class="button">Demo</button>
      </ModuleSurface>
    ));

    const styleTag = document.querySelector('style[data-pp-style-scope="demo"]');
    expect(styleTag).not.toBeNull();
    expect(styleTag?.textContent).toContain('[data-pp-module-scope="demo"] .button');
  });
});
