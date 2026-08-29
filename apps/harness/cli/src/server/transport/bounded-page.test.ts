import { expect, test } from "bun:test";
import { fitBoundedPage } from "./bounded-page";

test("oversized page advances with an explicit unavailable item", () => {
  const page = fitBoundedPage((limit) => ({ items: [{ id: "huge", projectId: "project-1", jobId: "job-1", value: "x".repeat(2048) },
    { id: "next", value: "ok" }].slice(0, limit), nextCursor: "after-huge" }), 2, (value) => value, 256);
  expect(page.items).toEqual([]);
  expect(page.unavailableItems).toEqual([{ id: "huge", reason: "item-too-large", projectId: "project-1", jobId: "job-1" }]);
  expect(page.nextCursor).toBe("after-huge");
});
