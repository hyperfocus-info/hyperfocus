import { connectHeadlessBrowser } from '@hyperfocus/desktop-runtime/automation';
import { chromium } from 'playwright-core';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { browserExecutable } from '@hyperfocus/desktop-runtime/automation';
import { inspectBrowserWindows } from '@hyperfocus/desktop-runtime/automation/windows-inspection';

const output = resolve(process.argv[2]!);
if (!process.argv[2]) throw new Error('Pass a built slice directory');
if (await Bun.file(resolve(output, 'review-manifest.json')).exists()) throw new Error('Packaged evidence is immutable; validate a new source version');
const owned = await connectHeadlessBrowser({ executable: browserExecutable(), connect: endpoint => chromium.connectOverCDP(endpoint) });
const errors: string[] = [];
try {
  const windows = inspectBrowserWindows({ pid: owned.pid });
  if (windows.visibleWindows.length) throw new Error('Visible browser');
  const page = await owned.browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(pathToFileURL(resolve(output, 'index.html')).href);
  await page.waitForFunction(() => Reflect.get(globalThis, '__artSlice'));
  const checks = await page.evaluate(() => {
    const api = Reflect.get(globalThis, '__artSlice'); api.manual(true);
    const checks: Array<{ name: string; passed: boolean; measured: unknown }> = [];
    for (const action of ['jab', 'heavy']) {
      api.reset(); api.study(undefined); api.effects(false);
      const samples: Array<ReturnType<typeof api.render>> = [];
      for (let tick = 0; tick < 150; tick++) { api.step(tick === 0 ? [`fighter1:${action}`] : []); samples.push(api.render()); }
      const support = samples.filter(s => s.snapshot.combat.state.fighters[0].moveId);
      const feet: number[][] = support.map(s => s.measurements[0].joints[0].foot);
      const drift = Math.max(...feet.map(p => Math.hypot(p[0]! - feet[0]![0]!, p[2]! - feet[0]![2]!)));
      checks.push({ name: `${action}: planted lead foot drift <= 2cm`, passed: drift <= .02, measured: drift });
      const firstHit = samples.find(s => s.snapshot.combat.state.fighters[1].health < 100);
      const cue = firstHit?.audioEvents.find((event: { assetId: string }) => event.assetId === `art:audio:${action === 'heavy' ? 'hitHeavy' : 'hit'}`);
      checks.push({ name: `${action}: hit cue and damage share simulation tick`, passed: !!firstHit && cue?.tick === firstHit.snapshot.tick, measured: { damageTick: firstHit?.snapshot.tick, cueTick: cue?.tick } });
      const finite = samples.every(s => s.transforms.every((e: { position: number[]; scale: number[]; rotation: number[] }) => [...e.position, ...e.scale, ...e.rotation].every(Number.isFinite)));
      checks.push({ name: `${action}: finite rig transforms and clean renderer`, passed: finite && samples.every(s => !s.errors.length), measured: { samples: samples.length, errors: samples.flatMap(s => s.errors) } });
      let maxWristJump = 0, peak: unknown, discontinuous = false;
      for (let i = 1; i < samples.length; i++) {
        const a: number[] = samples[i - 1].measurements[0].joints[1].wrist, b: number[] = samples[i].measurements[0].joints[1].wrist;
        const jump = Math.hypot(...a.map((n, axis) => n - b[axis]!));
        // B's owner-selected release is deliberately fast. Recovery/idle changes
        // have a tighter bound than the committed strike, where high speed is intended.
        const commitment = samples[i].measurements[0].phase === 'commitment' || samples[i - 1].measurements[0].phase === 'commitment';
        if (jump > (commitment ? .42 : .20)) discontinuous = true;
        if (jump > maxWristJump) { maxWristJump = jump; peak = { tick: samples[i].snapshot.tick, phase: samples[i].measurements[0].phase, moveFrame: samples[i].snapshot.combat.state.fighters[0].moveFrame }; }
      }
      checks.push({ name: `${action}: bounded strike speed and recovery continuity`, passed: !discontinuous, measured: { distance: maxWristJump, peak, commitmentLimit: .42, otherLimit: .20 } });
      checks.push({ name: `${action}: no unreachable support leg`, passed: support.every(s => s.measurements[0].joints.every((j: { legClamped: boolean }) => !j.legClamped)), measured: support.filter(s => s.measurements[0].joints.some((j: { legClamped: boolean }) => j.legClamped)).length });
      const frozenPairs = samples.slice(1).flatMap((sample, index) => sample.snapshot.combat.state.frame === samples[index].snapshot.combat.state.frame ? [[samples[index], sample]] : []);
      const poseDrift = Math.max(0, ...frozenPairs.flatMap(([a, b]) => a.measurements.flatMap((actor: { joints: { wrist: number[]; ankle: number[] }[] }, actorIndex: number) => actor.joints.map((joint, side) => Math.hypot(...joint.wrist.map((n, axis) => n - b.measurements[actorIndex].joints[side].wrist[axis]))))));
      checks.push({ name: `${action}: complete pose freezes during native hitstop`, passed: frozenPairs.length > 0 && poseDrift < .00001, measured: { samples: frozenPairs.length, poseDrift } });
    }
    api.reset(); api.effects(false); api.view('neutral');
    const neutralFeet: number[][] = [0, 10, 20, 30].map(frame => { api.study({ kind: 'walk', frame }); return api.render().measurements[0].joints[0].foot; });
    const movement = Math.max(...neutralFeet.map(p => Math.hypot(...p.map((n, axis) => n - neutralFeet[0]![axis]!))));
    checks.push({ name: 'Neutral locomotion study advances its gait', passed: movement > .2, measured: movement });
    api.reset(); api.study(undefined); api.view('gameplay');
    let clamped = 0, backwardsKnees = 0;
    let previous: { x: number; z: number } | undefined, forward = [0, 1];
    for (let tick = 0; tick < 180; tick++) {
      api.step(tick < 90 ? ['move-down'] : []);
      const sample = api.render(), actor = sample.measurements[0], position = sample.snapshot.combat.state.fighters[0].position;
      if (actor.joints.some((joint: { legClamped: boolean }) => joint.legClamped)) clamped++;
      if (previous) {
        const dx = position.x - previous.x, dz = position.z - previous.z, length = Math.hypot(dx, dz);
        if (length > .0001) forward = [dx / length, dz / length];
      }
      previous = { x: position.x, z: position.z };
      if (actor.phase === 'locomotion') for (const joint of actor.joints) {
        const thighY = joint.knee[1] - joint.hip[1], shinY = joint.ankle[1] - joint.knee[1];
        const thighForward = (joint.knee[0] - joint.hip[0]) * forward[0]! + (joint.knee[2] - joint.hip[2]) * forward[1]!;
        const shinForward = (joint.ankle[0] - joint.knee[0]) * forward[0]! + (joint.ankle[2] - joint.knee[2]) * forward[1]!;
        if (thighY * shinForward - thighForward * shinY < -.0001) backwardsKnees++;
      }
    }
    const stopped = api.render().measurements[0].locomotion;
    checks.push({ name: 'Locomotion remains in leg reach and settles after stopping', passed: clamped === 0 && stopped.weight < .01, measured: { clamped, stopped } });
    checks.push({ name: 'Running knees retain forward flexion through start and stop', passed: backwardsKnees === 0, measured: { backwardsKnees } });
    api.reset(); api.study(undefined); api.effects(false); api.view('gameplay');
    const sequence = [];
    for (let tick = 0; tick < 260; tick++) {
      const speed = tick < 40 ? 3 : tick < 65 ? 1.6 : tick >= 125 && tick < 155 ? -3 : 0;
      api.step(tick === 85 ? ['fighter1:jab'] : tick === 175 ? ['fighter1:heavy'] : [], { x: 0, y: 0, z: speed / 3 });
      sequence.push(api.render());
    }
    let transitionJump = 0, turnStep = 0;
    for (let i = 1; i < sequence.length; i++) {
      const a = sequence[i - 1].measurements[0], b = sequence[i].measurements[0];
      const turn = Math.atan2(Math.sin(b.yaw - a.yaw), Math.cos(b.yaw - a.yaw));
      turnStep = Math.max(turnStep, Math.abs(turn));
      if (a.phase === 'commitment' || b.phase === 'commitment') continue;
      for (let side = 0; side < 2; side++) transitionJump = Math.max(transitionJump, Math.hypot(...a.joints[side].wrist.map((n: number, axis: number) => n - b.joints[side].wrist[axis])));
    }
    checks.push({ name: 'Walk/run/stop/turn/attack sequence has bounded pose transitions', passed: transitionJump < .25 && turnStep <= .181 && sequence.every(s => !s.errors.length), measured: { transitionJump, turnStep } });
    const running = sequence[30].measurements[0].locomotion.speed, walking = sequence[60].measurements[0].locomotion.speed;
    checks.push({ name: 'Walk and run use distinct actual simulation speeds', passed: running > 2.8 && walking > 1.4 && walking < 1.8, measured: { running, walking } });
    let raisedElbows = 0, elbowJump = 0;
    for (const duration of [12, 20, 28, 36, 44, 52]) {
      api.reset();
      for (let tick = 0; tick < duration; tick++) { api.step(['move-down']); api.render(); }
      let previous = api.render().measurements[0];
      for (let tick = 0; tick < 55; tick++) {
        api.step([]); const current = api.render().measurements[0];
        for (let side = 0; side < 2; side++) {
          const joint = current.joints[side], old = previous.joints[side];
          if (current.locomotion.weight < .1 && joint.elbow[1] > joint.shoulder[1] - .12) raisedElbows++;
          elbowJump = Math.max(elbowJump, Math.hypot(...joint.elbow.map((n: number, axis: number) => n - old.elbow[axis])));
        }
        previous = current;
      }
    }
    checks.push({ name: 'Elbows return below shoulders after stops at six gait phases', passed: raisedElbows === 0, measured: { raisedElbows } });
    checks.push({ name: 'Solved elbows stay continuous through run-to-idle transitions', passed: elbowJump < .12, measured: { elbowJump } });
    return checks;
  });
  const sweeps = [];
  for (const [x, z] of [[0, 0], [-2.5, -1.5], [2.5, -1.5], [-2.5, 2], [2.5, 2]]) {
    const sample = await page.evaluate(({ x, z }) => { const api = Reflect.get(globalThis, '__artSlice'); api.arrange(x, z); api.effects(false); return api.render(); }, { x, z });
    await page.screenshot({ path: resolve(output, `camera-${x}-${z}.png`) });
    sweeps.push({ x, z, camera: sample.camera });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const hud = await page.evaluate(() => {
    const api = Reflect.get(globalThis, '__artSlice'); api.reset(); api.render();
    return [...document.querySelectorAll('.hf-fighter-bar')].map(bar => { const r = bar.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; });
  });
  await page.screenshot({ path: resolve(output, 'hud-portrait.png') });
  checks.push({ name: 'HUD remains inside portrait viewport', passed: hud.every(r => r.left >= 0 && r.right <= 390 && r.top >= 0 && r.bottom <= 844), measured: hud });
  checks.push({ name: 'Owned headless browser and no page errors', passed: !windows.visibleWindows.length && !errors.length, measured: { windows, errors } });
  await Bun.write(resolve(output, 'validation.json'), JSON.stringify({ checks, sweeps, limits: ['Camera sweep screenshots require visual obstruction review.', 'No triangle-level intersection or taste score is inferred.', 'Audio check measures cue dispatch, not acoustic output latency.'] }, null, 2));
  console.log(JSON.stringify(checks.map(({ name, passed, measured }) => ({ name, passed, ...(!passed ? { measured } : {}) }))));
  if (checks.some(check => !check.passed)) process.exitCode = 1;
} finally { await owned.close(); }
