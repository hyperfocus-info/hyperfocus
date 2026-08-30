import { expect, test } from "bun:test";
import { definePadPilotModule } from "./module-ui-contract";
import { definePadPilotModuleManifest } from "./module-manifest";

test("definePadPilotModule preserves the framework-neutral UI definition", () => {
  const Component = () => "controller-notes";
  const definition = definePadPilotModule({
    Component,
    manifest: definePadPilotModuleManifest({
      capabilities: ["controller-input", "module-state"],
      id: "controller-notes",
      minHostVersion: "0.1.0",
      moduleApiVersion: "0.1.0",
      name: "Controller Notes",
      stateSchemaVersion: 1,
      uiEntry: "ui/ui-entry.js",
      version: "1.0.0",
    }),
  });

  expect(definition.Component).toBe(Component);
  expect(definition.manifest.id).toBe("controller-notes");
});
