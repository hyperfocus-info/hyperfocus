import { combatAudioStage } from './delivery.ts';
import { bootStandalone3D } from "../standalone-3d.ts";
import { createStandaloneEntry } from "./entry-shared.ts";
import { prepareBulkRuntime } from '../scene3d/bulk-training/bootstrap.ts';
declare const __HYPERFOCUS_STANDALONE_AUTO_BOOT__: boolean;
export const { startStandalonePlayable, bootStandalonePlayable } = createStandaloneEntry({
  dimension: '3d',
  async boot(context) { await bootStandalone3D(context.opened.project, context.opened.assets, context.canvas, context.hook, { behaviors: context.options.behaviors, streamedMusic: context.opened.streamedAudio, loadAsset: context.opened.delivery?.bytes, loadAudioStage: combatAudioStage(context.opened) }); },
});
if (!prepareBulkRuntime() && (typeof __HYPERFOCUS_STANDALONE_AUTO_BOOT__ === "undefined" || __HYPERFOCUS_STANDALONE_AUTO_BOOT__)) {
  startStandalonePlayable({ behaviors: globalThis.__hyperfocusProjectBehaviors });
}
