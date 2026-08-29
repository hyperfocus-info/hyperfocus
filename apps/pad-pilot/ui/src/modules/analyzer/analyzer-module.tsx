import { For, Show } from "solid-js";
import { Download, Minus, Plus, PowerIcon, RotateCcw, Save } from "lucide-solid";
import { NoteHeatmap } from "../../components/elements/note-heatmap";
import styles from "./analyzer-module.module.css";
import { AnalyzerModuleStoreProvider, useAnalyzerModuleStore } from "./analyzer-module-store";
import { PadPilot } from "../../padpilot/index";

/** AnalyzerModule wires the analyzer module store to the shared module view. */
export function AnalyzerModule() {
  return (
    <AnalyzerModuleStoreProvider>
      <AnalyzerModuleView />
    </AnalyzerModuleStoreProvider>
  );
}

function AnalyzerModuleView() {
  const store = useAnalyzerModuleStore();

  return (
    <section class={styles["module-root"]}>
      <header class={styles.brand}>
        <h2>ANALYZER</h2>
      </header>

      <div class={styles.console}>
        <div class={styles["screen-shell"]}>
          <div class={styles["screen-bezel"]}>
            <NoteHeatmap
              class={styles.heatmap}
              frameCount={store.derived.frameCount()}
              laneEnergies={store.state.host.frame.laneEnergies}
              minMidiNote={store.derived.laneRange().minMidiNote}
              maxMidiNote={store.derived.laneRange().maxMidiNote}
              noteEvents={store.state.host.frame.noteEvents}
              tuningHz={store.state.host.frame.tuningHz}
            />
            <div class={styles["key-banner"]}>
              <span class={styles["key-copy"]}>Detected Key</span>
              <Show when={store.derived.reanalyzing()}>
                <span class={styles["analysis-chip"]}>Analyzing...</span>
              </Show>
              <strong>{store.derived.detectedKeyLabel()}</strong>
              <Show when={!store.derived.reanalyzing() && store.derived.alternateMatchLabels().length > 0}>
                <div class={styles.alternates}>
                  <For each={store.derived.alternateMatchLabels()}>
                    {(match) => (
                      <span>{match.label} {match.confidence}</span>
                    )}
                  </For>
                </div>
              </Show>
            </div>
          </div>
        </div>

        <aside class={styles["control-rail"]}>
          <section class={styles["action-panel"]}>
            <div class={styles["action-row"]}>
              <PadPilot.Button
                class={styles["record-button"]}
                aria-pressed={store.derived.recordEnabled()}
                data-recording={store.derived.recordEnabled() ? "true" : "false"}
                icon={<PowerIcon size={18} />}
                tooltip={store.derived.recordEnabled() ? "Stop recording" : "Start recording"}
                onClick={store.actions.toggleRecord}
              />

              <PadPilot.ToggleButton
                class={styles["append-toggle"]}
                value={store.derived.appendEnabled()}
                disabled={Boolean(store.derived.appendToggleDisabledReason())}
                tooltip={`Capture mode: ${store.derived.appendEnabled() ? "append" : "overwrite"}`}
                onClick={() => store.actions.setAppendEnabled(!store.derived.appendEnabled())}
              >
                <span class={styles["screen-reader-only"]}>
                  {`Capture mode: ${store.derived.appendEnabled() ? "append" : "overwrite"}`}
                </span>
                <span class={styles["append-toggle-track"]} aria-hidden="true">
                  <span
                    class={styles["append-toggle-option"]}
                    data-active={store.derived.appendEnabled() ? "false" : "true"}
                  >
                    Overwrite
                  </span>
                  <span
                    class={styles["append-toggle-option"]}
                    data-active={store.derived.appendEnabled() ? "true" : "false"}
                  >
                    Append
                  </span>
                </span>
              </PadPilot.ToggleButton>
            </div>

            <div class={styles["action-row"]}>
              <PadPilot.Button
                class={styles["export-button"]}
                disabled={!store.derived.exportEnabled()}
                icon={<Download size={16} />}
                tooltip={store.derived.exportDisabledReason() ?? "Drag MIDI into the DAW."}
                onClick={store.actions.requestMidiDrag}
              >
                Drag MIDI
              </PadPilot.Button>
              <PadPilot.Button
                class={styles["export-button"]}
                disabled={!store.derived.exportEnabled()}
                icon={<Save size={16} />}
                tooltip={store.derived.exportDisabledReason() ?? "Save MIDI to disk."}
                onClick={store.actions.requestMidiSave}
              >
                Save MIDI
              </PadPilot.Button>
            </div>
          </section>

          <section class={styles["slider-panel"]}>
            <div class={styles["slider-block"]}>
              <div class={styles["slider-header"]}>
                <span class={styles["rail-label"]}>Tuning</span>
                <div class={styles["digital-readout"]}>{store.derived.tuningLabel()}</div>
              </div>
              <PadPilot.Slider
                min={store.derived.tuningMin}
                max={store.derived.tuningMax}
                orientation="horizontal"
                value={store.state.host.frame.tuningHz}
                width={260}
                tooltip="Adjust analyzer tuning reference."
                onChange={store.actions.setTuning}
                label={store.derived.tuningLabel()}
              />
            </div>

            <div class={styles["slider-block"]}>
              <div class={styles["slider-header"]}>
                <div class={styles["slider-title-row"]}>
                  <span class={styles["rail-label"]}>Sensitivity</span>
                  <Show when={store.derived.reanalyzing()}>
                    <span class={styles["analysis-chip"]}>Analyzing...</span>
                  </Show>
                </div>
                <div class={styles["digital-readout"]}>{store.derived.detectionSensitivityLabel()}</div>
              </div>
              <PadPilot.Slider
                min={store.derived.detectionSensitivityMin}
                max={store.derived.detectionSensitivityMax}
                orientation="horizontal"
                value={store.state.host.frame.detectionSensitivity}
                width={260}
                tooltip="Higher sensitivity catches quieter notes. Lower sensitivity is stricter."
                onChange={store.actions.setDetectionSensitivity}
                label={`Sensitivity ${store.derived.detectionSensitivityPercent()}%`}
              />
            </div>

            <div class={styles["level-readout"]}>Input {store.derived.levelPercent()}%</div>
          </section>

          <Show when={!store.derived.recordEnabled() && store.derived.reviewEvents().length > 0}>
            <section class={styles["review-panel"]} aria-label="Detected note corrections">
              <div class={styles["review-heading"]}>
                <strong>Review notes</strong>
                <span>Lowest confidence first</span>
              </div>
              <div class={styles["review-list"]}>
                <For each={store.derived.reviewEvents()}>
                  {(event) => (
                    <div class={styles["review-row"]}>
                      <div class={styles["review-note"]}>
                        <strong>{event.noteLabel}</strong>
                        <span>{event.confidenceLabel}</span>
                        <Show when={event.corrected}>
                          <small>Detected {event.detectedNoteLabel}</small>
                        </Show>
                      </div>
                      <div class={styles["review-actions"]}>
                        <PadPilot.Button
                          icon={<Minus size={14} />}
                          tooltip={`Lower ${event.noteLabel} one semitone`}
                          onClick={() => store.actions.correctNote(event.eventId, event.midiNote - 1)}
                        />
                        <PadPilot.Button
                          icon={<Plus size={14} />}
                          tooltip={`Raise ${event.noteLabel} one semitone`}
                          onClick={() => store.actions.correctNote(event.eventId, event.midiNote + 1)}
                        />
                        <PadPilot.Button
                          disabled={!event.corrected}
                          icon={<RotateCcw size={14} />}
                          tooltip={`Reset ${event.noteLabel} to detected pitch`}
                          onClick={() => store.actions.resetNoteCorrection(event.eventId)}
                        />
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </section>
          </Show>
        </aside>
      </div>
    </section>
  );
}
