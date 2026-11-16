import { describe, expect, test } from "bun:test";
import { artifactManifestSchema, artifactReviewSchema, validateArtifactReview } from "@hyperfocus/artifact-review/schema";

const item = artifactManifestSchema.parse({ id: "trial", title: "Trial", items: [{ id: "cut", version: 2, sha256: "a".repeat(64), title: "Cut", kind: "video", media: "cut.mp4", durationSeconds: 20, sections: [{ id: "hook", title: "Hook", startSeconds: 0, endSeconds: 2 }], dimensions: [{ id: "pace", title: "Pace" }] }] }).items[0]!;
const review = { version: 2, sha256: item.sha256, grade: "B", scores: { pace: 4 }, notes: "Keep the ending", annotations: [{ id: "note-1", sectionId: "hook", startSeconds: 0.5, endSeconds: 1.5, text: "Cut earlier" }] };

describe("artifact identity and annotations", () => {
  test("retains multiple section and time annotations with spatial marks", () => {
    const parsed = validateArtifactReview({ item, review: { ...review, annotations: [...review.annotations, { id: "note-2", text: "Enlarge this control", startSeconds: 5, rect: { x: 0.1, y: 0.2, width: 0.4, height: 0.3 } }] } });
    expect(parsed.annotations).toHaveLength(2);
    expect(parsed.annotations[1]?.rect?.width).toBe(0.4);
  });
  test("rejects old artifact feedback even when item names match", () => {
    expect(() => validateArtifactReview({ item, review: { ...review, sha256: "b".repeat(64) } })).toThrow("version");
    expect(() => validateArtifactReview({ item, review: { ...review, version: "2" } })).toThrow("version");
  });
  test("rejects unknown sections, inverted ranges and out-of-bounds markers", () => {
    for (const extra of [{ sectionId: "missing" }, { startSeconds: 3, endSeconds: 2 }, { startSeconds: 21, endSeconds: 22 }, { rect: { x: 0.9, y: 0, width: 0.2, height: 1 } }]) {
      expect(() => validateArtifactReview({ item, review: { ...review, annotations: [{ ...review.annotations[0], ...extra }] } })).toThrow();
    }
  });
  test("rejects duplicate notes and scores outside declared dimensions", () => {
    expect(() => artifactReviewSchema.parse({ ...review, annotations: [...review.annotations, ...review.annotations] })).toThrow("Duplicate");
    for (const scores of [{ pace: 6 }, { invented: 3 }]) expect(() => validateArtifactReview({ item, review: { ...review, scores } })).toThrow("score");
  });
  test("text sections accept notes but reject invented playback timestamps", () => {
    const textItem = { ...item, kind: "text" as const, text: "An idea" };
    expect(() => validateArtifactReview({ item: textItem, review })).toThrow("timed media");
    expect(validateArtifactReview({ item: textItem, review: { ...review, annotations: [{ id: "copy", sectionId: "hook", text: "Show evidence here" }] } }).annotations).toHaveLength(1);
  });
});
