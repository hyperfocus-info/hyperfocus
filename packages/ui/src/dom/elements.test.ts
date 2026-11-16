import { afterEach, expect, test } from "bun:test";
import { requireButton, requireDomId, requireEventTarget, requireHtmlElement, requireInput } from "./elements";

afterEach(() => document.body.replaceChildren());

test("DOM ownership resolves actual nodes and rejects missing or wrong element types", () => {
  document.body.innerHTML = '<input id="amount"><button id="save">Save</button><div id="status"></div>';
  expect(requireInput("amount") === document.getElementById("amount")).toBe(true);
  expect(requireButton("save") === document.getElementById("save")).toBe(true);
  expect(requireHtmlElement("status") === document.getElementById("status")).toBe(true);
  expect(() => requireInput("save")).toThrow(TypeError);
  expect(() => requireButton("amount")).toThrow(TypeError);
  expect(() => requireHtmlElement("missing")).toThrow(TypeError);
});

test("duplicate IDs in independent document owners do not leak node identity", () => {
  const other = document.implementation.createHTMLDocument();
  document.body.innerHTML = '<button id="save">First</button>';
  other.body.innerHTML = '<button id="save">Second</button>';
  expect(requireButton("save").textContent).toBe("First");
  expect(requireDomId("save", HTMLButtonElement, other).textContent).toBe("Second");
  expect(requireButton("save", other)).not.toBe(requireButton("save"));
});

test("delegated event targets retain actual node ownership and reject unsupported targets", () => {
  document.body.innerHTML = '<input id="amount"><button id="save">Save</button>';
  const event = new Event("change", { bubbles: true });
  expect(() => requireEventTarget(event, HTMLInputElement)).toThrow(TypeError);
  const input = requireInput("amount");
  input.dispatchEvent(event);
  expect(requireEventTarget(event, HTMLInputElement)).toBe(input);
  requireButton("save").dispatchEvent(event);
  expect(() => requireEventTarget(event, HTMLInputElement)).toThrow(TypeError);
});
