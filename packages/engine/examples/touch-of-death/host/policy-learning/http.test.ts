import { expect, test } from 'bun:test';
import { createMemoryDurableServiceStore } from '@hyperfocus/engine/server';
import { createPolicyExperiment } from '../../src/learning/experiment.ts';
import { encodePolicyRecord } from '../../src/learning/records.ts';
import { createPolicyLearningHttp } from './http.ts';
import { createPolicyLearningService } from './service.ts';

const origin = 'https://fight.example', contentId = 'combat-test-content';
// Run with HARNESS_TEST_SKIP_UI_PRELOAD=1: happy-dom strips Origin/Host request headers.
const httpTest = test.skipIf(typeof window !== 'undefined');
function nomination() {
  const experiment = createPolicyExperiment({ seed: 123 });let trial;
  while ((trial = experiment.next())) {
    const strengths = trial.policies.map(policy => Object.values(policy?.scores ?? {}).reduce((total, score) => total + score, 0));
    experiment.record({ id: trial.id, status: 'completed', ticks: 100,
      winner: strengths[0]! > strengths[1]! ? 'player' : strengths[0]! < strengths[1]! ? 'opponent' : 'draw' });
  }
  return { id: 'candidate-a', baseRevision: 0, record: encodePolicyRecord({ version: 2, identity: contentId, revision: 1, active: 'approved', previous: 'original', evidence: experiment.snapshot() }) };
}
function fixture() {
  const memory = createMemoryDurableServiceStore();let fail = false, now = 1000, wakes = 0, evaluations = 0;
  const service = createPolicyLearningService({ contentId, now: () => now,
    store: { ...memory, transaction(callback) { if (fail) return Promise.reject(Error('Database unavailable'));return memory.transaction(callback); } },
    async evaluate() { evaluations++;return { approved: true, evidence: { trusted: true } }; },
  });
  const handler = createPolicyLearningHttp({ origin, contentId, service, authenticate: async token => token === 'good-token' ? 'player-a' : undefined, wake() { wakes++; } });
  return { handler, service, counts: () => ({ wakes, evaluations }), failReads() { fail = true; }, expire() { now += 1800000; } };
}
function post(value: unknown = { version: 1, contentId, candidates: [nomination()] }, headers: Record<string, string> = {}) {
  return new Request(`${origin}/tod-ai-candidates`, { method: 'POST', headers: { origin, authorization: 'Bearer good-token', 'content-type': 'application/json', ...headers }, body: JSON.stringify(value) });
}
function protectedResponse(response: Response | undefined, status: number) {
  expect(response?.status).toBe(status);expect(response?.headers.get('cache-control')).toBe('no-store');
  expect(response?.headers.get('x-content-type-options')).toBe('nosniff');
}

httpTest('same-origin GET serves cached canonical weights and only authenticated nominations queue work', async () => {
  const app = fixture();
  try {
    const initial = await app.handler(new Request(`${origin}/tod-ai-policy`));protectedResponse(initial, 200);
    expect(await initial!.json()).toMatchObject({ version: 1, contentId, revision: 0, stale: false });
    const submitted = await app.handler(post());protectedResponse(submitted, 200);
    expect(await submitted!.json()).toEqual({ revision: 0, receipts: [{ id: 'candidate-a', status: 'queued' }] });
    expect(app.counts()).toEqual({ wakes: 1, evaluations: 0 });expect((await app.service.read()).revision).toBe(0);
    const retry = await app.handler(post());protectedResponse(retry, 200);
    expect(await retry!.json()).toEqual({ revision: 0, receipts: [{ id: 'candidate-a', status: 'queued' }] });
    expect(app.counts().evaluations).toBe(0);
    await app.service.processNext();expect((await app.service.read()).revision).toBe(1);
    const promotedRetry = await app.handler(post());protectedResponse(promotedRetry, 200);
    expect(await promotedRetry!.json()).toEqual({ revision: 1, receipts: [{ id: 'candidate-a', status: 'promoted' }] });
  } finally { await app.service.dispose(); }
});

httpTest('origins, host, fetch context, methods, content type and authentication are enforced', async () => {
  const app = fixture();
  try {
    const cases: [Request, number][] = [
      [new Request('https://other.example/tod-ai-policy'), 403],
      [new Request(`${origin}/tod-ai-policy`, { headers: { origin: 'https://other.example' } }), 403],
      [new Request(`${origin}/tod-ai-policy`, { headers: { host: 'other.example' } }), 403],
      [new Request(`${origin}/tod-ai-policy`, { headers: { 'sec-fetch-site': 'cross-site' } }), 403],
      [new Request(`${origin}/tod-ai-policy?contentId=other`), 403],
      [new Request(`${origin}/tod-ai-policy`, { method: 'POST' }), 405],
      [new Request(`${origin}/tod-ai-candidates`), 405],
      [post(undefined, { origin: 'https://other.example' }), 403],
      [post(undefined, { 'content-type': 'text/plain' }), 415],
      [post(undefined, { authorization: '' }), 401],
      [post(undefined, { authorization: 'Bearer unknown' }), 401],
    ];
    for (const [request, expected] of cases) protectedResponse(await app.handler(request), expected);
    const missingOrigin = post();missingOrigin.headers.delete('origin');protectedResponse(await app.handler(missingOrigin), 403);
    expect(app.counts()).toEqual({ wakes: 0, evaluations: 0 });
  } finally { await app.service.dispose(); }
});

httpTest('invalid content, corrupted evidence and oversized batches cannot queue or activate a policy', async () => {
  const app = fixture();
  try {
    for (const value of [null, { version: 2, contentId, candidates: [nomination()] },
      { version: 1, contentId: 'another-game', candidates: [nomination()] },
      { version: 1, contentId, candidates: [] },
      { version: 1, contentId, candidates: Array.from({ length: 9 }, (_, index) => ({ ...nomination(), id: `candidate-${index}` })) },
      { version: 1, contentId, candidates: [{ ...nomination(), record: '{corrupt' }] },
      { version: 1, contentId, candidates: [{ ...nomination(), baseRevision: -1 }] },
    ]) protectedResponse(await app.handler(post(value)), 400);
    const malformed = new Request(`${origin}/tod-ai-candidates`, { method: 'POST', headers: post().headers, body: '{invalid' });
    protectedResponse(await app.handler(malformed), 400);
    const oversized = new Request(`${origin}/tod-ai-candidates`, { method: 'POST', headers: post().headers, body: ' '.repeat(1048577) });
    protectedResponse(await app.handler(oversized), 400);
    expect((await app.service.read()).revision).toBe(0);expect(app.counts()).toEqual({ wakes: 0, evaluations: 0 });
  } finally { await app.service.dispose(); }
});

httpTest('there is no client approval or rollback route, including injected approval fields', async () => {
  const app = fixture();
  try {
    for (const path of ['/tod-ai-approve', '/tod-ai-promote', '/tod-ai-rollback', '/tod-ai-policy/approve']) {
      expect(await app.handler(new Request(`${origin}${path}`, { method: 'POST' }))).toBeUndefined();
    }
    const response = await app.handler(post({ version: 1, contentId, approved: true, promote: true, revision: 999, candidates: [nomination()] }));
    protectedResponse(response, 200);expect((await app.service.read()).revision).toBe(0);expect(app.counts().evaluations).toBe(0);
  } finally { await app.service.dispose(); }
});

httpTest('database outage preserves no-store headers and last known policy with explicit stale status', async () => {
  const unavailable = fixture();unavailable.failReads();
  try { protectedResponse(await unavailable.handler(new Request(`${origin}/tod-ai-policy`)), 503); }
  finally { await unavailable.service.dispose(); }
  const cached = fixture();
  try {
    await cached.handler(new Request(`${origin}/tod-ai-policy`));cached.expire();cached.failReads();
    const response = await cached.handler(new Request(`${origin}/tod-ai-policy`));protectedResponse(response, 200);
    expect(await response!.json()).toMatchObject({ revision: 0, stale: true, error: expect.stringContaining('Database unavailable') });
  } finally { await cached.service.dispose(); }
});
