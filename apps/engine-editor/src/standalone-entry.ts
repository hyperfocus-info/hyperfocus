import { combatAudioStage } from './standalone/delivery.ts';
import { hasHyperfocus3DProject } from "@hyperfocus/engine/project/metadata";
import { createStandaloneEntry } from "./standalone/entry-shared.ts";
import { prepareBulkRuntime } from './scene3d/bulk-training/bootstrap.ts';
declare const __HYPERFOCUS_STANDALONE_AUTO_BOOT__: boolean;
export const { startStandalonePlayable, bootStandalonePlayable } = createStandaloneEntry({
  async boot(context) {
    if (hasHyperfocus3DProject(context.opened.project)) {
      const { bootStandalone3D } = await import('./standalone-3d.ts');
      await bootStandalone3D(context.opened.project, context.opened.assets, context.canvas, context.hook, { behaviors: context.options.behaviors, streamedMusic: context.opened.streamedAudio, loadAsset: context.opened.delivery?.bytes, loadAudioStage: combatAudioStage(context.opened) });
    } else { const { bootStandalone2D } = await import('./standalone/runtime-2d.ts');await bootStandalone2D(context); }
  },
});
if (!prepareBulkRuntime() && (typeof __HYPERFOCUS_STANDALONE_AUTO_BOOT__ === "undefined" || __HYPERFOCUS_STANDALONE_AUTO_BOOT__)) {
  startStandalonePlayable({ behaviors: globalThis.__hyperfocusProjectBehaviors });
}
