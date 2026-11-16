import { isObject as isRecord } from "@hyperfocus/utilities/records";
import type { Database } from "bun:sqlite";
import { createPageCursorError,decodePageCursor,encodePageCursor } from "./page-cursor-codec";

type Kind = "background-jobs" | "background-runs" | "notifications";
type Cursor = { v: 1; kind: Kind; owner: "workspace"; revision: string; updatedAt: string; id: string };
export type TimestampRow = { id: string; updated_at?: string; created_at: string };

function invalidCursor() { return createPageCursorError("Invalid or stale presentation page cursor"); }
function encode(cursor: Cursor) { return encodePageCursor({ identity: { scope: "presentation", kind: cursor.kind,
  owner: cursor.owner, revision: cursor.revision }, position: { updatedAt: cursor.updatedAt, id: cursor.id } }); }
function decode(value: string | undefined, kind: Kind, revision: string) {
  let position: unknown;
  try { position = decodePageCursor({ encoded: value, startToken: "__start__",
    identity: { scope: "presentation", kind, owner: "workspace", revision } }); }
  catch { throw invalidCursor(); }
  if (position === undefined) return undefined;
  if (!isRecord(position) || typeof position.updatedAt !== "string" || typeof position.id !== "string") throw invalidCursor();
  return { v: 1, kind, owner: "workspace" as const, revision, updatedAt: position.updatedAt, id: position.id };
}


export function readTimestampPage<Row extends TimestampRow>(input: { db: Database; kind: Kind; select: string;
  scope?: string; cursor?: string; limit: number; revisionTimestamp?: string; revisionSalt?: string }) {
  const timestamp = input.kind === "notifications" ? "created_at" : "updated_at";
  const where = input.scope ? `WHERE ${input.scope}` : "";
  const revisionRow = input.db.query<{ count: number; changed: string | null; edge: string | null }, []>(
    `SELECT COUNT(*) AS count, MAX(${input.revisionTimestamp ?? timestamp}) AS changed, MAX(id) AS edge FROM (${input.select} ${where})`).get();
  const revision = `${revisionRow?.count ?? 0}:${revisionRow?.changed ?? ""}:${revisionRow?.edge ?? ""}:${input.revisionSalt ?? ""}`;
  const cursor = decode(input.cursor, input.kind, revision); const conjunction = input.scope ? "AND" : "WHERE";
  const sql = `${input.select} ${where} ${cursor ? `${conjunction} (${timestamp} < ?1 OR (${timestamp} = ?1 AND id < ?2))` : ""}
    ORDER BY ${timestamp} DESC, id DESC LIMIT ?${cursor ? 3 : 1}`;
  const rows = cursor ? input.db.query<Row, [string, string, number]>(sql).all(cursor.updatedAt, cursor.id, input.limit + 1)
    : input.db.query<Row, [number]>(sql).all(input.limit + 1);
  const scanned = rows.slice(0, input.limit); const last = scanned.at(-1); const updatedAt = last?.updated_at ?? last?.created_at;
  return { rows: scanned, totalApprox: revisionRow?.count ?? 0, nextCursor: rows.length > input.limit && last && updatedAt
    ? encode({ v: 1, kind: input.kind, owner: "workspace", revision, updatedAt, id: last.id }) : undefined };
}
