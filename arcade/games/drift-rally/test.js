#!/usr/bin/env node
/* Headless test harness for Drift Rally.
   Extracts the inline <script> from index.html, syntax-checks it,
   then unit-tests the DOM-free sim core:
   - regression: a full race still runs, laps complete, positions sane
   - ghost replay: ~10 Hz keyframe recording throttle + ghostSample interpolation
     (clamped ends, keyframe exactness, lag behind the live car) */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const HTML = path.join(__dirname, 'index.html');
const EXTRACTED = path.join(os.tmpdir(), 'drift-rally-sim.js');

const html = fs.readFileSync(HTML, 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error('FAIL: no <script> block found'); process.exit(1); }
fs.writeFileSync(EXTRACTED, m[1]);

const chk = spawnSync(process.execPath, ['--check', EXTRACTED], { encoding: 'utf8' });
if (chk.status !== 0) { console.error('FAIL: node --check\n' + chk.stderr); process.exit(1); }
console.log('PASS  node --check (extracted inline script)');

const SIM = require(EXTRACTED);

let failures = 0;
function ok(cond, name, detail) {
  if (cond) console.log('PASS  ' + name + (detail ? '  [' + detail + ']' : ''));
  else { failures++; console.error('FAIL  ' + name + (detail ? '  [' + detail + ']' : '')); }
}

/* ---------- 1. Regression: full race with AI-driven player ---------- */
{
  const race = SIM.createRace(0);
  const dt = 1 / 60;
  ok(race.cars.length === 4 && race.state === 'countdown', 'race created: 4 cars, countdown state');

  const idle = { throttle: 0, brake: 0, steer: 0, handbrake: false };
  let guard = 0;
  while (race.state === 'countdown' && guard++ < 600) SIM.stepRace(race, idle, dt);
  ok(race.state === 'racing', 'countdown elapses into racing');

  const player = race.cars[0];
  const startDist = player.totalDist;
  let t = 0;
  while (t < 300 && race.state !== 'finished') {
    const inp = SIM.aiInput(player, race.track, dt);   // scripted driver for the player
    SIM.stepRace(race, inp, dt);
    t += dt;
  }
  ok(race.state === 'finished', 'player completes the race within time cap',
     't=' + t.toFixed(1) + 's');
  ok(player.lapTimes.length === race.laps, 'player logged ' + race.laps + ' lap times',
     player.lapTimes.map(x => x.toFixed(1)).join(', '));
  ok(player.lapTimes.every(lt => isFinite(lt) && lt > 5), 'lap times finite and positive');
  ok(isFinite(player.finishTime) && player.finishTime > 0, 'finish time finite/positive',
     'finish=' + player.finishTime.toFixed(1) + 's');
  ok(player.totalDist - startDist > race.laps * race.track.total * 0.95,
     'player covered ~' + race.laps + ' laps of centerline distance',
     (player.totalDist - startDist).toFixed(0) + ' / ' + (race.laps * race.track.total).toFixed(0));
  ok(race.cars.every(c => c.totalDist > 1000 && isFinite(c.x) && isFinite(c.y)),
     'all cars moved and have finite positions');
  const poss = race.cars.map(c => c.pos).sort((a, b) => a - b).join(',');
  ok(poss === '1,2,3,4', 'positions are a permutation of 1..4', poss);
}

/* ---------- 2. Ghost: recording throttle + interpolation ---------- */
{
  const track = SIM.buildTrack(SIM.TRACKS[0]);
  const s0 = track.samples[0];
  const car = SIM.createCar(track, s0.x, s0.y, Math.atan2(s0.ty, s0.tx));
  const dt = 1 / 60;
  const DUR = 20;
  const steps = Math.round(DUR / dt);
  const frames = [];
  const live = [];   // full-rate positions of the live run for comparison
  let t = 0;
  SIM.ghostRecord(frames, t, car.x, car.y, car.angle);
  for (let i = 0; i < steps; i++) {
    const inp = SIM.aiInput(car, track, dt);
    SIM.stepCar(car, inp, track, dt);
    t += dt;
    SIM.ghostRecord(frames, t, car.x, car.y, car.angle);
    live.push({ t, x: car.x, y: car.y });
  }

  // ~10 keyframes per second, far fewer than sim steps
  const rate = frames.length / DUR;
  ok(rate >= 7 && rate <= 12, 'keyframe rate ~10/sec (throttled)',
     frames.length + ' frames in ' + DUR + 's = ' + rate.toFixed(1) + '/s');
  ok(frames.length < steps / 3, 'keyframes are not per-frame',
     frames.length + ' << ' + steps + ' steps');
  ok(frames.every(f => isFinite(f.t) && isFinite(f.x) && isFinite(f.y) && isFinite(f.a)),
     'all keyframes finite');

  // ghostSample finite everywhere, including outside the recorded range
  let allFinite = true;
  for (let q = -2; q <= DUR + 5; q += 0.137) {
    const g = SIM.ghostSample(frames, q);
    if (!g || !isFinite(g.x) || !isFinite(g.y) || !isFinite(g.heading)) { allFinite = false; break; }
  }
  ok(allFinite, 'ghostSample finite for many t (incl. before first / after last keyframe)');

  // clamped at both ends
  const gLo = SIM.ghostSample(frames, -99);
  const gHi = SIM.ghostSample(frames, 9999);
  const f0 = frames[0], fN = frames[frames.length - 1];
  ok(gLo.x === f0.x && gLo.y === f0.y && gLo.heading === f0.a, 'clamped before first keyframe');
  ok(gHi.x === fN.x && gHi.y === fN.y && gHi.heading === fN.a, 'clamped after last keyframe');

  // sampling exactly at a keyframe time returns that keyframe
  const fk = frames[Math.floor(frames.length / 2)];
  const gk = SIM.ghostSample(frames, fk.t);
  ok(Math.abs(gk.x - fk.x) < 1e-6 && Math.abs(gk.y - fk.y) < 1e-6 &&
     Math.abs(gk.heading - fk.a) < 1e-6, 'sample at keyframe time matches keyframe');

  // mid-keyframe interpolation stays close to the actual recorded run
  const mid = SIM.ghostSample(frames, 10.05);
  const near = live.reduce((best, p) => {
    const d = Math.hypot(p.x - mid.x, p.y - mid.y);
    return d < best ? d : best;
  }, Infinity);
  ok(near < 15, 'interpolated position lies near the live trajectory', 'err=' + near.toFixed(2));

  // ghost sampled 0.3s in the past lags the live car
  const T = DUR - 0.5;
  const liveNow = live[Math.round((T / dt)) - 1];
  const gPast = SIM.ghostSample(frames, T - 0.3);
  const gNow = SIM.ghostSample(frames, T);
  const dPast = Math.hypot(gPast.x - liveNow.x, gPast.y - liveNow.y);
  const dNow = Math.hypot(gNow.x - liveNow.x, gNow.y - liveNow.y);
  ok(dPast > dNow + 20, 'ghost at t-0.3 lags behind the live car',
     'lag dist=' + dPast.toFixed(1) + ' vs now=' + dNow.toFixed(1));

  // monotonic progression along the track for increasing sample times
  function trackProgress(x, y, hint) {
    const n = track.n;
    let best = hint, bd = Infinity;
    for (let k = -80; k <= 80; k++) {
      const i = ((hint + k) % n + n) % n;
      const s = track.samples[i];
      const d = (x - s.x) * (x - s.x) + (y - s.y) * (y - s.y);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  let hint = 0, unwrapped = 0, monotonic = true, prevU = -Infinity;
  for (let q = 1; q <= 15; q += 0.5) {
    const g = SIM.ghostSample(frames, q);
    const idx = trackProgress(g.x, g.y, hint);
    let di = idx - hint;
    if (di < -track.n / 2) di += track.n;
    if (di > track.n / 2) di -= track.n;
    unwrapped += di;
    hint = idx;
    if (unwrapped < prevU - 1) { monotonic = false; break; }
    prevU = unwrapped;
  }
  ok(monotonic && unwrapped > 50, 'ghost progresses monotonically along the track',
     'advanced ' + (unwrapped * track.spacing).toFixed(0) + ' units over 14s');
}

if (failures) { console.error(failures + ' FAILURE(S)'); process.exit(1); }
console.log('ALL DRIFT RALLY TESTS PASSED');
