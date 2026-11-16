import { afterEach, describe, expect, test } from "bun:test";
import { render } from "solid-js/web";
import { CheckboxField, FormField, FormGrid } from "./form";
import { Input } from "./input";

afterEach(() => document.body.replaceChildren());

describe("form primitives", () => {
  test("compose responsive labeled fields with consistent inputs and errors", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const dispose = render(() => (
      <FormGrid aria-label="Physics timing">
        <FormField label="Anticipation" description="Frames before contact" error="Must be positive">
          <Input aria-label="Anticipation frames" type="number" min="1" value="0" />
        </FormField>
        <CheckboxField label="Require contact" description="Stop delivery when contact misses the planned frame">
          <input aria-label="Require contact" type="checkbox" checked />
        </CheckboxField>
      </FormGrid>
    ), host);

    expect(host.querySelector('[data-test-form-grid]')?.getAttribute("aria-label")).toBe("Physics timing");
    const input = host.querySelector<HTMLInputElement>('[data-test-input]');
    expect(input?.getAttribute("type")).toBe("number");
    expect(input?.labels?.[0]?.hasAttribute("data-test-form-field")).toBe(true);
    expect(host.querySelector('[data-test-form-field] [role="alert"]')?.textContent).toBe("Must be positive");
    expect(host.querySelector('[data-test-checkbox-field] input')?.getAttribute("aria-label")).toBe("Require contact");
    dispose();
  });
});
