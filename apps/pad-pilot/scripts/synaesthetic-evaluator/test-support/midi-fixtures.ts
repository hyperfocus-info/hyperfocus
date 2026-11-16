export function tempSkillSource(score: number, label: string) {
  return `
import { MIDIAnalyzer, metric } from "../base-analyzer";

export default new class TempSkill extends MIDIAnalyzer {
  name = "TempSkill";
  weight = 1;

  async evaluate() {
    return metric({
      score: ${score},
      biologicalImpact: "valence",
      justification: "${label}",
    });
  }
}();
`;
}

export function vlq(value: number) {
  const bytes = [value & 0x7f];
  let remaining = value >> 7;
  while (remaining > 0) {
    bytes.unshift((remaining & 0x7f) | 0x80);
    remaining >>= 7;
  }
  return bytes;
}
