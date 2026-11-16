import { bootStandalone2D } from "./runtime-2d.ts";
import { createStandaloneEntry } from "./entry-shared.ts";
declare const __HYPERFOCUS_STANDALONE_AUTO_BOOT__: boolean;
export const { startStandalonePlayable, bootStandalonePlayable } = createStandaloneEntry({
  dimension: '2d',
  async boot(context) { await bootStandalone2D(context); },
});
if (typeof __HYPERFOCUS_STANDALONE_AUTO_BOOT__ === "undefined" || __HYPERFOCUS_STANDALONE_AUTO_BOOT__) {
  startStandalonePlayable({ behaviors: globalThis.__hyperfocusProjectBehaviors });
}
