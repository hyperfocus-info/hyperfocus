import { expect, it, mock } from "bun:test";
import { submitOnEnter } from "./textarea-submit";

it("submitOnEnter submits on Enter and leaves Shift+Enter for newline", () => {
  const handler = mock(() => undefined);
  const submit = submitOnEnter(handler);
  const enter = new KeyboardEvent("keydown", { key: "Enter", cancelable: true });
  const shiftEnter = new KeyboardEvent("keydown", { key: "Enter", shiftKey: true, cancelable: true });

  submit(enter);
  submit(shiftEnter);

  expect(handler).toHaveBeenCalledTimes(1);
  expect(enter.defaultPrevented).toBe(true);
  expect(shiftEnter.defaultPrevented).toBe(false);
});
