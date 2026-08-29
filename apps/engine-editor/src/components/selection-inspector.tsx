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
export function SelectionInspector(props: SelectionInspectorProps) {
  return (
    <PanelSurface class="selection-inspector" aria-label="Selection inspector" data-selection-inspector="">
      <Switch>
        <Match when={props.selection.kind === "asset" ? props.selection : undefined}>
          {(selection) => {
            const assetSelection = selection;
            return <AssetInspector project={props.project} asset={assetSelection().asset} audition={assetSelection().audition} />;
          }}
        </Match>
        <Match when={props.selection.kind === "entity" ? props.selection : undefined}>
          {(selection) => {
            const entitySelection = selection;
            return <EntityInspector project={props.project} entity={entitySelection().entity} />;
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

function AssetInspector(props: { project: EditorProject; asset: EditorAsset; audition?: EditorAudioAuditionState }) {
  const usages = () => findEditorAssetUsages(props.project, props.asset.id);
  const primary = () => assetPrimaryAction(props.asset);
  const audition = () => props.audition?.assetId === props.asset.id ? props.audition : undefined;
  const auditionActive = () => audition()?.phase === "loading" || audition()?.phase === "playing";

  return (
    <>
      <PanelHeader
        title={props.asset.name}
        description={`${props.asset.id} · ${props.asset.kind}`}
        headingAs="h3"
        data-context-resource="asset"
        actions={<EditorActionMenu label={`${props.asset.name} asset actions`} items={[
          primary(),
          { label: "Replace / reimport…", action: "replace-asset", data: { assetId: props.asset.id }, disabled: props.asset.source !== "imported" },
          { label: "Find usages", action: "find-asset-usages", data: { assetId: props.asset.id } },
        ]} />}
      />
      <PanelSection class="asset-inspector">
        <dl>
          <Metadata label="Kind" value={props.asset.kind} />
          <Metadata label="MIME" value={props.asset.mimeType} />
          <Metadata label="Size" value={formatBytes(props.asset.size)} />
          <Metadata label="Source" value={props.asset.source} />
          <Metadata label="SHA-256" value={props.asset.sha256 ?? "Verified on save/build"} />
          <Metadata label="Usages" value={String(usages().length)} />
        </dl>

        <Show when={props.asset.kind === "audio"}>
          <section class="asset-audition" aria-labelledby="asset-audition-title">
            <strong id="asset-audition-title">Audio preview</strong>
            <div role="group" aria-label="Audio preview controls">
              <ActionButton
                label={audition()?.phase === "complete" ? "Play again" : "Play"}
                ariaLabel={`Play ${props.asset.name}`}
                action="audition-audio-asset"
                data={{ assetId: props.asset.id }}
                disabled={props.asset.source !== "imported" || auditionActive()}
              />
              <ActionButton
                label="Stop"
                ariaLabel={`Stop ${props.asset.name} preview`}
                action="stop-audio-audition"
                disabled={!auditionActive()}
              />
            </div>
            <output
              id="asset-audio-audition-status"
              data-audio-status-asset={props.asset.id}
              classList={{ "is-error": audition()?.phase === "error" }}
              role="status"
              aria-live="polite"
            >{audition()?.message ?? (props.asset.source === "imported" ? "Ready to decode" : "Preview requires an imported audio blob")}</output>
          </section>
        </Show>

        <div class="component-inline-actions">
          <ActionButton label={primary().label} action={primary().action} data={{ assetId: props.asset.id }} />
          <Show when={props.asset.source === "imported"}>
            <ActionButton label="Replace / reimport…" action="replace-asset" data={{ assetId: props.asset.id }} />
          </Show>
        </div>

        <Show when={usages().length} fallback={<p class="empty-copy">No project references.</p>}>
          <ul><For each={usages().slice(0, 8)}>{(usage) => <li>{usage.label}</li>}</For></ul>
        </Show>
      </PanelSection>
    </>
  );
}

function EntityInspector(props: { project: EditorProject; entity: EditorEntityData }) {
  const entityActions = (): readonly InspectorAction[] => [
    { label: "Rename", action: "rename-entity", data: { entityId: props.entity.id } },
    { label: "Duplicate", action: "duplicate-entity", data: { entityId: props.entity.id } },
    { label: "Add child", action: "create-child-entity", data: { entityId: props.entity.id } },
    ...(props.entity.parentId ? [{ label: "Remove parent", action: "unparent-entity", data: { entityId: props.entity.id } }] : []),
    { label: "Delete", action: "delete-entity-by-id", data: { entityId: props.entity.id }, danger: true },
  ];

  return (
    <>
      <PanelHeader
        title={props.entity.label}
        description={`${props.entity.id} · ${props.entity.kind}`}
        headingAs="h3"
        data-context-resource="entity"
        actions={<EditorActionMenu label={`${props.entity.label} entity actions`} items={entityActions()} />}
      />
      <PanelSection>
        <div class="inspector-edit-grid">
          <EntityTextField label="Name" property="label" value={props.entity.label} />
          <EntityNumberField label="X" property="x" value={props.entity.x} step={1} />
          <EntityNumberField label="Y" property="y" value={props.entity.y} step={1} />
          <EntityNumberField label="Width" property="width" value={props.entity.width} minimum={1} />
          <EntityNumberField label="Height" property="height" value={props.entity.height} minimum={1} />
          <EntityNumberField label="Scale" property="scale" value={props.entity.scale} minimum={0.000001} step={0.05} />
          <EntityNumberField label="Rotation" detail="radians" property="rotation" value={props.entity.rotation ?? 0} step={0.01} />
          <EntityNumberField label="Opacity" property="opacity" value={props.entity.opacity ?? 1} minimum={0} maximum={1} step={0.05} />
        </div>
        <div class="component-list">
          <For each={props.entity.components}>{(component) => (
            <ComponentCard project={props.project} component={component} />
          )}</For>
        </div>
        <AddComponentForm components={props.entity.components} />
        <details class="generated-code">
          <summary>Generated TypeScript mapping</summary>
          <pre>{generatedEntityCode(props.entity.id, props.entity.components)}</pre>
        </details>
      </PanelSection>
    </>
  );
}

function ComponentCard(props: { project: EditorProject; component: EditorComponent }) {
  const actions = (): readonly InspectorAction[] => [
    { label: props.component.enabled ? "Disable" : "Enable", action: "toggle-component", data: { componentId: props.component.id } },
    { label: "Duplicate", action: "duplicate-component", data: { componentId: props.component.id }, disabled: ["transform", "sprite", "camera"].includes(props.component.type) },
    { label: "Reset values", action: "reset-component", data: { componentId: props.component.id } },
    { label: "Remove", action: "remove-component", data: { componentId: props.component.id }, danger: true, disabled: props.component.type === "transform" },
  ];

  return (
    <Switch>
      <Match when={props.component.type === "behavior"}>
        <BehaviorComponentCard project={props.project} component={props.component} actions={actions()} />
      </Match>
      <Match when={true}>
        <details
          class="component-card"
          data-context-resource="component"
          data-component-card={props.component.id}
          open={props.component.type === "transform"}
        >
          <summary><span>{editorFieldLabel(props.component.type)}</span><small>{props.component.enabled ? "enabled" : "disabled"}</small></summary>
          <div class="component-menu-row"><EditorActionMenu label={`${props.component.type} component actions`} items={actions()} /></div>
          <div class="component-editor"><div class="component-value-grid">
            <Show
              when={props.component.type === "audio"}
              fallback={<SpecializedComponentFields project={props.project} component={props.component} />}
            >
              <AudioComponentFields project={props.project} component={props.component} />
            </Show>
          </div></div>
        </details>
      </Match>
    </Switch>
  );
}

function SpecializedComponentFields(props: { project: EditorProject; component: EditorComponent }) {
  const selectFields = () => editorComponentSelectFields(props.component, props.project);
  const specializedKeys = () => new Set(selectFields().map((field) => field.key));
  const remaining = () => Object.entries(props.component.values).filter(([key]) => !specializedKeys().has(key));
  return (
    <>
      <For each={selectFields()}>{(field) => <ComponentSelectField componentId={props.component.id} field={field} />}</For>
      <For each={remaining()}>{([key, value]) => <ComponentValueField componentId={props.component.id} fieldKey={key} value={value} />}</For>
      <Show when={!selectFields().length && !remaining().length}><span class="empty-copy">No properties yet.</span></Show>
    </>
  );
}

function ComponentSelectField(props: { componentId: string; field: EditorComponentSelectField }) {
  const hasCurrentOption = () => props.field.options.some((option) => option.value === props.field.value);
  return (
    <label class="component-field">
      <span>{props.field.label}<small class="field-description">{props.field.description}</small></span>
      <select value={props.field.value} data-value-kind="text" data-component-id={props.componentId} data-component-key={props.field.key}>
        <Show when={!hasCurrentOption() && props.field.value}>
          <option value={props.field.value}>Unavailable · {props.field.value}</option>
        </Show>
        <For each={props.field.options}>{(option) => <option value={option.value}>{option.label}</option>}</For>
      </select>
    </label>
  );
}

function AudioComponentFields(props: { project: EditorProject; component: EditorComponent }) {
  const assetKey = () => Object.hasOwn(props.component.values, "assetId") ? "assetId" : "asset";
  const gainKey = () => Object.hasOwn(props.component.values, "gain") ? "gain" : "volume";
  const known = new Set(["asset", "assetId", "trigger", "autoplay", "gain", "volume", "pan", "bus", "loop"]);
  const extraFields = () => Object.entries(props.component.values).filter(([key]) => !known.has(key));
  return (
    <>
      <SelectValueField componentId={props.component.id} fieldKey={assetKey()} label="Audio asset" description="Only imported audio assets are listed" value={String(props.component.values[assetKey()] ?? "")} options={[
        { value: "", label: "Choose audio…" },
        ...props.project.assets.filter((asset) => asset.kind === "audio").map((asset) => ({ value: asset.id, label: asset.name })),
      ]} />
      <SelectValueField componentId={props.component.id} fieldKey="trigger" label="Trigger" description="Start automatically or respond to a project input action" value={String(props.component.values.trigger ?? "start")} options={[
        { value: "start", label: "Start" },
        ...props.project.settings.input.map((mapping) => ({ value: `action:${mapping.action}`, label: `Action · ${mapping.action}` })),
      ]} />
      <SelectValueField componentId={props.component.id} fieldKey="bus" label="Bus" value={String(props.component.values.bus ?? "sfx")} options={["music", "sfx", "voice", "ambient"].map((bus) => ({ value: bus, label: editorFieldLabel(bus) }))} />
      <NumberValueField componentId={props.component.id} fieldKey={gainKey()} label="Gain" value={Number(props.component.values[gainKey()] ?? 1)} minimum={0} maximum={4} step={0.05} />
      <NumberValueField componentId={props.component.id} fieldKey="pan" label="Pan" value={Number(props.component.values.pan ?? 0)} minimum={-1} maximum={1} step={0.05} />
      <BooleanValueField componentId={props.component.id} fieldKey="loop" label="Loop" value={props.component.values.loop === true} />
      <For each={extraFields()}>{([key, value]) => <ComponentValueField componentId={props.component.id} fieldKey={key} value={value} />}</For>
    </>
  );
}

function BehaviorComponentCard(props: { project: EditorProject; component: EditorComponent; actions: readonly InspectorAction[] }) {
  const definition = () => resolveBehaviorDefinition(props.component, props.project);
  const moduleName = () => typeof props.component.values.module === "string" ? props.component.values.module : "Behavior";
  const title = () => definition()?.label ?? (moduleName().startsWith("builtin:") ? editorFieldLabel(moduleName().slice(8)) : moduleName().split("/").at(-1)?.replace(/\.[^.]+$/, "") || "Behavior");
  const storedFields = () => groupBehaviorFields(props.component.values);
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
    <details class="component-card behavior-component" data-context-resource="component" data-component-card={props.component.id} open>
      <summary><span>{title()}</span><small>{props.component.enabled ? definition()?.builtIn ? "built-in" : "project source" : "disabled"}</small></summary>
      <div class="component-menu-row"><EditorActionMenu label="behavior component actions" items={props.actions} /></div>
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
                    <BehaviorField project={props.project} componentId={props.component.id} field={field} value={props.component.values[field.key] ?? field.default} />
                    <Show when={Object.hasOwn(props.component.values, field.key)}>
                      <ActionButton label="↺" ariaLabel={`Reset ${field.label} to its default`} action="remove-behavior-variable" data={{ componentId: props.component.id, componentKey: field.key }} compact />
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
                    <ComponentValueField componentId={props.component.id} fieldKey={key} value={value} />
                    <ActionButton label="×" ariaLabel={`Remove ${editorFieldLabel(key)}`} action="remove-behavior-variable" data={{ componentId: props.component.id, componentKey: key }} compact />
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
            <select aria-label="New public property type" data-behavior-variable-type="">
              <option value="number">Number</option><option value="boolean">Boolean</option><option value="text">Text</option>
            </select>
            <ActionButton label="Add" action="add-behavior-variable" data={{ componentId: props.component.id }} />
          </div>
        </section>

        <Show when={definition()?.events?.length}>
          <div class="behavior-events"><strong>Emits</strong><For each={definition()!.events}>{(event) => <span title={event.description ?? ""}>{event.label} <code>{event.name}</code></span>}</For></div>
        </Show>

        <div class="component-inline-actions">
          <Show
            when={moduleName().startsWith("builtin:")}
            fallback={<ActionButton label="Open source" action="open-script" data={{ componentId: props.component.id }} />}
          >
            <ActionButton label="Create additive behavior extension" action="create-behavior-extension" data={{ componentId: props.component.id }} />
            <span class="component-origin">Adds a no-op project behavior beside this built-in; it does not replace equivalent runtime logic</span>
          </Show>
        </div>
        <details class="behavior-binding">
          <summary>Advanced behavior settings</summary>
          <div class="component-value-grid">
            <For each={advancedDefinitions()}>{(field) => <BehaviorField project={props.project} componentId={props.component.id} field={field} value={props.component.values[field.key] ?? field.default} />}</For>
            <For each={storedFields().bindingFields}>{([key, value]) => <ComponentValueField componentId={props.component.id} fieldKey={key} value={value} />}</For>
          </div>
        </details>
      </div>
    </details>
  );
}

function BehaviorField(props: { project: EditorProject; componentId: string; field: PlayableBehaviorField2D; value: string | number | boolean }) {
  const valueKind = () => props.field.type === "number" ? "number" : props.field.type === "boolean" ? "boolean" : "text";
  const label = () => <span>{props.field.label}<Show when={props.field.type === "number" && props.field.unit}><small class="field-unit">{props.field.type === "number" ? props.field.unit : ""}</small></Show><Show when={props.field.description}><small class="field-description">{props.field.description}</small></Show></span>;
  const options = () => behaviorFieldOptions(props.field, props.project);
  return (
    <Switch>
      <Match when={props.field.type === "boolean"}>
        <label class="component-field component-field-toggle">{label()}<input type="checkbox" role="switch" checked={Boolean(props.value)} data-value-kind={valueKind()} data-component-id={props.componentId} data-component-key={props.field.key} /></label>
      </Match>
      <Match when={props.field.type === "number"}>
        <label class="component-field">{label()}<input type="number" inputMode="decimal" min={props.field.type === "number" ? props.field.minimum : undefined} max={props.field.type === "number" ? props.field.maximum : undefined} step={props.field.type === "number" ? props.field.step ?? "any" : undefined} value={String(props.value)} data-value-kind={valueKind()} data-component-id={props.componentId} data-component-key={props.field.key} /></label>
      </Match>
      <Match when={options()?.length}>
        <SelectValueField componentId={props.componentId} fieldKey={props.field.key} label={props.field.label} description={props.field.description} value={String(props.value)} options={options()!} />
      </Match>
      <Match when={true}>
        <label class="component-field">{label()}<input type="text" placeholder={props.field.type === "text" ? props.field.placeholder : props.field.type === "state-key" ? "state.key" : undefined} value={String(props.value)} data-value-kind={valueKind()} data-component-id={props.componentId} data-component-key={props.field.key} /></label>
      </Match>
    </Switch>
  );
}

function ComponentValueField(props: { componentId: string; fieldKey: string; value: string | number | boolean }) {
  const presentation = () => describeEditorField(props.fieldKey, props.value);
  return (
    <Switch>
      <Match when={presentation().kind === "boolean"}>
        <BooleanValueField componentId={props.componentId} fieldKey={props.fieldKey} label={editorFieldLabel(props.fieldKey)} value={Boolean(props.value)} />
      </Match>
      <Match when={true}>
        <label class="component-field">
          <span>{editorFieldLabel(props.fieldKey)}<Show when={presentation().unit}><small class="field-unit">{presentation().unit}</small></Show></span>
          <input
            type={presentation().inputType}
            inputMode={presentation().inputMode}
            min={presentation().minimum}
            max={presentation().maximum}
            step={presentation().step}
            value={String(props.value)}
            data-value-kind={presentation().kind}
            data-component-id={props.componentId}
            data-component-key={props.fieldKey}
          />
        </label>
      </Match>
    </Switch>
  );
}

function SelectValueField(props: { componentId: string; fieldKey: string; label: string; description?: string; value: string; options: readonly { value: string; label: string }[] }) {
  const missing = () => Boolean(props.value) && !props.options.some((option) => option.value === props.value);
  return (
    <label class="component-field">
      <span>{props.label}<Show when={props.description}><small class="field-description">{props.description}</small></Show></span>
      <select value={props.value} data-value-kind="text" data-component-id={props.componentId} data-component-key={props.fieldKey}>
        <Show when={missing()}><option value={props.value}>Unavailable · {props.value}</option></Show>
        <For each={props.options}>{(option) => <option value={option.value}>{option.label}</option>}</For>
      </select>
    </label>
  );
}

function NumberValueField(props: { componentId: string; fieldKey: string; label: string; value: number; minimum?: number; maximum?: number; step?: number }) {
  return <label class="component-field"><span>{props.label}</span><input type="number" min={props.minimum} max={props.maximum} step={props.step} value={props.value} data-value-kind="number" data-component-id={props.componentId} data-component-key={props.fieldKey} /></label>;
}

function BooleanValueField(props: { componentId: string; fieldKey: string; label: string; value: boolean }) {
  return <label class="component-field component-field-toggle"><span>{props.label}</span><input type="checkbox" role="switch" checked={props.value} data-value-kind="boolean" data-component-id={props.componentId} data-component-key={props.fieldKey} /></label>;
}

function EntityTextField(props: { label: string; property: string; value: string }) {
  return <label>{props.label}<input value={props.value} data-entity-property={props.property} /></label>;
}

function EntityNumberField(props: { label: string; detail?: string; property: string; value: number; minimum?: number; maximum?: number; step?: number }) {
  return <label>{props.label}<Show when={props.detail}> <small>({props.detail})</small></Show><input type="number" value={props.value} min={props.minimum} max={props.maximum} step={props.step} data-entity-property={props.property} /></label>;
}

function AddComponentForm(props: { components: readonly EditorComponent[] }) {
  const present = () => new Set(props.components.map((component) => component.type));
  const available = () => (["collider", "audio", "input", "ui", "camera", "sprite", "transform"] as const)
    .filter((type) => type === "collider" || type === "audio" || !present().has(type));
  return (
    <div class="component-actions component-add-form">
      <label><span>Add component</span><select data-add-component-type="" aria-label="Component type">
        <optgroup label="Behavior">
          <option value="behavior">Project behavior script</option>
          <For each={BUILTIN_PLAYABLE_BEHAVIOR_DEFINITIONS_2D}>{(definition) => <option value={`behavior:${definition.module}`}>{definition.label}</option>}</For>
        </optgroup>
        <optgroup label="Components"><For each={available()}>{(type) => <option value={type}>{editorFieldLabel(type)}</option>}</For></optgroup>
      </select></label>
      <ActionButton label="Add" action="add-selected-component" />
    </div>
  );
}

function ActionButton(props: { label: string; ariaLabel?: string; action: string; data?: Readonly<Record<string, string>>; disabled?: boolean; compact?: boolean }) {
  const attributes = () => editorDataAttributes(props.data);
  if (props.compact) return (
    <Button
      variant="ghost"
      size="icon"
      tooltip={props.ariaLabel ?? props.label}
      aria-label={props.ariaLabel}
      data-editor-action={props.action}
      {...attributes()}
      disabled={props.disabled}
    >{props.label}</Button>
  );
  return (
    <Button
      variant="ghost"
      size="small"
      justificationForNoTooltip="Visible inspector action label"
      aria-label={props.ariaLabel}
      data-editor-action={props.action}
      {...attributes()}
      disabled={props.disabled}
    >{props.label}</Button>
  );
}

function Metadata(props: { label: string; value: string }) {
  return <div><dt>{props.label}</dt><dd>{props.value}</dd></div>;
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

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export {
  AssetInspector as EditorAssetInspector,
  ComponentCard as EditorComponentCard,
  ComponentValueField as EditorComponentValueField,
  EntityInspector as EditorEntityInspector,
};
