import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (relativePath: string) => readFileSync(resolve(import.meta.dir, relativePath), "utf8");

describe("PadPilot dynamic label typography", () => {
  it("defines the shared pad-pilot-label utility with tabular numerals", () => {
    const css = read("./element-typography.module.css");

    expect(css).toContain(":global(.pad-pilot-label)");
    expect(css).toContain("font-variant-numeric: tabular-nums;");
    expect(css).toContain('font-feature-settings: "tnum";');
  });

  it("applies the shared utility class to frequently changing element labels", () => {
    const knob = read("./knob.tsx");
    const meter = read("./meter.tsx");

    expect(knob).toContain('pad-pilot-label');
    expect(meter).toContain('pad-pilot-label');
  });

  it("does not force uppercase in element visuals that render dynamic labels", () => {
    const waveformCss = read("./waveform-view.module.css");
    const dropzoneCss = read("./file-upload-dropzone.module.css");

    expect(waveformCss).not.toContain("text-transform: uppercase;");
    expect(dropzoneCss).not.toContain("text-transform: uppercase;");
  });
});

