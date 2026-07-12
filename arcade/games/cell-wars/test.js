#!/usr/bin/env node
/* Headless test harness for Cell Wars.
   Extracts the inline <script> from index.html, syntax-checks it,
   then unit-tests the DOM-free sim core:
   - regression: NPCs still kill each other
   - viruses burst big cells into pieces; small cells hide safely
   - player virus pieces re-merge like split pieces */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const HTML = path.join(__dirname, 'index.html');
const EXTRACTED = path.join(os.tmpdir(), 'cell-wars-sim.js');

const html = fs.readFileSync(HTML, 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error('FAIL: no <script> block found'); process.exit(1); }
fs.writeFileSync(EXTRACTED, m[1]);

const chk = spawnSync(process.execPath, ['--check', EXTRACTED], { encoding: 'utf8' });
if (chk.status !== 0) { console.error('FAIL: node --check\n' + chk.stderr); process.exit(1); }
console.log('PASS  node --check (extracted inline script)');

const { createSim, CFG } = require(EXTRACTED);

let failures = 0;
function ok(cond, name, detail) {
  if (cond) console.log('PASS  ' + name + (detail ? '  [' + detail + ']' : ''));
  else { failures++; console.error('FAIL  ' + name + (detail ? '  [' + detail + ']' : '')); }
}

/* ---------- 1. Regression: NPCs still kill each other ---------- */
{
  const sim = createSim();
  sim.reset({ withPlayer: false });
  const dt = 1 / 30;
  let t = 0;
  while (t < 240 && sim.totalKills === 0) { sim.update(dt); t += dt; }
  ok(sim.totalKills > 0, 'NPC war regression: NPCs kill each other',
     'kills=' + sim.totalKills + ' @ ' + t.toFixed(0) + 's');
}

/* ---------- 2. Virus bursts a big NPC; hiding small cell is safe ---------- */
{
  const sim = createSim();
  sim.reset({ withPlayer: false });
  ok(sim.viruses.length === CFG.VIRUS_COUNT, 'viruses spawn on reset', sim.viruses.length + ' viruses');
  const v = sim.viruses[0];
  const big = sim.cells[0], small = sim.cells[1];
  sim.cells.length = 0;
  sim.cells.push(big, small);
  big.protT = 0; small.protT = 0;
  big.mass = 3600; big.r = 60;                 // 60 > 36 * 1.35 = 48.6 -> bursts
  big.x = v.x; big.y = v.y; big.tx = v.x; big.ty = v.y; big.vx = big.vy = 0;
  small.mass = 225; small.r = 15;              // 15 < 48.6 -> hides safely
  small.x = v.x + 5; small.y = v.y + 5; small.tx = small.x; small.ty = small.y;
  const bigName = big.name;

  sim.update(1 / 60);

  const virusEvents = sim.events.filter(e => e.type === 'virus');
  ok(virusEvents.length === 1, 'big cell triggers one virus burst');
  ok(big.dead === true, 'burst cell dies');
  const pieces = sim.cells.filter(c => c.name === bigName.slice(0, 9) + ' Jr');
  ok(pieces.length >= 3 && pieces.length <= 4, 'NPC bursts into 3-4 Jr pieces', pieces.length + ' pieces');
  ok(!small.dead && sim.cells.indexOf(small) >= 0, 'small cell hiding under virus survives');
  ok(sim.viruses.indexOf(v) < 0 && sim.virusRespawns.length === 1, 'triggered virus removed + respawn queued');

  for (let i = 0; i < 6 * 30; i++) sim.update(1 / 30);
  ok(sim.viruses.length === CFG.VIRUS_COUNT, 'virus respawns elsewhere', sim.viruses.length + ' viruses');
}

/* ---------- 3. Player virus pieces behave like split pieces + re-merge ---------- */
{
  const sim = createSim();
  sim.reset({ withPlayer: true, name: 'TESTER' });
  const p = sim.cells.find(c => c.isPlayer);
  sim.cells.length = 0;
  sim.cells.push(p);                            // no NPC interference
  const v = sim.viruses[0];
  p.protT = 0;
  p.mass = 4900; p.r = 70;
  p.x = v.x; p.y = v.y;
  sim.setPlayerTarget(v.x, v.y);

  sim.update(1 / 60);
  let pieces = sim.cells.filter(c => c.isPlayer && !c.dead);
  ok(pieces.length >= 3 && pieces.length <= 4, 'player bursts into 3-4 pieces', pieces.length + ' pieces');
  ok(pieces.every(pc => pc.mergeT > 0), 'player pieces carry merge timers');
  ok(sim.playerAlive === true, 'player stays alive through burst');

  let t = 0;
  const dt = 1 / 30;
  while (t < 40) {
    sim.setPlayerTarget(v.x, v.y);
    sim.update(dt);
    t += dt;
    pieces = sim.cells.filter(c => c.isPlayer && !c.dead);
    if (pieces.length === 1) break;
  }
  ok(pieces.length === 1, 'player pieces re-merge', 'merged after ' + t.toFixed(1) + 's');
}

if (failures) { console.error(failures + ' FAILURE(S)'); process.exit(1); }
console.log('ALL CELL WARS TESTS PASSED');
