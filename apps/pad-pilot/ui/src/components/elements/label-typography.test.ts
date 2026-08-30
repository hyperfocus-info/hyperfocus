import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (relativePath: string) => readFileSync(resolve(import.meta.dir, relativePath), "utf8");

describe("PadPilot dynamic label typography", () => {
  it("defines shared label typography with tabular numerals", () => {
    const stylex = read("./styles/element-typography.stylex.ts");

    expect(stylex).toContain('fontVariantNumeric: "tabular-nums"');
    expect(stylex).toContain("fontFeatureSettings: '\"tnum\"'");
  });

  it("applies the shared utility class to frequently changing element labels", () => {
    const knob = read("./knob.tsx");
    const meter = read("./meter.tsx");

    expect(knob).toContain("labelTypographyClass");
    expect(meter).toContain("labelTypographyClass");
  });

  it("does not force uppercase in element visuals that render dynamic labels", () => {
    const waveformCss = read("./styles/waveform-view.stylex.ts");
    const dropzoneCss = read("./styles/file-upload-dropzone.stylex.ts");

    expect(waveformCss).not.toContain("textTransform: \"uppercase\"");
    expect(dropzoneCss).not.toContain("textTransform: \"uppercase\"");
  });
});

