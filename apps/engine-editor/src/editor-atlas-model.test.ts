import { describe, expect, test } from "bun:test";
import { duplicateEditorAtlasFrame, duplicateEditorAtlasSequenceEntry, removeEditorAtlasFrame, removeEditorAtlasSequenceEntry, reorderEditorAtlasFrame, sampleAtlasClipFrame, sliceEditorAtlasGrid, updateEditorAtlasFrame } from "./editor-atlas-model.ts";
import { createDefaultProject } from "@hyperfocus/engine/project";

describe("editor atlas authoring model", () => {
  test("slices actual image dimensions and keeps sequence edits consistent", () => {
    const project = createDefaultProject();
    expect(sliceEditorAtlasGrid(project, { imageWidth: 96, imageHeight: 64, frameWidth: 32, frameHeight: 32 })).toBe(6);
    const last = project.atlas.frames.at(-1)!;
    reorderEditorAtlasFrame(project, last.id, 0);
    expect(project.atlas.sequence[0]).toBe(last.id);
    removeEditorAtlasFrame(project, last.id);
    expect(project.atlas.sequence).not.toContain(last.id);
    expect(project.atlas.clips?.every((clip) => !clip.sequence.includes(last.id))).toBe(true);
  });

  test("supports localized frame and sequence actions without dangling references", () => {
    const project = createDefaultProject();
    const source = project.atlas.frames[0]!;
    const copy = duplicateEditorAtlasFrame(project, source.id);
    expect(project.atlas.frames[1]?.id).toBe(copy.id);
    expect(project.atlas.sequence[1]).toBe(copy.id);
    expect(project.atlas.clips?.find((clip) => clip.id === "idle")?.sequence).toContain(copy.id);

    updateEditorAtlasFrame(project, copy.id, { name: "Idle copy", x: 12, y: 24, width: 48, height: 52, color: "#abcdef" });
    expect(project.atlas.frames[1]).toMatchObject({ name: "Idle copy", x: 12, y: 24, width: 48, height: 52, color: "#abcdef" });

    duplicateEditorAtlasSequenceEntry(project, 0);
    expect(project.atlas.sequence.slice(0, 2)).toEqual([source.id, source.id]);
    removeEditorAtlasSequenceEntry(project, 0);
    expect(project.atlas.sequence[0]).toBe(source.id);
  });

  test("rejects invalid frame edits and sequence indexes", () => {
    const project = createDefaultProject();
    const frame = project.atlas.frames[0]!;
    expect(() => updateEditorAtlasFrame(project, frame.id, { width: 0 })).toThrow("width");
    expect(() => updateEditorAtlasFrame(project, frame.id, { color: "red" })).toThrow("hex color");
    expect(() => removeEditorAtlasSequenceEntry(project, -1)).toThrow("out of range");
  });

  test("samples looping and held named clips from deterministic timeline time", () => {
    const frames = ["idle-0", "idle-1", "attack-0", "attack-1"].map((id, index) => ({ id, x: index * 16, y: 0, width: 16, height: 16 }));
    const clips = [
      { id: "idle", sequence: ["idle-0", "idle-1"], fps: 2, loop: true },
      { id: "attack", sequence: ["attack-0", "attack-1"], fps: 4, loop: false },
    ];
    expect(sampleAtlasClipFrame({ frames, sequence: [], clips, defaultClipId: "idle", timeSeconds: 0.5 })?.id).toBe("idle-1");
    expect(sampleAtlasClipFrame({ frames, sequence: [], clips, defaultClipId: "idle", timeSeconds: 1 })?.id).toBe("idle-0");
    expect(sampleAtlasClipFrame({ frames, sequence: [], clips, defaultClipId: "idle", requestedClipId: "attack", timeSeconds: 20 })?.id).toBe("attack-1");
    expect(sampleAtlasClipFrame({ frames, sequence: [], clips, defaultClipId: "idle", requestedClipId: "missing", timeSeconds: 0.5 })?.id).toBe("idle-1");
  });
});
