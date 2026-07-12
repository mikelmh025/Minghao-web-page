#!/usr/bin/env node
/* Headless test harness for Snake Arena.
   Extracts the inline <script> from index.html, syntax-checks it,
   then unit-tests the DOM-free sim core (SIM):
   - regression: AI snakes still kill each other
   - GOLD RUSH: 25 golden 5x orbs rain into a region, AI converge on it,
     event ends after ~8s and reschedules ~45s out */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const HTML = path.join(__dirname, 'index.html');
const EXTRACTED = path.join(os.tmpdir(), 'snake-arena-sim.js');

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

/* ---------- 1. Regression: AI snakes still kill each other ---------- */
{
  const world = SIM.createWorld({ aiOnly: true, aiCount: 6 });
  const dt = 1 / 30;
  let t = 0;
  while (t < 400 && world.stats.aiKills === 0) { SIM.stepWorld(world, dt, null); t += dt; }
  ok(world.stats.aiKills > 0, 'AI regression: snakes still kill each other',
     'aiKills=' + world.stats.aiKills + ' @ ' + t.toFixed(0) + 's, eaten=' + world.stats.eaten);
}

/* ---------- 2. Gold rush: orbs rain in, AI converge ---------- */
{
  const world = SIM.createWorld({ aiOnly: true, aiCount: 5 });
  world.goldRush.nextAt = 0.5;   // trigger early for the test
  const dt = 1 / 30;
  let t = 0, rushEvent = null;
  while (t < 10 && !rushEvent) {
    const events = SIM.stepWorld(world, dt, null);
    for (const e of events) if (e.type === 'goldrush') rushEvent = e;
    t += dt;
  }
  ok(!!rushEvent && world.goldRush.active, 'gold rush triggers');

  const gr = world.goldRush;
  const goldOrbs = world.food.filter(f => f.gold);
  // 25 spawn; a nearby AI can eat 1-2 within the same tick before we count
  ok(goldOrbs.length >= 23 && goldOrbs.length <= 25, '~25 golden orbs rain into region',
     goldOrbs.length + ' orbs');
  const avgVal = goldOrbs.reduce((s, f) => s + f.value, 0) / goldOrbs.length;
  ok(avgVal > 3.0, 'golden orbs worth 5x (normal max 1.7)', 'avg value=' + avgVal.toFixed(2));
  ok(goldOrbs.every(f => Math.hypot(f.x - gr.x, f.y - gr.y) <= gr.r + 1),
     'all golden orbs land inside the region');

  const before = {};
  for (const s of world.snakes) {
    if (!s.alive) continue;
    const h = s.segments[0];
    before[s.id] = Math.hypot(h.x - gr.x, h.y - gr.y);
  }
  for (let i = 0; i < Math.round(5 / dt); i++) SIM.stepWorld(world, dt, null);   // 5s of rush

  let n = 0, sumBefore = 0, sumAfter = 0;
  for (const s of world.snakes) {
    if (!s.alive || before[s.id] == null) continue;
    const h = s.segments[0];
    sumBefore += before[s.id];
    sumAfter += Math.hypot(h.x - gr.x, h.y - gr.y);
    n++;
  }
  ok(n >= 3, 'enough AI survive to measure convergence', n + ' snakes');
  ok(sumAfter / n < sumBefore / n, 'AI converge: avg distance to region decreases',
     (sumBefore / n).toFixed(0) + ' -> ' + (sumAfter / n).toFixed(0));

  let ended = false;
  for (let i = 0; i < Math.round(6 / dt) && !ended; i++) {
    const events = SIM.stepWorld(world, dt, null);
    for (const e of events) if (e.type === 'goldrushEnd') ended = true;
  }
  ok(ended && !world.goldRush.active, 'gold rush ends after ~8s');
  ok(world.goldRush.nextAt > world.time + 30, 'next rush rescheduled ~45s out',
     'nextAt=' + world.goldRush.nextAt.toFixed(0) + 's');
}

if (failures) { console.error(failures + ' FAILURE(S)'); process.exit(1); }
console.log('ALL SNAKE ARENA TESTS PASSED');
