export type RootNote = "C" | "C#" | "D" | "D#" | "E" | "F" | "F#" | "G" | "G#" | "A" | "A#" | "B";
export type ScaleMode = "major" | "minor";

export type NoteMapInput = {
  x: number;
  y: number;
  deadzone?: number;
  root: RootNote;
  scale: ScaleMode;
  octave: number;
  modifier: number;
};

const ROOT_TO_INDEX: Record<RootNote, number> = {
  C: 0,
  "C#": 1,
  D: 2,
  "D#": 3,
  E: 4,
  F: 5,
  "F#": 6,
  G: 7,
  "G#": 8,
  A: 9,
  "A#": 10,
  B: 11
};

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];

export function mapStickToMidiNote(input: NoteMapInput) {
  const deadzone = input.deadzone ?? 0.25;
  const magnitude = Math.hypot(input.x, input.y);
  if (magnitude < deadzone) return null;

  const scaleIntervals = input.scale === "major" ? MAJOR : MINOR;
  const angle = (Math.atan2(-input.y, input.x) + Math.PI * 2) % (Math.PI * 2);
  const degreeIndex = Math.floor((angle / (Math.PI * 2)) * 7);
  const shiftedDegree = degreeIndex + clamp(input.modifier, 0, 7);
  const wrappedDegree = shiftedDegree % 7;
  const octaveCarry = Math.floor(shiftedDegree / 7);

  const rootMidi = (input.octave + 1) * 12 + ROOT_TO_INDEX[input.root];
  return rootMidi + scaleIntervals[wrappedDegree] + octaveCarry * 12;
}
import { clamp } from "../../utils/math";
