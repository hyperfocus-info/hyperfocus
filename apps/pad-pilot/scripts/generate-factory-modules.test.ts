import { describe, expect, it } from "bun:test";
import {
  FACTORY_MODULE_HEADER_PATH,
  renderFactoryModuleHeader,
} from "./generate-factory-modules";

describe("factory Module native catalog generation", () => {
  it("keeps the tracked native catalog generated from the canonical TypeScript source", async () => {
    expect(await Bun.file(FACTORY_MODULE_HEADER_PATH).text()).toBe(renderFactoryModuleHeader());
  });
});
