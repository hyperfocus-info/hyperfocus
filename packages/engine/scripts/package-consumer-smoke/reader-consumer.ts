/** Executed from the installed package's unrelated consumer directory. */
export const readerConsumerSource = String.raw`
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { openHyperfocusProjectFiles, migrateProject } from '@hyperfocus/engine/project';
import { createCombatPreset, createCombatSimulation } from '@hyperfocus/engine/combat';
import { createHyperfocus3DRuntime, createGameplay3D, createCombatAi3D, readHyperfocus3DDeclaration, readCombatAiOutcomeReport3D, readGameplayProject3D, readGameplaySnapshot3D, readHyperfocus3DTimeline, readResolvedAppearance3D, readResolvedAppearancePoses3D, readCombatFramePresentation3D, readPortableAssets3D, readCombatAiTuning } from '@hyperfocus/engine/project/runtime-3d';
function check(value, message) { if (!value) throw Error(message); }
function rejects(operation, message) { let rejected = false;try { operation(); } catch { rejected = true; }check(rejected, message); }
const pair = resolve('game-3d/.hyperfocus');
const opened = await openHyperfocusProjectFiles(new Uint8Array(await readFile(resolve(pair, 'project.json'))), new Uint8Array(await readFile(resolve(pair, 'assets.hfp'))), { parseProject: migrateProject });
const project = readGameplayProject3D(opened.project), assets = readPortableAssets3D(opened.assets);
const declaration = readHyperfocus3DDeclaration(project);
declaration.materials.push({ ...declaration.materials[0], id: 'actor:shirt' });
declaration.textures.push({ id: 'actor:print', assetId: 'installed-print', width: 1, height: 1, filter: 'nearest', wrap: 'clamp', flipY: false }, { id: 'unused-print', assetId: 'missing-unused-asset', width: 1, height: 1, filter: 'nearest', wrap: 'clamp', flipY: false });
declaration.budgets.materials++;declaration.budgets.textures += 2;declaration.budgets.textureBytes += 8;
const appearanceProject = { ...project, extensions: { ...project.extensions, hyperfocus3D: declaration, hyperfocusAppearance: { version: 1, actors: [{ entityId: 'actor' }], slots: [{ id: 'color', label: 'Color', defaultOptionId: 'plain', options: [{ id: 'plain', label: 'Plain', colors: [{ materialSuffix: ':shirt', baseColor: [1, 1, 1, 1] }] }] }], textureSlots: [{ id: 'print', label: 'Print', materialSuffix: ':shirt', textureSuffix: ':print' }] } } };
const runtime = await createHyperfocus3DRuntime(appearanceProject, [...assets, { id: 'installed-print', mimeType: 'application/octet-stream', bytes: new Uint8Array([255, 255, 255, 255]) }]), game = createGameplay3D({ project: appearanceProject, runtime });
runtime.replaceTexture({ textureId: 'actor:print', width: 1, height: 1, pixels: new Uint8Array([1, 2, 3, 4]) });runtime.resetTexture({ textureId: 'actor:print' });
rejects(() => runtime.resetTexture({ textureId: 'unused-print' }), 'installed resource closure retained an unrelated texture');
game.step(['move-right']);
const saved = game.snapshot(), parsed = readGameplaySnapshot3D(saved);
check(JSON.stringify(parsed) === JSON.stringify(saved), 'installed gameplay snapshot reader changed fields');
game.step();game.restore(parsed);check(JSON.stringify(game.snapshot()) === JSON.stringify(saved), 'installed parsed save did not restore');
parsed.entities[0].position[0] += 10;check(JSON.stringify(game.snapshot()) === JSON.stringify(saved), 'installed snapshot reader borrowed entity data');
rejects(() => readGameplaySnapshot3D({ ...saved, gameplay: { ...saved.gameplay, velocities: [{ id: 'actor', value: [0, 'bad', 0] }] } }), 'installed nested snapshot corruption passed');
const timeline = { version: 2, sceneId: runtime.declaration.activeSceneId, durationFrames: 60, fps: 30, background: '#000', groups: [], materialTracks: [], shots: [] };
const decodedTimeline = readHyperfocus3DTimeline(timeline);
check(JSON.stringify(runtime.sampleFrame({ timeline, viewport: { width: 640, height: 360 } })) === JSON.stringify(runtime.sampleFrame({ timeline: decodedTimeline, viewport: { width: 640, height: 360 } })), 'installed timeline reader changed actual frame output');
rejects(() => readHyperfocus3DTimeline({ ...timeline, entityTracks: [{ entityId: 'actor', keyframes: [{ id: 'bad', frame: 0, position: [0, 0, 0], rotationEuler: [0, 0, 0], scale: [1, 1, 1], visible: 'true', interpolation: 'linear' }] }] }), 'installed nested timeline corruption passed');
const config = createCombatPreset(), sim = createCombatSimulation({ config, fighters: [{ id: 'a', position: { x: 0, y: 0, z: 0 } }, { id: 'b', position: { x: 1, y: 0, z: 0 } }] }), ai = createCombatAi3D({ config });
ai.outcomes.choice({ state: sim.capture(), level: 5, fighter: 'a', target: 'b', action: { input: { fighterId: 'a', guardFresh: false, direction: { x: 1, y: 0, z: 0 } }, direction: { x: 1, y: 0, z: 0 }, jump: false, dash: false, sprint: false } });
const report = ai.outcomes.report(), decodedReport = readCombatAiOutcomeReport3D(report);
check(JSON.stringify(report) === JSON.stringify(decodedReport), 'installed actual report changed');
rejects(() => readCombatAiOutcomeReport3D({ ...report, choices: [{ ...report.choices[0], action: { ...report.choices[0].action, input: { fighterId: 'a', guardFresh: 1 } } }] }), 'installed action corruption passed');
const appearance = { variants: [{ entityId: 'actor', variantId: 'coat' }], colors: [{ materialId: 'shirt', baseColor: [.2, .3, .4, 1] }], poses: [{ actorId: 'actor', phase: 'intro', style: 'bow' }], styles: [{ actorId: 'actor', channel: 'movement', style: 'loose' }] };
check(JSON.stringify(readResolvedAppearance3D(appearance)) === JSON.stringify(appearance), 'installed appearance reader changed fields');
check(readResolvedAppearancePoses3D(appearance.poses)[0].phase === 'intro', 'installed pose reader failed');
check(readCombatFramePresentation3D({ poses: appearance.poses, styles: appearance.styles, reducedMotion: false }).reducedMotion === false, 'installed presentation reader failed');
check(readCombatAiTuning({ compression: true }).compression === true, 'installed existing tuning reader export failed');
rejects(() => readResolvedAppearance3D({ ...appearance, colors: [{ materialId: 'shirt', baseColor: [0, 0, NaN, 1] }] }), 'installed appearance corruption passed');
// Rebundle the real installed, already-minified package entry, then execute it.
// Source-only tree shaking would miss import-time metadata retained by delivery.
const narrowEntry = resolve('narrow-project-reader.ts');
await Bun.write(narrowEntry, "export { readGameplayProject3D } from '@hyperfocus/engine/project/runtime-3d';");
const narrowBuild = await Bun.build({ entrypoints: [narrowEntry], target: 'browser', format: 'esm', minify: true, metafile: true });
check(narrowBuild.success, 'installed narrow reader rebundle failed');
check(narrowBuild.outputs.length === 1, 'installed narrow reader has an unrecorded output graph');
check(narrowBuild.metafile, 'installed narrow reader metadata is missing');
const narrowCode = await narrowBuild.outputs[0].text();
await Bun.write(resolve('narrow-project-reader.mjs'), narrowBuild.outputs[0]);
await Bun.write(resolve('narrow-project-reader.meta.json'), JSON.stringify(narrowBuild.metafile, null, 2));
await Bun.write(resolve('narrow-project-reader.receipt.json'), JSON.stringify({
  schema: 'engine-installed-reader-evidence-v1', bunVersion: Bun.version,
  entrySource: await readFile(narrowEntry, 'utf8'), target: 'browser', format: 'esm', minify: true,
  artifact: { file: 'narrow-project-reader.mjs', bytes: narrowBuild.outputs[0].size, sha256: new Bun.CryptoHasher('sha256').update(narrowCode).digest('hex') },
  installedRuntime: { file: 'node_modules/@hyperfocus/engine/dist/project-runtime-3d.js', sha256: new Bun.CryptoHasher('sha256').update(await readFile(resolve('node_modules/@hyperfocus/engine/dist/project-runtime-3d.js'))).digest('hex') }
}, null, 2));
for (const field of ['queuedLearning', 'searchStartFrame', 'maximumPenetrationMeters']) check(!narrowCode.includes(field), 'installed narrow reader retained unrelated schema ' + field);
const narrow = await import('data:text/javascript;base64,' + Buffer.from(narrowCode).toString('base64'));
check(JSON.stringify(narrow.readGameplayProject3D(opened.project)) === JSON.stringify(project), 'rebundled installed project reader changed fields');
rejects(() => narrow.readGameplayProject3D({ activeSceneId: 's', scenes: [{ id: 's', entities: [{ components: [{ id: 'c', type: 'motion', enabled: true, values: { speed: NaN } }] }] }] }), 'rebundled installed project reader lost validation');
console.log(JSON.stringify({ canonicalReaders: true, actualReport: true, savedRestore: true, frameRoundtrip: true, nestedRejection: true, appearance: true, assets: true, appearancePlaceholderReplacement: true, emittedNarrowReader: true, emittedNarrowReaderBytes: narrowBuild.outputs.reduce((bytes, output) => bytes + output.size, 0) }));
`;

/** Runs unchanged in Bun and Node against the installed package. */
export const runtimeAdmissionConsumerSource = String.raw`
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { migrateProject, openHyperfocusProjectFiles } from '@hyperfocus/engine/project';
import { createHyperfocus3DRuntime, createEntityInputLease3D, readCombatAiLearningEvidence } from '@hyperfocus/engine/project/runtime-3d';
const pair = resolve('game-3d/.hyperfocus');
const opened = await openHyperfocusProjectFiles(new Uint8Array(await readFile(resolve(pair, 'project.json'))), new Uint8Array(await readFile(resolve(pair, 'assets.hfp'))), { parseProject: migrateProject });
const runtime = await createHyperfocus3DRuntime(opened.project, opened.assets, { entityApplication: 'leased-input', entityApplicationDiagnostics: true });
const frame = runtime.sampleFrame({ viewport: { width: 800, height: 600 } });
assert.ok(frame.entities.length > 0, 'installed lease fixture must contain entities');
const lease = createEntityInputLease3D(frame.entities);
runtime.applyFrame(frame, lease);
runtime.applyFrame(frame, lease);
assert.equal(runtime.readEntityApplicationWork().entityTransformReuses, frame.entities.length);
assert.throws(() => runtime.applyFrame({ ...frame, entities: [...frame.entities] }, lease), /different entity array/);
assert.throws(() => runtime.applyFrame(frame, Object.assign({}, { revoke() {} })), /not issued/);
lease.revoke();
assert.throws(() => runtime.applyFrame(frame, lease), /revoked/);
const evidence = { version: 1, opponentId: '', actions: [], habits: [], probes: [{ frame: 0, context: 'near:ground:ground:neutral', difficulty: 1, opponentId: '', candidates: [{ id: 'move', score: 0, movement: ['toward'] }] }], omittedProbes: 0 };
const before = JSON.stringify(evidence);
const parsed = readCombatAiLearningEvidence(evidence);
assert.equal(parsed.probes[0].candidates[0].movement, 'toward');
assert.equal(JSON.stringify(evidence), before);
assert.notEqual(parsed.probes[0].candidates, evidence.probes[0].candidates);
assert.equal(parsed.omittedActions, 0);
assert.equal(parsed.omittedHabits, 0);
const extra = structuredClone(evidence);
extra.probes[0].candidates[0].unknown = true;
assert.throws(() => readCombatAiLearningEvidence(extra));
const malformed = structuredClone(evidence);
malformed.probes[0].candidates[0].score = 'wrong';
assert.throws(() => readCombatAiLearningEvidence(malformed));
let calls = 0;
const noncloneable = structuredClone(evidence);
noncloneable.probes[0].candidates[0].movement = { toString() { calls++; return 'toward'; } };
assert.throws(() => readCombatAiLearningEvidence(noncloneable), { name: 'DataCloneError' });
assert.equal(calls, 1);
console.log(JSON.stringify({ runtime: process.versions.bun ? 'bun' : 'node', issuedLease: true, revokedAndForgedRejected: true, evidenceAdmission: true, cloneFailurePreserved: true }));
`;
