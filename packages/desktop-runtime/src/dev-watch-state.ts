import { lstatSync, readdirSync } from "node:fs";
import path from "node:path";

/** Snapshot content-relevant metadata without reading files or changing access times. */
export function createDevWatchState(options: {
  source: string;
  recursive: boolean;
  accepts: (file: string) => boolean;
}) {
  const states = new Map<string, string>();
  const collect = (file: string, output: Map<string, string>, descend: boolean) => {
    if (!options.accepts(file)) return;
    let stat;
    try { stat = lstatSync(file, { bigint: true }); }
    catch (error) {
      if (isMissingPath(error)) return;
      throw error;
    }
    if (stat.isDirectory()) {
      if (descend) {
        let names;
        try { names = readdirSync(file); }
        catch (error) { if (isMissingPath(error)) return; throw error; }
        for (const name of names) collect(path.join(file, name), output, options.recursive);
      }
    } else {
      output.set(file, `${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.mode}`);
    }
  };
  collect(options.source, states, true);
  return {
    changes(file = options.source) {
      const previousFile = states.has(file);
      const next = new Map<string, string>();
      collect(file, next, file === options.source || options.recursive);
      const changed: string[] = [];
      for (const [name, state] of next) {
        if (states.get(name) !== state) changed.push(name);
        states.set(name, state);
      }
      // Ordinary file notifications must not scan the entire watched tree.
      if (previousFile && (next.has(file) || next.size === 0)) {
        if (!next.has(file)) { states.delete(file); changed.push(file); }
        return changed;
      }
      const prefix = file + path.sep;
      for (const name of states.keys()) {
        if ((name === file || name.startsWith(prefix)) && !next.has(name)) {
          states.delete(name);
          changed.push(name);
        }
      }
      return changed;
    },
  };
}

function isMissingPath(error: unknown) {
  return error !== null && typeof error === "object" && "code" in error && (error.code === "ENOENT" || error.code === "ENOTDIR");
}
