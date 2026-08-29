import { Plus, Sparkles, Trash2 } from "lucide-solid";
import { For, Show, createEffect, createMemo, createSignal } from "solid-js";
import { PadPilot } from "../../../padpilot/index";
import { FX_IDEA_TAGS } from "../fx-idea-generator";
import { useFxModuleActions, useFxModuleState } from "../fx-module-store";
import { getNodeDefinition } from "../node-registry/registry";
import { TIMING_SYNC_LABELS } from "../timing-sync";
import styles from "./fx-creative-tools.module.css";

type ModulationTarget = {
  baseValue: number;
  chainId: number;
  id: string;
  label: string;
  maxValue: number;
  minValue: number;
  nodeId: number;
  parameterId: number;
};

const LFO_SHAPE_OPTIONS = ["Sine", "Triangle", "Square", "Random"].map((value) => ({ label: value, value }));
const LFO_SOURCE_OPTIONS = [
  { label: "LFO 1", value: "1" },
  { label: "LFO 2", value: "2" },
];
const DIVISION_OPTIONS = TIMING_SYNC_LABELS.map((label, index) => ({ label, value: String(index) }));

/** FxCreativeTools exposes curated chain generation and generic dual-LFO routing. */
export function FxCreativeTools() {
  const state = useFxModuleState();
  const actions = useFxModuleActions();
  const [selectedTags, setSelectedTags] = createSignal<string[]>(["dreamy"]);
  const [selectedTargetId, setSelectedTargetId] = createSignal("");
  const [selectedModulatorId, setSelectedModulatorId] = createSignal(1);
  const modulationTargets = createMemo<ModulationTarget[]>(() =>
    state.session.working.chains.flatMap((chain) =>
      chain.nodes.flatMap((node) => {
        const definition = getNodeDefinition(node.type);
        return definition.controls.flatMap((control) => {
          if (control.kind === "select" || control.kind === "toggle") return [];
          const parameter = node.legacyParams.find((entry) => entry.label === control.label);
          if (!parameter) return [];
          return [{
            baseValue: parameter.value,
            chainId: chain.id,
            id: `${chain.id}:${node.id}:${parameter.parameterId}`,
            label: `${chain.name} / ${node.name} / ${control.label}`,
            maxValue: parameter.maxValue,
            minValue: parameter.minValue,
            nodeId: node.id,
            parameterId: parameter.parameterId,
          }];
        });
      }),
    ),
  );
  const targetOptions = createMemo(() => modulationTargets().map((target) => ({ label: target.label, value: target.id })));

  createEffect(() => {
    if (!modulationTargets().some((target) => target.id === selectedTargetId())) {
      setSelectedTargetId(modulationTargets()[0]?.id ?? "");
    }
  });

  const toggleTag = (tag: string) => {
    setSelectedTags((current) => current.includes(tag) ? current.filter((entry) => entry !== tag) : [...current, tag]);
  };

  const addRoute = () => {
    const target = modulationTargets().find((entry) => entry.id === selectedTargetId());
    if (!target) return;
    actions.modulation.addRoute(
      selectedModulatorId(),
      target.chainId,
      target.nodeId,
      target.parameterId,
      target.minValue,
      target.maxValue,
      target.baseValue,
    );
  };

  const routeLabel = (chainId: number, nodeId: number, parameterId: number) =>
    modulationTargets().find((target) => target.chainId === chainId && target.nodeId === nodeId && target.parameterId === parameterId)?.label ??
    `Chain ${chainId} / Node ${nodeId} / Param ${parameterId}`;

  return (
    <section class={styles.root} data-testid="fx-creative-tools">
      <div class={styles.generator}>
        <div class={styles.heading}>
          <div>
            <strong>Idea Generator</strong>
            <small>Human-curated recipes. Pick vibe tags, build chain.</small>
          </div>
          <PadPilot.Button icon={<Sparkles size={14} />} onClick={() => actions.generator.generate(selectedTags())} tooltip="Generate tagged FX chain">
            Generate
          </PadPilot.Button>
        </div>
        <div class={styles.tags}>
          <For each={FX_IDEA_TAGS}>
            {(tag) => (
              <PadPilot.ToggleButton
                class={styles.tag}
                onClick={() => toggleTag(tag)}
                tooltip={`Toggle ${tag} tag`}
                value={selectedTags().includes(tag)}
                variant="ghost"
              >
                {tag}
              </PadPilot.ToggleButton>
            )}
          </For>
        </div>
      </div>

      <div class={styles.modulation}>
        <div class={styles.heading}>
          <div>
            <strong>Dual LFO Matrix</strong>
            <small>Public FX-state routes; fixed-capacity realtime DSP.</small>
          </div>
        </div>
        <div class={styles.sources}>
          <For each={state.session.working.modulators}>
            {(modulator) => (
              <div class={styles.source} data-testid={`fx-lfo-${modulator.id}`}>
                <strong>LFO {modulator.id}</strong>
                <PadPilot.Toggle label="On" value={modulator.enabled} onChange={(value) => actions.modulation.setEnabled(modulator.id, value)} />
                <PadPilot.Dropdown label="Shape" value={modulator.shape} options={LFO_SHAPE_OPTIONS} onChange={(value) => actions.modulation.setShape(modulator.id, value)} />
                <PadPilot.Knob
                  label="Rate"
                  min={0.01}
                  max={20}
                  step={0.01}
                  size={42}
                  value={modulator.rateHz}
                  valueFormatter={(value) => `${value.toFixed(2)} Hz`}
                  onChange={(value) => actions.modulation.setRate(modulator.id, value)}
                />
                <PadPilot.Toggle label="Sync" value={modulator.rateSync?.enabled ?? false} onChange={(value) => actions.modulation.setRateSync(modulator.id, value)} />
                <Show when={modulator.rateSync?.enabled}>
                  <PadPilot.Dropdown
                    label="Division"
                    value={String(modulator.rateSync?.divisionIndex ?? 9)}
                    options={DIVISION_OPTIONS}
                    onChange={(value) => actions.modulation.setRateDivision(modulator.id, Number(value))}
                  />
                </Show>
              </div>
            )}
          </For>
        </div>
        <div class={styles["route-builder"]}>
          <PadPilot.Dropdown label="Source" value={String(selectedModulatorId())} options={LFO_SOURCE_OPTIONS} onChange={(value) => setSelectedModulatorId(Number(value))} />
          <PadPilot.Dropdown label="Destination" value={selectedTargetId()} options={targetOptions()} onChange={setSelectedTargetId} />
          <PadPilot.Button disabled={!selectedTargetId()} icon={<Plus size={14} />} onClick={addRoute} tooltip="Add modulation route">
            Route
          </PadPilot.Button>
        </div>
        <div class={styles.routes}>
          <For each={state.session.working.modulationRoutes}>
            {(route, index) => (
              <div class={styles.route}>
                <span>LFO {route.modulatorId} → {routeLabel(route.chainId, route.nodeId, route.parameterId)}</span>
                <PadPilot.Slider
                  aria-label={`Route ${index() + 1} depth`}
                  label="Depth"
                  min={-1}
                  max={1}
                  orientation="horizontal"
                  step={0.01}
                  value={route.depth}
                  width={130}
                  onChange={(value) => actions.modulation.setRouteDepth(index(), value)}
                />
                <PadPilot.Button icon={<Trash2 size={13} />} onClick={() => actions.modulation.removeRoute(index())} tooltip="Remove modulation route" />
              </div>
            )}
          </For>
        </div>
      </div>
    </section>
  );
}
