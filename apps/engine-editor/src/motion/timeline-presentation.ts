import type { EditorProject } from "@hyperfocus/engine/project";

type Options = {
  timeline: EditorProject["timeline"];
  beatGrid: boolean;
  framePercent(frame: number): number;
  formatRulerLabel(frame: number): string;
  escapeMarkup(value: unknown): string;
};

export function renderTimelineGuides(options: Options) {
  renderRuler(options);
  renderBeatGrid(options);
  renderCurveEditor(options.timeline);
}

export function renderTimelineAudioClip(audio: EditorProject["timeline"]["audioTracks"][number], options: Pick<Options, "framePercent" | "escapeMarkup">) {
  return `<div class="audio-clip" style="left:${options.framePercent(audio.startFrame)}%;width:${options.framePercent(audio.durationFrames)}%" title="${options.escapeMarkup(audio.name)} · metadata only · waveform analysis unavailable"><div class="waveform"><span>WAVEFORM UNAVAILABLE · METADATA ONLY</span></div></div>`;
}

export function updateTimelinePlayheadView(options: { frame: number; framePercent(frame: number): number; formatTimecode(frame: number): string; playing: boolean; runtimeDriven: boolean }) {
  required<HTMLElement>("#sequence-playhead").style.left = `${options.framePercent(options.frame)}%`;
  required<HTMLElement>("#sequence-timecode").textContent = options.formatTimecode(options.frame);
  const playButton = required<HTMLButtonElement>("#sequence-play");
  playButton.textContent = options.playing || options.runtimeDriven ? "Ⅱ" : "▶";
  playButton.disabled = options.runtimeDriven;
  playButton.title = options.runtimeDriven ? "Timeline transport is driven by Editor Play. Stop the game to scrub independently." : "Play or pause the authored sequence preview";
}

function renderRuler({ timeline, framePercent, formatRulerLabel }: Options) {
  const ruler = required<HTMLElement>("#sequence-ruler");
  const interval = timeline.durationFrames > 600 ? 60 : 15;
  const ticks: string[] = [];
  for (let frame = 0; frame <= timeline.durationFrames; frame += interval) {
    const major = frame % (interval * 4) === 0;
    ticks.push(`<i class="ruler-tick ${major ? "major" : ""}" style="left:${framePercent(frame)}%">${major ? `<span>${formatRulerLabel(frame)}</span>` : ""}</i>`);
  }
  ruler.innerHTML = ticks.join("");
}

function renderBeatGrid({ timeline, beatGrid, framePercent }: Options) {
  const host = required<HTMLElement>("#sequence-beat-lines");
  host.hidden = !beatGrid;
  const framesPerBeat = timeline.fps * 60 / timeline.bpm;
  const lines: string[] = [];
  for (let frame = 0, beat = 0; frame <= timeline.durationFrames; frame += framesPerBeat, beat += 1) lines.push(`<i class="beat-line ${beat % timeline.beatsPerBar === 0 ? "bar" : ""}" style="left:${framePercent(frame)}%"></i>`);
  host.innerHTML = lines.join("");
  const loop = required<HTMLElement>("#sequence-loop-region");
  loop.style.left = `${framePercent(timeline.loopStart)}%`;
  loop.style.width = `${framePercent(timeline.loopEnd - timeline.loopStart)}%`;
}

function renderCurveEditor(timeline: EditorProject["timeline"]) {
  const svg = required<SVGSVGElement>("#curve-svg");
  svg.setAttribute("aria-label", "Read-only curve visualization. Edit frame, value, and easing in the Keyframe inspector.");
  const visible = timeline.tracks.filter((track) => track.keyframes.length > 1 && !track.muted).slice(0, 3);
  svg.innerHTML = visible.map((track) => {
    const values = track.keyframes.map((key) => key.value);
    const minimum = Math.min(...values); const maximum = Math.max(...values); const range = Math.max(0.001, maximum - minimum);
    const points = track.keyframes.map((key) => ({ x: key.frame / timeline.durationFrames * 1000, y: 260 - (key.value - minimum) / range * 210 }));
    let path = `M ${points[0].x} ${points[0].y}`;
    for (let index = 1; index < points.length; index += 1) {
      const previous = points[index - 1]; const point = points[index]; const distance = (point.x - previous.x) * 0.36;
      path += ` C ${previous.x + distance} ${previous.y}, ${point.x - distance} ${point.y}, ${point.x} ${point.y}`;
    }
    return `<g style="--curve-color:${track.color}"><path class="curve-path" d="${path}"></path>${points.map((point) => `<circle class="curve-point" cx="${point.x}" cy="${point.y}" r="5"></circle>`).join("")}</g>`;
  }).join("");
}

function required<T extends Element>(selector: string) {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Timeline presentation markup is missing ${selector}`);
  return element;
}
