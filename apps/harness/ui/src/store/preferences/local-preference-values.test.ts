import { expect, test } from "bun:test";
import { clampPanelSize, parseBooleanStorageValue, parseBoundedDecimalStorageValue, parseBoundedIntegerStorageValue } from "./local-preference-values";

test("stored booleans accept only literal true and false text", () => {
  expect(parseBooleanStorageValue("true")).toBe(true);
  expect(parseBooleanStorageValue("false")).toBe(false);
  for (const value of [null, "", "TRUE", "1", " true "]) expect(parseBooleanStorageValue(value)).toBeUndefined();
});

test("panel preferences keep finite fallback and size bounds", () => {
  for (const value of [null, undefined, "2", NaN, Infinity, -Infinity]) {
    expect(clampPanelSize(value, 2)).toBe(2);
  }
  expect(clampPanelSize(0.1, 2)).toBe(0.75);
  expect(clampPanelSize(99, 2)).toBe(5);
  expect(clampPanelSize(3, 2)).toBe(3);
});

test("stored integer preferences retain legacy prefix parsing and lower-winning bounds", () => {
  for (const value of [null, "", " ", "NaN", "Infinity"]) {
    expect(parseBoundedIntegerStorageValue(value, 1, 10)).toBeUndefined();
  }
  expect(parseBoundedIntegerStorageValue("12.7 seconds", 1, 10)).toBe(10);
  expect(parseBoundedIntegerStorageValue("1e3", 1, 10)).toBe(1);
  expect(parseBoundedIntegerStorageValue("5", 10, 0)).toBe(10);
});

test("stored decimal preferences preserve exponent parsing and JavaScript negative ties", () => {
  expect(parseBoundedDecimalStorageValue("", -10, 10, 0.5)).toBeUndefined();
  expect(parseBoundedDecimalStorageValue("Infinity", -10, 10, 0.5)).toBeUndefined();
  expect(parseBoundedDecimalStorageValue("-1.25 seconds", -10, 10, 0.5)).toBe(-1);
  expect(parseBoundedDecimalStorageValue("1e3", -10, 10, 0.5)).toBe(10);
  expect(parseBoundedDecimalStorageValue("5", 10, 0, 0.5)).toBe(10);
});
