import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  runPersistenceMigrationOnce, withImmediateMigrationScope, type PersistenceMigrationScope,
} from "./persistence-migrations";

describe("persistence migrations", () => {
  test("marks successful work and runs it once", () => {
    const db = new Database(":memory:"); let calls = 0;
    withImmediateMigrationScope(db, (scope) => runPersistenceMigrationOnce(db, "success", () => { calls += 1; }, scope));
    runPersistenceMigrationOnce(db, "success", () => { calls += 1; });
    expect(calls).toBe(1); db.close(false);
  });

  test("does not mark failed transactional work", () => {
    const db = new Database(":memory:"); let calls = 0;
    db.exec("CREATE TABLE effects (value TEXT)");
    const attempt = () => runPersistenceMigrationOnce(db, "retry", () => {
      db.run("INSERT INTO effects VALUES ('partial')");
      calls += 1; if (calls === 1) throw new Error("failed migration");
    });
    expect(attempt).toThrow("failed migration"); expect(attempt()).toBe(true); expect(calls).toBe(2);
    expect(db.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM effects").get()?.count).toBe(1);
    db.close(false);
  });

  test("serializes competing connections before marking once", () => {
    const path = join(tmpdir(), `hf-persistence-migration-${crypto.randomUUID()}.sqlite`);
    const first = new Database(path); first.exec("PRAGMA journal_mode = WAL; CREATE TABLE effects (value TEXT)");
    const second = new Database(path); second.exec("PRAGMA busy_timeout = 0"); let calls = 0;
    runPersistenceMigrationOnce(first, "shared", () => {
      first.run("INSERT INTO effects VALUES ('once')"); calls += 1;
      expect(() => runPersistenceMigrationOnce(second, "shared", () => { calls += 1; })).toThrow();
    });
    expect(runPersistenceMigrationOnce(second, "shared", () => { calls += 1; })).toBe(false);
    expect(calls).toBe(1); first.close(false); second.close(false); rmSync(path, { force: true });
  });

  test("rejects an unscoped migration nested in a deferred transaction", () => {
    const path = join(tmpdir(), `hf-deferred-migration-${crypto.randomUUID()}.sqlite`);
    const first = new Database(path); first.exec("CREATE TABLE effects (value TEXT)");
    const second = new Database(path); let calls = 0;
    first.transaction(() => {
      expect(() => runPersistenceMigrationOnce(first, "shared", () => { calls += 1; })).toThrow("requires");
      expect(runPersistenceMigrationOnce(second, "shared", () => { calls += 1; })).toBe(true);
    })();
    expect(calls).toBe(1); first.close(false); second.close(false); rmSync(path, { force: true });
  });

  test("revokes scopes after successful and failed callbacks", () => {
    const db = new Database(":memory:"); db.exec("CREATE TABLE effects (value TEXT)");
    let successful: PersistenceMigrationScope | undefined;
    withImmediateMigrationScope(db, (scope) => { successful = scope; });
    const useSuccessful = () => runPersistenceMigrationOnce(db, "escaped-success", () => {
      db.run("INSERT INTO effects VALUES ('escaped')");
    }, successful);
    expect(useSuccessful).toThrow("inactive");
    expect(() => db.transaction(useSuccessful)()).toThrow("inactive");
    let failed: PersistenceMigrationScope | undefined;
    expect(() => withImmediateMigrationScope(db, (scope) => {
      failed = scope; throw new Error("scope callback failed");
    })).toThrow("scope callback failed");
    expect(() => runPersistenceMigrationOnce(db, "escaped-failure", () => {
      db.run("INSERT INTO effects VALUES ('escaped')");
    }, failed)).toThrow("inactive");
    expect(db.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM effects").get()?.count).toBe(0);
    db.close(false);
  });
});
