#!/usr/bin/env node
/* Headless test harness for Cave Flyer.
   Extracts the inline <script> from index.html, syntax-checks it,
   then unit-tests the DOM-free sim core (CaveCore):
   - regression: a run flies some distance, then dies on wall contact
   - determinism: same seed -> identical cave geometry, different seed -> different
   - rotating laser bars: contact kills, timed pass survives, angle advances
   - collapsing ceiling chunks: telegraph -> falling state machine, falling contact kills */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const HTML = path.join(__dirname, 'index.html');
const EXTRACTED = path.join(os.tmpdir(), 'cave-flyer-sim.js');

const html = fs.readFileSync(HTML, 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error('FAIL: no <script> block found'); process.exit(1); }
fs.writeFileSync(EXTRACTED, m[1]);

const chk = spawnSync(process.execPath, ['--check', EXTRACTED], { encoding: 'utf8' });
if (chk.status !== 0) { console.error('FAIL: node --check\n' + chk.stderr); process.exit(1); }
console.log('PASS  node --check (extracted inline script)');

const C = require(EXTRACTED);

let failures = 0;
function ok(cond, name, detail) {
  if (cond) console.log('PASS  ' + name + (detail ? '  [' + detail + ']' : ''));
  else { failures++; console.error('FAIL  ' + name + (detail ? '  [' + detail + ']' : '')); }
}

const DT = 1 / 60;

/* naive autopilot: seek the middle of the opening a little ahead */
function autopilotThrust(run) {
  const op = run.cave.opening(run.worldX + run.ship.sx + 120);
  return (run.ship.y + run.ship.vy * 0.18) > (op.top + op.bot) / 2;
}
/* pin the ship to the corridor centre so walls can't kill it (hazard tests) */
function pinShip(run) {
  const op = run.cave.opening(run.worldX + run.ship.sx);
  run.ship.y = (op.top + op.bot) / 2;
  run.ship.vy = 0;
}

/* ---------- 1. Regression: fly a while, then die on wall contact ---------- */
{
  const run = C.makeRun(4242, 800);
  let t = 0;
  while (t < 25 && !run.dead) { C.step(run, autopilotThrust(run), DT); t += DT; }
  ok(!run.dead && run.meters > 150, 'regression: autopilot flies some distance',
     Math.floor(run.meters) + ' m in ' + t.toFixed(0) + 's');

  let deathEvent = false;
  while (t < 40 && !run.dead) {                    // dive into the floor
    C.step(run, false, DT);
    if (run.events.some(e => e.t === 'death')) deathEvent = true;
    t += DT;
  }
  ok(run.dead && !run.alive && deathEvent, 'regression: wall contact kills (death event fired)',
     'died at ' + Math.floor(run.meters) + ' m');
}

/* ---------- 2. Determinism: seeded cave geometry ---------- */
{
  const a = C.makeCave(20260712);
  const b = C.makeCave(20260712);
  const c = C.makeCave(20260713);
  let same = true, diff = false;
  for (let i = 0; i < 200; i++) {
    const x = i * 50;
    if (a.topY(x) !== b.topY(x) || a.botY(x) !== b.botY(x)) same = false;
    if (a.topY(x) !== c.topY(x) || a.botY(x) !== c.botY(x)) diff = true;
  }
  ok(same, 'determinism: same seed -> identical ceiling/floor samples (200 pts)');
  ok(diff, 'determinism: different seed -> different geometry');

  const oa = a.obstaclesInRange(0, 10000), ob = b.obstaclesInRange(0, 10000);
  ok(JSON.stringify(oa) === JSON.stringify(ob), 'determinism: same seed -> identical obstacles',
     oa.length + ' obstacles');
}

/* ---------- 3. Rotating laser bar ---------- */
{
  // 3a. angle advances at constant angular speed
  const run = C.makeRun(7, 800);
  const rng = C.mulberry32(1);
  const laser = C.makeLaser(run.cave, run.worldX + run.ship.sx + 5000, rng);
  laser.angle = 0; laser.angVel = 2;
  run.hazards.push(laser);
  const a0 = laser.angle;
  for (let i = 0; i < 30; i++) { pinShip(run); C.step(run, false, DT); }
  ok(Math.abs(laser.angle - (a0 + 2 * 30 * DT)) < 1e-9, 'laser: bar angle advances over time',
     a0.toFixed(2) + ' -> ' + laser.angle.toFixed(3) + ' rad');

  // 3b. contact kills: vertical, non-rotating bar across the corridor centre
  const run2 = C.makeRun(7, 800);
  const bar = C.makeLaser(run2.cave, run2.worldX + run2.ship.sx + 300, C.mulberry32(2));
  bar.angle = Math.PI / 2; bar.angVel = 0;
  const op = run2.cave.opening(bar.x);
  bar.y = (op.top + op.bot) / 2;
  run2.hazards.push(bar);
  let t = 0, died = false;
  while (t < 5 && !run2.dead) {
    pinShip(run2);
    C.step(run2, false, DT);
    if (run2.events.some(e => e.t === 'death')) died = true;
    t += DT;
  }
  ok(run2.dead && died, 'laser: contact with the bar kills the player',
     'died at wx=' + Math.floor(run2.worldX + run2.ship.sx) + ' (bar at ' + Math.floor(bar.x) + ')');

  // 3c. right timing window: bar aligned horizontally away from the flight path -> safe pass
  const run3 = C.makeRun(7, 800);
  const safeBar = C.makeLaser(run3.cave, run3.worldX + run3.ship.sx + 300, C.mulberry32(3));
  safeBar.angle = 0; safeBar.angVel = 0;               // horizontal at pass time
  const op3 = run3.cave.opening(safeBar.x);
  safeBar.y = (op3.top + op3.bot) / 2 - 100;           // bar sits 100px above flight path
  run3.hazards.push(safeBar);
  t = 0;
  while (t < 3 && !run3.dead) { pinShip(run3); C.step(run3, false, DT); t += DT; }
  ok(!run3.dead && run3.worldX + run3.ship.sx > safeBar.x + safeBar.half + 50,
     'laser: passing through the gap window at the right moment does not kill');
}

/* ---------- 4. Collapsing ceiling chunk ---------- */
{
  // 4a. state machine: wait -> telegraph (for ~tele seconds, no fall) -> falling (y increases)
  const run = C.makeRun(9, 800);
  const chunk = C.makeChunk(run.cave, run.worldX + run.ship.sx + C.CHUNK_TRIGGER + 60, C.mulberry32(4));
  run.hazards.push(chunk);
  ok(chunk.state === 'wait', 'chunk: starts in wait state');

  let t = 0;
  while (t < 5 && chunk.state === 'wait') { pinShip(run); C.step(run, false, DT); t += DT; }
  ok(chunk.state === 'telegraph', 'chunk: telegraph begins when the ship approaches');

  const yAtTele = chunk.y;
  let teleTime = 0, sawMidTelegraph = false, fallEvent = false;
  while (t < 10 && chunk.state === 'telegraph') {
    pinShip(run);
    C.step(run, false, DT);
    teleTime += DT; t += DT;
    if (teleTime > 0.6 && chunk.state === 'telegraph') sawMidTelegraph = true;
    if (run.events.some(e => e.t === 'chunkFall')) fallEvent = true;
  }
  ok(sawMidTelegraph && chunk.y === yAtTele,
     'chunk: stays telegraphing (no fall, y unchanged) during the telegraph window');
  ok(chunk.state === 'falling' && fallEvent && teleTime >= C.CHUNK_TELEGRAPH - DT && teleTime < C.CHUNK_TELEGRAPH + 0.15,
     'chunk: transitions telegraph -> falling after ~' + C.CHUNK_TELEGRAPH + 's',
     'telegraph lasted ' + teleTime.toFixed(2) + 's');

  const y1 = chunk.y;
  pinShip(run); C.step(run, false, DT);
  const y2 = chunk.y;
  pinShip(run); C.step(run, false, DT);
  ok(y2 > y1 && chunk.y > y2, 'chunk: falls with increasing y (accelerating downward)',
     y1.toFixed(1) + ' -> ' + y2.toFixed(1) + ' -> ' + chunk.y.toFixed(1));

  // 4b. contact with a falling chunk kills
  const run2 = C.makeRun(9, 800);
  const hz = C.makeChunk(run2.cave, run2.worldX + run2.ship.sx, C.mulberry32(5));
  hz.state = 'falling';
  hz.y = run2.ship.y - hz.h / 2;
  hz.vy = 40;
  run2.hazards.push(hz);
  C.step(run2, false, DT);
  ok(run2.dead && run2.events.some(e => e.t === 'death'),
     'chunk: contact while falling kills the player');
}

if (failures) { console.error(failures + ' FAILURE(S)'); process.exit(1); }
console.log('ALL CAVE FLYER TESTS PASSED');
