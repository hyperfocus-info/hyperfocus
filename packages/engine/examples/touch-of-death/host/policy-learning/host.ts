import type { GameplayProject3D, PortableAsset3D } from '@hyperfocus/engine/project/runtime-3d';
import type { DurableServiceStore } from '@hyperfocus/engine/server';
import { createTrustedPolicyEvaluator } from './evaluator.ts';
import { createPolicyLearningHttp } from './http.ts';
import { createPolicyLearningService } from './service.ts';
import { stageDeploymentPolicy, type readDeploymentPolicy } from './deployment.ts';

/** One owned evaluator, restarted from durable nominations when the host boots. */
export function createHostedPolicyLearning(options: {
  origin: string; contentId: string; store: DurableServiceStore; project: GameplayProject3D; assets: readonly PortableAsset3D[];
  authenticate(token: string): Promise<string | undefined>;
  deploymentPolicy?: ReturnType<typeof readDeploymentPolicy>;
}) {
  const evaluator = createTrustedPolicyEvaluator(options);
  const service = createPolicyLearningService({ ...options, evaluate: evaluator.evaluate });
  let stopped = false, pumping: Promise<void> | undefined;
  let staged = false, stageRetryAt = 0;
  function wake() {
    if (stopped || pumping) return;
    pumping = (async () => {
      if (options.deploymentPolicy && !staged && Date.now() >= stageRetryAt) {
        try { await stageDeploymentPolicy({ store: options.store, policy: options.deploymentPolicy });staged = true; }
        catch (error) { stageRetryAt = Date.now() + 60000;console.warn('Deployment policy nomination deferred:', error instanceof Error ? error.message : String(error)); }
      }
      while (!stopped && await service.processNext()) { /* Drain serially. */ }
    })()
      .catch(error => { console.warn('Shared policy evaluation deferred:', error instanceof Error ? error.message : String(error)); })
      .finally(() => { pumping = undefined; });
  }
  const handle = createPolicyLearningHttp({ ...options, service, wake });
  const timer = setInterval(wake, 60000);
  wake();
  return {
    handle,
    async dispose() { stopped = true;clearInterval(timer);await service.dispose();await pumping; },
  };
}
