import { createContext, useContext } from "solid-js";
const SelectionInspectorControls = createContext<SelectionInspectorProps>();
const AssetInspectorControls = createContext<{ project: EditorProject; asset: EditorAsset; audition?: EditorAudioAuditionState }>();
const EntityInspectorControls = createContext<{ project: EditorProject; entity: EditorEntityData }>();
const ComponentCardControls = createContext<{ project: EditorProject; component: EditorComponent }>();
const SpecializedComponentFieldsControls = createContext<{ project: EditorProject; component: EditorComponent }>();
const ComponentSelectFieldControls = createContext<{ componentId: string; field: EditorComponentSelectField }>();
const AudioComponentFieldsControls = createContext<{ project: EditorProject; component: EditorComponent }>();
const BehaviorComponentCardControls = createContext<{ project: EditorProject; component: EditorComponent; actions: readonly InspectorAction[] }>();
const BehaviorFieldControls = createContext<{ project: EditorProject; componentId: string; field: PlayableBehaviorField2D; value: string | number | boolean }>();
const ComponentValueFieldControls = createContext<{ componentId: string; fieldKey: string; value: string | number | boolean }>();
const SelectValueFieldControls = createContext<{ componentId: string; fieldKey: string; label: string; description?: string; value: string; options: readonly { value: string; label: string }[] }>();
const NumberValueFieldControls = createContext<{ componentId: string; fieldKey: string; label: string; value: number; minimum?: number; maximum?: number; step?: number }>();
const BooleanValueFieldControls = createContext<{ componentId: string; fieldKey: string; label: string; value: boolean }>();
const EntityTextFieldControls = createContext<{ label: string; property: string; value: string }>();
const EntityNumberFieldControls = createContext<{ label: string; detail?: string; property: string; value: number; minimum?: number; maximum?: number; step?: number }>();
const AddComponentFormControls = createContext<{ components: readonly EditorComponent[] }>();
const ActionButtonControls = createContext<{ label: string; ariaLabel?: string; action: string; data?: Readonly<Record<string, string>>; disabled?: boolean; compact?: boolean }>();
const MetadataControls = createContext<{ label: string; value: string }>();
const LocalInspectorSelectControls = createContext<{ label: string; data: Readonly<Record<string, string>>; options: readonly { value: string; label: string; tags?: string[] }[] }>();
import { formatBytes } from "./utils/selection-inspector-values";
import { SelectControl } from "@hyperfocus/ui";
import { createSignal } from "solid-js";
import { Button, EmptyState, PanelHeader, PanelSection, PanelSurface } from "@hyperfocus/ui";
import {
  BUILTIN_PLAYABLE_BEHAVIOR_DEFINITIONS_2D,
  playableBehaviorDefinition2D,
  type PlayableBehaviorDefinition2D,
  type PlayableBehaviorField2D,
} from "@hyperfocus/engine/project/runtime-2d";
import { For, Match, Show, Switch } from "solid-js";
import { findEditorAssetUsages } from "../editor-asset-model.ts";
import {
  describeEditorField,
  editorComponentSelectFields,
  editorFieldLabel,
  groupBehaviorFields,
  type EditorComponentSelectField,
} from "../editor-field-presentation.ts";
import { readEditorBehaviorDefinitions } from "../editor-script-model.ts";
import type { EditorAsset, EditorComponent, EditorEntityData, EditorProject } from "@hyperfocus/engine/project";
import { EditorActionMenu, type EditorActionItem, editorDataAttributes } from "./editor-action-menu.tsx";

export type EditorAudioAuditionState = Readonly<{
  assetId: string;
  phase: "idle" | "loading" | "playing" | "complete" | "error";
  message: string;
}>;

export type SelectionInspectorSelection =
  | { readonly kind: "none" }
  | { readonly kind: "asset"; readonly asset: EditorAsset; readonly audition?: EditorAudioAuditionState }
  | { readonly kind: "entity"; readonly entity: EditorEntityData };

export type SelectionInspectorProps = {
  project: EditorProject;
  selection: SelectionInspectorSelection;
};

type InspectorAction = EditorActionItem;

/** Typed Solid owner for the editor's empty, asset, and 2D entity inspectors. */
export function SelectionInspector(props: SelectionInspectorProps) { return <SelectionInspectorControls.Provider value={props}><SelectionInspectorContent /></SelectionInspectorControls.Provider>; }
function SelectionInspectorContent() { const controls = useContext(SelectionInspectorControls); if (!controls) throw new Error("Missing SelectionInspector controls");

  return (
    <PanelSurface class="selection-inspector" aria-label="Selection inspector" data-selection-inspector="">
      <Switch>
        <Match when={controls.selection.kind === "asset" ? controls.selection : undefined}>
          {(selection) => {
            const assetSelection = selection;
            return <AssetInspector project={controls.project} asset={assetSelection().asset} audition={assetSelection().audition} />;
          }}
        </Match>
        <Match when={controls.selection.kind === "entity" ? controls.selection : undefined}>
          {(selection) => {
            const entitySelection = selection;
            return <EntityInspector project={controls.project} entity={entitySelection().entity} />;
          }}
        </Match>
        <Match when={true}>
          <EmptyState
            title="Nothing selected"
            description="Select an entity to inspect its properties and components."
            icon="◇"
          />
        </Match>
      </Switch>
    </PanelSurface>
  );

}

function AssetInspector(props: { project: EditorProject; asset: EditorAsset; audition?: EditorAudioAuditionState }) { return <AssetInspectorControls.Provider value={props}><AssetInspectorContent /></AssetInspectorControls.Provider>; }
function AssetInspectorContent() { const controls = useContext(AssetInspectorControls); if (!controls) throw new Error("Missing AssetInspector controls");

  const usages = () => findEditorAssetUsages(controls.project, controls.asset.id);
  const primary = () => assetPrimaryAction(controls.asset);
  const audition = () => controls.audition?.assetId === controls.asset.id ? controls.audition : undefined;
  const auditionActive = () => audition()?.phase === "loading" || audition()?.phase === "playing";

  return (
    <>
      <PanelHeader
        title={controls.asset.name}
        description={`${controls.asset.id} · ${controls.asset.kind}`}
        headingAs="h3"
        data-context-resource="asset"
        actions={<EditorActionMenu label={`${controls.asset.name} asset actions`} items={[
          primary(),
          { label: "Replace / reimport…", action: "replace-asset", data: { assetId: controls.asset.id }, disabled: controls.asset.source !== "imported" },
          { label: "Find usages", action: "find-asset-usages", data: { assetId: controls.asset.id } },
        ]} />}
      />
      <PanelSection class="asset-inspector">
        <dl>
          <Metadata label="Kind" value={controls.asset.kind} />
          <Metadata label="MIME" value={controls.asset.mimeType} />
          <Metadata label="Size" value={formatBytes(controls.asset.size)} />
          <Metadata label="Source" value={controls.asset.source} />
          <Metadata label="SHA-256" value={controls.asset.sha256 ?? "Verified on save/build"} />
          <Metadata label="Usages" value={String(usages().length)} />
        </dl>

        <Show when={controls.asset.kind === "audio"}>
          <section class="asset-audition" aria-labelledby="asset-audition-title">
            <strong id="asset-audition-title">Audio preview</strong>
            <div role="group" aria-label="Audio preview controls">
              <ActionButton
                label={audition()?.phase === "complete" ? "Play again" : "Play"}
                ariaLabel={`Play ${controls.asset.name}`}
                action="audition-audio-asset"
                data={{ assetId: controls.asset.id }}
                disabled={controls.asset.source !== "imported" || auditionActive()}
              />
              <ActionButton
                label="Stop"
                ariaLabel={`Stop ${controls.asset.name} preview`}
                action="stop-audio-audition"
                disabled={!auditionActive()}
              />
            </div>
            <output
              id="asset-audio-audition-status"
              data-audio-status-asset={controls.asset.id}
              classList={{ "is-error": audition()?.phase === "error" }}
              role="status"
              aria-live="polite"
            >{audition()?.message ?? (controls.asset.source === "imported" ? "Ready to decode" : "Preview requires an imported audio blob")}</output>
          </section>
        </Show>

        <div class="component-inline-actions">
          <ActionButton label={primary().label} action={primary().action} data={{ assetId: controls.asset.id }} />
          <Show when={controls.asset.source === "imported"}>
            <ActionButton label="Replace / reimport…" action="replace-asset" data={{ assetId: controls.asset.id }} />
          </Show>
        </div>

        <Show when={usages().length} fallback={<p class="empty-copy">No project references.</p>}>
          <ul><For each={usages().slice(0, 8)}>{(usage) => <li>{usage.label}</li>}</For></ul>
        </Show>
      </PanelSection>
    </>
  );

}

function EntityInspector(props: { project: EditorProject; entity: EditorEntityData }) { return <EntityInspectorControls.Provider value={props}><EntityInspectorContent /></EntityInspectorControls.Provider>; }
function EntityInspectorContent() { const controls = useContext(EntityInspectorControls); if (!controls) throw new Error("Missing EntityInspector controls");

  const entityActions = (): readonly InspectorAction[] => [
    { label: "Rename", action: "rename-entity", data: { entityId: controls.entity.id } },
    { label: "Duplicate", action: "duplicate-entity", data: { entityId: controls.entity.id } },
    { label: "Add child", action: "create-child-entity", data: { entityId: controls.entity.id } },
    ...(controls.entity.parentId ? [{ label: "Remove parent", action: "unparent-entity", data: { entityId: controls.entity.id } }] : []),
    { label: "Delete", action: "delete-entity-by-id", data: { entityId: controls.entity.id }, danger: true },
  ];

  return (
    <>
      <PanelHeader
        title={controls.entity.label}
        description={`${controls.entity.id} · ${controls.entity.kind}`}
        headingAs="h3"
        data-context-resource="entity"
        actions={<EditorActionMenu label={`${controls.entity.label} entity actions`} items={entityActions()} />}
      />
      <PanelSection>
        <div class="inspector-edit-grid">
          <EntityTextField label="Name" property="label" value={controls.entity.label} />
          <EntityNumberField label="X" property="x" value={controls.entity.x} step={1} />
          <EntityNumberField label="Y" property="y" value={controls.entity.y} step={1} />
          <EntityNumberField label="Width" property="width" value={controls.entity.width} minimum={1} />
          <EntityNumberField label="Height" property="height" value={controls.entity.height} minimum={1} />
          <EntityNumberField label="Scale" property="scale" value={controls.entity.scale} minimum={0.000001} step={0.05} />
          <EntityNumberField label="Rotation" detail="radians" property="rotation" value={controls.entity.rotation ?? 0} step={0.01} />
          <EntityNumberField label="Opacity" property="opacity" value={controls.entity.opacity ?? 1} minimum={0} maximum={1} step={0.05} />
        </div>
        <div class="component-list">
          <For each={controls.entity.components}>{(component) => (
            <ComponentCard project={controls.project} component={component} />
          )}</For>
        </div>
        <AddComponentForm components={controls.entity.components} />
        <details class="generated-code">
          <summary>Generated TypeScript mapping</summary>
          <pre>{generatedEntityCode(controls.entity.id, controls.entity.components)}</pre>
        </details>
      </PanelSection>
    </>
  );

}

function ComponentCard(props: { project: EditorProject; component: EditorComponent }) { return <ComponentCardControls.Provider value={props}><ComponentCardContent /></ComponentCardControls.Provider>; }
function ComponentCardContent() { const controls = useContext(ComponentCardControls); if (!controls) throw new Error("Missing ComponentCard controls");

  const actions = (): readonly InspectorAction[] => [
    { label: controls.component.enabled ? "Disable" : "Enable", action: "toggle-component", data: { componentId: controls.component.id } },
    { label: "Duplicate", action: "duplicate-component", data: { componentId: controls.component.id }, disabled: ["transform", "sprite", "camera"].includes(controls.component.type) },
    { label: "Reset values", action: "reset-component", data: { componentId: controls.component.id } },
    { label: "Remove", action: "remove-component", data: { componentId: controls.component.id }, danger: true, disabled: controls.component.type === "transform" },
  ];

  return (
    <Switch>
      <Match when={controls.component.type === "behavior"}>
        <BehaviorComponentCard project={controls.project} component={controls.component} actions={actions()} />
      </Match>
      <Match when={true}>
        <details
          class="component-card"
          data-context-resource="component"
          data-component-card={controls.component.id}
          open={controls.component.type === "transform"}
        >
          <summary><span>{editorFieldLabel(controls.component.type)}</span><small>{controls.component.enabled ? "enabled" : "disabled"}</small></summary>
          <div class="component-menu-row"><EditorActionMenu label={`${controls.component.type} component actions`} items={actions()} /></div>
          <div class="component-editor"><div class="component-value-grid">
            <Show
              when={controls.component.type === "audio"}
              fallback={<SpecializedComponentFields project={controls.project} component={controls.component} />}
            >
              <AudioComponentFields project={controls.project} component={controls.component} />
            </Show>
          </div></div>
        </details>
      </Match>
    </Switch>
  );

}

function SpecializedComponentFields(props: { project: EditorProject; component: EditorComponent }) { return <SpecializedComponentFieldsControls.Provider value={props}><SpecializedComponentFieldsContent /></SpecializedComponentFieldsControls.Provider>; }
function SpecializedComponentFieldsContent() { const controls = useContext(SpecializedComponentFieldsControls); if (!controls) throw new Error("Missing SpecializedComponentFields controls");

  const selectFields = () => editorComponentSelectFields(controls.component, controls.project);
  const specializedKeys = () => new Set(selectFields().map((field) => field.key));
  const remaining = () => Object.entries(controls.component.values).filter(([key]) => !specializedKeys().has(key));
  return (
    <>
      <For each={selectFields()}>{(field) => <ComponentSelectField componentId={controls.component.id} field={field} />}</For>
      <For each={remaining()}>{([key, value]) => <ComponentValueField componentId={controls.component.id} fieldKey={key} value={value} />}</For>
      <Show when={!selectFields().length && !remaining().length}><span class="empty-copy">No properties yet.</span></Show>
    </>
  );

}

function ComponentSelectField(props: { componentId: string; field: EditorComponentSelectField }) { return <ComponentSelectFieldControls.Provider value={props}><ComponentSelectFieldContent /></ComponentSelectFieldControls.Provider>; }
function ComponentSelectFieldContent() { const controls = useContext(ComponentSelectFieldControls); if (!controls) throw new Error("Missing ComponentSelectField controls");

  const hasCurrentOption = () => controls.field.options.some((option) => option.value === controls.field.value);
  return (
    <label class="component-field">
      <span>{controls.field.label}<small class="field-description">{controls.field.description}</small></span>
      <SelectControl ariaLabel={controls.field.label} value={controls.field.value} options={[...(!hasCurrentOption() && controls.field.value ? [{ value: controls.field.value, label: `Unavailable · ${controls.field.value}` }] : []), ...controls.field.options]} dataAttributes={{ "data-value-kind": "text", "data-component-id": controls.componentId, "data-component-key": controls.field.key }} changeEventValue="requested" onChange={() => {}} />
    </label>
  );

}

function AudioComponentFields(props: { project: EditorProject; component: EditorComponent }) { return <AudioComponentFieldsControls.Provider value={props}><AudioComponentFieldsContent /></AudioComponentFieldsControls.Provider>; }
function AudioComponentFieldsContent() { const controls = useContext(AudioComponentFieldsControls); if (!controls) throw new Error("Missing AudioComponentFields controls");

  const assetKey = () => Object.hasOwn(controls.component.values, "assetId") ? "assetId" : "asset";
  const gainKey = () => Object.hasOwn(controls.component.values, "gain") ? "gain" : "volume";
  const known = new Set(["asset", "assetId", "trigger", "autoplay", "gain", "volume", "pan", "bus", "loop"]);
  const extraFields = () => Object.entries(controls.component.values).filter(([key]) => !known.has(key));
  return (
    <>
      <SelectValueField componentId={controls.component.id} fieldKey={assetKey()} label="Audio asset" description="Only imported audio assets are listed" value={String(controls.component.values[assetKey()] ?? "")} options={[
        { value: "", label: "Choose audio…" },
        ...controls.project.assets.filter((asset) => asset.kind === "audio").map((asset) => ({ value: asset.id, label: asset.name })),
      ]} />
      <SelectValueField componentId={controls.component.id} fieldKey="trigger" label="Trigger" description="Start automatically or respond to a project input action" value={String(controls.component.values.trigger ?? "start")} options={[
        { value: "start", label: "Start" },
        ...controls.project.settings.input.map((mapping) => ({ value: `action:${mapping.action}`, label: `Action · ${mapping.action}` })),
      ]} />
      <SelectValueField componentId={controls.component.id} fieldKey="bus" label="Bus" value={String(controls.component.values.bus ?? "sfx")} options={["music", "sfx", "voice", "ambient"].map((bus) => ({ value: bus, label: editorFieldLabel(bus) }))} />
      <NumberValueField componentId={controls.component.id} fieldKey={gainKey()} label="Gain" value={Number(controls.component.values[gainKey()] ?? 1)} minimum={0} maximum={4} step={0.05} />
      <NumberValueField componentId={controls.component.id} fieldKey="pan" label="Pan" value={Number(controls.component.values.pan ?? 0)} minimum={-1} maximum={1} step={0.05} />
      <BooleanValueField componentId={controls.component.id} fieldKey="loop" label="Loop" value={controls.component.values.loop === true} />
      <For each={extraFields()}>{([key, value]) => <ComponentValueField componentId={controls.component.id} fieldKey={key} value={value} />}</For>
    </>
  );

}

function BehaviorComponentCard(props: { project: EditorProject; component: EditorComponent; actions: readonly InspectorAction[] }) { return <BehaviorComponentCardControls.Provider value={props}><BehaviorComponentCardContent /></BehaviorComponentCardControls.Provider>; }
function BehaviorComponentCardContent() { const controls = useContext(BehaviorComponentCardControls); if (!controls) throw new Error("Missing BehaviorComponentCard controls");

  const definition = () => resolveBehaviorDefinition(controls.component, controls.project);
  const moduleName = () => typeof controls.component.values.module === "string" ? controls.component.values.module : "Behavior";
  const title = () => definition()?.label ?? (moduleName().startsWith("builtin:") ? editorFieldLabel(moduleName().slice(8)) : moduleName().split("/").at(-1)?.replace(/\.[^.]+$/, "") || "Behavior");
  const storedFields = () => groupBehaviorFields(controls.component.values);
  const definitionKeys = () => new Set(definition()?.fields.map((field) => field.key) ?? []);
  const publicDefinitions = () => definition()?.fields.filter((field) => !field.advanced) ?? [];
  const advancedDefinitions = () => definition()?.fields.filter((field) => field.advanced) ?? [];
  const extraFields = () => storedFields().publicFields.filter(([key]) => !definitionKeys().has(key));
  const publicGroups = () => {
    const groups = new Map<string, PlayableBehaviorField2D[]>();
    for (const field of publicDefinitions()) {
      const group = field.group ?? "Properties";
      groups.set(group, [...groups.get(group) ?? [], field]);
    }
    return [...groups.entries()];
  };

  return (
    <details class="component-card behavior-component" data-context-resource="component" data-component-card={controls.component.id} open>
      <summary><span>{title()}</span><small>{controls.component.enabled ? definition()?.builtIn ? "built-in" : "project source" : "disabled"}</small></summary>
      <div class="component-menu-row"><EditorActionMenu label="behavior component actions" items={controls.actions} /></div>
      <div class="component-editor">
        <Show when={definition()?.description}><p class="behavior-description">{definition()!.description}</p></Show>
        <section class="behavior-public-properties">
          <header><strong>Public properties</strong><small>Saved as component overrides</small></header>
          <div class="component-value-grid">
            <For each={publicGroups()}>{([group, fields]) => (
              <fieldset class="behavior-field-group">
                <legend>{group}</legend>
                <For each={fields}>{(field) => (
                  <div class="behavior-public-field">
                    <BehaviorField project={controls.project} componentId={controls.component.id} field={field} value={controls.component.values[field.key] ?? field.default} />
                    <Show when={Object.hasOwn(controls.component.values, field.key)}>
                      <ActionButton label="↺" ariaLabel={`Reset ${field.label} to its default`} action="remove-behavior-variable" data={{ componentId: controls.component.id, componentKey: field.key }} compact />
                    </Show>
                  </div>
                )}</For>
              </fieldset>
            )}</For>
            <Show when={extraFields().length}>
              <fieldset class="behavior-field-group">
                <legend>Custom</legend>
                <For each={extraFields()}>{([key, value]) => (
                  <div class="behavior-public-field">
                    <ComponentValueField componentId={controls.component.id} fieldKey={key} value={value} />
                    <ActionButton label="×" ariaLabel={`Remove ${editorFieldLabel(key)}`} action="remove-behavior-variable" data={{ componentId: controls.component.id, componentKey: key }} compact />
                  </div>
                )}</For>
              </fieldset>
            </Show>
            <Show when={!publicGroups().length && !extraFields().length}>
              <p class="empty-copy">No public properties yet. Add one for designers to tune without opening source.</p>
            </Show>
          </div>
          <div class="behavior-public-property-form">
            <input aria-label="New public property name" data-behavior-variable-name="" placeholder="propertyName" />
            <LocalInspectorSelect label="New public property type" data={{ "data-behavior-variable-type": "" }} options={[{ value: "number", label: "Number" }, { value: "boolean", label: "Boolean" }, { value: "text", label: "Text" }]} />
            <ActionButton label="Add" action="add-behavior-variable" data={{ componentId: controls.component.id }} />
          </div>
        </section>

        <Show when={definition()?.events?.length}>
          <div class="behavior-events"><strong>Emits</strong><For each={definition()!.events}>{(event) => <span title={event.description ?? ""}>{event.label} <code>{event.name}</code></span>}</For></div>
        </Show>

        <div class="component-inline-actions">
          <Show
            when={moduleName().startsWith("builtin:")}
            fallback={<ActionButton label="Open source" action="open-script" data={{ componentId: controls.component.id }} />}
          >
            <ActionButton label="Create additive behavior extension" action="create-behavior-extension" data={{ componentId: controls.component.id }} />
            <span class="component-origin">Adds a no-op project behavior beside this built-in; it does not replace equivalent runtime logic</span>
          </Show>
        </div>
        <details class="behavior-binding">
          <summary>Advanced behavior settings</summary>
          <div class="component-value-grid">
            <For each={advancedDefinitions()}>{(field) => <BehaviorField project={controls.project} componentId={controls.component.id} field={field} value={controls.component.values[field.key] ?? field.default} />}</For>
            <For each={storedFields().bindingFields}>{([key, value]) => <ComponentValueField componentId={controls.component.id} fieldKey={key} value={value} />}</For>
          </div>
        </details>
      </div>
    </details>
  );

}

function BehaviorField(props: { project: EditorProject; componentId: string; field: PlayableBehaviorField2D; value: string | number | boolean }) { return <BehaviorFieldControls.Provider value={props}><BehaviorFieldContent /></BehaviorFieldControls.Provider>; }
function BehaviorFieldContent() { const controls = useContext(BehaviorFieldControls); if (!controls) throw new Error("Missing BehaviorField controls");

  const valueKind = () => controls.field.type === "number" ? "number" : controls.field.type === "boolean" ? "boolean" : "text";
  const label = () => <span>{controls.field.label}<Show when={controls.field.type === "number" && controls.field.unit}><small class="field-unit">{controls.field.type === "number" ? controls.field.unit : ""}</small></Show><Show when={controls.field.description}><small class="field-description">{controls.field.description}</small></Show></span>;
  const options = () => behaviorFieldOptions(controls.field, controls.project);
  return (
    <Switch>
      <Match when={controls.field.type === "boolean"}>
        <label class="component-field component-field-toggle">{label()}<input type="checkbox" role="switch" checked={Boolean(controls.value)} data-value-kind={valueKind()} data-component-id={controls.componentId} data-component-key={controls.field.key} /></label>
      </Match>
      <Match when={controls.field.type === "number"}>
        <label class="component-field">{label()}<input type="number" inputMode="decimal" min={controls.field.type === "number" ? controls.field.minimum : undefined} max={controls.field.type === "number" ? controls.field.maximum : undefined} step={controls.field.type === "number" ? controls.field.step ?? "any" : undefined} value={String(controls.value)} data-value-kind={valueKind()} data-component-id={controls.componentId} data-component-key={controls.field.key} /></label>
      </Match>
      <Match when={options()?.length}>
        <SelectValueField componentId={controls.componentId} fieldKey={controls.field.key} label={controls.field.label} description={controls.field.description} value={String(controls.value)} options={options()!} />
      </Match>
      <Match when={true}>
        <label class="component-field">{label()}<input type="text" placeholder={controls.field.type === "text" ? controls.field.placeholder : controls.field.type === "state-key" ? "state.key" : undefined} value={String(controls.value)} data-value-kind={valueKind()} data-component-id={controls.componentId} data-component-key={controls.field.key} /></label>
      </Match>
    </Switch>
  );

}

function ComponentValueField(props: { componentId: string; fieldKey: string; value: string | number | boolean }) { return <ComponentValueFieldControls.Provider value={props}><ComponentValueFieldContent /></ComponentValueFieldControls.Provider>; }
function ComponentValueFieldContent() { const controls = useContext(ComponentValueFieldControls); if (!controls) throw new Error("Missing ComponentValueField controls");

  const presentation = () => describeEditorField(controls.fieldKey, controls.value);
  return (
    <Switch>
      <Match when={presentation().kind === "boolean"}>
        <BooleanValueField componentId={controls.componentId} fieldKey={controls.fieldKey} label={editorFieldLabel(controls.fieldKey)} value={Boolean(controls.value)} />
      </Match>
      <Match when={true}>
        <label class="component-field">
          <span>{editorFieldLabel(controls.fieldKey)}<Show when={presentation().unit}><small class="field-unit">{presentation().unit}</small></Show></span>
          <input
            type={presentation().inputType}
            inputMode={presentation().inputMode}
            min={presentation().minimum}
            max={presentation().maximum}
            step={presentation().step}
            value={String(controls.value)}
            data-value-kind={presentation().kind}
            data-component-id={controls.componentId}
            data-component-key={controls.fieldKey}
          />
        </label>
      </Match>
    </Switch>
  );

}

function SelectValueField(props: { componentId: string; fieldKey: string; label: string; description?: string; value: string; options: readonly { value: string; label: string }[] }) { return <SelectValueFieldControls.Provider value={props}><SelectValueFieldContent /></SelectValueFieldControls.Provider>; }
function SelectValueFieldContent() { const controls = useContext(SelectValueFieldControls); if (!controls) throw new Error("Missing SelectValueField controls");

  const missing = () => Boolean(controls.value) && !controls.options.some((option) => option.value === controls.value);
  return (
    <label class="component-field">
      <span>{controls.label}<Show when={controls.description}><small class="field-description">{controls.description}</small></Show></span>
      <SelectControl ariaLabel={controls.label} value={controls.value} options={[...(missing() ? [{ value: controls.value, label: `Unavailable · ${controls.value}` }] : []), ...controls.options]} dataAttributes={{ "data-value-kind": "text", "data-component-id": controls.componentId, "data-component-key": controls.fieldKey }} changeEventValue="requested" onChange={() => {}} />
    </label>
  );

}

function NumberValueField(props: { componentId: string; fieldKey: string; label: string; value: number; minimum?: number; maximum?: number; step?: number }) { return <NumberValueFieldControls.Provider value={props}><NumberValueFieldContent /></NumberValueFieldControls.Provider>; }
function NumberValueFieldContent() { const controls = useContext(NumberValueFieldControls); if (!controls) throw new Error("Missing NumberValueField controls");

  return <label class="component-field"><span>{controls.label}</span><input type="number" min={controls.minimum} max={controls.maximum} step={controls.step} value={controls.value} data-value-kind="number" data-component-id={controls.componentId} data-component-key={controls.fieldKey} /></label>;

}

function BooleanValueField(props: { componentId: string; fieldKey: string; label: string; value: boolean }) { return <BooleanValueFieldControls.Provider value={props}><BooleanValueFieldContent /></BooleanValueFieldControls.Provider>; }
function BooleanValueFieldContent() { const controls = useContext(BooleanValueFieldControls); if (!controls) throw new Error("Missing BooleanValueField controls");

  return <label class="component-field component-field-toggle"><span>{controls.label}</span><input type="checkbox" role="switch" checked={controls.value} data-value-kind="boolean" data-component-id={controls.componentId} data-component-key={controls.fieldKey} /></label>;

}

function EntityTextField(props: { label: string; property: string; value: string }) { return <EntityTextFieldControls.Provider value={props}><EntityTextFieldContent /></EntityTextFieldControls.Provider>; }
function EntityTextFieldContent() { const controls = useContext(EntityTextFieldControls); if (!controls) throw new Error("Missing EntityTextField controls");

  return <label>{controls.label}<input value={controls.value} data-entity-property={controls.property} /></label>;

}

function EntityNumberField(props: { label: string; detail?: string; property: string; value: number; minimum?: number; maximum?: number; step?: number }) { return <EntityNumberFieldControls.Provider value={props}><EntityNumberFieldContent /></EntityNumberFieldControls.Provider>; }
function EntityNumberFieldContent() { const controls = useContext(EntityNumberFieldControls); if (!controls) throw new Error("Missing EntityNumberField controls");

  return <label>{controls.label}<Show when={controls.detail}> <small>({controls.detail})</small></Show><input type="number" value={controls.value} min={controls.minimum} max={controls.maximum} step={controls.step} data-entity-property={controls.property} /></label>;

}

function AddComponentForm(props: { components: readonly EditorComponent[] }) { return <AddComponentFormControls.Provider value={props}><AddComponentFormContent /></AddComponentFormControls.Provider>; }
function AddComponentFormContent() { const controls = useContext(AddComponentFormControls); if (!controls) throw new Error("Missing AddComponentForm controls");

  const present = () => new Set(controls.components.map((component) => component.type));
  const available = () => (["collider", "audio", "input", "ui", "camera", "sprite", "transform"] as const)
    .filter((type) => type === "collider" || type === "audio" || !present().has(type));
  return (
    <div class="component-actions component-add-form">
      <label><span>Add component</span><LocalInspectorSelect label="Component type" data={{ "data-add-component-type": "" }} options={[{ value: "behavior", label: "Project behavior script", tags: ["Behavior"] }, ...BUILTIN_PLAYABLE_BEHAVIOR_DEFINITIONS_2D.map(definition => ({ value: `behavior:${definition.module}`, label: definition.label, tags: ["Behavior"] })), ...available().map(type => ({ value: type, label: editorFieldLabel(type), tags: ["Components"] }))]} /></label>
      <ActionButton label="Add" action="add-selected-component" />
    </div>
  );

}

function ActionButton(props: { label: string; ariaLabel?: string; action: string; data?: Readonly<Record<string, string>>; disabled?: boolean; compact?: boolean }) { return <ActionButtonControls.Provider value={props}><ActionButtonContent /></ActionButtonControls.Provider>; }
function ActionButtonContent() { const controls = useContext(ActionButtonControls); if (!controls) throw new Error("Missing ActionButton controls");

  const attributes = () => editorDataAttributes(controls.data);
  if (controls.compact) return (
    <Button
      variant="ghost"
      size="icon"
      tooltip={controls.ariaLabel ?? controls.label}
      aria-label={controls.ariaLabel}
      data-editor-action={controls.action}
      {...attributes()}
      disabled={controls.disabled}
    >{controls.label}</Button>
  );
  return (
    <Button
      variant="ghost"
      size="small"
      justificationForNoTooltip="Visible inspector action label"
      aria-label={controls.ariaLabel}
      data-editor-action={controls.action}
      {...attributes()}
      disabled={controls.disabled}
    >{controls.label}</Button>
  );

}

function Metadata(props: { label: string; value: string }) { return <MetadataControls.Provider value={props}><MetadataContent /></MetadataControls.Provider>; }
function MetadataContent() { const controls = useContext(MetadataControls); if (!controls) throw new Error("Missing Metadata controls");

  return <div><dt>{controls.label}</dt><dd>{controls.value}</dd></div>;

}

function assetPrimaryAction(asset: EditorAsset): InspectorAction {
  const data = { assetId: asset.id };
  if (asset.mimeType === "model/gltf+json" || /\.gltf$/i.test(asset.name)) return { label: "Place glTF JSON in 3D scene", action: "place-3d-asset", data };
  if (/\.glb$/i.test(asset.name) || asset.mimeType === "model/gltf-binary") return { label: "GLB placement unsupported · use .gltf", action: "select-asset", data };
  if (asset.kind === "image") return { label: "Create Stage sprite", action: "create-entity-from-asset", data };
  if (asset.kind === "audio") return { label: "Select for Audio components", action: "select-asset", data };
  return { label: "Inspect metadata", action: "select-asset", data };
}

function resolveBehaviorDefinition(component: EditorComponent, project: EditorProject): Readonly<PlayableBehaviorDefinition2D> | undefined {
  const builtIn = playableBehaviorDefinition2D(component);
  if (builtIn) return builtIn;
  const moduleName = component.values.module;
  const exportName = component.values.export;
  if (typeof moduleName !== "string" || typeof exportName !== "string") return undefined;
  return readEditorBehaviorDefinitions(project).find((candidate) => candidate.module === moduleName && candidate.exportName === exportName);
}

function behaviorFieldOptions(field: PlayableBehaviorField2D, project: EditorProject): readonly { value: string; label: string }[] | undefined {
  if (field.type === "select") return field.options;
  if (field.type === "action") return project.settings.input.map((mapping) => ({ value: mapping.action, label: mapping.action }));
  if (field.type === "entity") return project.scenes.flatMap((scene) => scene.entities.map((entity) => ({ value: entity.id, label: `${scene.name} / ${entity.label}` })));
  if (field.type === "asset") return project.assets.map((asset) => ({ value: asset.id, label: asset.name }));
  if (field.type === "scene") return project.scenes.map((scene) => ({ value: scene.id, label: scene.name }));
  return undefined;
}

function generatedEntityCode(id: string, components: readonly EditorComponent[]) {
  const behavior = components.find((component) => component.type === "behavior");
  const collider = components.find((component) => component.type === "collider");
  return [
    `const entity = scene.entity(${JSON.stringify(id)})`,
    behavior ? `entity.behavior(${JSON.stringify(behavior.values.module)}, ${JSON.stringify(behavior.values.export)})` : "// Add a behavior component",
    collider ? `entity.collider(${JSON.stringify(collider.values)})` : "// Collider is optional",
  ].join("\n");
}



export {
  AssetInspector as EditorAssetInspector,
  ComponentCard as EditorComponentCard,
  ComponentValueField as EditorComponentValueField,
  EntityInspector as EditorEntityInspector,
};

function LocalInspectorSelect(props: { label: string; data: Readonly<Record<string, string>>; options: readonly { value: string; label: string; tags?: string[] }[] }) { return <LocalInspectorSelectControls.Provider value={props}><LocalInspectorSelectContent /></LocalInspectorSelectControls.Provider>; }
function LocalInspectorSelectContent() { const controls = useContext(LocalInspectorSelectControls); if (!controls) throw new Error("Missing LocalInspectorSelect controls");

 const [value, setValue] = createSignal(controls.options[0]?.value ?? "");
 return <SelectControl ariaLabel={controls.label} value={value()} options={controls.options} dataAttributes={controls.data} onChange={setValue} />;

}
