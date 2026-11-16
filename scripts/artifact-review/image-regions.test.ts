import { describe, expect, test } from "bun:test";
import { rectangleBetween, validImageRect } from "./public/image-regions";
import { artifactManifestSchema, validateArtifactReview } from "@hyperfocus/artifact-review/schema";

describe("image review region coordinates", () => {
  test("reverse and out-of-bounds drags retain image-relative bounds", () => {
    expect(rectangleBetween({ x: .8, y: .7 }, { x: .2, y: .1 })).toEqual(rectangleBetween({ x: .2, y: .1 }, { x: .8, y: .7 }));
    expect(rectangleBetween({ x: .25, y: .25 }, { x: 2, y: -1 })).toEqual({ x: .25, y: 0, width: .75, height: .25 });
    expect(rectangleBetween({ x: .5, y: .5 }, { x: .5, y: .5 })).toBeUndefined();
  });
  test("keyboard regions reject empty, inverted and overflowing bounds", () => {
    for (const rect of [
      { x: 0, y: 0, width: NaN, height: .2 }, { x: -.1, y: 0, width: .2, height: .2 },
      { x: 0, y: 0, width: 0, height: .2 }, { x: .9, y: 0, width: .2, height: .2 },
      { x: 0, y: .9, width: .2, height: .2 }, { x: Infinity, y: 0, width: .2, height: .2 },
    ]) expect(validImageRect(rect)).toBe(false);
    expect(validImageRect({ x: 0, y: 0, width: 1, height: 1 })).toBe(true);
  });
  test("normalized rectangles survive immutable image feedback validation", () => {
    const item = artifactManifestSchema.parse({ id: "ui", title: "UI", items: [{ id: "after", title: "After", kind: "image", media: "after.png", version: 1, sha256: "a".repeat(64) }] }).items[0]!;
    const rect = rectangleBetween({ x: .2, y: .3 }, { x: .8, y: .9 })!;
    const review = validateArtifactReview({ item, review: { version: 1, sha256: item.sha256, grade: null, scores: {}, notes: "", annotations: [{ id: "region", rect, text: "Improve this toolbar" }] } });
    expect(review.annotations[0]!.rect).toEqual(rect);
    expect(review.annotations[0]!.text).toBe("Improve this toolbar");
  });
});
