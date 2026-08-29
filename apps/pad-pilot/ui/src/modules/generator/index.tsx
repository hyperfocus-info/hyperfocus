import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { ChevronDown, ChevronUp } from "lucide-solid";
import { createStore } from "solid-js/store";
import { PadPilot } from "../../padpilot/index";
import { GeneratorDashboard, type GeneratorDashboardState } from "./components/generator-dashboard";
import { generateMidiTemplate, type GeneratedMidiTemplate } from "./utils/codex-client";
import { isPadPilotDevtoolsEnabled } from "../../runtime-flags";
import {
  type GeneratorAiSettings,
  type GeneratorDashboardFields,
} from "./utils/generator-options";
import {
  GENERATOR_AI_SETTINGS_CHANGED_EVENT,
  loadGeneratorAiSettings,
} from "./utils/generator-ai-settings";
import styles from "./generator-module.module.css";

type GeneratorRunStatus = "error" | "idle" | "loading" | "ready";

type GeneratorRunState = {
  logs: string[];
  progress: number;
  status: GeneratorRunStatus;
};

type GeneratorModuleState = {
  dashboard: GeneratorDashboardState;
  // Removed from canonical Module state. Optional fields let old projects be
  // migrated without making transient view/session data part of the new shape.
  midiDrawerOpen?: boolean;
  run?: GeneratorRunState;
  statusDrawerOpen?: boolean;
  template?: unknown;
};

type GeneratorViewState = {
  midiDrawerOpen: boolean;
  statusDrawerOpen: boolean;
};

function createInitialRunState() {
  return {
    logs: ["standby Codex CLI bridge"],
    progress: 0,
    status: "idle",
  } satisfies GeneratorRunState;
}

function createInitialModuleState() {
  return {
    dashboard: {
      fields: {
        complexity: "",
        creativity: 0.65,
        density: 0.55,
        era: "",
        genre: "",
        humanize: 0.35,
        lengthBars: 4,
        mood: "",
        notes: "",
        scaleKey: "",
        temperature: 0.7,
      },
      locked: {
        complexity: false,
        creativity: false,
        density: false,
        era: false,
        genre: false,
        humanize: false,
        lengthBars: false,
        mood: false,
        scaleKey: false,
        temperature: false,
      },
      manualFields: {
        complexity: false,
        era: false,
        genre: false,
        mood: false,
        scaleKey: false,
      },
      queries: {
        complexity: "",
        era: "",
        genre: "",
        mood: "",
        scaleKey: "",
      },
      rerollSeed: 0,
      suggestedFields: {
        complexity: false,
        era: false,
        genre: false,
        mood: false,
        scaleKey: false,
      },
    },
  } satisfies GeneratorModuleState;
}

const GENERATOR_PROGRESS_COMPLETE_MS = 420;
const GENERATOR_PROGRESS_LOADING_CAP = 97.5;
const GENERATOR_PROGRESS_READY_CAP = 100;
const GENERATOR_PROGRESS_START = 4.5;
const GENERATOR_PROGRESS_PER_SECOND = 1.15;
const GENERATOR_PROGRESS_LOG_MS = 1800;

function percent(value: number) {
  return `${value.toFixed(1)}%`;
}

function lineTimestamp() {
  return new Date().toLocaleTimeString([], { hour12: false, minute: "2-digit", second: "2-digit" });
}

function generatorAuditLines(generated: GeneratedMidiTemplate) {
  const audit = generated.audit;
  if (!audit) {
    return [];
  }
  const magicFieldLabels: Record<string, string> = {
    complexity: "Complexity",
    era: "Era",
    genre: "Genre",
    mood: "Mood/Vibe",
    scaleKey: "Scale/Mode",
  };
  const magicFields = audit.magicProvenance
    ? Object.entries(audit.magicProvenance.suggestedFields)
      .filter(([, suggested]) => suggested)
      .map(([field]) => magicFieldLabels[field] ?? field)
    : [];
  return [
    `Source: ${generated.source}`,
    ...(audit.magicProvenance ? [`Magic: chaos ${Math.round(audit.magicProvenance.chaos * 100)}%; reroll ${audit.magicProvenance.reroll}`] : []),
    ...(magicFields.length > 0 ? [`Magic fields: ${magicFields.join(", ")}`] : []),
    ...(audit.modelEnvelope ? [
      `Schema: ${audit.modelEnvelope.schemaVersion}; grammar ${audit.modelEnvelope.grammarVersion}`,
      `Plan: ${audit.modelEnvelope.arrangementPlan.style}; ${audit.modelEnvelope.arrangementPlan.grid}; roles ${audit.modelEnvelope.arrangementPlan.roles.join(", ")}`,
    ] : []),
    ...(audit.modelFailure ? [`Fallback: ${audit.modelFailure.reason}`] : []),
    ...(audit.modelValidationReport ? [`Model quality ${Math.round(audit.modelValidationReport.score)} - ${audit.modelValidationReport.passed ? "passed" : "failed"}`] : []),
    ...(audit.validationReport ? [
      `Quality ${Math.round(audit.validationReport.score)} - ${audit.validationReport.passed ? "passed" : "failed"}`,
      ...(audit.validationReport.reasons.length > 0 ? [`Reasons: ${audit.validationReport.reasons.join("; ")}`] : []),
    ] : []),
    ...(audit.repairPatch ? [
      `Repair ${Math.round(audit.repairPatch.beforeScore)} -> ${Math.round(audit.repairPatch.afterScore)} (${audit.repairPatch.keepMassaged ? "massaged" : "structural"})`,
      ...(audit.repairPatch.patchLines.length > 0 ? [`Patch: ${audit.repairPatch.patchLines.join("; ")}`] : []),
    ] : []),
    ...(audit.modelEnvelope?.validationNotes.length ? [`Validation: ${audit.modelEnvelope.validationNotes.join("; ")}`] : []),
    ...(audit.modelEnvelope?.repairAvoided.length ? [`Avoided: ${audit.modelEnvelope.repairAvoided.join("; ")}`] : []),
  ];
}

/** GeneratorModule builds local-model MIDI templates and exposes DAW drag blocks. */
export function GeneratorModule() {
  const [moduleState, setModuleState] = PadPilot.hooks.useModuleState<GeneratorModuleState>("generator", createInitialModuleState());
  const [viewState, setViewState] = PadPilot.hooks.useEditorViewState<GeneratorViewState>("generator", {
    midiDrawerOpen: true,
    statusDrawerOpen: true,
  });
  const [mounted, setMounted] = createSignal(false);
  const [theme, setTheme] = createSignal<"dark" | "light">("light");
  const [template, setTemplate] = createSignal<GeneratedMidiTemplate | null>(null);
  const [run, setRun] = createStore<GeneratorRunState>(createInitialRunState());
  const [aiSettings, setAiSettings] = createStore(loadGeneratorAiSettings());
  const progressLogLines = [
    "still working: waiting on model tokens",
    "still working: validating tracker syntax",
    "still working: preparing style massage",
    "still working: shaping groove lanes",
    "still working: checking MIDI export bounds",
  ];
  let completeFrame: number | null = null;
  let completeCancel: (() => void) | null = null;
  let completeTimer: number | null = null;
  let mountFrame: number | null = null;
  let progressLogIndex = 0;
  let progressLogTimer: number | null = null;
  let progressFrame: number | null = null;
  let progressStartedAt = 0;
  let progressLastAt = 0;

  const addLog = (line: string) => {
    setRun("logs", (logs) => [...logs, `${lineTimestamp()} ${line}`].slice(-24));
  };

  createEffect(() => {
    const current = moduleState();
    if (
      current.midiDrawerOpen === undefined &&
      current.run === undefined &&
      current.statusDrawerOpen === undefined &&
      current.template === undefined
    ) {
      return;
    }
    setModuleState({
      midiDrawerOpen: undefined,
      run: undefined,
      statusDrawerOpen: undefined,
      template: undefined,
    });
  });

  const updateTemplate = (nextTemplate: GeneratedMidiTemplate | null) => {
    setTemplate(nextTemplate);
  };

  const stopProgressAnimation = () => {
    if (progressFrame === null) {
      return;
    }
    window.cancelAnimationFrame(progressFrame);
    progressFrame = null;
  };

  const stopCompletionAnimation = () => {
    const cancel = completeCancel;
    completeCancel = null;
    if (cancel) {
      cancel();
      return;
    }
    if (completeFrame !== null) {
      window.cancelAnimationFrame(completeFrame);
      completeFrame = null;
    }
    if (completeTimer !== null) {
      window.clearTimeout(completeTimer);
      completeTimer = null;
    }
  };

  const stopProgressLogPump = () => {
    if (progressLogTimer === null) {
      return;
    }
    window.clearInterval(progressLogTimer);
    progressLogTimer = null;
  };

  const stopProgressWork = () => {
    stopProgressAnimation();
    stopCompletionAnimation();
    stopProgressLogPump();
  };

  const startProgressLogPump = () => {
    stopProgressLogPump();
    progressLogIndex = 0;
    progressLogTimer = window.setInterval(() => {
      addLog(progressLogLines[progressLogIndex % progressLogLines.length] ?? "still working");
      progressLogIndex += 1;
    }, GENERATOR_PROGRESS_LOG_MS);
  };

  const startProgressAnimation = () => {
    stopProgressAnimation();
    progressStartedAt = window.performance.now();
    progressLastAt = progressStartedAt;
    const tick = (now: number) => {
      const elapsedSeconds = Math.max(0.001, (now - progressLastAt) / 1000);
      const target = Math.min(GENERATOR_PROGRESS_LOADING_CAP, GENERATOR_PROGRESS_START + ((now - progressStartedAt) / 1000) * GENERATOR_PROGRESS_PER_SECOND);
      progressLastAt = now;
      setRun("progress", (progress) => {
        const lerpAmount = Math.min(1, elapsedSeconds * 1.6);
        return Math.min(GENERATOR_PROGRESS_LOADING_CAP, progress + (target - progress) * lerpAmount);
      });
      progressFrame = window.requestAnimationFrame(tick);
    };
    progressFrame = window.requestAnimationFrame(tick);
  };

  const completeProgressAnimation = () => new Promise<boolean>((resolve) => {
    stopProgressAnimation();
    stopCompletionAnimation();
    const startValue = run.progress;
    const startAt = window.performance.now();
    let finished = false;
    const settle = (completed: boolean) => {
      if (finished) {
        return;
      }
      finished = true;
      if (completeFrame !== null) {
        window.cancelAnimationFrame(completeFrame);
        completeFrame = null;
      }
      if (completeTimer !== null) {
        window.clearTimeout(completeTimer);
        completeTimer = null;
      }
      completeCancel = null;
      if (completed) {
        setRun("progress", GENERATOR_PROGRESS_READY_CAP);
      }
      resolve(completed);
    };
    const finish = () => settle(true);
    completeCancel = () => settle(false);
    const tick = (now: number) => {
      const ratio = Math.min(1, (now - startAt) / GENERATOR_PROGRESS_COMPLETE_MS);
      const eased = 1 - (1 - ratio) ** 3;
      setRun("progress", startValue + (GENERATOR_PROGRESS_READY_CAP - startValue) * eased);
      if (ratio >= 1) {
        finish();
        return;
      }
      completeFrame = window.requestAnimationFrame(tick);
    };
    completeTimer = window.setTimeout(finish, GENERATOR_PROGRESS_COMPLETE_MS + 80);
    completeFrame = window.requestAnimationFrame(tick);
  });

  onMount(() => {
    mountFrame = window.requestAnimationFrame(() => {
      mountFrame = null;
      setMounted(true);
    });
    const onAiSettingsChanged = (event: Event) => {
      const settings = (event as CustomEvent<GeneratorAiSettings>).detail;
      if (settings) {
        setAiSettings(settings);
      }
    };
    window.addEventListener(GENERATOR_AI_SETTINGS_CHANGED_EVENT, onAiSettingsChanged);
    onCleanup(() => {
      window.removeEventListener(GENERATOR_AI_SETTINGS_CHANGED_EVENT, onAiSettingsChanged);
      if (mountFrame !== null) {
        window.cancelAnimationFrame(mountFrame);
        mountFrame = null;
      }
    });
  });

  onCleanup(stopProgressWork);

  const statusLabel = createMemo(() => {
    if (run.status === "loading") return "Connecting";
    if (run.status === "ready") return template()?.source === "fallback" ? "Fallback ready" : "Template ready";
    if (run.status === "error") return "Generation failed";
    return "Idle";
  });

  const progressValue = createMemo(() => Math.min(GENERATOR_PROGRESS_READY_CAP, run.progress));
  const showStatusDrawer = createMemo(() => run.status !== "idle");
  const showMidiDrawer = createMemo(() => template() !== null);

  let generationController: AbortController | null = null;
  let generationId = 0;
  let disposed = false;

  onCleanup(() => {
    disposed = true;
    generationId += 1;
    generationController?.abort();
    generationController = null;
    stopProgressWork();
  });

  const generate = async (fields: GeneratorDashboardFields) => {
    generationController?.abort();
    const controller = new AbortController();
    generationController = controller;
    const requestId = ++generationId;
    stopProgressWork();
    updateTemplate(null);
    setRun({
      logs: [`${lineTimestamp()} boot generator session`],
      progress: GENERATOR_PROGRESS_START,
      status: "loading",
    });
    startProgressAnimation();
    startProgressLogPump();
    addLog("probing agent bridge");
    addLog("normalizing selector/theme/groove tags");
    addLog("building musician prompt");
    addLog("requesting tracker output");
    try {
      const nextTemplate = await generateMidiTemplate(fields, {
        model: aiSettings.model,
        onLog(line) {
          if (!disposed && requestId === generationId && !controller.signal.aborted) {
            addLog(line);
          }
        },
        provider: aiSettings.provider,
        signal: controller.signal,
      });
      if (disposed || requestId !== generationId) {
        return;
      }
      generationController = null;
      stopProgressAnimation();
      stopProgressLogPump();
      addLog(`encoded ${nextTemplate.tracks.length + 1} SMF tracks`);
      updateTemplate(nextTemplate);
      const completed = await completeProgressAnimation();
      if (!completed || disposed || requestId !== generationId) {
        return;
      }
      addLog("generation complete");
      setRun("status", "ready");
    } catch (error) {
      if (
        disposed ||
        requestId !== generationId ||
        controller.signal.aborted ||
        error instanceof DOMException && error.name === "AbortError"
      ) {
        return;
      }
      generationController = null;
      stopProgressWork();
      addLog(error instanceof Error ? error.message : "unknown generation error");
      setRun("status", "error");
    }
  };

  return (
    <section class={styles.root} data-theme={theme()}>
      <div
        class={styles.workspace}
        data-midi-visible={showMidiDrawer() ? "true" : "false"}
        data-mounted={mounted() ? "true" : "false"}
        data-status-visible={showStatusDrawer() ? "true" : "false"}
      >
        <section class={styles["control-panel"]}>
          <GeneratorDashboard
            disabled={run.status === "loading"}
            initialState={moduleState().dashboard}
            onStateChange={(dashboard) => {
              if (JSON.stringify(dashboard) !== JSON.stringify(moduleState().dashboard)) {
                setModuleState({ dashboard });
              }
            }}
            onThemeChange={setTheme}
            onGenerate={(fields) => {
              generate(fields);
            }}
          />
        </section>
        <Show when={showStatusDrawer()}>
        <aside class={styles["side-panel"]} data-open={viewState().statusDrawerOpen ? "true" : "false"} aria-label="Generator status">
          <div class={styles["status-header"]}>
            <div class={styles["drawer-heading-row"]}>
              <h3>{statusLabel()}</h3>
              <PadPilot.Button
                class={styles["drawer-button"]}
                icon={viewState().statusDrawerOpen ? ChevronUp : ChevronDown}
                onClick={() => setViewState({ statusDrawerOpen: !viewState().statusDrawerOpen })}
                size="sm"
                tooltip={viewState().statusDrawerOpen ? "Minimize status drawer" : "Expand status drawer"}
                variant="ghost"
              />
            </div>
            <Show when={viewState().statusDrawerOpen}>
              <small>{template() ? `${template()!.tracks.length} instrument tracks at ${template()!.bpm} BPM` : "Waiting for template request"}</small>
            </Show>
          </div>
          <Show when={viewState().statusDrawerOpen}>
          <div class={styles["meter-stack"]}>
            <div
              class={styles.meter}
              role="meter"
              aria-label="Generation progress"
              aria-valuemin="0"
              aria-valuemax="100"
              aria-valuenow={progressValue().toFixed(1)}
            >
              <div class={styles["meter-label"]}>
                <span>Generation</span>
                <span>{percent(progressValue())}</span>
              </div>
              <div class={styles["meter-bar"]}>
                <div class={styles["meter-fill"]} style={{ width: percent(progressValue()) }} />
              </div>
            </div>
          </div>
          <PadPilot.StreamingTextBox
            autoScroll
            class={styles.terminal}
            copyButton
            lines={run.logs}
          />
          <div class={styles["status-stats"]} aria-label="Generated template summary">
            <span>
              <strong>{template()?.tracks.length ?? "--"}</strong>
              <small>Tracks</small>
            </span>
            <span>
              <strong>{template()?.lengthBars ?? "--"}</strong>
              <small>Bars</small>
            </span>
            <span>
              <strong>{template()?.bpm ?? "--"}</strong>
              <small>BPM</small>
            </span>
            <span>
              <strong>{template()?.selectedScale.split(" ")[0] ?? "--"}</strong>
              <small>Scale</small>
            </span>
          </div>
          </Show>
        </aside>
        </Show>
        <Show when={showMidiDrawer()}>
        <section class={styles["result-panel"]} data-open={viewState().midiDrawerOpen ? "true" : "false"}>
          <div class={styles["result-header"]}>
            <h3>MIDI OUTPUT</h3>
            <small>{template() ? `${template()!.filename} - ${template()!.selectedScale} - ${template()!.lengthBars} bars` : "Generate a template to unlock MIDI drag blocks"}</small>
            <PadPilot.Button
              class={styles["drawer-button"]}
              icon={viewState().midiDrawerOpen ? ChevronDown : ChevronUp}
              onClick={() => setViewState({ midiDrawerOpen: !viewState().midiDrawerOpen })}
              size="sm"
              tooltip={viewState().midiDrawerOpen ? "Minimize MIDI output drawer" : "Expand MIDI output drawer"}
              variant="ghost"
            />
          </div>
          <Show when={viewState().midiDrawerOpen}>
          <Show
            when={template()}
          >
            {(generated) => (
              <>
                <div class={styles["result-actions"]}>
                  <PadPilot.HostBpmButton bpm={generated().bpm} />
                  <div class={styles["primary-midi"]}>
                    <PadPilot.MidiDragBlock
                      filename={generated().filename}
                      label="Complete Multi-track MIDI"
                      midiData={generated().combinedMidi}
                    />
                  </div>
                  <Show when={isPadPilotDevtoolsEnabled() && generated().originalModel}>
                    {(originalModel) => (
                      <div class={styles["primary-midi"]}>
                        <PadPilot.MidiDragBlock
                          filename={originalModel().filename}
                          label={originalModel().label}
                          midiData={originalModel().midiData}
                        />
                      </div>
                    )}
                  </Show>
                </div>
                <Show when={generated().audit}>
                  <div class={styles["audit-panel"]}>
                    <For each={generatorAuditLines(generated())}>
                      {(line) => <span class={styles["audit-item"]}>{line}</span>}
                    </For>
                  </div>
                </Show>
                <div class={styles["track-list"]}>
                  <For each={generated().trackFiles}>
                    {(trackFile, index) => (
                      <div class={styles["track-item"]}>
                        <span class={styles["track-number"]}>{String(index() + 1).padStart(2, "0")}</span>
                        <PadPilot.MidiDragBlock
                          filename={trackFile.filename}
                          label={trackFile.label}
                          midiData={trackFile.midiData}
                        />
                        <span class={styles["track-meta"]}>
                          <span>{`PG ${trackFile.track.program}`}</span>
                          <span>{trackFile.track.drums ? "Drums CH 10" : `CH ${trackFile.track.channel + 1}`}</span>
                        </span>
                      </div>
                    )}
                  </For>
                </div>
              </>
            )}
          </Show>
          </Show>
        </section>
        </Show>
      </div>
    </section>
  );
}

export default GeneratorModule;
