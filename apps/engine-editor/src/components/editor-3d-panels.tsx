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
export function Editor3DHierarchy(props: { state: Editor3DPanelsState }) {
  const declaration = () => props.state.declaration;
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
            classList={{ "is-active": props.state.activeKind === "object" && entity.id === props.state.activeEntityId }}
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
                  classList={{ "is-active": props.state.activeKind === "material" && material.id === props.state.activeMaterialId }}
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
                classList={{ "is-active": props.state.activeKind === "light" && light.id === props.state.activeLightId }}
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
export function Editor3DInspector(props: { state: Editor3DPanelsState }) {
  const declaration = () => props.state.declaration;
  const scene = () => activeScene(declaration());
  const entity = () => scene()?.entities.find((candidate) => candidate.id === props.state.activeEntityId);
  const material = () => declaration()?.materials.find((candidate) => candidate.id === props.state.activeMaterialId);
  const light = () => scene()?.lights.find((candidate) => candidate.id === props.state.activeLightId);
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
      <Match when={props.state.activeKind === "material" ? material() : undefined}>
        {(selected) => <MaterialInspector material={selected()} />}
      </Match>
      <Match when={props.state.activeKind === "light" ? light() : undefined}>
        {(selected) => <LightInspector light={selected()} />}
      </Match>
      <Match when={objectSelection()}>
        {(selected) => <ObjectInspector declaration={selected().declaration} scene={selected().scene} entity={selected().entity} activeLightId={props.state.activeLightId} />}
      </Match>
      <Match when={true}>
        <PanelTitle label="Inspector" count="NOTHING SELECTED" />
        <p class="empty-copy">Select a 3D declaration to inspect it.</p>
      </Match>
    </Switch>
  );
}

function MaterialInspector(props: { material: Material3D }) {
  return <>
    <PanelTitle label="Material" count={props.material.id} />
    <div class="inspector-form">
      <label>Shading<select data-3d-field="selectedMaterial.shading" value={props.material.shading}><option value="lit">Lit</option><option value="unlit">Unlit</option></select></label>
      <NumberField label="Metallic" field="selectedMaterial.metallic" value={props.material.metallic} min={0} max={1} step={0.05} />
      <NumberField label="Roughness" field="selectedMaterial.roughness" value={props.material.roughness} min={0} max={1} step={0.05} />
      <label>Double sided<input type="checkbox" data-3d-field="selectedMaterial.doubleSided" checked={props.material.doubleSided} /></label>
      <div class="friendly-hint"><strong>Portable material</strong><span>Changes affect every object that references this material.</span></div>
    </div>
  </>;
}

function LightInspector(props: { light: Light3D }) {
  return <>
    <PanelTitle label="Light" count={props.light.id} />
    <div class="inspector-form">
      <label>Kind<select data-3d-field="selectedLight.kind" value={props.light.kind}>
        <For each={["ambient", "directional", "point", "spot"] as const}>{(kind) => <option value={kind}>{title(kind)}</option>}</For>
      </select></label>
      <NumberField label="Intensity" field="selectedLight.intensity" value={props.light.intensity} min={0} step={0.1} />
      <Show when={props.light.position}>{(position) => <VectorField label="Light position" field="selectedLight.position" values={position()} />}</Show>
      <Show when={props.light.direction}>{(direction) => <VectorField label="Light direction" field="selectedLight.direction" values={direction()} />}</Show>
      <Show when={props.light.range !== undefined}><NumberField label="Range" field="selectedLight.range" value={props.light.range!} min={0.01} step={0.1} /></Show>
      <div class="friendly-hint"><strong>Portable {props.light.kind} light</strong><span>This inspector edits the selected light.</span></div>
    </div>
  </>;
}

function ObjectInspector(props: { declaration: Hyperfocus3DDeclaration; scene: Scene3D; entity: Entity3D; activeLightId: string }) {
  const material = () => props.declaration.materials.find((candidate) => candidate.id === props.entity.materialId);
  const light = () => props.scene.lights.find((candidate) => candidate.id === props.activeLightId);
  return <>
    <PanelTitle label="Inspector" count={props.entity.id} />
    <div class="inspector-form">
      <VectorField label="Position" field="position" values={props.entity.position} />
      <NumberField label="Rotation Y" field="rotationY" value={props.entity.rotationY} step={0.1} />
      <VectorField label="Scale" field="scale" values={props.entity.scale} min={0.01} />
      <label>Mesh<select data-3d-field="meshId" value={props.entity.meshId}><For each={props.declaration.meshes}>{(mesh) => <option value={mesh.id}>{mesh.id}</option>}</For></select></label>
      <label>Material<select data-3d-field="materialId" value={props.entity.materialId}><For each={props.declaration.materials}>{(item) => <option value={item.id}>{item.id}</option>}</For></select></label>
      <fieldset><legend>Physics</legend>
        <label>Body type<select data-3d-field="physics.type" value={props.entity.physics?.type ?? "none"}><option value="none">None</option><option value="static">Static</option><option value="dynamic">Dynamic</option></select></label>
        <label>Shape<select data-3d-field="physics.shape" value={props.entity.physics?.shape ?? "box"} disabled={!props.entity.physics}><option value="box">Box</option><option value="sphere">Sphere</option></select></label>
        <NumberField label="Gravity scale" field="physics.gravityScale" value={props.entity.physics?.gravityScale ?? 1} min={0} step={0.1} disabled={!props.entity.physics} />
      </fieldset>
      <Show when={material()}>{(selected) => <fieldset><legend>Material · {selected().id}</legend>
        <label>Shading<select data-3d-field="material.shading" value={selected().shading}><option value="lit">Lit</option><option value="unlit">Unlit</option></select></label>
        <NumberField label="Metallic" field="material.metallic" value={selected().metallic} min={0} max={1} step={0.05} />
        <NumberField label="Roughness" field="material.roughness" value={selected().roughness} min={0} max={1} step={0.05} />
      </fieldset>}</Show>
      <details class="scene3d-scene-settings"><summary>Camera &amp; lights</summary>
        <NumberField label="Field of view (radians)" field="camera.fovYRadians" value={props.scene.camera.fovYRadians} min={0.01} max={3.13} step={0.01} />
        <NumberField label="Near plane" field="camera.near" value={props.scene.camera.near} min={0.0001} step={0.01} />
        <NumberField label="Far plane" field="camera.far" value={props.scene.camera.far} min={0.001} step={1} />
        <Show when={light()} fallback={<p class="empty-copy">No lights. Add one from the object toolbar.</p>}>
          {(selected) => <NumberField label={`${selected().id} intensity`} field={`light.${selected().id}.intensity`} value={selected().intensity} min={0} step={0.1} />}
        </Show>
      </details>
      <div class="friendly-hint"><strong>{props.entity.controller ? "Playable controller attached" : props.entity.physics ? `${props.entity.physics.type} ${props.entity.physics.shape} physics` : "Visual object"}</strong><span>Object, material, physics, camera, and light edits update portable 3D project data.</span></div>
    </div>
  </>;
}

function PanelTitle(props: { label: string; count: string }) {
  return <div class="panel-title"><span>{props.label}</span><span class="panel-count">{props.count}</span></div>;
}

function NumberField(props: { label: string; field: string; value: number; min?: number; max?: number; step?: number; disabled?: boolean }) {
  return <label>{props.label}<input type="number" data-3d-field={props.field} value={props.value} min={props.min} max={props.max} step={props.step} disabled={props.disabled} /></label>;
}

function VectorField(props: { label: string; field: string; values: readonly number[]; min?: number }) {
  return <label>{props.label}<div class="vector-fields"><For each={props.values}>{(value, index) => (
    <input type="number" step="0.1" min={props.min} aria-label={`${props.label} ${"XYZ"[index()]}`} data-3d-field={`${props.field}.${index()}`} value={value} />
  )}</For></div></label>;
}

function activeScene(declaration?: Hyperfocus3DDeclaration) {
  return declaration?.scenes.find((candidate) => candidate.id === declaration.activeSceneId) ?? declaration?.scenes[0];
}

function materialUsageCount(declaration: Hyperfocus3DDeclaration, materialId: string) {
  return declaration.scenes.reduce((total, scene) => total + scene.entities.filter((entity) => entity.materialId === materialId).length, 0);
}

function title(value: string) {
  return value.slice(0, 1).toUpperCase() + value.slice(1).replace(/[-_]/g, " ");
}
