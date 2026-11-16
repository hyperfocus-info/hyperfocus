import { createContext, useContext } from "solid-js";
const Editor3DHierarchyControls = createContext<{ state: Editor3DPanelsState }>();
const Editor3DInspectorControls = createContext<{ state: Editor3DPanelsState }>();
const MaterialInspectorControls = createContext<{ material: Material3D }>();
const LightInspectorControls = createContext<{ light: Light3D }>();
const ObjectInspectorControls = createContext<{ declaration: Hyperfocus3DDeclaration; scene: Scene3D; entity: Entity3D; activeLightId: string }>();
const PanelTitleControls = createContext<{ label: string; count: string }>();
const NumberFieldControls = createContext<{ label: string; field: string; value: number; min?: number; max?: number; step?: number; disabled?: boolean }>();
const VectorFieldControls = createContext<{ label: string; field: string; values: readonly number[]; min?: number }>();
import { title } from "./utils/editor-3d-panels-values";
import { SelectControl } from "@hyperfocus/ui";
import type { Hyperfocus3DDeclaration } from "@hyperfocus/engine/project/runtime-3d";
import { For, Match, Show, Switch } from "solid-js";
import { EditorActionMenu } from "./editor-action-menu.tsx";

export type Editor3DResourceKind = "object" | "material" | "light";

export type Editor3DPanelsState = Readonly<{
  declaration?: Hyperfocus3DDeclaration;
  activeKind: Editor3DResourceKind;
  activeEntityId: string;
  activeMaterialId: string;
  activeLightId: string;
}>;

type Scene3D = Hyperfocus3DDeclaration["scenes"][number];
type Entity3D = Scene3D["entities"][number];
type Material3D = Hyperfocus3DDeclaration["materials"][number];
type Light3D = Scene3D["lights"][number];

/** Solid owner for the 3D declaration hierarchy. The canvas renderer stays imperative. */
export function Editor3DHierarchy(props: { state: Editor3DPanelsState }) { return <Editor3DHierarchyControls.Provider value={props}><Editor3DHierarchyContent /></Editor3DHierarchyControls.Provider>; }
function Editor3DHierarchyContent() { const controls = useContext(Editor3DHierarchyControls); if (!controls) throw new Error("Missing Editor3DHierarchy controls");

  const declaration = () => controls.state.declaration;
  const scene = () => activeScene(declaration());

  return (
    <Show when={declaration() && scene()} fallback={<p class="empty-copy">This project has no experimental hyperfocus3D declaration.</p>}>
      <div class="scene3d-authoring-actions">
        <button type="button" data-editor-action="create-3d-object">+ Object</button>
        <button type="button" data-editor-action="create-3d-material">+ Material</button>
        <button type="button" data-editor-action="create-3d-light">+ Light</button>
      </div>

      <For each={scene()!.entities}>{(entity) => (
        <div class="scene3d-resource-row" data-context-resource="3d-object">
          <button
            type="button"
            classList={{ "is-active": controls.state.activeKind === "object" && entity.id === controls.state.activeEntityId }}
            data-3d-entity={entity.id}
          ><span>◇</span><strong>{entity.id}</strong><small>{entity.materialId}</small></button>
          <EditorActionMenu label={`${entity.id} 3D object actions`} items={[
            { label: "Duplicate", action: "duplicate-3d-object", data: { entityId: entity.id } },
            { label: "Delete", action: "delete-3d-object", data: { entityId: entity.id }, danger: true },
          ]} />
        </div>
      )}</For>

      <section class="scene3d-resource-group">
        <h3>Materials <span>{declaration()!.materials.length}</span></h3>
        <Show when={declaration()!.materials.length} fallback={<p class="empty-copy">No materials.</p>}>
          <For each={declaration()!.materials}>{(material) => {
            const uses = () => materialUsageCount(declaration()!, material.id);
            return (
              <div class="scene3d-resource-row" data-context-resource="3d-material">
                <button
                  type="button"
                  classList={{ "is-active": controls.state.activeKind === "material" && material.id === controls.state.activeMaterialId }}
                  data-3d-material={material.id}
                ><span>●</span><strong>{material.id}</strong><small>{uses()} use{uses() === 1 ? "" : "s"}</small></button>
                <EditorActionMenu label={`${material.id} 3D material actions`} items={[
                  { label: "Rename", action: "rename-3d-material", data: { materialId: material.id } },
                  { label: "Duplicate", action: "duplicate-3d-material", data: { materialId: material.id } },
                  { label: "Delete", action: "delete-3d-material", data: { materialId: material.id }, danger: true, disabled: uses() > 0 || declaration()!.materials.length <= 1 },
                ]} />
              </div>
            );
          }}</For>
        </Show>
      </section>

      <section class="scene3d-resource-group">
        <h3>Lights <span>{scene()!.lights.length}</span></h3>
        <Show when={scene()!.lights.length} fallback={<p class="empty-copy">No lights.</p>}>
          <For each={scene()!.lights}>{(light) => (
            <div class="scene3d-resource-row" data-context-resource="3d-light">
              <button
                type="button"
                classList={{ "is-active": controls.state.activeKind === "light" && light.id === controls.state.activeLightId }}
                data-3d-light={light.id}
              ><span>☀</span><strong>{light.id}</strong><small>{light.kind}</small></button>
              <EditorActionMenu label={`${light.id} 3D light actions`} items={[
                { label: "Rename", action: "rename-3d-light", data: { lightId: light.id } },
                { label: "Duplicate", action: "duplicate-3d-light", data: { lightId: light.id } },
                { label: "Delete", action: "delete-3d-light", data: { lightId: light.id }, danger: true },
              ]} />
            </div>
          )}</For>
        </Show>
      </section>
    </Show>
  );

}

/** Solid owner for object, material, and light declaration fields. */
export function Editor3DInspector(props: { state: Editor3DPanelsState }) { return <Editor3DInspectorControls.Provider value={props}><Editor3DInspectorContent /></Editor3DInspectorControls.Provider>; }
function Editor3DInspectorContent() { const controls = useContext(Editor3DInspectorControls); if (!controls) throw new Error("Missing Editor3DInspector controls");

  const declaration = () => controls.state.declaration;
  const scene = () => activeScene(declaration());
  const entity = () => scene()?.entities.find((candidate) => candidate.id === controls.state.activeEntityId);
  const material = () => declaration()?.materials.find((candidate) => candidate.id === controls.state.activeMaterialId);
  const light = () => scene()?.lights.find((candidate) => candidate.id === controls.state.activeLightId);
  const objectSelection = () => {
    const selectedDeclaration = declaration();
    const selectedScene = scene();
    const selectedEntity = entity();
    return selectedDeclaration && selectedScene && selectedEntity
      ? { declaration: selectedDeclaration, scene: selectedScene, entity: selectedEntity }
      : undefined;
  };

  return (
    <Switch>
      <Match when={!declaration() || !scene()}>
        <PanelTitle label="Inspector" count="NO 3D SCENE" />
        <div class="friendly-hint"><strong>Create or open a 3D project</strong><span>Edit uses lightweight authoring proxies; Play and Build use the real portable runtime with imported assets, lighting, physics, controllers, and the authored camera.</span></div>
      </Match>
      <Match when={controls.state.activeKind === "material" ? material() : undefined}>
        {(selected) => <MaterialInspector material={selected()} />}
      </Match>
      <Match when={controls.state.activeKind === "light" ? light() : undefined}>
        {(selected) => <LightInspector light={selected()} />}
      </Match>
      <Match when={objectSelection()}>
        {(selected) => <ObjectInspector declaration={selected().declaration} scene={selected().scene} entity={selected().entity} activeLightId={controls.state.activeLightId} />}
      </Match>
      <Match when={true}>
        <PanelTitle label="Inspector" count="NOTHING SELECTED" />
        <p class="empty-copy">Select a 3D declaration to inspect it.</p>
      </Match>
    </Switch>
  );

}

function MaterialInspector(props: { material: Material3D }) { return <MaterialInspectorControls.Provider value={props}><MaterialInspectorContent /></MaterialInspectorControls.Provider>; }
function MaterialInspectorContent() { const controls = useContext(MaterialInspectorControls); if (!controls) throw new Error("Missing MaterialInspector controls");

  return <>
    <PanelTitle label="Material" count={controls.material.id} />
    <div class="inspector-form">
      <label>Shading<SelectControl ariaLabel="Material shading" value={controls.material.shading} options={["lit", "unlit"].map(value => ({ value, label: title(value) }))} dataAttributes={{ "data-3d-field": "selectedMaterial.shading" }} changeEventValue="requested" onChange={() => {}} /></label>
      <NumberField label="Metallic" field="selectedMaterial.metallic" value={controls.material.metallic} min={0} max={1} step={0.05} />
      <NumberField label="Roughness" field="selectedMaterial.roughness" value={controls.material.roughness} min={0} max={1} step={0.05} />
      <label>Double sided<input type="checkbox" data-3d-field="selectedMaterial.doubleSided" checked={controls.material.doubleSided} /></label>
      <div class="friendly-hint"><strong>Portable material</strong><span>Changes affect every object that references this material.</span></div>
    </div>
  </>;

}

function LightInspector(props: { light: Light3D }) { return <LightInspectorControls.Provider value={props}><LightInspectorContent /></LightInspectorControls.Provider>; }
function LightInspectorContent() { const controls = useContext(LightInspectorControls); if (!controls) throw new Error("Missing LightInspector controls");

  return <>
    <PanelTitle label="Light" count={controls.light.id} />
    <div class="inspector-form">
      <label>Kind<SelectControl ariaLabel="Light kind" value={controls.light.kind} options={["ambient", "directional", "point", "spot"].map(value => ({ value, label: title(value) }))} dataAttributes={{ "data-3d-field": "selectedLight.kind" }} changeEventValue="requested" onChange={() => {}} /></label>
      <NumberField label="Intensity" field="selectedLight.intensity" value={controls.light.intensity} min={0} step={0.1} />
      <Show when={controls.light.position}>{(position) => <VectorField label="Light position" field="selectedLight.position" values={position()} />}</Show>
      <Show when={controls.light.direction}>{(direction) => <VectorField label="Light direction" field="selectedLight.direction" values={direction()} />}</Show>
      <Show when={controls.light.range !== undefined}><NumberField label="Range" field="selectedLight.range" value={controls.light.range!} min={0.01} step={0.1} /></Show>
      <div class="friendly-hint"><strong>Portable {controls.light.kind} light</strong><span>This inspector edits the selected light.</span></div>
    </div>
  </>;

}

function ObjectInspector(props: { declaration: Hyperfocus3DDeclaration; scene: Scene3D; entity: Entity3D; activeLightId: string }) { return <ObjectInspectorControls.Provider value={props}><ObjectInspectorContent /></ObjectInspectorControls.Provider>; }
function ObjectInspectorContent() { const controls = useContext(ObjectInspectorControls); if (!controls) throw new Error("Missing ObjectInspector controls");

  const material = () => controls.declaration.materials.find((candidate) => candidate.id === controls.entity.materialId);
  const light = () => controls.scene.lights.find((candidate) => candidate.id === controls.activeLightId);
  return <>
    <PanelTitle label="Inspector" count={controls.entity.id} />
    <div class="inspector-form">
      <VectorField label="Position" field="position" values={controls.entity.position} />
      <NumberField label="Rotation Y" field="rotationY" value={controls.entity.rotationY} step={0.1} />
      <VectorField label="Scale" field="scale" values={controls.entity.scale} min={0.01} />
      <label>Mesh<SelectControl ariaLabel="Mesh" value={controls.entity.meshId} options={controls.declaration.meshes.map(mesh => ({ value: mesh.id, label: mesh.id }))} dataAttributes={{ "data-3d-field": "meshId" }} changeEventValue="requested" onChange={() => {}} /></label>
      <label>Material<SelectControl ariaLabel="Material" value={controls.entity.materialId} options={controls.declaration.materials.map(item => ({ value: item.id, label: item.id }))} dataAttributes={{ "data-3d-field": "materialId" }} changeEventValue="requested" onChange={() => {}} /></label>
      <fieldset><legend>Physics</legend>
        <label>Body type<SelectControl ariaLabel="Body type" value={controls.entity.physics?.type ?? "none"} options={["none", "static", "dynamic"].map(value => ({ value, label: title(value) }))} dataAttributes={{ "data-3d-field": "physics.type" }} changeEventValue="requested" onChange={() => {}} /></label>
        <label>Shape<SelectControl ariaLabel="Physics shape" value={controls.entity.physics?.shape ?? "box"} options={["box", "sphere"].map(value => ({ value, label: title(value) }))} dataAttributes={{ "data-3d-field": "physics.shape" }} changeEventValue="requested" onChange={() => {}} disabled={!controls.entity.physics} /></label>
        <NumberField label="Gravity scale" field="physics.gravityScale" value={controls.entity.physics?.gravityScale ?? 1} min={0} step={0.1} disabled={!controls.entity.physics} />
      </fieldset>
      <Show when={material()}>{(selected) => <fieldset><legend>Material · {selected().id}</legend>
        <label>Shading<SelectControl ariaLabel="Object material shading" value={selected().shading} options={["lit", "unlit"].map(value => ({ value, label: title(value) }))} dataAttributes={{ "data-3d-field": "material.shading" }} changeEventValue="requested" onChange={() => {}} /></label>
        <NumberField label="Metallic" field="material.metallic" value={selected().metallic} min={0} max={1} step={0.05} />
        <NumberField label="Roughness" field="material.roughness" value={selected().roughness} min={0} max={1} step={0.05} />
      </fieldset>}</Show>
      <details class="scene3d-scene-settings"><summary>Camera &amp; lights</summary>
        <NumberField label="Field of view (radians)" field="camera.fovYRadians" value={controls.scene.camera.fovYRadians} min={0.01} max={3.13} step={0.01} />
        <NumberField label="Near plane" field="camera.near" value={controls.scene.camera.near} min={0.0001} step={0.01} />
        <NumberField label="Far plane" field="camera.far" value={controls.scene.camera.far} min={0.001} step={1} />
        <Show when={light()} fallback={<p class="empty-copy">No lights. Add one from the object toolbar.</p>}>
          {(selected) => <NumberField label={`${selected().id} intensity`} field={`light.${selected().id}.intensity`} value={selected().intensity} min={0} step={0.1} />}
        </Show>
      </details>
      <div class="friendly-hint"><strong>{controls.entity.controller ? "Playable controller attached" : controls.entity.physics ? `${controls.entity.physics.type} ${controls.entity.physics.shape} physics` : "Visual object"}</strong><span>Object, material, physics, camera, and light edits update portable 3D project data.</span></div>
    </div>
  </>;

}

function PanelTitle(props: { label: string; count: string }) { return <PanelTitleControls.Provider value={props}><PanelTitleContent /></PanelTitleControls.Provider>; }
function PanelTitleContent() { const controls = useContext(PanelTitleControls); if (!controls) throw new Error("Missing PanelTitle controls");

  return <div class="panel-title"><span>{controls.label}</span><span class="panel-count">{controls.count}</span></div>;

}

function NumberField(props: { label: string; field: string; value: number; min?: number; max?: number; step?: number; disabled?: boolean }) { return <NumberFieldControls.Provider value={props}><NumberFieldContent /></NumberFieldControls.Provider>; }
function NumberFieldContent() { const controls = useContext(NumberFieldControls); if (!controls) throw new Error("Missing NumberField controls");

  return <label>{controls.label}<input type="number" data-3d-field={controls.field} value={controls.value} min={controls.min} max={controls.max} step={controls.step} disabled={controls.disabled} /></label>;

}

function VectorField(props: { label: string; field: string; values: readonly number[]; min?: number }) { return <VectorFieldControls.Provider value={props}><VectorFieldContent /></VectorFieldControls.Provider>; }
function VectorFieldContent() { const controls = useContext(VectorFieldControls); if (!controls) throw new Error("Missing VectorField controls");

  return <label>{controls.label}<div class="vector-fields"><For each={controls.values}>{(value, index) => (
    <input type="number" step="0.1" min={controls.min} aria-label={`${controls.label} ${"XYZ"[index()]}`} data-3d-field={`${controls.field}.${index()}`} value={value} />
  )}</For></div></label>;

}

function activeScene(declaration?: Hyperfocus3DDeclaration) {
  return declaration?.scenes.find((candidate) => candidate.id === declaration.activeSceneId) ?? declaration?.scenes[0];
}

function materialUsageCount(declaration: Hyperfocus3DDeclaration, materialId: string) {
  return declaration.scenes.reduce((total, scene) => total + scene.entities.filter((entity) => entity.materialId === materialId).length, 0);
}
