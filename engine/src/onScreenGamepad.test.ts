import { expect, test } from "bun:test";
import { createKeyboardState } from "./input/keyboard.ts";
import { createOnScreenGamepad } from "./onScreenGamepad.ts";

function createElement(tagName: string) {
  const listeners = new Map<string, Set<(event: any) => void>>();
  const element: any = {
    tagName: tagName.toUpperCase(),
    children: [] as any[],
    dataset: {},
    className: "",
    hidden: false,
    textContent: "",
    classList: {
      add(name: string) {
        element.className = `${element.className} ${name}`.trim();
      },
      remove(name: string) {
        element.className = element.className
          .split(/\s+/)
          .filter((item: string) => item && item !== name)
          .join(" ");
      }
    },
    setAttribute() {},
    appendChild(child: any) {
      child.parentNode = element;
      element.children.push(child);
      return child;
    },
    append(...children: any[]) {
      for (const child of children) element.appendChild(child);
    },
    remove() {
      if (!element.parentNode) return;
      element.parentNode.children = element.parentNode.children.filter((child: any) => child !== element);
    },
    addEventListener(type: string, handler: (event: any) => void) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)?.add(handler);
    },
    removeEventListener(type: string, handler: (event: any) => void) {
      listeners.get(type)?.delete(handler);
    },
    dispatch(type: string, event: any) {
      for (const handler of listeners.get(type) ?? []) handler(event);
    },
    setPointerCapture() {},
    removePointerCapture() {}
  };
  return element;
}

test("on screen gamepad writes to a scoped input target and cleans up", () => {
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  const input = createKeyboardState({ ArrowLeft: "left", Space: "jump" });
  const body = createElement("body");
  const head = createElement("head");
  const buttons: any[] = [];
  const documentStub: any = {
    head,
    body,
    createElement(tagName: string) {
      const element = createElement(tagName);
      if (tagName === "button") buttons.push(element);
      return element;
    }
  };

  globalThis.document = documentStub;
  globalThis.window = globalThis.window ?? ({} as any);

  try {
    const gamepad = createOnScreenGamepad({ input, visible: false });
    const leftButton = buttons.find((button) => button.dataset.code === "ArrowLeft");
    expect(leftButton).toBeTruthy();

    leftButton.dispatch("pointerdown", { pointerId: 1, preventDefault() {} });
    expect(input.down("left")).toBe(true);
    expect(input.pressed("left")).toBe(true);

    leftButton.dispatch("pointerup", { pointerId: 1, preventDefault() {} });
    expect(input.down("left")).toBe(false);
    expect(input.released("left")).toBe(true);

    leftButton.dispatch("pointerdown", { pointerId: 2, preventDefault() {} });
    gamepad.hide();
    expect(input.down("left")).toBe(false);

    gamepad.show();
    leftButton.dispatch("pointerdown", { pointerId: 3, preventDefault() {} });
    gamepad.destroy();
    expect(input.down("left")).toBe(false);
    expect(body.children.length).toBe(0);
  } finally {
    input.dispose();
    globalThis.document = previousDocument;
    globalThis.window = previousWindow;
  }
});
