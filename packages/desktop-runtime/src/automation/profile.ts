import { removeOwnedDirectory } from '../filesystem/remove-owned-directory';
import { tmpdir } from "node:os";
import { basename, dirname, resolve } from "node:path";

export async function removeBrowserProfile(profileDir: string) {
  const directory = resolve(profileDir);
  if (dirname(directory) !== resolve(tmpdir()) || !basename(directory).startsWith("hyperfocus-browser-")) {
    throw new Error("Browser cleanup requires its dedicated temporary profile.");
  }
  await removeOwnedDirectory({ directory, parent: tmpdir() });
}
