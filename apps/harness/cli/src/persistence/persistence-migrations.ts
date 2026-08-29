import type { Database } from "bun:sqlite";

const migrationScope = Symbol("persistence-migration-scope");
export type PersistenceMigrationScope = { readonly db: Database; readonly [migrationScope]: true };
const activeScopes = new WeakSet<PersistenceMigrationScope>();

export function withImmediateMigrationScope<T>(db: Database, use: (scope: PersistenceMigrationScope) => T) {
  if (db.inTransaction) throw new Error("Cannot create an immediate migration scope inside another transaction");
  return db.transaction(() => {
    const scope: PersistenceMigrationScope = { db, [migrationScope]: true }; activeScopes.add(scope);
    try { return use(scope); } finally { activeScopes.delete(scope); }
  }).immediate();
}

export function runPersistenceMigrationOnce(
  db: Database, id: string, migrate: () => void, scope?: PersistenceMigrationScope,
) {
  const run = () => {
    db.exec("CREATE TABLE IF NOT EXISTS repository_migrations (id TEXT PRIMARY KEY)");
    if (db.query<{ id: string }, [string]>("SELECT id FROM repository_migrations WHERE id = ?1").get(id)) return false;
    migrate();
    db.query("INSERT INTO repository_migrations(id) VALUES(?1)").run(id);
    return true;
  };
  if (scope) {
    if (scope.db !== db || !scope[migrationScope] || !db.inTransaction || !activeScopes.has(scope)) {
      throw new Error("Invalid or inactive immediate migration scope");
    }
    return run();
  }
  if (db.inTransaction) throw new Error("Nested persistence migration requires an immediate migration scope");
  return withImmediateMigrationScope(db, () => run());
}
