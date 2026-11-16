import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readerConsumerSource, runtimeAdmissionConsumerSource } from './reader-consumer.ts';

/** Runs only installed public APIs and scripts from an unrelated temporary consumer. */
export async function verifyAuthoringConsumer(options: {
  consumerDir: string;
  bunCommand: string;
  evidenceDirectory: string;
  run: (cmd: readonly string[], cwd: string) => Promise<string>;
}) {
  const { consumerDir, bunCommand, run, evidenceDirectory } = options;
  writeFileSync(join(consumerDir, "authoring-consumer.ts"), authoringConsumerSource);
  console.log(await run([bunCommand, "authoring-consumer.ts"], consumerDir));
  writeFileSync(join(consumerDir, 'reader-consumer.ts'), readerConsumerSource);
  mkdirSync(evidenceDirectory, { recursive: true });
  console.log(JSON.stringify({ packageConsumerEvidence: evidenceDirectory }));
  try {
    console.log(await run([bunCommand, 'reader-consumer.ts'], consumerDir));
  } finally {
    for (const file of ['narrow-project-reader.mjs', 'narrow-project-reader.meta.json', 'narrow-project-reader.receipt.json']) {
      const source = join(consumerDir, file);
      if (existsSync(source)) copyFileSync(source, join(evidenceDirectory, file));
    }
  }
  writeFileSync(join(consumerDir, 'runtime-admission-consumer.mjs'), runtimeAdmissionConsumerSource);
  console.log(await run([bunCommand, 'runtime-admission-consumer.mjs'], consumerDir));
  console.log(await run(['node', 'runtime-admission-consumer.mjs'], consumerDir));
  const installed = join(consumerDir, "node_modules/@hyperfocus/engine");
  await run([bunCommand, "run", "create:project", "--", "top-down", join(consumerDir, "cli-game")], installed);
  await run([bunCommand, "run", "build:game", "--", "--project", join(consumerDir, "game")], installed);
  await run([bunCommand, "run", "create:project", "--", "check", join(consumerDir, "game-3d"), "--json"], installed);
  await run([bunCommand, "run", "build:game", "--", "--project", join(consumerDir, "game-3d")], installed);
  const web = readFileSync(join(consumerDir, 'game/dist/web/index.html'), 'utf8');
  if (!web.includes('"manifestUrl"') || web.includes('"assetsArchive"')) throw Error('Installed default build did not produce streaming web output.');
  await run([bunCommand, "run", "dev:game", "--", "--help"], installed);
}

const authoringConsumerSource = String.raw`
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createProjectStarter, inspectProjectStarter } from "@hyperfocus/engine/tooling/create-project";
import { buildPortableProject } from "@hyperfocus/engine/tooling/build-project";
import { startProjectDevServer } from "@hyperfocus/engine/tooling/dev-project";
import { createHyperfocusProjectFiles, migrateProject, openHyperfocusProjectFiles } from "@hyperfocus/engine/project";
import { planProjectDelivery } from '@hyperfocus/engine/project/delivery';
import { hasHyperfocus3DProject, validateTimelineEffectPlacement2D } from '@hyperfocus/engine/project/metadata';
import { createCombatPreset, createCombatSimulation } from '@hyperfocus/engine/combat';
import { combatRoomInputCodec } from '@hyperfocus/engine/combat/net';
import { createHyperfocus3DRuntime, createNetworkCombatSession } from '@hyperfocus/engine/project/runtime-3d';
import { createCombatRelayRoom } from '@hyperfocus/engine/server';
import { createProgressionProfile, snapshotProgressionLoadout, applyProgressionReward } from '@hyperfocus/engine/progression';
import { createRoamNavigator3D } from '@hyperfocus/engine/navigation';
import { createCombatRollbackSession, createRollbackParticipant } from '@hyperfocus/engine/net';

function check(value, message) { if (!value) throw new Error(message); }
const fighter = createCombatSimulation({ config: createCombatPreset(), fighters: [{ id: 'player', position: {x:0,y:0,z:0} }] });
const fight = createCombatRollbackSession({ peerIds: ['player'], localPeerId: 'player', defaultInput: false, getLocalInput: () => false, participants: [createRollbackParticipant({ id: 'combat', capture: fighter.capture, restore: snapshot => fighter.restore({snapshot}) })], update: () => fighter.step() });
fight.tick(); check(fighter.capture().frame === 1, 'installed combat rollback failed');
const wireInput = { matchId: 'installed', frame: 0, actions: ['jab'], direction: { x: 0, y: 0, z: 1 } };
check(JSON.stringify(combatRoomInputCodec.decode(combatRoomInputCodec.encode(wireInput))) === JSON.stringify(wireInput), 'installed combat network codec failed');
check(typeof createNetworkCombatSession === 'function' && createCombatRelayRoom({ matchId: 'installed', contentId: 'v1', seed: 1, allowedActions: ['jab'] }).maxPlayers === 2, 'installed network combat exports failed');
const navigator = createRoamNavigator3D({waypoints:[{id:'start',position:[0,0,0]}],links:[]});
check(navigator, 'installed 3D navigation failed');
check(createProgressionProfile().revision === 0 && typeof snapshotProgressionLoadout === 'function' && typeof applyProgressionReward === 'function', 'installed progression failed');
const root = resolve("game");
await createProjectStarter({ template: "top-down", outputDirectory: root, name: "External authored game" });
check((await inspectProjectStarter(root)).canonicalFiles.length === 2, "starter inspection failed");
const pair = resolve(root, ".hyperfocus");
const original = await openHyperfocusProjectFiles(
  new Uint8Array(await readFile(resolve(pair, "project.json"))),
  new Uint8Array(await readFile(resolve(pair, "assets.hfp"))),
  { parseProject: migrateProject },
);
original.project.scenes[0].entities[0].components.push({ id: "custom", type: "behavior", enabled: true,
  values: { module: "./src/custom.ts", export: "updateCustom" } });
const files = await createHyperfocusProjectFiles(original.project, []);
check(Array.isArray(planProjectDelivery({project:original.project}).groups.startup), 'installed delivery contract failed');
check(!hasHyperfocus3DProject(original.project), 'installed dimension contract failed');
validateTimelineEffectPlacement2D({ space: 'screen' });
await writeFile(resolve(pair, "project.json"), files.projectJson);
await writeFile(resolve(pair, "assets.hfp"), files.assetsArchive);
await mkdir(resolve(root, "src"));
await writeFile(resolve(root, "src/shared.ts"), "export const speed = 17;\n");
await writeFile(resolve(root, "src/custom.ts"), 'import { speed } from "./shared.ts"; export function updateCustom() { return { velocityX: speed }; }\n');
const result = await buildPortableProject({ projectDirectory: root });
check(result.behaviorCount === 1, "custom source was omitted");
const html = await readFile(result.outputPath, "utf8");
check(html.includes("hyperfocus-project-pair"), "missing canonical pair");
check(!/<script\s+src=/.test(html), "artifact depends on external scripts");
const receipt = JSON.parse(await readFile(result.receiptPath, "utf8"));
check(receipt.artifact.sha256 === new Bun.CryptoHasher("sha256").update(html).digest("hex"), "artifact hash mismatch");
check(receipt.inputs.some(input => input.path.endsWith("/src/shared.ts")), "transitive source absent from receipt");
check(receipt.inputs.some(input => input.path.endsWith("/dist/tooling/standalone-runtime-2d.js")), "packaged 2D runtime absent from receipt");
const server = await startProjectDevServer({ projectDirectory: root, port: 0, logger: { log() {}, error() {} } });
try {
  check((await (await fetch(server.url)).text()).includes("hyperfocus-project-pair"), "preview failed");
  check(server.status().watchedFiles.some(path => path.endsWith("shared.ts")), "preview omitted transitive source");
  await writeFile(resolve(root, "src/shared.ts"), "export const speed = 31;\n");
  const rebuilt = await server.rebuild();
  check(rebuilt.state === "ready", "authored rebuild failed");
  await writeFile(resolve(root, "src/shared.ts"), "export const speed = ;\n");
  check((await server.rebuild()).state === "error", "broken source passed rebuild");
  check((await fetch(server.url)).ok, "last good preview was lost");
  await writeFile(resolve(root, "src/shared.ts"), "export const speed = 31;\n");
  check((await server.rebuild()).state === "ready", "preview did not recover");
} finally { await server.stop(); }
check(!existsSync(server.disposableDirectory), "preview leaked disposable output");
const root3D = resolve('game-3d');
await createProjectStarter({ template: '3d-action', outputDirectory: root3D, name: 'External 3D game' });
check((await inspectProjectStarter(root3D)).importedAssetCount === 3, '3D archive inspection failed');
const source3D = await openHyperfocusProjectFiles(new Uint8Array(await readFile(resolve(root3D, '.hyperfocus/project.json'))),
  new Uint8Array(await readFile(resolve(root3D, '.hyperfocus/assets.hfp'))), { parseProject: migrateProject });
const runtime3D = await createHyperfocus3DRuntime(source3D.project, source3D.assets);
const initial3D = runtime3D.snapshot();
for (let tick = 0; tick < 60; tick++) runtime3D.step(['move-right']);
check(runtime3D.snapshot().entities.find(entity => entity.id === 'actor').position[0] > initial3D.entities.find(entity => entity.id === 'actor').position[0], 'installed 3D controller did not move');
check(runtime3D.snapshot().entities.find(entity => entity.id === 'spinner').rotationY > 0, 'installed 3D animation did not advance');
check(runtime3D.compile().instanceCount === 5, 'installed 3D scene lost instances');
const built3D = await buildPortableProject({ projectDirectory: root3D });
const receipt3D = JSON.parse(await readFile(built3D.receiptPath, 'utf8'));
check(receipt3D.inputs.some(input => input.path.endsWith('/dist/tooling/standalone-runtime-3d.js')), 'packaged 3D runtime absent from receipt');
console.log(JSON.stringify({ create: true, customBuild: true, receipt: true, preview: true, recovery: true, cleanup: true, packed3D: true }));
`;
