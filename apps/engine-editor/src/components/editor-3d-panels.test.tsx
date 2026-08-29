import { afterEach, describe, expect, test } from "bun:test";
import { render } from "solid-js/web";
import { readEditor3DDeclaration } from "../editor-3d-authoring.ts";
import { createEditorStarter } from "../starter-projects.ts";
import { Editor3DHierarchy, Editor3DInspector, type Editor3DPanelsState } from "./editor-3d-panels.tsx";

afterEach(() => document.body.replaceChildren());

function state(overrides: Partial<Editor3DPanelsState> = {}): Editor3DPanelsState {
  const project = createEditorStarter("3d-action", "Components").project;
  return {
    declaration: readEditor3DDeclaration(project),
    activeKind: "object",
    activeEntityId: "actor",
    activeMaterialId: "actor",
    activeLightId: "sun",
    ...overrides,
  };
}

describe("editor 3D declaration panels", () => {
  test("renders objects, materials, lights, and shared action menus", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const dispose = render(() => <Editor3DHierarchy state={state()} />, host);

    expect(host.querySelector('[data-3d-entity="actor"]')?.classList.contains("is-active")).toBe(true);
    expect(host.querySelector('[data-3d-material="level"]')).not.toBeNull();
    expect(host.querySelector('[data-3d-light="sun"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="actor 3D object actions"]')).not.toBeNull();
    dispose();
  });

  test("renders typed object, material, light, and empty inspectors", () => {
    const host = document.createElement("div");
    document.body.append(host);
    let dispose = render(() => <Editor3DInspector state={state()} />, host);
    expect(host.querySelector<HTMLInputElement>('[data-3d-field="position.0"]')?.value).toBe("0");
    expect(host.querySelector<HTMLSelectElement>('[data-3d-field="physics.type"]')?.value).toBe("dynamic");
    dispose();

    host.replaceChildren();
    dispose = render(() => <Editor3DInspector state={state({ activeKind: "material" })} />, host);
    expect(host.querySelector<HTMLSelectElement>('[data-3d-field="selectedMaterial.shading"]')?.value).toBe("lit");
    dispose();

    host.replaceChildren();
    dispose = render(() => <Editor3DInspector state={state({ activeKind: "light" })} />, host);
    expect(host.querySelector<HTMLInputElement>('[data-3d-field="selectedLight.direction.0"]')?.value).toBe("-1");
    dispose();

    host.replaceChildren();
    dispose = render(() => <Editor3DInspector state={state({ declaration: undefined })} />, host);
    expect(host.textContent).toContain("NO 3D SCENE");
    dispose();
  });
});
