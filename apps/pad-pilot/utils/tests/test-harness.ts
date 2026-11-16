import { afterEach, beforeAll, describe } from "bun:test";
import { cleanup } from "@solidjs/testing-library";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

declare global { var __padPilotHappyDomRegistered: boolean | undefined; }
const globalState = globalThis;

function ensureHappyDom() {
  if (globalState.__padPilotHappyDomRegistered) {
    return;
  }

  GlobalRegistrator.register();
  globalState.__padPilotHappyDomRegistered = true;
}

export const createUiTest = (componentName: string, suite: () => void) => {
  beforeAll(() => {
    ensureHappyDom();
  });

  describe(componentName, () => {
    afterEach(() => {
      cleanup();
    });

    suite();
  });
};
