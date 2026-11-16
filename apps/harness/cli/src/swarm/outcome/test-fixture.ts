import { createLocalAiRuntime, type AiRuntimeAdapter } from "@hyperfocus/ai-runtime";
import { swarmInvestigationInstrumentSchema } from "@hyperfocus/ai-core/swarm";
import { runnerFixture } from "../execution/runner-test-fixture";
import { createSwarmCoordinator } from "../coordinator";
import { createSwarmTaskHandler } from "../execution/runner";
import { planSwarm } from "../plan";

export async function outcomeFixture(options: { campaignRounds?:number; selected?: number; observed?: unknown; missingEvaluator?: boolean; constraint?: boolean; variants?: boolean; malformedPlan?: boolean; failProbe?: boolean; failValidation?: boolean; repair?: "succeed" | "repeat" | "wrong-primitive" } = {}) {
  const fixture = await runnerFixture({ failValidation: options.failValidation ? [1] : [] });
  const profile = { agentId: "direct", providerId: "test-provider", modelId: "test-model", approvalPolicy: "never" as const };
  const profiles = { planning: profile, implementation: profile, review: profile };
  const selected = options.selected ?? 1;
  const instruments = [1, 2].map(index => swarmInvestigationInstrumentSchema.parse({ id: `probe-${index}`, methodId: "causal-probe", claim: `Mechanism ${index} explains redundant work.`, command: "probe-fixture", timeoutMs: 60_000, maxComputeUsd: 0.1, lane: "investigation",
    implementationEligible: !(index === 2 && options.constraint), supports: { path: ["observed"], operator: "eq", value: true }, contradicts: { path: ["observed"], operator: "eq", value: false }, limitations: ["Synthetic orchestration evidence only."] }));
  const recipe = fixture.context.recipes.get(fixture.run.request.projectId)!;
  recipe.investigationInstruments = instruments;
  recipe.outcomeCriteria = fixture.run.request.doneCriteria.map(criterion => ({criterion,metric:"Protected correctness plus controlled improvement.",evaluatorMethodId:"paired-performance"}));
  fixture.store.change(fixture.run.id, run => {
    if(options.campaignRounds){run.request.executionMode="campaign";run.request.budget.maxCampaignRounds=options.campaignRounds;}
    Object.assign(run, planSwarm({ id: run.id, request: run.request, modelProfiles: profiles, investigationInstruments: instruments }));
    if(options.campaignRounds)run.campaign={round:1,finalizationReserveMs:1000,rounds:[{number:1,candidateIds:run.candidates.map(candidate=>candidate.id),compareTaskId:run.tasks.find(task=>task.kind==="compare")!.id,startedAt:Date.now()}]};
  });
  const calls: string[] = [], prompts: string[] = [];
  const execute = fixture.provider.execute;
  fixture.provider.execute = async input => {
    const result = await execute(input); calls.push(input.task.command);
    if (input.task.command !== "probe-fixture") return result;
    return { ...result, stdout: JSON.stringify({ observed: options.observed ?? true }), exitCode: options.failProbe ? 1 : 0 };
  };
  const turns = new Map<number, number>(); let repairTurn = 0;
  const adapter: AiRuntimeAdapter = {
    descriptor: { id: "direct", label: "Deterministic outcome test", providerIds: ["test-provider"], supportsReasoning: true, supportsStructuredOutput: true, available: true },
    listCatalog: () => ({ providers: [{ id: "test-provider", label: "Fixture", authenticated: true, credentialSource: "stored", modelIds: ["test-model"] }], models: [{ id: "test-model", providerId: "test-provider", label: "Fixture model", reasoning: true, input: ["text"] }] }),
    async run(request) {
      prompts.push(JSON.stringify(request.messages));
      const current = fixture.store.get(fixture.run.id)!;
      const activeIds=current.campaign?.rounds.at(-1)?.candidateIds??current.candidates.map(candidate=>candidate.id);
      const baseline = current.artifacts.find(artifact => artifact.name === "baseline.json")!;
      let value: unknown;
      if (request.systemPrompt?.includes("outcome planner")) {
        value = { difficulty: selected > 1 ? "complex" : "bounded", reason: "Select only distinct falsification experiments.", intendedOutcome: "Reduce redundant work while preserving observable behavior.", observedSymptoms: ["Current fixture repeats work."], assumptions: [{ claim: "Repeated work is unnecessary.", falsification: "External mutation requires repair." }],
          acceptanceCriteria: current.request.doneCriteria.map(criterion => ({ criterion, metric: "Protected correctness plus controlled improvement.", evaluatorMethodId: options.missingEvaluator ? null : "paired-performance" })), downstreamConsequences: ["Submission cadence does not establish display freshness."], limitations: ["Synthetic fixture."],
          hypotheses: instruments.slice(options.campaignRounds?(current.campaign!.round-1):0,options.campaignRounds?current.campaign!.round:selected).map(instrument=>options.variants?instruments[0]!:instrument).map((instrument, index) => ({ candidateId: activeIds[index]!, claim: options.malformedPlan ? "Unrelated claim" : instrument.claim, methodId: instrument.methodId, ...(options.variants?{implementationStrategy:`Bounded variant ${index+1}`} : {}), supportingEvidenceIds: baseline?[baseline.id]:[], contradictingEvidenceIds: [], verificationCostUsd: 0.01,
            experiment: { instrumentId: instrument.id, objective: "Falsify redundant work before editing.", expectedInformationGain: "Distinguish mechanism from a regression constraint.", expectedIfCorrect: "observed is true", expectedIfIncorrect: "observed is false", timeoutMs: 60_000, maxComputeUsd: 0.1 } })) };
      } else if (request.systemPrompt?.includes("planning/review actor")) {
        value = { summary: "A completed investigation is distinct from demonstrating an improvement.", criteria: current.request.doneCriteria.map(criterion => ({ criterion, status: "met", artifactIds: [baseline.id], reason: "Retained synthetic evidence." })), candidates: current.candidates.filter(candidate=>activeIds.includes(candidate.id)).map(candidate => ({ candidateId: candidate.id, approved: candidate.correctness === "passed" && !candidate.blockers.length, reason: "Independent deterministic gates remain authoritative." })) };
      } else if(request.systemPrompt?.includes("bounded repair round")) {
        value = repairTurn++ === 0 ? {action:"repair-plan",expectedCause:"The implementation uses an invalid branch.",diagnosis:options.repair==="wrong-primitive"?"wrong-primitive":"implementation-defect",proceed:options.repair!=="wrong-primitive"}
          : repairTurn===2 ? {action:"execute",command:options.repair==="succeed"?"produce-candidate-2":"produce-candidate-1",purpose:"Bounded fixture repair"}
          : {action:"finish",diagnosis:"Repair candidate requires independent revalidation.",risks:[],hypothesisSupported:true};
      } else {
        const index = request.systemPrompt?.includes("Mechanism 2") || request.systemPrompt?.includes("Bounded variant 2") ? 2 : 1;
        const turn = turns.get(index) ?? 0; turns.set(index, turn + 1);
        value = turn === 0 ? { action: "execute", command: `produce-candidate-${index}`, purpose: "Synthetic candidate" } : { action: "finish", diagnosis: "Bounded synthetic implementation", risks: [], hypothesisSupported: true };
      }
      return { requestId: request.requestId, profile: request.profile, text: JSON.stringify(value), stopReason: "stop", usage: { inputTokens: 10, outputTokens: 10, costUsd: 0 } };
    },
  };
  const runtime = createLocalAiRuntime({ adapters: [adapter] });
  const coordinator = createSwarmCoordinator({ store: fixture.store, provider: fixture.provider, modelProfiles: profiles, investigationInstruments: () => instruments, handleTask: createSwarmTaskHandler({ context: fixture.context, runtime, maxTokenPriceUsd: 0 }) });
  return { ...fixture, instruments, calls, prompts, coordinator, current: () => fixture.store.get(fixture.run.id)!,
    async close() { await coordinator.close(); await fixture.close(); } };
}
