import { For, Show, createSignal, onCleanup } from "solid-js";
import { Button } from "../../../components/elements/button";
import { extractFileUploadSelection, FileUploadInput } from "../../../components/elements/file-upload-dropzone";
import styles from "../recut-module.stylex";
import { RecutAnalysisMode, RecutBpmSource } from "../recut-state";
import { PadPilot } from "../../../padpilot/index";
import { useRecutModuleStore } from "../recut-module-store";
import { createWaveformMarkerDragSession } from "./waveform-drag-controller";
import { clamp01 } from "../../../utils/math";
import { PADPILOT_FILE_IMPORT_MAX_BYTES } from "@hyperfocus/pad-pilot/file-import";

const RECUT_IMPORT_OPTIONS = {
  category: "sample",
  maxBytes: PADPILOT_FILE_IMPORT_MAX_BYTES,
} as const;

const ANALYSIS_MODE_OPTIONS = [
  { label: "Auto", value: String(RecutAnalysisMode.AUTO) },
  { label: "BPM", value: String(RecutAnalysisMode.BPM) },
  { label: "Custom", value: String(RecutAnalysisMode.CUSTOM) },
];

function formatSourceLabel(path: string) {
  const trimmed = path.trim();
  if (!trimmed) {
    return "Drop sample or click to browse";
  }
  const parts = trimmed.split(/[\\/]/);
  return parts[parts.length - 1] || trimmed;
}

function shouldUseNativeSampleBrowse() {
  return window.location.protocol !== "http:" && window.location.protocol !== "https:";
}

function bpmSourceLabel(source: RecutBpmSource) {
  switch (source) {
    case RecutBpmSource.METADATA:
      return "Metadata";
    case RecutBpmSource.ANALYZED:
      return "Analyzed";
    case RecutBpmSource.PROJECT:
      return "Project";
    case RecutBpmSource.USER:
      return "User";
    default:
      return "Unset";
  }
}

function frameForClientX(element: HTMLElement, clientX: number, totalFrames: number) {
  const rect = element.getBoundingClientRect();
  const ratio = clamp01((clientX - rect.left) / Math.max(1, rect.width));
  return Math.round(ratio * Math.max(1, totalFrames - 1));
}

function markerPercent(frame: number, totalFrames: number) {
  return clamp01(frame / Math.max(1, totalFrames)) * 100;
}

export function WaveformDisplay() {
  const store = useRecutModuleStore();
  const [draggingFile, setDraggingFile] = createSignal(false);
  let waveformRef: HTMLDivElement | undefined;
  let fileInputRef: HTMLInputElement | undefined;
  let pendingSlicePreviewHandle: number | null = null;
  let endMarkerDrag: (() => void) | undefined;
  let importGeneration = 0;
  let disposed = false;

  const sourceLabel = () => store.state().sourceName.trim() || formatSourceLabel(store.state().sourcePath);
  const totalFrames = () => Math.max(Number(store.state().lengthFrames) || 1, ...store.derived.sliceMarkers().map((marker) => marker.endFrame), 1);
  const selectedMarker = () => store.derived.sliceMarkers()[store.derived.selectedMarkerIndex()] ?? null;
  const bpmHint = () => {
    if (store.derived.bpmSuggestedValue() <= 0) {
      return `Project ${Math.round(store.derived.projectBpm())} BPM fallback`;
    }
    return `Suggested ${Math.round(store.derived.bpmSuggestedValue())} BPM at ${Math.round(store.derived.bpmSuggestedConfidence() * 100)}%`;
  };
  const analysisBusyLabel = () => store.derived.analysisProgress() > 0 && store.derived.analysisProgress() < 1
    ? `Rebuilding chops… ${Math.round(store.derived.analysisProgress() * 100)}%`
    : "Rebuilding chops…";

  const clearPendingSlicePreview = () => {
    if (pendingSlicePreviewHandle === null) {
      return;
    }
    window.clearTimeout(pendingSlicePreviewHandle);
    pendingSlicePreviewHandle = null;
  };

  const queueSlicePreview = (sliceIndex: number) => {
    clearPendingSlicePreview();
    pendingSlicePreviewHandle = window.setTimeout(() => {
      pendingSlicePreviewHandle = null;
      store.actions.previewSlice(sliceIndex);
    }, 180);
  };

  onCleanup(() => {
    disposed = true;
    importGeneration += 1;
    clearPendingSlicePreview();
    endMarkerDrag?.();
  });

  const importSelection = async (
    selection: { files: File[]; paths: string[] },
    generation = ++importGeneration,
  ) => {
    const file = selection.files[0];
    const sourcePath = selection.paths[0];

    try {
      store.actions.setImportError(null);
      const imported = file
        ? await PadPilot.IO.importFile(file, RECUT_IMPORT_OPTIONS)
        : sourcePath
          ? await PadPilot.IO.importFile(sourcePath, RECUT_IMPORT_OPTIONS)
          : null;

      if (!imported) {
        throw new Error("PadPilot could not resolve a sample file from that selection.");
      }
      if (disposed || generation !== importGeneration) {
        return;
      }

      store.actions.replaceSource({
        contentId: imported.contentId,
        name: imported.name,
        path: imported.path,
      });
    } catch (error) {
      if (disposed || generation !== importGeneration) {
        return;
      }
      const message = error instanceof Error ? error.message : "PadPilot could not import that sample.";
      store.actions.setImportError(message);
    }
  };

  const browseNativeSample = async () => {
    const generation = ++importGeneration;
    try {
      store.actions.setImportError(null);
      const sourcePath = await PadPilot.IO.pickFile({
        patterns: "*.wav;*.aif;*.aiff;*.flac;*.mp3;*.ogg",
        title: "Select sample",
      });
      if (sourcePath) {
        await importSelection({ files: [], paths: [sourcePath] }, generation);
      }
    } catch (error) {
      if (disposed || generation !== importGeneration) {
        return;
      }
      store.actions.setImportError(error instanceof Error ? error.message : "PadPilot could not select that sample.");
    }
  };

  const openReplacePicker = () => {
    if (shouldUseNativeSampleBrowse()) {
      browseNativeSample();
      return;
    }
    fileInputRef?.click();
  };

  const handleSurfaceClick = (event: MouseEvent) => {
    if (!waveformRef || !store.derived.loaded()) {
      return;
    }
    const clickFrame = frameForClientX(waveformRef, event.clientX, totalFrames());
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    store.derived.sliceMarkers().forEach((marker, index) => {
      const distance = Math.abs(marker.startFrame - clickFrame);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });
    store.actions.setSelectedMarkerIndex(nearestIndex);
  };

  const handleSurfaceDoubleClick = (event: MouseEvent) => {
    if (!waveformRef || !store.derived.loaded()) {
      return;
    }
    clearPendingSlicePreview();
    const clickFrame = frameForClientX(waveformRef, event.clientX, totalFrames());
    store.actions.addMarkerAtFrame(clickFrame);
  };

  const startMarkerDrag = (markerIndex: number) => (event: PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (!waveformRef) {
      return;
    }
    endMarkerDrag?.();
    store.actions.setSelectedMarkerIndex(markerIndex);
    const dragSession = createWaveformMarkerDragSession({
      cancelTimer: (handle) => window.clearTimeout(handle),
      onActivate: () => {
        store.actions.setDraggingMarkerIndex(markerIndex);
      },
      onDeactivate: () => {
        store.actions.setDraggingMarkerIndex(null);
      },
      onMove: (move) => {
        if (!waveformRef) {
          return;
        }
        store.actions.moveMarker(markerIndex, frameForClientX(waveformRef, move.clientX, totalFrames()), move.snapToTransient);
      },
      scheduleTimer: (callback, delayMs) => window.setTimeout(callback, delayMs),
      startAltKey: event.altKey,
    });
    let ended = false;
    const cleanup = () => {
      if (ended) {
        return;
      }
      ended = true;
      dragSession.dispose();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      if (endMarkerDrag === cleanup) {
        endMarkerDrag = undefined;
      }
    };
    const onMove = (moveEvent: PointerEvent) => {
      dragSession.handleMove(moveEvent);
    };
    const onUp = () => {
      cleanup();
    };
    endMarkerDrag = cleanup;
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  const renderWaveformEditor = () => (
    <div
      ref={waveformRef}
      class={`${styles["waveform-canvas"]} ${draggingFile() ? styles["is-file-dragging"] : ""}`.trim()}
      role="group"
      tabindex={store.derived.loaded() ? 0 : -1}
      aria-label="Recut waveform editor"
      onClick={handleSurfaceClick}
      onDblClick={handleSurfaceDoubleClick}
      onKeyDown={(event) => {
        const markerIndex = store.derived.selectedMarkerIndex();
        if (event.key === "Delete" || event.key === "Backspace") {
          event.preventDefault();
          store.actions.removeMarker(markerIndex);
          return;
        }
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          store.actions.nudgeMarker(markerIndex, event.shiftKey ? -16 : -128);
          return;
        }
        if (event.key === "ArrowRight") {
          event.preventDefault();
          store.actions.nudgeMarker(markerIndex, event.shiftKey ? 16 : 128);
        }
      }}
      onDragOver={(event) => {
        event.preventDefault();
        setDraggingFile(true);
      }}
      onDragEnter={(event) => {
        event.preventDefault();
        setDraggingFile(true);
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        if (event.currentTarget === event.target) {
          setDraggingFile(false);
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDraggingFile(false);
        importSelection(extractFileUploadSelection(event.dataTransfer?.files ?? null, event.dataTransfer ?? null));
      }}
    >
      <FileUploadInput
        ref={fileInputRef}
        class={styles["hidden-file-input"]}
        accept=".wav,.aif,.aiff,.flac,.mp3,.ogg,audio/*"
        onSelection={importSelection}
      />
      <svg class={styles["waveform-canvas-svg"]} viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Recut waveform and slice view">
        <polyline
          class={styles["waveform-line"]}
          points={store.derived.waveformPeaks().map((peak, index) => {
            const x = (index / Math.max(1, store.derived.waveformPeaks().length - 1)) * 100;
            const y = 50 - clamp01(peak) * 42;
            return `${x.toFixed(3)},${y.toFixed(3)}`;
          }).join(" ")}
        />
      </svg>
      <div class={styles["slice-overlay"]}>
        <For each={store.derived.candidateTransients()}>
          {(transientFrame) => (
            <span
              class={styles["candidate-marker"]}
              style={{ left: `${markerPercent(transientFrame, totalFrames())}%` }}
            />
          )}
        </For>
        <For each={store.derived.sliceMarkers()}>
          {(marker, index) => (
            <>
              <Button
                appearance="unstyled"
                class={`${styles["slice-region"]} ${index() === store.derived.selectedMarkerIndex() ? styles["is-selected-range"] : ""}`.trim()}
                style={{
                  left: `${markerPercent(marker.startFrame, totalFrames())}%`,
                  width: `${Math.max(0.5, markerPercent(marker.endFrame, totalFrames()) - markerPercent(marker.startFrame, totalFrames()))}%`,
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  store.actions.setSelectedMarkerIndex(index());
                  queueSlicePreview(index());
                }}
                onDblClick={() => {
                  clearPendingSlicePreview();
                }}
                tooltip={`Preview ${store.derived.sliceLabel(index())}`}
              >
                <span class={styles["slice-region-label"]}>{store.derived.sliceLabel(index())}</span>
              </Button>
              <Button
                appearance="unstyled"
                class={`${styles["slice-handle"]} ${index() === store.derived.selectedMarkerIndex() ? styles["is-selected"] : ""}`.trim()}
                style={{ left: `${markerPercent(marker.startFrame, totalFrames())}%` }}
                onClick={(event) => {
                  event.stopPropagation();
                  store.actions.setSelectedMarkerIndex(index());
                }}
                onPointerDown={startMarkerDrag(index())}
                tooltip={`${store.derived.sliceLabel(index())} start`}
              />
            </>
          )}
        </For>
        <For each={store.derived.playingPadIndices()}>
          {(padIndex) => {
            const assignment = store.derived.padAssignments()[padIndex];
            const marker = assignment ? store.derived.sliceMarkers()[assignment.sliceIndex] : null;
            return marker ? (
              <span
                class={styles["playing-marker"]}
                style={{ left: `${markerPercent(marker.startFrame, totalFrames())}%` }}
              />
            ) : null;
          }}
        </For>
      </div>
      <Show when={!store.derived.loaded()}>
        <div class={styles["empty-waveform"]}>Drop sample or click browse to start slicing.</div>
      </Show>
      <Show when={draggingFile()}>
        <div class={styles["replace-overlay"]}>Drop to replace sample</div>
      </Show>
      <Show when={store.derived.loaded() && store.derived.isAnalyzing()}>
        <div class={styles["analysis-overlay"]}>
          <span>{analysisBusyLabel()}</span>
          <div class={styles["analysis-meter"]}>
            <div
              class={`${styles["analysis-meter-fill"]} ${!(store.derived.analysisProgress() > 0 && store.derived.analysisProgress() < 1) ? styles["is-indeterminate"] : ""}`.trim()}
              style={{
                width: store.derived.analysisProgress() > 0 && store.derived.analysisProgress() < 1
                  ? `${Math.max(8, Math.round(store.derived.analysisProgress() * 100))}%`
                  : "38%",
              }}
            />
          </div>
        </div>
      </Show>
    </div>
  );

  return (
    <section class={styles["waveform-display"]}>
      <div class={styles["waveform-header"]}>
        <div class={styles["waveform-title"]}>
          <span class={styles["section-label"]}>Waveform</span>
          <strong>{store.derived.loaded() ? sourceLabel() : "Waiting for sample"}</strong>
          <small class={styles["waveform-meta"]}>
            {store.derived.totalSlices()} chops · {Math.round(store.derived.analysisProgress() * 100)}% analyzed
          </small>
        </div>
        <div class={styles["waveform-actions"]}>
          <PadPilot.Dropdown
            label="Analysis"
            value={String(store.derived.analysisMode())}
            options={ANALYSIS_MODE_OPTIONS}
            onChange={(value) => store.actions.setAnalysisMode(Number(value) as RecutAnalysisMode)}
          />
          <PadPilot.Button
            variant="secondary"
            tooltip="Replace sample"
            onClick={openReplacePicker}
          >
            Replace
          </PadPilot.Button>
        </div>
      </div>

      <Show
        when={store.derived.loaded()}
        fallback={(
          <PadPilot.FileUploadDropzone
            accept=".wav,.aif,.aiff,.flac,.mp3,.ogg,audio/*"
            class={styles["waveform-dropzone"]}
            hint={sourceLabel()}
            onBrowseRequest={() => {
              if (shouldUseNativeSampleBrowse()) {
                browseNativeSample();
                return true;
              }
              return false;
            }}
            onSelection={importSelection}
          >
            {renderWaveformEditor()}
          </PadPilot.FileUploadDropzone>
        )}
      >
        {renderWaveformEditor()}
      </Show>

      <div class={styles["waveform-footer"]}>
        <PadPilot.Slider
          orientation="horizontal"
          min={0}
          max={1}
          value={store.derived.density()}
          onChange={(value) => {
            if (store.derived.canEditDensity()) {
              store.actions.setDensity(value);
            }
          }}
          onCommit={(value) => {
            if (store.derived.canEditDensity()) {
              store.actions.setDensity(value, { commit: true });
            }
          }}
          label={`Density ${Math.round(store.derived.density() * 100)}%`}
          tooltip={store.derived.canEditDensity()
            ? store.derived.analysisMode() === RecutAnalysisMode.AUTO
              ? "Controls how strict Recut is about which transients count as interesting."
              : "Controls chop density."
            : "Disabled in Custom mode."}
        />
        <Show when={store.derived.analysisMode() === RecutAnalysisMode.BPM}>
          <div class={styles["bpm-controls"]}>
            <PadPilot.TextField
              label="BPM"
              type="number"
              min="20"
              max="320"
              value={String(Math.round(store.derived.bpmValue() || store.derived.projectBpm()))}
              description={`${bpmSourceLabel(store.derived.bpmSource())} · ${Math.round(store.derived.bpmConfidence() * 100)}% confidence`}
              onInput={(event) => {
                const nextValue = Number(event.currentTarget.value);
                if (Number.isFinite(nextValue)) {
                  store.actions.setBpmValue(nextValue);
                }
              }}
            />
            <div class={styles["bpm-hint"]}>{bpmHint()}</div>
          </div>
        </Show>
        <PadPilot.Button
          variant="ghost"
          tooltip="Regenerate chops"
          onClick={store.actions.reanalyze}
        >
          Reanalyze
        </PadPilot.Button>
      </div>

      <Show when={selectedMarker()}>
        {(marker) => (
          <div class={styles["marker-readout"]}>
            <span class={`${styles["section-label"]} ${styles["marker-readout-span"]}`.trim()}>Selected Chop</span>
            <strong>Start {marker().startFrame}</strong>
            <span class={styles["marker-readout-span"]}>End {marker().endFrame}</span>
            <span class={styles["marker-readout-span"]}>Pad {marker().padIndex + 1}</span>
          </div>
        )}
      </Show>

      <Show when={store.derived.importError()}>
        {(message) => <div class={styles["import-error"]}>{message()}</div>}
      </Show>
    </section>
  );
}








