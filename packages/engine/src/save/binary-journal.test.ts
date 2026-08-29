import { expect, test } from "bun:test";
import { decodeBinaryJournalEntry, encodeBinaryJournalEntry } from "./binary-journal.ts";

test("binary journal uses a compact delta for sparse byte changes", () => {
  const baseline = new Uint8Array(1_000).fill(7);
  const current = baseline.slice();
  current[10] = 1;
  current[11] = 2;
  current[900] = 3;
  const encoded = encodeBinaryJournalEntry(current, { sequence: 8, baselineSequence: 7, baseline });
  const decoded = decodeBinaryJournalEntry(encoded, baseline);
  expect(decoded).toEqual({ kind: "delta", sequence: 8, baselineSequence: 7, bytes: current });
  expect(encoded.byteLength).toBeLessThan(current.byteLength / 4);
});

test("binary journal supports growth and truncation", () => {
  const baseline = Uint8Array.from([1, 2, 3, 4]);
  const grown = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
  const grownEntry = encodeBinaryJournalEntry(grown, { sequence: 2, baselineSequence: 1, baseline });
  expect(decodeBinaryJournalEntry(grownEntry, baseline).bytes).toEqual(grown);

  const truncated = Uint8Array.from([1, 2]);
  const truncatedEntry = encodeBinaryJournalEntry(truncated, { sequence: 3, baselineSequence: 2, baseline: grown });
  expect(decodeBinaryJournalEntry(truncatedEntry, grown).bytes).toEqual(truncated);
});

test("binary journal falls back to snapshots when delta metadata would be larger", () => {
  const baseline = new Uint8Array(32);
  const current = Uint8Array.from({ length: 32 }, (_, index) => index);
  const encoded = encodeBinaryJournalEntry(current, { sequence: 2, baselineSequence: 1, baseline });
  expect(decodeBinaryJournalEntry(encoded, baseline).kind).toBe("snapshot");
});

test("binary journal rejects corruption, wrong baselines, and configured overflows", () => {
  const baseline = new Uint8Array(100).fill(1);
  const current = baseline.slice();
  current[50] = 2;
  const encoded = encodeBinaryJournalEntry(current, { sequence: 2, baselineSequence: 1, baseline });
  const corrupt = encoded.slice();
  corrupt[corrupt.length - 1] ^= 1;
  expect(() => decodeBinaryJournalEntry(corrupt, baseline)).toThrow("checksum");
  expect(() => decodeBinaryJournalEntry(encoded, new Uint8Array(1))).toThrow("baseline length");
  expect(() => decodeBinaryJournalEntry(encoded, new Uint8Array(100).fill(9))).toThrow("result checksum");
  expect(() => encodeBinaryJournalEntry(current, { sequence: 2, maxBytes: 50 })).toThrow("result exceeds");
});
