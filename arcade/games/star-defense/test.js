#!/usr/bin/env node
/* Headless test harness for Star Defense.
   Extracts the inline <script> from index.html, syntax-checks it,
   then unit-tests the DOM-free sim core (SD):
   - regression: a basic wave still clears with the original turrets
   - Tesla Coil chains lightning across packed enemies
   - Drone Bay drones dive-attack, kill, and respawn; new turrets clear a wave
   - wave 8+ enemies get +8% HP */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const HTML = path.join(__dirname, 'index.html');
const EXTRACTED = path.join(os.tmpdir(), 'star-defense-sim.js');

const html = fs.readFileSync(HTML, 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error('FAIL: no <script> block found'); process.exit(1); }
fs.writeFileSync(EXTRACTED, m[1]);

const chk = spawnSync(process.execPath, ['--check', EXTRACTED], { encoding: 'utf8' });
if (chk.status !== 0) { console.error('FAIL: node --check\n' + chk.stderr); process.exit(1); }
console.log('PASS  node --check (extracted inline script)');

const SD = require(EXTRACTED);

let failures = 0;
function ok(cond, name, detail) {
  if (cond) console.log('PASS  ' + name + (detail ? '  [' + detail + ']' : ''));
  else { failures++; console.error('FAIL  ' + name + (detail ? '  [' + detail + ']' : '')); }
}

function buildSpots(state, want) {
  const spots = [];
  for (let x = 40; x <= 920 && spots.length < want; x += 16) {
    for (let y = 40; y <= 500 && spots.length < want; y += 16) {
      if (SD.canPlace(state, x, y) && SD.distToPath(x, y) < 65) spots.push([x, y]);
    }
  }
  return spots;
}

function runWave(state, maxT, onStep) {
  const dt = 1 / 30;
  let t = 0;
  SD.sendWave(state, false);
  while (t < maxT && state.phase === 'wave' && !state.over) {
    SD.update(state, dt);
    if (onStep) onStep(state);
    state.events.length = 0;
    t += dt;
  }
}

/* ---------- 1. Regression: old turrets still clear a wave ---------- */
{
  const state = SD.createGame();
  state.credits = 500;
  const spots = buildSpots(state, 40);
  let placed = 0;
  for (const [x, y] of spots) {
    if (placed >= 5) break;
    if (SD.placeTurret(state, placed % 2 === 0 ? 'pulse' : 'missile', x, y)) placed++;
  }
  runWave(state, 90);
  ok(state.stats.kills > 0 && state.phase === 'prewave' && state.wave === 2,
     'regression: old turrets clear wave 1',
     'kills=' + state.stats.kills + ' hp=' + state.hp);
}

/* ---------- 2. Tesla Coil chains across a dense swarm ---------- */
{
  const state = SD.createGame();
  state.credits = 400;
  const spots = buildSpots(state, 10);
  ok(SD.placeTurret(state, 'tesla', spots[0][0], spots[0][1]), 'tesla coil can be placed');
  state.wave = 3;   // swarm wave: dense pack

  let teslaShots = 0, maxChain = 0;
  runWave(state, 120, function (st) {
    for (const e of st.events) {
      if (e.t === 'shoot' && e.kind === 'tesla') { teslaShots++; maxChain = Math.max(maxChain, e.chain.length); }
    }
  });
  ok(teslaShots > 0 && state.stats.kills > 0, 'tesla fires and kills',
     'shots=' + teslaShots + ' kills=' + state.stats.kills);
  ok(maxChain >= 2, 'lightning chains to multiple targets', 'max chain=' + maxChain);
}

/* ---------- 3. Drones dive, kill, respawn; new turrets clear a wave ---------- */
{
  const state = SD.createGame();
  state.credits = 1200;
  const spots = buildSpots(state, 60);
  let tesla = 0, drone = 0;
  for (const [x, y] of spots) {
    if (tesla < 2 && SD.placeTurret(state, 'tesla', x, y)) { tesla++; continue; }
    if (drone < 2 && SD.placeTurret(state, 'drone', x, y)) { drone++; continue; }
    if (tesla >= 2 && drone >= 2) break;
  }
  ok(tesla >= 2 && drone >= 2, 'tesla + drone bays placed', tesla + ' tesla, ' + drone + ' drone');
  state.wave = 3;

  let droneHits = 0, droneSpawns = 0;
  const scan = function (st) {
    for (const e of st.events) {
      if (e.t === 'droneHit') droneHits++;
      if (e.t === 'droneSpawn') droneSpawns++;
    }
  };
  runWave(state, 120, scan);
  const clearedPhase = state.phase, clearedWave = state.wave;
  for (let i = 0; i < 8 * 30; i++) {   // step into prewave so drones respawn
    SD.update(state, 1 / 30);
    scan(state);
    state.events.length = 0;
  }
  ok(droneHits > 0, 'drones dive-attack enemies', droneHits + ' hits');
  ok(droneSpawns > 0, 'drones respawn after dying', droneSpawns + ' respawns');
  ok(state.stats.kills > 0 && clearedPhase === 'prewave' && clearedWave === 4,
     'new turrets alone clear a wave', 'kills=' + state.stats.kills + ' hp=' + state.hp);
}

/* ---------- 4. Definitions + economy balance ---------- */
{
  let defsOk = true;
  for (const k of ['pulse', 'missile', 'cryo', 'rail', 'tesla', 'drone']) {
    const def = SD.TURRETS[k];
    if (!def || def.tiers.length !== 3 || !(def.tiers[1].cost > 0) || !(def.tiers[2].cost > 0)) defsOk = false;
  }
  ok(defsOk, '6 turret types, each with base + 2 upgrade tiers');
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  ok(near(SD.hpMul(7), 1 + 0.10 * 6), 'wave 7 enemy HP unchanged', SD.hpMul(7).toFixed(3));
  ok(near(SD.hpMul(8), (1 + 0.10 * 7) * 1.08) && near(SD.hpMul(12), (1 + 0.10 * 11) * 1.08),
     'waves 8+ enemy HP scaled +8%', 'hpMul(8)=' + SD.hpMul(8).toFixed(3));
}

if (failures) { console.error(failures + ' FAILURE(S)'); process.exit(1); }
console.log('ALL STAR DEFENSE TESTS PASSED');
