import { For, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { type HostState, subscribeHostState } from "../bridge";
import { Button } from "./elements/button";
import { moduleSdk } from "../module-sdk";
import { isPadPilotDevtoolsEnabled } from "../runtime-flags";
import { Modal } from "./elements/modal";
import styles from "./diagnostics-modal.module.css";

const formatNumber = (value: number | undefined, suffix = "") => {
  if (value === undefined || Number.isNaN(value)) return "n/a";
  return `${value.toFixed(2)}${suffix}`;
};

export function isDiagnosticsTimingEnabled(runtime: HostState["runtimeDiagnostics"] | undefined) {
  return Boolean(runtime?.profilingEnabled && (runtime?.profiledBlocks ?? 0) > 0);
}

export function getDiagnosticsStatusLabel(runtime: HostState["runtimeDiagnostics"] | undefined) {
  return runtime?.profilingEnabled ? "Profiling On" : "Profiling Off";
}

export function getActiveDiagnosticChains(runtime: HostState["runtimeDiagnostics"] | undefined) {
  return (runtime?.chains ?? []).filter((chain) => chain.active);
}

export function formatTimingValue(value: number | undefined, runtime: HostState["runtimeDiagnostics"] | undefined) {
  return isDiagnosticsTimingEnabled(runtime) ? formatNumber(value, " us") : "Disabled";
}

export function formatPeakValue(value: number | undefined) {
  return formatNumber(value, " dB");
}

export function DiagnosticsModal() {
  if (!isPadPilotDevtoolsEnabled()) {
    return null;
  }

  const [open, setOpen] = createSignal(false);
  const [state, setState] = createSignal<HostState>({});

  onMount(() => {
    const unsubscribe = subscribeHostState((next) => setState(next));
    onCleanup(unsubscribe);
  });

  const runtime = () => state().runtimeDiagnostics;
  const activeChains = createMemo(() => getActiveDiagnosticChains(runtime()));

  return (
    <div class={styles["diagnostics-root"]}>
      <Button
        class={styles["diagnostics-launcher"]}
        variant="ghost"
        onClick={() => {
          setOpen(true);
          moduleSdk.setDiagnosticsVisible(true);
        }}
      >
        Diagnostics
      </Button>
      <Show when={open()}>
        <Modal
          open={open()}
          onClose={() => {
          setOpen(false);
          moduleSdk.setDiagnosticsVisible(false);
        }}
          title="PadPilot Diagnostics"
          size="lg"
          class={styles["diagnostics-modal"]}
        >
          <div class={styles["diagnostics-grid"]}>
            <article class={styles["diagnostics-card"]}>
              <span class={styles["diagnostics-card-title"]}>Thread Counters</span>
              <div class={styles["diagnostics-row"]}>
                <span class={styles["diagnostics-label"]}>Input Wakeups</span>
                <span class={styles["diagnostics-value"]}>{runtime()?.inputWakeups ?? "n/a"}</span>
              </div>
              <div class={styles["diagnostics-row"]}>
                <span class={styles["diagnostics-label"]}>Script Wakeups</span>
                <span class={styles["diagnostics-value"]}>{runtime()?.scriptWakeups ?? "n/a"}</span>
              </div>
              <div class={styles["diagnostics-row"]}>
                <span class={styles["diagnostics-label"]}>Input Events</span>
                <span class={styles["diagnostics-value"]}>{runtime()?.inputEventsPushed ?? "n/a"}</span>
              </div>
              <div class={styles["diagnostics-row"]}>
                <span class={styles["diagnostics-label"]}>Script Events</span>
                <span class={styles["diagnostics-value"]}>{runtime()?.scriptEventsProcessed ?? "n/a"}</span>
              </div>
              <div class={styles["diagnostics-row"]}>
                <span class={styles["diagnostics-label"]}>Input Dropped</span>
                <span class={styles["diagnostics-value"]}>{runtime()?.inputEventsDropped ?? "n/a"}</span>
              </div>
              <div class={styles["diagnostics-row"]}>
                <span class={styles["diagnostics-label"]}>Script Cmd Dropped</span>
                <span class={styles["diagnostics-value"]}>{runtime()?.scriptCommandsDropped ?? "n/a"}</span>
              </div>
              <div class={styles["diagnostics-row"]}>
                <span class={styles["diagnostics-label"]}>UI Audio Cmd Pushed</span>
                <span class={styles["diagnostics-value"]}>{runtime()?.uiAudioCommandsPushed ?? "n/a"}</span>
              </div>
              <div class={styles["diagnostics-row"]}>
                <span class={styles["diagnostics-label"]}>UI Audio Cmd Dropped</span>
                <span class={styles["diagnostics-value"]}>{runtime()?.uiAudioCommandsDropped ?? "n/a"}</span>
              </div>
              <div class={styles["diagnostics-row"]}>
                <span class={styles["diagnostics-label"]}>Audio Cmd Rejected</span>
                <span class={styles["diagnostics-value"]}>{runtime()?.audioCommandsRejected ?? "n/a"}</span>
              </div>
              <div class={styles["diagnostics-row"]}>
                <span class={styles["diagnostics-label"]}>Analyzer Slices</span>
                <span class={styles["diagnostics-value"]}>{runtime()?.analyzerAudioSlicesPushed ?? "n/a"}</span>
              </div>
              <div class={styles["diagnostics-row"]}>
                <span class={styles["diagnostics-label"]}>Analyzer Dropped</span>
                <span class={styles["diagnostics-value"]}>{runtime()?.analyzerAudioSlicesDropped ?? "n/a"}</span>
              </div>
            </article>
            <article class={styles["diagnostics-card"]}>
              <span class={styles["diagnostics-card-title"]}>DSP Timing</span>
              <div class={styles["diagnostics-row"]}>
                <span class={styles["diagnostics-label"]}>Status</span>
                <span class={styles["diagnostics-value"]}>
                  {getDiagnosticsStatusLabel(runtime())}
                </span>
              </div>
              <div class={styles["diagnostics-row"]}>
                <span class={styles["diagnostics-label"]}>Profiled Blocks</span>
                <span class={styles["diagnostics-value"]}>{runtime()?.profiledBlocks ?? "n/a"}</span>
              </div>
              <div class={styles["diagnostics-row"]}>
                <span class={styles["diagnostics-label"]}>Block Avg</span>
                <span class={styles["diagnostics-value"]}>{formatTimingValue(runtime()?.avgBlockUs, runtime())}</span>
              </div>
              <div class={styles["diagnostics-row"]}>
                <span class={styles["diagnostics-label"]}>Convolver Avg</span>
                <span class={styles["diagnostics-value"]}>{formatTimingValue(runtime()?.avgConvolverUs, runtime())}</span>
              </div>
              <div class={styles["diagnostics-row"]}>
                <span class={styles["diagnostics-label"]}>Delay Avg</span>
                <span class={styles["diagnostics-value"]}>{formatTimingValue(runtime()?.avgDelayUs, runtime())}</span>
              </div>
              <div class={styles["diagnostics-row"]}>
                <span class={styles["diagnostics-label"]}>Reverb Avg</span>
                <span class={styles["diagnostics-value"]}>{formatTimingValue(runtime()?.avgReverbUs, runtime())}</span>
              </div>
              <div class={styles["diagnostics-row"]}>
                <span class={styles["diagnostics-label"]}>Reverb Pre</span>
                <span class={styles["diagnostics-value"]}>{formatTimingValue(runtime()?.avgReverbPreDelayUs, runtime())}</span>
              </div>
              <div class={styles["diagnostics-row"]}>
                <span class={styles["diagnostics-label"]}>Reverb Core</span>
                <span class={styles["diagnostics-value"]}>{formatTimingValue(runtime()?.avgReverbCoreUs, runtime())}</span>
              </div>
              <div class={styles["diagnostics-row"]}>
                <span class={styles["diagnostics-label"]}>Reverb Mix</span>
                <span class={styles["diagnostics-value"]}>{formatTimingValue(runtime()?.avgReverbMixUs, runtime())}</span>
              </div>
              <div class={styles["diagnostics-row"]}>
                <span class={styles["diagnostics-label"]}>Modulation Avg</span>
                <span class={styles["diagnostics-value"]}>{formatTimingValue(runtime()?.avgModulationUs, runtime())}</span>
              </div>
              <div class={styles["diagnostics-row"]}>
                <span class={styles["diagnostics-label"]}>EQ Avg</span>
                <span class={styles["diagnostics-value"]}>{formatTimingValue(runtime()?.avgEqUs, runtime())}</span>
              </div>
            </article>
            <article class={styles["diagnostics-card"]}>
              <span class={styles["diagnostics-card-title"]}>Signal Peaks</span>
              <div class={styles["diagnostics-row"]}>
                <span class={styles["diagnostics-label"]}>Convolver</span>
                <span class={styles["diagnostics-value"]}>{formatPeakValue(runtime()?.convolverPeakDb)}</span>
              </div>
              <div class={styles["diagnostics-row"]}>
                <span class={styles["diagnostics-label"]}>Delay</span>
                <span class={styles["diagnostics-value"]}>{formatPeakValue(runtime()?.delayPeakDb)}</span>
              </div>
              <div class={styles["diagnostics-row"]}>
                <span class={styles["diagnostics-label"]}>Reverb</span>
                <span class={styles["diagnostics-value"]}>{formatPeakValue(runtime()?.reverbPeakDb)}</span>
              </div>
              <div class={styles["diagnostics-row"]}>
                <span class={styles["diagnostics-label"]}>Modulation</span>
                <span class={styles["diagnostics-value"]}>{formatPeakValue(runtime()?.modulationPeakDb)}</span>
              </div>
              <div class={styles["diagnostics-row"]}>
                <span class={styles["diagnostics-label"]}>EQ</span>
                <span class={styles["diagnostics-value"]}>{formatPeakValue(runtime()?.eqPeakDb)}</span>
              </div>
              <div class={styles["diagnostics-row"]}>
                <span class={styles["diagnostics-label"]}>Output</span>
                <span class={styles["diagnostics-value"]}>{formatPeakValue(runtime()?.outputPeakDb)}</span>
              </div>
            </article>
          </div>
          <article class={[styles["diagnostics-card"], styles["chains-card"]].join(" ")}>
            <span class={styles["diagnostics-card-title"]}>Chains</span>
            <Show
              when={activeChains().length > 0}
              fallback={<div class={styles["diagnostics-empty"]}>No active chains.</div>}
            >
              <div class={styles["chain-grid"]}>
                <For each={activeChains()}>
                  {(chain) => (
                    <section class={styles["chain-row"]} data-testid={`diagnostics-chain-${chain.chainId}`}>
                      <div class={styles["chain-row-header"]}>
                        <strong>{`Chain ${chain.chainId}`}</strong>
                        <div class={styles["chain-badge-row"]}>
                          <span class={styles["chain-badge"]}>{`${chain.activeNodeCount} active nodes`}</span>
                          <Show when={chain.muted}>
                            <span class={styles["chain-badge"]}>Muted</span>
                          </Show>
                          <Show when={chain.solo}>
                            <span class={styles["chain-badge"]}>Solo</span>
                          </Show>
                        </div>
                      </div>
                      <div class={styles["diagnostics-row"]}>
                        <span class={styles["diagnostics-label"]}>Avg Chain</span>
                        <span class={styles["diagnostics-value"]}>{formatTimingValue(chain.avgChainUs, runtime())}</span>
                      </div>
                      <div class={styles["diagnostics-row"]}>
                        <span class={styles["diagnostics-label"]}>Input Peak</span>
                        <span class={styles["diagnostics-value"]}>{formatPeakValue(chain.inputPeakDb)}</span>
                      </div>
                      <div class={styles["diagnostics-row"]}>
                        <span class={styles["diagnostics-label"]}>Output Peak</span>
                        <span class={styles["diagnostics-value"]}>{formatPeakValue(chain.outputPeakDb)}</span>
                      </div>
                    </section>
                  )}
                </For>
              </div>
            </Show>
          </article>
        </Modal>
      </Show>
    </div>
  );
}

