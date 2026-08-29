import { For, Match, Show, Switch, createMemo, createResource, createSignal, onCleanup } from "solid-js";
import { SolidUplot } from "@dschz/solid-uplot";
import { arc, curveCatmullRom, line } from "d3-shape";
import { interpolateRgb } from "d3-interpolate";
import { scaleLinear, scaleSequential } from "d3-scale";
import { Tooltip } from "../../../ui/src/components/elements/tooltip";
import { FloatingLayer } from "../../../ui/src/components/elements/floating-layer";
import { audioSourceUrl, fetchLibrary, fetchRun, openRunProject, reanalyzeRun, saveRunReview, type DashboardDimension, type DashboardReviewVerdict, type DashboardRun, type DashboardSeries } from "./api";

const scoreColor = scaleSequential(interpolateRgb("#ef476f", "#70e1a2")).domain([0, 1]);
const barWidth = scaleLinear().domain([0, 1]).range([0, 100]).clamp(true);

function percent(score: number | null) {
  return score === null ? "N/A" : `${Math.round(score * 100)}%`;
}

function clockTime(seconds: number) {
  const whole = Math.max(0, Math.round(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

function friendlyName(id: string) {
  return id.replace(/([a-z0-9])([A-Z])/g, "$1 $2").split(/[._-]/).filter(Boolean).map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" ");
}

function reportPath(runId: string) {
  return `/runs/${encodeURIComponent(runId)}`;
}

function navigate(event: MouseEvent, target: string) {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  navigateTo(target);
}

function navigateTo(target: string) {
  history.pushState({}, "", target);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function OverallArc(props: { score: number | null; confidence: number; uncappedScore?: number | null }) {
  const path = createMemo(() => arc()({
    innerRadius: 46,
    outerRadius: 58,
    startAngle: -Math.PI * 0.75,
    endAngle: -Math.PI * 0.75 + Math.PI * 1.5 * (props.score ?? 0),
  }) ?? "");
  const background = arc()({
    innerRadius: 46,
    outerRadius: 58,
    startAngle: -Math.PI * 0.75,
    endAngle: Math.PI * 0.75,
  }) ?? "";
  return (
    <figure class="score-arc" aria-label={`Overall ${percent(props.score)}, confidence ${percent(props.confidence)}`}>
      <svg viewBox="-64 -64 128 128" role="img">
        <path class="arc-background" d={background} />
        <path d={path()} fill={scoreColor(props.score ?? 0)} />
      </svg>
      <figcaption><strong>{percent(props.score)}</strong><span>{percent(props.confidence)} confidence</span><Show when={props.uncappedScore !== undefined && props.uncappedScore !== props.score}><small>{percent(props.uncappedScore ?? null)} before safety cap</small></Show></figcaption>
    </figure>
  );
}

export function DimensionBar(props: { dimension: DashboardDimension; explanation?: string }) {
  const tooltip = createMemo(() => props.explanation ?? `${friendlyName(props.dimension.id)} contributes once at the dimension level. Confidence controls influence; unavailable evidence is not converted to zero.`);
  return (
    <div class="dimension-row">
      <Tooltip content={tooltip()}>
        <span class="dimension-label" tabindex="0">{friendlyName(props.dimension.id)}</span>
      </Tooltip>
      <Tooltip content={tooltip()}>
        <div class="dimension-track" tabindex="0" role="meter" aria-valuemin="0" aria-valuemax="1" aria-valuenow={props.dimension.score ?? undefined}>
          <span style={{ width: `${barWidth(props.dimension.score ?? 0)}%`, background: scoreColor(props.dimension.score ?? 0) }} />
        </div>
      </Tooltip>
      <output>{percent(props.dimension.score)}</output>
    </div>
  );
}

function SectionCurve(props: { sections: DashboardRun["sections"] }) {
  const points = createMemo(() => props.sections.map((section, index) => [index * 100 / Math.max(1, props.sections.length - 1), 56 - section.score * 48] as [number, number]));
  const path = createMemo(() => line<[number, number]>().x((point) => point[0]).y((point) => point[1]).curve(curveCatmullRom.alpha(0.5))(points()) ?? "");
  return (
    <svg class="section-curve" viewBox="0 0 100 64" preserveAspectRatio="none" role="img" aria-label="Section-level score changes">
      <path d={path()} />
      <For each={points()}>{(point) => <circle cx={point[0]} cy={point[1]} r="1.3" />}</For>
    </svg>
  );
}

function SimilarityMatrix(props: { values: number[][] }) {
  const size = createMemo(() => Math.max(1, props.values.length));
  return (
    <svg class="similarity-matrix" viewBox={`0 0 ${size()} ${size()}`} role="img" aria-label="Audio self-similarity matrix">
      <For each={props.values}>{(row, y) => (
        <For each={row}>{(value, x) => <rect x={x()} y={y()} width="1.02" height="1.02" fill={scoreColor(value)} />}</For>
      )}</For>
    </svg>
  );
}

function ErbProfile(props: { values: number[] }) {
  const domain = createMemo(() => {
    const low = Math.min(...props.values);
    const high = Math.max(...props.values);
    return low === high ? [low - 1, high + 1] : [low, high];
  });
  const path = createMemo(() => {
    const x = scaleLinear().domain([0, Math.max(1, props.values.length - 1)]).range([2, 98]);
    const y = scaleLinear().domain(domain()).range([56, 4]);
    return line<number>().x((_, index) => x(index)).y((value) => y(value))(props.values) ?? "";
  });
  return <svg class="erb-profile" viewBox="0 0 100 60" preserveAspectRatio="none" role="img" aria-label="ERB perceptual-band profile"><path d={path()} /></svg>;
}

function TimeSeriesChart(props: { series: DashboardSeries }) {
  const [anchorRect, setAnchorRect] = createSignal<DOMRectReadOnly>();
  const [cursorText, setCursorText] = createSignal("");
  const data = createMemo(() => {
    const timestamps = props.series.timestamps ?? props.series.values.map((_, index) => (props.series.startSeconds ?? 0) + index * (props.series.stepSeconds ?? 1));
    return [timestamps, props.series.values];
  });
  return (
    <article class="timeline-card">
      <header><h3>{friendlyName(props.series.id)}</h3><span>{props.series.unit}</span></header>
      <div class="timeline-plot">
        <SolidUplot
          autoResize
          height={190}
          data={data()}
          scales={{ x: { time: false } }}
          axes={[{ label: "seconds" }, { label: props.series.unit }]}
          series={[{}, { label: friendlyName(props.series.id), stroke: "#70e1a2", width: 2, spanGaps: false }]}
          onCursorMove={({ u, cursor }) => {
            if (!cursor.visible || cursor.idx < 0) {
              setAnchorRect(undefined);
              return;
            }
            const root = u.root.getBoundingClientRect();
            setAnchorRect(new DOMRect(root.left + cursor.position.left, root.top + cursor.position.top, 1, 1));
            const value = props.series.values[cursor.idx];
            setCursorText(`${cursor.xValue.toFixed(2)} s · ${value?.toFixed(3) ?? "N/A"} ${props.series.unit ?? ""}`);
          }}
        />
      </div>
      <FloatingLayer anchorRect={anchorRect} class="chart-tooltip" open={Boolean(anchorRect())} role="tooltip">
        {cursorText()}
      </FloatingLayer>
    </article>
  );
}

function MetricTable(props: { run: DashboardRun }) {
  return (
    <details class="panel metric-panel">
      <summary><span>Evidence details</span><small>{props.run.metrics.filter((metric) => metric.valid).length} valid metrics</small></summary>
      <div class="metric-table">
        <For each={props.run.metrics}>{(metric) => {
          const explanation = () => metric.summary ?? `${metric.id}: evidence and confidence used inside ${metric.dimension}.`;
          return (
            <div class="metric-row" classList={{ invalid: !metric.valid }}>
              <Tooltip content={explanation()}><span class="metric-name" tabindex="0">{friendlyName(metric.id)}</span></Tooltip>
              <Tooltip content={explanation()}>
                <div class="metric-bar" tabindex="0">
                  <span style={{ width: `${barWidth(metric.score ?? 0)}%`, background: scoreColor(metric.score ?? 0) }} />
                </div>
              </Tooltip>
              <output>{metric.valid ? percent(metric.score) : "N/A"}</output>
              <small>{percent(metric.confidence)} conf.</small>
            </div>
          );
        }}</For>
      </div>
    </details>
  );
}

function SafetySummary(props: { run: DashboardRun }) {
  const reasons = createMemo(() => [...new Set(props.run.safetyChecks.flatMap((check) => check.reasons))]);
  const cap = createMemo(() => props.run.safetyChecks.reduce<number | null>((lowest, check) => {
    if (check.cap === null) return lowest;
    return lowest === null ? check.cap : Math.min(lowest, check.cap);
  }, null));
  return (
    <Show when={reasons().length > 0}>
      <article class="panel safety-panel">
        <header><h2>Safety</h2><span>{cap() !== null && cap()! < 1 ? `${percent(cap())} cap` : "advisory"}</span></header>
        <ul><For each={reasons()}>{(reason) => <li>{reason}</li>}</For></ul>
      </article>
    </Show>
  );
}

function ActionPlan(props: { run: DashboardRun }) {
  return (
    <article class="panel action-plan" classList={{ "no-safety": props.run.safetyChecks.every((check) => check.reasons.length === 0) }}>
      <header><h2>Fix first</h2><span>top {Math.min(3, props.run.actions.length)} actions</span></header>
      <Show when={props.run.actions.length > 0} fallback={<p class="no-action">No high-confidence corrective action. Preserve intent; compare against a chosen reference before changing the mix.</p>}>
        <div class="action-list"><For each={props.run.actions.slice(0, 3)}>{(action, index) => (
          <section class={`producer-action severity-${action.severity}`}>
            <div class="action-rank">{index() + 1}</div>
            <div>
              <header><h3>{action.title}</h3><span>{percent(action.confidence)} confidence</span></header>
              <p>{action.observation}</p>
              <Show when={action.focus}>{(focus) => <p class="action-focus"><strong>{clockTime(focus().startSeconds)}–{clockTime(focus().endSeconds)}</strong> · {focus().label}</p>}</Show>
              <p class="action-impact">{action.impact}</p>
              <ol><For each={action.steps}>{(step) => <li>{step}</li>}</For></ol>
              <small><strong>Verify:</strong> {action.verify}</small>
            </div>
          </section>
        )}</For></div>
      </Show>
    </article>
  );
}

function commaTags(value: string) {
  return value.split(",").map((tag) => tag.trim()).filter(Boolean);
}

function ReviewPanel(props: { run: DashboardRun }) {
  const previous = props.run.review;
  const [overall, setOverall] = createSignal(String(Math.round((previous?.overallScore ?? props.run.overall ?? 0) * 100)));
  const [confidence, setConfidence] = createSignal(String(Math.round((previous?.confidence ?? 0.9) * 100)));
  const [genreTags, setGenreTags] = createSignal(previous?.genreTags.join(", ") ?? "");
  const [intentTags, setIntentTags] = createSignal(previous?.intentTags.join(", ") ?? "");
  const [notes, setNotes] = createSignal(previous?.notes ?? "");
  const [eligible, setEligible] = createSignal(previous?.calibrationEligible ?? true);
  const initialFeedback = Object.fromEntries((previous?.actionFeedback ?? []).map((item) => [item.actionId, item.verdict]));
  const [actionVerdicts, setActionVerdicts] = createSignal<Record<string, DashboardReviewVerdict | "">>(initialFeedback);
  const initialDimensions = Object.fromEntries(Object.entries(previous?.dimensionScores ?? {}).map(([id, score]) => [id, String(Math.round(score * 100))]));
  const [dimensionScores, setDimensionScores] = createSignal<Record<string, string>>(initialDimensions);
  const [saving, setSaving] = createSignal(false);
  const [status, setStatus] = createSignal("");
  const save = async (event: SubmitEvent) => {
    event.preventDefault();
    setSaving(true);
    setStatus("");
    try {
      const review = await saveRunReview(props.run.id, {
        actionFeedback: Object.entries(actionVerdicts()).flatMap(([actionId, verdict]) => verdict ? [{ actionId, verdict }] : []),
        calibrationEligible: eligible(),
        confidence: Math.max(0, Math.min(100, Number(confidence()))) / 100,
        dimensionScores: Object.fromEntries(Object.entries(dimensionScores()).flatMap(([id, score]) => {
          const value = Number(score);
          return Number.isFinite(value) && score.trim() ? [[id, Math.max(0, Math.min(100, value)) / 100]] : [];
        })),
        genreTags: commaTags(genreTags()),
        intentTags: commaTags(intentTags()),
        notes: notes().trim() || undefined,
        overallScore: Math.max(0, Math.min(100, Number(overall()))) / 100,
      });
      setStatus(`Review saved to ${review.datasetSplit} split`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Review save failed.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <article class="panel review-panel">
      <header><div><h2>Your review</h2><p>Saved as an immutable label for a future evaluator version. It never changes this run.</p></div><span>{previous ? "new revision" : "human signal"}</span></header>
      <form onSubmit={save}>
        <div class="review-fields">
          <label>Overall rating (0-100)<input required type="number" min="0" max="100" step="1" value={overall()} onInput={(event) => setOverall(event.currentTarget.value)} /></label>
          <label>How sure are you? (0-100)<input required type="number" min="0" max="100" step="1" value={confidence()} onInput={(event) => setConfidence(event.currentTarget.value)} /></label>
          <label>Genre or style tags<input value={genreTags()} onInput={(event) => setGenreTags(event.currentTarget.value)} placeholder="trap, melodic rap" /></label>
          <label>Intent tags<input value={intentTags()} onInput={(event) => setIntentTags(event.currentTarget.value)} placeholder="loose pocket, dark, demo" /></label>
        </div>
        <Show when={props.run.actions.length > 0}>
          <fieldset><legend>Were the suggestions right?</legend><For each={props.run.actions}>{(action) => (
            <label>{`Review ${action.title}`}
              <select value={actionVerdicts()[action.id] ?? ""} onChange={(event) => setActionVerdicts((current) => ({ ...current, [action.id]: event.currentTarget.value as DashboardReviewVerdict | "" }))}>
                <option value="">Not reviewed</option><option value="helpful">Helpful</option><option value="wrong">Wrong diagnosis</option><option value="intentional">Intentional choice</option><option value="fixed">Already fixed</option>
              </select>
            </label>
          )}</For></fieldset>
        </Show>
        <details class="review-dimensions"><summary>Optional dimension ratings</summary><div class="review-fields"><For each={props.run.dimensions}>{(dimension) => (
          <label>{friendlyName(dimension.id)} (0-100)<input type="number" min="0" max="100" step="1" value={dimensionScores()[dimension.id] ?? ""} onInput={(event) => setDimensionScores((current) => ({ ...current, [dimension.id]: event.currentTarget.value }))} /></label>
        )}</For></div></details>
        <label class="review-notes">What did the evaluator miss?<textarea maxlength="4000" value={notes()} onInput={(event) => setNotes(event.currentTarget.value)} placeholder="Mention the passage, intent, or mix decision." /></label>
        <label class="review-eligible"><input type="checkbox" checked={eligible()} onChange={(event) => setEligible(event.currentTarget.checked)} />Allow this review in future calibration datasets</label>
        <footer><button type="submit" disabled={saving()}>{saving() ? "Saving…" : "Save review"}</button><Show when={status()}>{(message) => <span role="status" aria-label="Review status">{message()}</span>}</Show></footer>
      </form>
    </article>
  );
}

function TimelineExplorer(props: { series: DashboardSeries[] }) {
  const [selectedId, setSelectedId] = createSignal(props.series[0]?.id ?? "");
  const selected = createMemo(() => props.series.find((series) => series.id === selectedId()) ?? props.series[0]);
  return (
    <Show when={selected()}>{(series) => (
      <section class="timeline-explorer">
        <label>Timeline signal
          <select value={series().id} onChange={(event) => setSelectedId(event.currentTarget.value)}>
            <For each={props.series}>{(option) => <option value={option.id} selected={option.id === series().id}>{friendlyName(option.id)}</option>}</For>
          </select>
        </label>
        <TimeSeriesChart series={series()} />
      </section>
    )}</Show>
  );
}

type LibrarySortKey = "displayName" | "overall" | "confidence" | "evaluatorFingerprint" | "evaluatedAt";
type SortDirection = "ascending" | "descending";
type LibrarySort = { key: LibrarySortKey; direction: SortDirection };

function compareNumbers(left: number | null, right: number | null, direction: SortDirection) {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return direction === "ascending" ? left - right : right - left;
}

function evaluatedTime(run: DashboardRun) {
  if (!run.evaluatedAt) return null;
  const value = Date.parse(run.evaluatedAt);
  return Number.isFinite(value) ? value : null;
}

function algorithmFingerprint(run: DashboardRun) {
  return run.evaluatorFingerprint?.trim() || "unknown";
}

function algorithmVersionParts(fingerprint: string) {
  const match = fingerprint.match(/(?:^|[-_])v(\d+(?:\.\d+)*)$/i);
  return match?.[1]?.split(".").map(Number) ?? null;
}

function compareAlgorithmFingerprints(left: string, right: string) {
  const leftParts = algorithmVersionParts(left);
  const rightParts = algorithmVersionParts(right);
  if (leftParts && rightParts) {
    const length = Math.max(leftParts.length, rightParts.length);
    for (let index = 0; index < length; index += 1) {
      const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
      if (difference !== 0) return difference;
    }
  } else if (leftParts) {
    return 1;
  } else if (rightParts) {
    return -1;
  }
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
}

function algorithmVersionLabel(fingerprint: string) {
  const parts = algorithmVersionParts(fingerprint);
  return parts ? `v${parts.join(".")}` : fingerprint === "unknown" ? "Unknown" : fingerprint;
}

function newestRunsForAlgorithm(runs: readonly DashboardRun[], fingerprint: string) {
  const newestByMedia = new Map<string, DashboardRun>();
  for (const run of runs) {
    if (algorithmFingerprint(run) !== fingerprint) continue;
    const identity = run.mediaId ?? run.sourcePath?.toLowerCase() ?? run.id;
    const current = newestByMedia.get(identity);
    const runTime = evaluatedTime(run) ?? Number.NEGATIVE_INFINITY;
    const currentTime = current ? evaluatedTime(current) ?? Number.NEGATIVE_INFINITY : Number.NEGATIVE_INFINITY;
    if (!current || runTime > currentTime || (runTime === currentTime && run.id > current.id)) {
      newestByMedia.set(identity, run);
    }
  }
  return [...newestByMedia.values()];
}

export function sortLibraryRuns(runs: readonly DashboardRun[], sort: LibrarySort) {
  return [...runs].sort((left, right) => {
    let comparison = 0;
    if (sort.key === "displayName") {
      comparison = left.displayName.localeCompare(right.displayName, undefined, { numeric: true, sensitivity: "base" });
      if (sort.direction === "descending") comparison *= -1;
    } else if (sort.key === "overall") {
      comparison = compareNumbers(left.overall, right.overall, sort.direction);
    } else if (sort.key === "confidence") {
      comparison = compareNumbers(left.confidence, right.confidence, sort.direction);
    } else if (sort.key === "evaluatorFingerprint") {
      comparison = compareAlgorithmFingerprints(algorithmFingerprint(left), algorithmFingerprint(right));
      if (sort.direction === "descending") comparison *= -1;
    } else {
      comparison = compareNumbers(evaluatedTime(left), evaluatedTime(right), sort.direction);
    }
    if (comparison !== 0) return comparison;
    return left.displayName.localeCompare(right.displayName, undefined, { numeric: true, sensitivity: "base" })
      || left.id.localeCompare(right.id);
  });
}

function LibrarySortHeader(props: {
  label: string;
  sortKey: LibrarySortKey;
  sort: LibrarySort;
  onSort: (key: LibrarySortKey) => void;
}) {
  const active = createMemo(() => props.sort.key === props.sortKey);
  return (
    <span role="columnheader" aria-sort={active() ? props.sort.direction : undefined}>
      <button type="button" classList={{ active: active() }} onClick={() => props.onSort(props.sortKey)}>
        <span>{props.label}</span>
        <span class="library-sort-indicator" aria-hidden="true">
          {active() ? props.sort.direction === "ascending" ? "↑" : "↓" : "↕"}
        </span>
      </button>
    </span>
  );
}

export function RunActions(props: {
  onReanalyzed: (runId: string) => void;
  onTogglePlayback: (run: DashboardRun) => Promise<unknown> | unknown;
  playing: boolean;
  run: DashboardRun;
  tableCell?: boolean;
}) {
  const [operation, setOperation] = createSignal<"edit" | "reanalyze" | null>(null);
  const [status, setStatus] = createSignal("");
  const reanalyze = async () => {
    setOperation("reanalyze");
    setStatus("Analyzing…");
    try {
      const result = await reanalyzeRun(props.run.id);
      setStatus("Analysis complete");
      props.onReanalyzed(result.runId);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Reanalysis failed.");
    } finally {
      setOperation(null);
    }
  };
  const edit = async () => {
    setOperation("edit");
    setStatus("Opening project…");
    try {
      await openRunProject(props.run.id);
      setStatus("Project opened");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Project open failed.");
    } finally {
      setOperation(null);
    }
  };
  return (
    <div class="run-actions" role={props.tableCell ? "cell" : undefined} aria-busy={operation() !== null}>
      <button type="button" disabled={!props.run.sourceAvailable || operation() !== null} onClick={reanalyze}>
        {operation() === "reanalyze" ? "Analyzing…" : "Reanalyze"}
      </button>
      <button type="button" disabled={!props.run.sourceAvailable || operation() !== null} onClick={() => props.onTogglePlayback(props.run)}>
        {props.playing ? "Pause" : "Play"}
      </button>
      <button type="button" disabled={!props.run.hasColocatedFlp || operation() !== null} onClick={edit}>Edit</button>
      <Show when={status()}>{(message) => <small class="operation-status" role="status">{message()}</small>}</Show>
    </div>
  );
}

export function ReportView(props: {
  onTogglePlayback: (run: DashboardRun) => Promise<unknown> | unknown;
  playingRunId?: string;
  runId: string;
}) {
  const [run] = createResource(() => props.runId, fetchRun);
  return (
    <Switch>
      <Match when={run.loading}><p class="state">Loading evaluation…</p></Match>
      <Match when={run.error}><p class="state error">{run.error.message}</p></Match>
      <Match when={run()}>{(loaded) => (
        <>
          <nav><a href="/" onClick={(event) => navigate(event, "/")}>← All evaluations</a></nav>
          <header class="report-heading">
            <div><p class="eyebrow">Persistent evaluation</p><h1>{loaded().displayName}</h1><p class="source-path">{loaded().sourcePath}</p><RunActions run={loaded()} playing={props.playingRunId === loaded().id} onTogglePlayback={props.onTogglePlayback} onReanalyzed={(runId) => navigateTo(reportPath(runId))} /></div>
            <OverallArc score={loaded().overall} uncappedScore={loaded().uncappedOverall} confidence={loaded().confidence} />
          </header>
          <section class="report-grid">
            <SafetySummary run={loaded()} />
            <ActionPlan run={loaded()} />
            <ReviewPanel run={loaded()} />
            <article class="panel dimension-panel">
              <header><h2>Dimensions</h2><span>fixed influence budgets</span></header>
              <For each={loaded().dimensions}>{(dimension) => <DimensionBar dimension={dimension} />}</For>
            </article>
            <Show when={loaded().sections.length > 1}>
              <article class="panel"><header><h2>Section development</h2><span>measured macro curve</span></header><SectionCurve sections={loaded().sections} /></article>
            </Show>
            <Show when={loaded().selfSimilarity && loaded().selfSimilarity!.length > 0}>
              <article class="panel visual-panel"><header><h2>Structure recurrence</h2><span>self-similarity</span></header><SimilarityMatrix values={loaded().selfSimilarity!} /></article>
            </Show>
            <Show when={loaded().erbProfile && loaded().erbProfile!.length > 0}>
              <article class="panel visual-panel"><header><h2>Perceptual spectrum</h2><span>ERB bands</span></header><ErbProfile values={loaded().erbProfile!} /></article>
            </Show>
            <details class="panel metadata-panel">
              <summary><span>Source + evaluator</span><small>{loaded().evaluatorFingerprint ?? "Unknown"}</small></summary>
              <dl>
                <dt>Sample rate</dt><dd>{loaded().originalSampleRate ? `${loaded().originalSampleRate} Hz` : "Unknown"}</dd>
                <dt>Channels</dt><dd>{loaded().channelCount ?? "Unknown"}</dd>
                <dt>Estimated bitrate</dt><dd>{loaded().estimatedBitrateKbps ? `${loaded().estimatedBitrateKbps} kbps` : "Unknown"}</dd>
                <Show when={loaded().subjectiveScore !== undefined}><><dt>Legacy listener score</dt><dd>{percent(loaded().subjectiveScore ?? null)}</dd></></Show>
              </dl>
            </details>
          </section>
          <TimelineExplorer series={loaded().series} />
          <MetricTable run={loaded()} />
        </>
      )}</Match>
    </Switch>
  );
}

function LibraryView(props: {
  onTogglePlayback: (run: DashboardRun) => Promise<unknown> | unknown;
  playingRunId?: string;
}) {
  const [query, setQuery] = createSignal("");
  const [selectedAlgorithm, setSelectedAlgorithm] = createSignal("");
  const [sort, setSort] = createSignal<LibrarySort>({ key: "evaluatedAt", direction: "descending" });
  const [library] = createResource(fetchLibrary);
  const algorithms = createMemo(() => [...new Set((library() ?? []).map(algorithmFingerprint))]
    .sort((left, right) => compareAlgorithmFingerprints(right, left)));
  const activeAlgorithm = createMemo(() => {
    const selected = selectedAlgorithm();
    return selected && algorithms().includes(selected) ? selected : algorithms()[0] ?? "unknown";
  });
  const filtered = createMemo(() => {
    const needle = query().trim().toLowerCase();
    const currentRuns = newestRunsForAlgorithm(library() ?? [], activeAlgorithm());
    const matches = currentRuns.filter((run) => `${run.displayName} ${run.sourcePath ?? ""}`.toLowerCase().includes(needle));
    return sortLibraryRuns(matches, sort());
  });
  const toggleSort = (key: LibrarySortKey) => {
    setSort((current) => current.key === key
      ? { key, direction: current.direction === "ascending" ? "descending" : "ascending" }
      : { key, direction: key === "displayName" ? "ascending" : "descending" });
  };
  return (
    <>
      <header class="library-heading">
        <div><p class="eyebrow">PadPilot</p><h1>Synaesthetic Library</h1><p>Newest run per track for selected algorithm. Immutable history stays stored.</p></div>
        <div class="library-controls">
          <Show when={algorithms().length > 0}>
            <label>Algorithm version
              <select value={activeAlgorithm()} onChange={(event) => setSelectedAlgorithm(event.currentTarget.value)}>
                <For each={algorithms()}>{(fingerprint, index) => (
                  <option value={fingerprint} title={fingerprint} selected={fingerprint === activeAlgorithm()}>{index() === 0 ? "Latest — " : ""}{algorithmVersionLabel(fingerprint)}</option>
                )}</For>
              </select>
            </label>
          </Show>
          <label>Filter evaluations<input value={query()} onInput={(event) => setQuery(event.currentTarget.value)} placeholder="Track or path" /></label>
        </div>
      </header>
      <Switch>
        <Match when={library.loading}><p class="state">Loading library…</p></Match>
        <Match when={library.error}><p class="state error">{library.error.message}</p></Match>
        <Match when={library()}>
          <div class="library-table" role="table" aria-label="Evaluation runs">
            <div class="library-row library-header" role="row">
              <LibrarySortHeader label="File" sortKey="displayName" sort={sort()} onSort={toggleSort} />
              <LibrarySortHeader label="Overall / listener" sortKey="overall" sort={sort()} onSort={toggleSort} />
              <LibrarySortHeader label="Confidence" sortKey="confidence" sort={sort()} onSort={toggleSort} />
              <LibrarySortHeader label="Algorithm" sortKey="evaluatorFingerprint" sort={sort()} onSort={toggleSort} />
              <LibrarySortHeader label="Evaluated" sortKey="evaluatedAt" sort={sort()} onSort={toggleSort} />
              <span role="columnheader">Actions</span>
            </div>
            <For each={filtered()}>{(run) => (
              <div class="library-row" role="row">
                <span role="cell"><a class="library-file-link" href={reportPath(run.id)} onClick={(event) => navigate(event, reportPath(run.id))}><strong>{run.displayName}</strong><small>{run.sourcePath}</small></a></span><span role="cell"><strong class="score-chip" style={{ color: scoreColor(run.overall ?? 0) }}>{percent(run.overall)}</strong><Show when={run.subjectiveScore !== undefined}><small>{percent(run.subjectiveScore ?? null)} legacy listener</small></Show></span><span role="cell">{percent(run.confidence)}</span><span class="algorithm-cell" role="cell" title={algorithmFingerprint(run)}><strong>{algorithmVersionLabel(algorithmFingerprint(run))}</strong></span><time role="cell">{run.evaluatedAt ? new Date(run.evaluatedAt).toLocaleString() : "Unknown"}</time><RunActions tableCell run={run} playing={props.playingRunId === run.id} onTogglePlayback={props.onTogglePlayback} onReanalyzed={(runId) => navigateTo(reportPath(runId))} />
              </div>
            )}</For>
          </div>
          <Show when={filtered().length === 0}><p class="state">No persisted evaluations match.</p></Show>
        </Match>
      </Switch>
    </>
  );
}

export function DashboardApp() {
  let player: HTMLAudioElement | undefined;
  const [playingRunId, setPlayingRunId] = createSignal<string>();
  const [playbackError, setPlaybackError] = createSignal("");
  const [pathname, setPathname] = createSignal(location.pathname);
  const updatePathname = () => setPathname(location.pathname);
  window.addEventListener("popstate", updatePathname);
  onCleanup(() => {
    window.removeEventListener("popstate", updatePathname);
    player?.pause();
    player?.removeAttribute("src");
  });
  const togglePlayback = async (run: DashboardRun) => {
    if (!player) return;
    setPlaybackError("");
    if (playingRunId() === run.id && !player.paused) {
      player.pause();
      setPlayingRunId(undefined);
      return;
    }
    player.src = audioSourceUrl(run.id);
    try {
      await player.play();
      setPlayingRunId(run.id);
    } catch (error) {
      setPlayingRunId(undefined);
      setPlaybackError(error instanceof Error ? error.message : "Audio playback failed.");
    }
  };
  const runId = createMemo(() => pathname().match(/^\/runs\/([^/]+)$/)?.[1]);
  return (
    <div class="dashboard-shell">
      <audio class="dashboard-audio" ref={(element) => { player = element; }} preload="none" onEnded={() => setPlayingRunId(undefined)} />
      <Show when={playbackError()}>{(message) => <p class="playback-error" role="alert">{message()}</p>}</Show>
      <Show when={runId()} fallback={<LibraryView playingRunId={playingRunId()} onTogglePlayback={togglePlayback} />}>
        {(id) => <ReportView runId={decodeURIComponent(id())} playingRunId={playingRunId()} onTogglePlayback={togglePlayback} />}
      </Show>
    </div>
  );
}
