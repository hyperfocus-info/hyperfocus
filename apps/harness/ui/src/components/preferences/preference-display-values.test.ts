import { expect, test } from "bun:test";
import { formatBytes } from "./preference-display-values";

test("storage byte labels retain binary thresholds, GB maximum and special values", () => {
  for (const [bytes, expected] of [
    [0, "0 bytes"], [-1, "-1 bytes"], [1023, "1023 bytes"],
    [1024, "1.0 KB"], [1048575, "1024.0 KB"], [1048576, "1.0 MB"],
    [1073741824, "1.0 GB"], [1099511627776, "1024.0 GB"],
    [NaN, "NaN bytes"], [Infinity, "Infinity GB"], [-Infinity, "-Infinity bytes"],
  ] as const) expect(formatBytes(bytes)).toBe(expected);
});
