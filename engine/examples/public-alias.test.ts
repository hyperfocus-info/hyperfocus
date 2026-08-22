import { expect, test } from "bun:test";
import { createFixedStepDriver, createFrameMetrics, truncateUtf8 } from "@hyperfocus/engine";
import { createMmoWorld } from "@hyperfocus/engine/mmo";
import { defineSchema } from "@hyperfocus/engine/protocol";
import { createRoomType } from "@hyperfocus/engine/server";

test("@hyperfocus/engine resolves the root and representative public subpaths", () => {
  expect(typeof createFixedStepDriver).toBe("function");
  expect(createFrameMetrics({ capacity: 2 }).snapshot().capacity).toBe(2);
  expect(truncateUtf8("a😀b", 5)).toBe("a😀");
  expect(createMmoWorld({ id: "alias-smoke" }).id).toBe("alias-smoke");
  const schema = defineSchema<{ tick: number }>({ tick: "u32" });
  expect(schema.fields[0]?.name).toBe("tick");
  expect(createRoomType({ name: "alias-room", schema, createState: () => ({ tick: 0 }) }).name).toBe("alias-room");
});
