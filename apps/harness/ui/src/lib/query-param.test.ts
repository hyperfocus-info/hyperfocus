import { expect, test } from "bun:test";
import { createUiTest, setTestUrl } from "../utils/tests/test-harness";
import { queryParam } from "./query-param";

createUiTest("queryParam", () => {
  test("reads query string values", () => {
    const originalUrl = window.location.href;
    try {
      setTestUrl("http://localhost/?terminal=solid&number=right");

      expect(queryParam("terminal")).toBe("solid");
      expect(queryParam("number")).toBe("right");
      expect(queryParam("missing")).toBeUndefined();
    } finally {
      setTestUrl(originalUrl);
    }
  });
});
