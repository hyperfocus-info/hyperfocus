import { create } from "@bufbuild/protobuf";
import { createContext, createEffect, createMemo, createSignal, onCleanup, onMount, useContext, type ParentProps } from "solid-js";
import { getLatestHostState, subscribeHostState } from "../../bridge";
import { PadPilot } from "../../padpilot/index";
import { createEmptySampleEditorFrame, createSampleCapabilityHandles, sampleCapabilities } from "../../padpilot/sample-capabilities";
import { RECUT_MAX_PADS, RecutAnalysisMode, RecutBpmSource, createDefaultRecutModuleState, getRecutPadLabel, type RecutModuleState } from "./recut-state";
import { SliceMarkerSchema } from "../../proto/generated/recut-pb";
import { clamp } from "../../utils/math";
import { PadTriggerOwner, DENSITY_ANALYSIS_DEBOUNCE_MS, sliceMarkersToSerializable, buildPlaybackStateSignature, mapSampleAnalysisMode, mapSampleBpmSource, markerFromFrame, padAssignmentFromFrame, mapRecutBpmSourceFromFrame, mapRecutAnalysisModeFromFrame, targetSliceCountForMode, buildAnalysisRequest, createDefaultPadAssignments, commitMarkers, resolvePadIndexFromButtons, resolvePreviewPadIndex } from "./recut-store-codec";

type RecutUiState = {
  activePadIndex: number;
  draggingMarkerIndex: number | null;
  importError: string;
  selectedMarkerIndex: number;
  waveformHoverFrame: number | null;
};

type PendingAnalysisState = {
  analysisMode: RecutAnalysisMode;
  bpmSource: RecutBpmSource;
  bpmValue: number;
  density: number;
};

function createRecutModuleStore() {
  const [state, setState] = PadPilot.hooks.useModuleState<RecutModuleState>("recut", createDefaultRecutModuleState());
  const [viewState, setViewState] = PadPilot.hooks.useEditorViewState<RecutUiState>("recut-module", {
    activePadIndex: 0,
    draggingMarkerIndex: null,
    importError: "",
    selectedMarkerIndex: 0,
    waveformHoverFrame: null,
  });
  const gamepad = PadPilot.hooks.useGamepad();
  const moduleInteraction = PadPilot.hooks.useModuleInteraction("recut");
  const [hostFrame, setHostFrame] = createSignal(createEmptySampleEditorFrame());
  const [pendingAnalysisState, setPendingAnalysisState] = createSignal<PendingAnalysisState | null>(null);
  const [projectBpm, setProjectBpm] = createSignal(getLatestHostState().projectBpm ?? 120);
  const handles = createMemo(() => createSampleCapabilityHandles("recut"));
  let lastLoadedSourcePath = "";
  let lastAppliedPlaybackSignature = "";
  let lastHandledSampleSourceSelectionSequence = getLatestHostState().pathSelectionSequence ?? 0;
  let previousGamepadButtons: number[] = [];
  let pendingDensityAnalysisHandle: number | null = null;
  let pendingDensityAnalysisState: RecutModuleState | null = null;
  const padTriggerOwners = new Map<number, Set<PadTriggerOwner>>();
  const previewReleaseTimers = new Map<number, number>();

  const buildPlaybackState = () => ({
    analysisMode: mapSampleAnalysisMode(state().analysisMode),
    bpmConfidence: state().bpmConfidence,
    bpmSource: mapSampleBpmSource(state().bpmSource),
    bpmSuggestedConfidence: state().bpmSuggestedConfidence,
    bpmSuggestedValue: state().bpmSuggestedValue,
    bpmValue: state().bpmValue,
    density: state().density,
    gainDb: state().gainDb,
    grainDensity: state().grainDensity,
    grainSizeMs: state().grainSizeMs,
    granularEnabled: state().granularEnabled,
    manualEditRevision: state().manualEditRevision,
    padAssignments: state().padAssignments.map((assignment) => ({
      bank: assignment.bank,
      chokeGroupId: assignment.chokeGroupId,
      faceButton: assignment.faceButton,
      isEmpty: assignment.isEmpty,
      padIndex: assignment.padIndex,
      sliceIndex: assignment.sliceIndex,
    })),
    pitchSemitones: state().pitchSemitones,
    projectBpm: projectBpm(),
    sampleHandle: handles().sampleSource,
    sliceMarkers: sliceMarkersToSerializable(state()),
    stretchEnabled: state().stretchEnabled,
  });

  const currentState = createMemo(() => state());
  const currentFrame = createMemo(() => hostFrame());
  const currentView = createMemo(() => viewState());
  const currentPendingAnalysis = createMemo(() => pendingAnalysisState());
  const hasLiveFrame = createMemo(() =>
    currentFrame().sequence > 0n ||
    currentFrame().loaded ||
    currentFrame().waveformPeaks.length > 0 ||
    currentFrame().sliceMarkers.length > 0,
  );
  const localCustomAheadOfFrame = createMemo(
    () =>
      currentState().analysisMode === RecutAnalysisMode.CUSTOM &&
      currentState().manualEditRevision > currentFrame().analysisRevision,
  );
  const preferLocalState = createMemo(() => {
    if (!hasLiveFrame()) {
      return true;
    }
    if (currentPendingAnalysis()) {
      return false;
    }
    return localCustomAheadOfFrame();
  });
  const markersVisible = createMemo(() => currentFrame().loaded || currentState().loaded);
  const syncedSliceMarkers = createMemo(() =>
    !markersVisible()
      ? []
      : currentFrame().sliceMarkers.length > 0
      ? currentFrame().sliceMarkers.map((marker) => markerFromFrame(marker))
      : currentState().sliceMarkers,
  );
  const syncedPadAssignments = createMemo(() =>
    !markersVisible()
      ? []
      : currentFrame().padAssignments.length > 0
      ? currentFrame().padAssignments.map((assignment) => padAssignmentFromFrame(assignment))
      : currentState().padAssignments,
  );
  const liveAnalysisMode = createMemo(() =>
    currentPendingAnalysis()?.analysisMode ??
    (preferLocalState() ? currentState().analysisMode : mapRecutAnalysisModeFromFrame(currentFrame().analysisMode)),
  );

  const clearPreviewReleaseTimer = (padIndex: number) => {
    const handle = previewReleaseTimers.get(padIndex);
    if (handle === undefined) {
      return;
    }
    window.clearTimeout(handle);
    previewReleaseTimers.delete(padIndex);
  };

  const clearAllPreviewReleaseTimers = () => {
    for (const handle of previewReleaseTimers.values()) {
      window.clearTimeout(handle);
    }
    previewReleaseTimers.clear();
  };

  const pressPad = (padIndex: number, owner: PadTriggerOwner) => {
    const owners = padTriggerOwners.get(padIndex) ?? new Set<PadTriggerOwner>();
    if (owners.has(owner)) {
      return;
    }
    const shouldTrigger = owners.size === 0;
    owners.add(owner);
    padTriggerOwners.set(padIndex, owners);
    if (shouldTrigger) {
      sampleCapabilities.triggerPad(handles().slicePlayback, padIndex, 1, true);
    }
  };

  const snapFrameToTransient = (frame: number) => {
    const safeFrame = clamp(Math.round(frame), 0, Math.max(0, Number(currentState().lengthFrames) - 1));
    const candidates = currentFrame().candidateTransients;
    if (candidates.length === 0) {
      return safeFrame;
    }
    let nearest = candidates[0] ?? safeFrame;
    let nearestDistance = Math.abs(nearest - safeFrame);
    for (let index = 1; index < candidates.length; index += 1) {
      const candidate = candidates[index] ?? safeFrame;
      const distance = Math.abs(candidate - safeFrame);
      if (distance < nearestDistance) {
        nearest = candidate;
        nearestDistance = distance;
      }
    }
    return nearest;
  };

  const releasePad = (padIndex: number, owner: PadTriggerOwner) => {
    const owners = padTriggerOwners.get(padIndex);
    if (!owners?.delete(owner)) {
      return;
    }
    if (owners.size > 0) {
      return;
    }
    padTriggerOwners.delete(padIndex);
    sampleCapabilities.triggerPad(handles().slicePlayback, padIndex, 1, false);
  };

  const releaseAllTriggeredPads = () => {
    clearAllPreviewReleaseTimers();
    for (const padIndex of padTriggerOwners.keys()) {
      sampleCapabilities.triggerPad(handles().slicePlayback, padIndex, 1, false);
    }
    padTriggerOwners.clear();
    previousGamepadButtons = [];
  };

  const previewSlice = (sliceIndex: number) => {
    const marker = syncedSliceMarkers()[sliceIndex];
    if (!marker) {
      return;
    }
    const padIndex = resolvePreviewPadIndex(sliceIndex, syncedPadAssignments());
    const assignment = syncedPadAssignments().find((entry) => entry.padIndex === padIndex) ?? null;
    if (assignment?.isEmpty) {
      return;
    }
    const sampleRate = Math.max(1, currentState().sampleRate || 48000);
    const previewDurationMs = Math.max(40, Math.round(((marker.endFrame - marker.startFrame) / sampleRate) * 1000));
    clearPreviewReleaseTimer(padIndex);
    pressPad(padIndex, "preview");
    setViewState({ activePadIndex: padIndex, selectedMarkerIndex: sliceIndex });
    previewReleaseTimers.set(
      padIndex,
      window.setTimeout(() => {
        previewReleaseTimers.delete(padIndex);
        releasePad(padIndex, "preview");
      }, previewDurationMs),
    );
  };

  const requestAnalysis = (nextState = state()) => {
    sampleCapabilities.requestAnalysis(handles().sampleAnalysis, buildAnalysisRequest(nextState, projectBpm()));
  };

  const clearPendingDensityAnalysis = () => {
    if (pendingDensityAnalysisHandle !== null) {
      window.clearTimeout(pendingDensityAnalysisHandle);
      pendingDensityAnalysisHandle = null;
    }
    pendingDensityAnalysisState = null;
  };

  const flushPendingDensityAnalysis = () => {
    const nextState = pendingDensityAnalysisState;
    if (!nextState) {
      return;
    }
    if (pendingDensityAnalysisHandle !== null) {
      window.clearTimeout(pendingDensityAnalysisHandle);
      pendingDensityAnalysisHandle = null;
    }
    pendingDensityAnalysisState = null;
    requestAnalysis(nextState);
  };

  const queueDensityAnalysis = (nextState: RecutModuleState, immediate = false) => {
    pendingDensityAnalysisState = nextState;
    if (immediate) {
      flushPendingDensityAnalysis();
      return;
    }
    if (pendingDensityAnalysisHandle !== null) {
      window.clearTimeout(pendingDensityAnalysisHandle);
    }
    pendingDensityAnalysisHandle = window.setTimeout(() => {
      pendingDensityAnalysisHandle = null;
      const queuedState = pendingDensityAnalysisState;
      pendingDensityAnalysisState = null;
      if (queuedState) {
        requestAnalysis(queuedState);
      }
    }, DENSITY_ANALYSIS_DEBOUNCE_MS);
  };

  const applyPlaybackState = () => {
    sampleCapabilities.applySlicePlaybackState(handles().slicePlayback, buildPlaybackState());
  };

  onMount(() => {
    const unsubscribe = sampleCapabilities.openEditorFrameStream(handles().sampleAnalysis, (frame) => {
      setHostFrame(frame);
    });
    const unsubscribeHost = subscribeHostState((hostState) => {
      if (hostState.projectBpm && Number.isFinite(hostState.projectBpm)) {
        setProjectBpm(hostState.projectBpm);
      }
      if (hostState.type !== "sampleSourcePathSelected") {
        return;
      }
      const pathSelectionSequence = hostState.pathSelectionSequence ?? 0;
      const sourcePath = hostState.path?.trim() ?? "";
      if (pathSelectionSequence <= lastHandledSampleSourceSelectionSequence || sourcePath.length === 0) {
        return;
      }
      lastHandledSampleSourceSelectionSequence = pathSelectionSequence;
      actions.loadSource({
        contentId: hostState.contentId,
        name: hostState.name,
        path: sourcePath,
      });
    });
    onCleanup(unsubscribe);
    onCleanup(unsubscribeHost);
  });

  onCleanup(() => {
    releaseAllTriggeredPads();
    clearPendingDensityAnalysis();
  });

  createEffect(() => {
    const current = state();
    const playbackSignature = buildPlaybackStateSignature(current, handles().sampleSource, projectBpm());
    if (playbackSignature === lastAppliedPlaybackSignature) {
      return;
    }
    lastAppliedPlaybackSignature = playbackSignature;
    applyPlaybackState();
  });

  createEffect(() => {
    const pending = currentPendingAnalysis();
    if (!pending) {
      return;
    }
    const frame = currentFrame();
    if (!frame.loaded) {
      return;
    }
    if (
      mapRecutAnalysisModeFromFrame(frame.analysisMode) === pending.analysisMode &&
      Math.abs(frame.density - pending.density) <= 0.0001 &&
      Math.abs(frame.bpmValue - pending.bpmValue) <= 0.0001 &&
      mapRecutBpmSourceFromFrame(frame.bpmSource) === pending.bpmSource
    ) {
      setPendingAnalysisState(null);
    }
  });

  createEffect(() => {
    const sourcePath = state().sourcePath.trim();
    if (sourcePath.length === 0 || sourcePath === lastLoadedSourcePath) {
      return;
    }
    lastLoadedSourcePath = sourcePath;
    sampleCapabilities.loadFile(handles().sampleSource, {
      sourceContentId: state().sourceContentId.trim(),
      sourceName: state().sourceName.trim(),
      sourcePath,
    });
  });

  createEffect(() => {
    const buttons = [...gamepad().buttons];
    const nextPadIndex = resolvePadIndexFromButtons(buttons);
    const previousPadIndex = resolvePadIndexFromButtons(previousGamepadButtons);
    if (nextPadIndex !== previousPadIndex) {
      if (previousPadIndex !== null) {
        releasePad(previousPadIndex, "gamepad");
      }
      if (nextPadIndex !== null) {
        pressPad(nextPadIndex, "gamepad");
        setViewState({ activePadIndex: nextPadIndex });
      }
    }
    previousGamepadButtons = buttons;
  });

  const actions = {
    loadSource(input: { path: string; name?: string; contentId?: string }) {
      releaseAllTriggeredPads();
      clearPendingDensityAnalysis();
      setPendingAnalysisState(null);
      setHostFrame(createEmptySampleEditorFrame());
      setState({
        loaded: false,
        sourceContentId: input.contentId?.trim() ?? "",
        sourceName: input.name?.trim() ?? "",
        sourcePath: input.path,
      });
      setViewState({ importError: "" });
      lastLoadedSourcePath = "";
    },
    replaceSource(input: { path: string; name?: string; contentId?: string }) {
      actions.loadSource(input);
    },
    setImportError(message: string | null) {
      setViewState({ importError: message?.trim() ?? "" });
    },
    reanalyze() {
      clearPendingDensityAnalysis();
      requestAnalysis();
    },
    setAnalysisMode(analysisMode: RecutAnalysisMode) {
      const nextState = {
        ...state(),
        analysisMode,
      };
      setState({
        analysisMode,
      });
      if (analysisMode !== RecutAnalysisMode.CUSTOM) {
        clearPendingDensityAnalysis();
        setPendingAnalysisState({
          analysisMode,
          bpmSource: nextState.bpmSource,
          bpmValue: nextState.bpmValue,
          density: nextState.density,
        });
        requestAnalysis(nextState);
      }
    },
    setDensity(density: number, options?: { commit?: boolean }) {
      const nextDensity = clamp(density, 0, 1);
      const current = state();
      setState({ density: nextDensity });
      if (current.analysisMode !== RecutAnalysisMode.CUSTOM) {
        const nextState = { ...current, density: nextDensity };
        setPendingAnalysisState({
          analysisMode: nextState.analysisMode,
          bpmSource: nextState.bpmSource,
          bpmValue: nextState.bpmValue,
          density: nextDensity,
        });
        queueDensityAnalysis(nextState, options?.commit === true);
      }
    },
    setBpmValue(bpmValue: number, source = RecutBpmSource.USER) {
      const nextBpmValue = clamp(bpmValue, 20, 320);
      const nextState = {
        ...state(),
        analysisMode: RecutAnalysisMode.BPM,
        bpmSource: source,
        bpmValue: nextBpmValue,
      };
      setState({
        analysisMode: nextState.analysisMode,
        bpmSource: nextState.bpmSource,
        bpmValue: nextState.bpmValue,
      });
      clearPendingDensityAnalysis();
      setPendingAnalysisState({
        analysisMode: nextState.analysisMode,
        bpmSource: nextState.bpmSource,
        bpmValue: nextState.bpmValue,
        density: nextState.density,
      });
      requestAnalysis(nextState);
    },
    setGainDb(gainDb: number) {
      setState({ gainDb: clamp(gainDb, -24, 24) });
    },
    setPitchSemitones(pitchSemitones: number) {
      setState({ pitchSemitones: clamp(pitchSemitones, -24, 24) });
    },
    setStretchEnabled(stretchEnabled: boolean) {
      setState({ stretchEnabled });
    },
    setGranularEnabled(granularEnabled: boolean) {
      setState({ granularEnabled });
    },
    setGrainSizeMs(grainSizeMs: number) {
      setState({ grainSizeMs: clamp(grainSizeMs, 2, 250) });
    },
    setGrainDensity(grainDensity: number) {
      setState({ grainDensity: clamp(grainDensity, 0, 1) });
    },
    setSelectedMarkerIndex(selectedMarkerIndex: number) {
      setViewState({ selectedMarkerIndex: clamp(selectedMarkerIndex, 0, Math.max(0, syncedSliceMarkers().length - 1)) });
    },
    setActivePadIndex(activePadIndex: number) {
      setViewState({ activePadIndex: clamp(activePadIndex, 0, RECUT_MAX_PADS - 1) });
    },
    setDraggingMarkerIndex(draggingMarkerIndex: number | null) {
      setViewState({ draggingMarkerIndex });
    },
    setWaveformHoverFrame(waveformHoverFrame: number | null) {
      setViewState({ waveformHoverFrame });
    },
    triggerPad(padIndex: number, pressed = true) {
      const assignment = syncedPadAssignments()[padIndex] ?? null;
      if (assignment?.isEmpty) {
        setViewState({ activePadIndex: padIndex });
        return;
      }
      if (!pressed) {
        releasePad(padIndex, "ui");
      } else {
        pressPad(padIndex, "ui");
      }
      setViewState({ activePadIndex: padIndex });
    },
    previewSlice,
    commitMarkers(nextMarkers: readonly RecutModuleState["sliceMarkers"][number][]) {
      const normalizedMarkers = commitMarkers(nextMarkers, Number(state().lengthFrames || BigInt(nextMarkers.at(-1)?.endFrame ?? 1)));
      const nextState = {
        ...state(),
        analysisMode: RecutAnalysisMode.CUSTOM,
        manualEditRevision: state().manualEditRevision + 1n,
        padAssignments: createDefaultPadAssignments(normalizedMarkers.length),
        sliceMarkers: normalizedMarkers,
      };
      clearPendingDensityAnalysis();
      setPendingAnalysisState(null);
      moduleInteraction.begin();
      setState({
        analysisMode: RecutAnalysisMode.CUSTOM,
        manualEditRevision: nextState.manualEditRevision,
        padAssignments: nextState.padAssignments,
        sliceMarkers: normalizedMarkers,
      });
      moduleInteraction.end();
      setViewState({
        selectedMarkerIndex: clamp(currentView().selectedMarkerIndex, 0, Math.max(0, normalizedMarkers.length - 1)),
      });
      sampleCapabilities.applySlicePlaybackState(handles().slicePlayback, {
        ...buildPlaybackState(),
        analysisMode: mapSampleAnalysisMode(RecutAnalysisMode.CUSTOM),
        manualEditRevision: nextState.manualEditRevision,
        padAssignments: nextState.padAssignments.map((assignment) => ({
          bank: assignment.bank,
          chokeGroupId: assignment.chokeGroupId,
          faceButton: assignment.faceButton,
          isEmpty: assignment.isEmpty,
          padIndex: assignment.padIndex,
          sliceIndex: assignment.sliceIndex,
        })),
        sliceMarkers: normalizedMarkers.map((marker) => ({
          chokeGroupId: marker.chokeGroupId,
          confidence: marker.confidence,
          endFrame: marker.endFrame,
          fadeMs: marker.fadeMs,
          padIndex: marker.padIndex,
          snapExact: marker.snapExact,
          startFrame: marker.startFrame,
          transientFrame: marker.transientFrame,
        })),
      });
    },
    addMarkerAtFrame(frame: number) {
      const markers = syncedSliceMarkers();
      actions.commitMarkers([
        ...markers,
        create(SliceMarkerSchema, {
          chokeGroupId: 0,
          confidence: 1,
          endFrame: frame + 1,
          fadeMs: 8,
          padIndex: markers.length % RECUT_MAX_PADS,
          snapExact: false,
          startFrame: frame,
          transientFrame: frame,
        }),
      ]);
    },
    moveMarker(sliceIndex: number, startFrame: number, snapToTransient = true) {
      const nextStartFrame = snapToTransient ? snapFrameToTransient(startFrame) : Math.round(startFrame);
      const markers = syncedSliceMarkers().map((marker, index) =>
        index === sliceIndex
          ? create(SliceMarkerSchema, {
              ...marker,
              startFrame: nextStartFrame,
              transientFrame: nextStartFrame,
            })
          : marker,
      );
      actions.commitMarkers(markers);
    },
    removeMarker(sliceIndex: number) {
      const markers = syncedSliceMarkers().filter((_, index) => index !== sliceIndex);
      if (markers.length === 0) {
        return;
      }
      actions.commitMarkers(markers);
    },
    nudgeMarker(sliceIndex: number, deltaFrames: number) {
      const marker = syncedSliceMarkers()[sliceIndex];
      if (!marker) {
        return;
      }
      actions.moveMarker(sliceIndex, marker.startFrame + deltaFrames);
    },
  };

  const derived = {
    frame: currentFrame,
    activePadIndex: createMemo(() => currentView().activePadIndex),
    activeSlice: createMemo(() => syncedSliceMarkers()[currentView().selectedMarkerIndex] ?? syncedSliceMarkers()[0] ?? null),
    analysisMode: liveAnalysisMode,
    analysisProgress: createMemo(() => currentFrame().analysisProgress),
    bpmConfidence: createMemo(() => (preferLocalState() ? currentState().bpmConfidence : currentFrame().bpmConfidence)),
    bpmSource: createMemo(() => currentPendingAnalysis()?.bpmSource ?? (preferLocalState() ? currentState().bpmSource : mapRecutBpmSourceFromFrame(currentFrame().bpmSource))),
    bpmSuggestedConfidence: createMemo(() => (preferLocalState() ? currentState().bpmSuggestedConfidence : currentFrame().bpmSuggestedConfidence)),
    bpmSuggestedValue: createMemo(() => (preferLocalState() ? currentState().bpmSuggestedValue : currentFrame().bpmSuggestedValue)),
    bpmValue: createMemo(() => {
      const liveValue = currentPendingAnalysis()?.bpmValue ?? (preferLocalState() ? currentState().bpmValue : currentFrame().bpmValue);
      return liveValue > 0 ? liveValue : projectBpm();
    }),
    canEditBpm: createMemo(() => liveAnalysisMode() === RecutAnalysisMode.BPM),
    canEditDensity: createMemo(() => liveAnalysisMode() !== RecutAnalysisMode.CUSTOM),
    candidateTransients: createMemo(() => currentFrame().candidateTransients),
    currentPadAssignment: createMemo(() => syncedPadAssignments()[currentView().activePadIndex] ?? null),
    density: createMemo(() => currentPendingAnalysis()?.density ?? (preferLocalState() ? currentState().density : currentFrame().density)),
    draggingMarkerIndex: createMemo(() => currentView().draggingMarkerIndex),
    heldPadIndices: createMemo(() => currentFrame().heldPadIndices),
    hapticStatus: createMemo(() => (currentFrame().lastSnapExact ? "Transient locked" : "Idle")),
    importError: createMemo(() => currentView().importError),
    isAnalyzing: createMemo(() => {
      const progress = currentFrame().analysisProgress;
      return currentPendingAnalysis() !== null || (progress > 0 && progress < 1);
    }),
    loaded: createMemo(() => currentFrame().loaded || currentState().loaded),
    padAssignments: syncedPadAssignments,
    playingPadIndices: createMemo(() => currentFrame().playingPadIndices),
    projectBpm,
    selectedMarkerIndex: createMemo(() => currentView().selectedMarkerIndex),
    sliceMarkers: syncedSliceMarkers,
    slicePreviewCount: createMemo(() => targetSliceCountForMode(currentState().analysisMode, currentState().density)),
    totalSlices: createMemo(() => syncedSliceMarkers().length),
    waveformHoverFrame: createMemo(() => currentView().waveformHoverFrame),
    waveformPeaks: createMemo(() => currentFrame().waveformPeaks),
    sliceLabel: (sliceIndex: number) => {
      const padIndex = resolvePreviewPadIndex(sliceIndex, syncedPadAssignments());
      return getRecutPadLabel(padIndex);
    },
  };

  return {
    actions,
    derived,
    state,
    viewState,
  };
}

const RecutModuleStoreContext = createContext<ReturnType<typeof createRecutModuleStore>>();

export function RecutModuleStoreProvider(props: ParentProps) {
  const store = createRecutModuleStore();
  return <RecutModuleStoreContext.Provider value={store}>{props.children}</RecutModuleStoreContext.Provider>;
}

export function useRecutModuleStore() {
  const store = useContext(RecutModuleStoreContext);
  if (!store) {
    throw new Error("useRecutModuleStore must be used inside RecutModuleStoreProvider.");
  }
  return store;
}

