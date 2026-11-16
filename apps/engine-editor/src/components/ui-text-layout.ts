/** Explicit breaks and measured wrapping preserve the authored font size. */
export function layoutUiText(options: {
  text: string;
  width: number;
  measure: (text: string) => number;
}): string[] {
  const width = Math.max(1, options.width), lines: string[] = [];
  for (const paragraph of options.text.replace(/\r\n?/g, "\n").split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && options.measure(candidate) > width) { lines.push(line); line = ""; }
      if (options.measure(word) <= width) { line = line ? `${line} ${word}` : word; continue; }
      for (const character of word) {
        if (line && options.measure(line + character) > width) { lines.push(line); line = ""; }
        line += character;
      }
    }
    lines.push(line);
  }
  return lines;
}

export function drawUiText(options: {
  context: CanvasRenderingContext2D;
  text: string;
  width: number;
  fontSize: number;
}) {
  const lines = layoutUiText({ text: options.text, width: options.width, measure: (text) => options.context.measureText(text).width });
  for (let index = 0; index < lines.length; index++) options.context.fillText(lines[index]!, 0, index * options.fontSize * 1.35);
}
