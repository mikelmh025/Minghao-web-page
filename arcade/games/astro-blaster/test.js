#!/usr/bin/env node
/* Headless test harness for Astro Blaster.
   Extracts the inline <script> from index.html, syntax-checks it,
   then unit-tests the DOM-free sim core (CORE):
   - regression: waves spawn, player shots kill rocks, score increases
   - UFO boss: wave 10 spawns it, rotating shield absorbs shots,
     shots through the gap damage it, shield gap angle rotates
   - wingman drone: follows with lag, mirrors player fire,
     dies in one enemy-bullet hit (absorbing it, player survives) */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const HTML = path.join(__dirname, 'index.html');
const EXTRACTED = path.join(os.tmpdir(), 'astro-blaster-sim.js');

const html = fs.readFileSync(HTML, 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error('FAIL: no <script> block found'); process.exit(1); }
fs.writeFileSync(EXTRACTED, m[1]);

const chk = spawnSync(process.execPath, ['--check', EXTRACTED], { encoding: 'utf8' });
if (chk.status !== 0) { console.error('FAIL: node --check\n' + chk.stderr); process.exit(1); }
console.log('PASS  node --check (extracted inline script)');

const CORE = require(EXTRACTED);

let failures = 0;
function ok(cond, name, detail) {
  if (cond) console.log('PASS  ' + name + (detail ? '  [' + detail + ']' : ''));
  else { failures++; console.error('FAIL  ' + name + (detail ? '  [' + detail + ']' : '')); }
}

const W = 900, H = 700, DT = 1 / 60;

/* ---------- 1. Regression: waves spawn, shots kill rocks, score climbs ---------- */
{
  const g = CORE.createGame(W, H, CORE.mulberry32(1));
  g.lives = 99;                       // keep the run going through deaths
  let t = 0;
  const broken = () => g.stats.broken[1] + g.stats.broken[2] + g.stats.broken[3];
  while (t < 90 && (broken() < 5 || g.score <= 0)) {
    const s = g.ship;
    let best = null, bd = Infinity;
    for (const r of g.rocks) {
      const d = (r.x - s.x) ** 2 + (r.y - s.y) ** 2;
      if (d < bd) { bd = d; best = r; }
    }
    const inp = { mode: 'mouse', fire: true,
                  aim: best ? Math.atan2(best.y - s.y, best.x - s.x) : -Math.PI / 2 };
    CORE.updateGame(g, inp, DT);
    t += DT;
  }
  ok(g.wave >= 1, 'regression: waves spawn', 'wave=' + g.wave);
  ok(broken() >= 5, 'regression: player shots kill enemies', 'rocksBroken=' + broken());
  ok(g.score > 0, 'regression: score increases', 'score=' + g.score);
  ok(!g.over, 'regression: game still running', 'lives=' + g.lives);
}

/* ---------- 2. UFO boss: wave 10 spawns it ---------- */
{
  const g = CORE.createGame(W, H, CORE.mulberry32(3));
  g.wave = 9;
  g.rocks = [];
  g.pendingWave = true;
  g.waveDelay = 0.01;
  CORE.updateGame(g, {}, 0.05);       // triggers startWave -> wave 10
  const ev = g.events.find(e => e.t === 'wavestart');
  ok(g.wave === 10 && !!g.ufo, 'wave 10 spawns the UFO boss',
     'wave=' + g.wave + ' ufoHp=' + (g.ufo && g.ufo.hp));
  ok(!!ev && ev.ufo === true, 'wavestart event flags ufo wave');
  ok(g.rocks.length === 0, 'boss-only wave: no rocks spawned');
  // wave must not auto-advance while the boss is alive
  for (let i = 0; i < Math.round(5 / DT); i++) CORE.updateGame(g, {}, DT);
  ok(g.wave === 10 && !!g.ufo, 'wave does not advance while boss alive');
}

/* ---------- 3. UFO boss: shield absorbs, gap lets shots through ---------- */
function bossSetup() {
  const g = CORE.createGame(W, H, CORE.mulberry32(7));
  g.pendingWave = false;              // no rock waves during the test
  const u = CORE.spawnUfoBoss(g);
  u.shieldSpin = 0;                   // freeze shield for deterministic angles
  u.strafe = 0; u.bob = 0;            // freeze movement
  u.fireT = 999;                      // no return fire
  g.ship.x = 60; g.ship.y = H - 60;   // ship well out of the way
  return { g, u };
}
function fireAt(g, u, ang) {          // bullet flying toward boss center from angle `ang`
  const d = u.shieldR + 25;
  g.bullets.push({ x: u.x + Math.cos(ang) * d, y: u.y + Math.sin(ang) * d,
                   vx: -Math.cos(ang) * 520, vy: -Math.sin(ang) * 520, r: 2.5, life: 0.95 });
}
{
  const { g, u } = bossSetup();
  const blockedAng = u.shieldA + Math.PI;      // opposite the gap: shielded
  ok(CORE.ufoShieldBlocks(u, u.x + Math.cos(blockedAng) * 60, u.y + Math.sin(blockedAng) * 60),
     'ufoShieldBlocks: shielded angle reports blocked');
  ok(!CORE.ufoShieldBlocks(u, u.x + Math.cos(u.shieldA) * 60, u.y + Math.sin(u.shieldA) * 60),
     'ufoShieldBlocks: gap angle reports open');

  const hp0 = u.hp;
  fireAt(g, u, blockedAng);
  let steps = 0;
  while (g.bullets.length > 0 && steps++ < 300) CORE.updateGame(g, {}, 1 / 120);
  ok(g.bullets.length === 0 && u.hp === hp0,
     'shot at shielded angle is absorbed (hp unchanged, shot removed)',
     'hp=' + u.hp + '/' + hp0);
  ok(g.events.some(e => e.t === 'shieldhit'), 'shield absorption emits shieldhit event');

  fireAt(g, u, u.shieldA);                     // straight through the gap
  steps = 0;
  while (g.bullets.length > 0 && steps++ < 300) CORE.updateGame(g, {}, 1 / 120);
  ok(u.hp === hp0 - 1, 'shot through the gap damages boss hp', 'hp=' + u.hp + ' was ' + hp0);
}
{
  const { g, u } = bossSetup();
  u.shieldSpin = 1.1;                          // default rotation back on
  const a0 = u.shieldA;
  for (let i = 0; i < 60; i++) CORE.updateGame(g, {}, DT);   // 1s
  ok(Math.abs(u.shieldA - a0) > 0.5, 'shield rotates: gap angle changes over time',
     a0.toFixed(2) + ' -> ' + u.shieldA.toFixed(2));
}

/* ---------- 4. Wingman drone ---------- */
function droneSetup() {
  const g = CORE.createGame(W, H, CORE.mulberry32(11));
  g.pendingWave = false;
  // inert far-away rock keeps the wave from clearing/respawning
  g.rocks.push({ x: 5, y: 5, vx: 0, vy: 0, size: 1, r: CORE.ROCK_R[1], rot: 0, spin: 0,
                 verts: [1, 1, 1, 1, 1, 1, 1, 1, 1], boss: false, hp: 1 });
  CORE.applyPowerup(g, { type: 'D' });         // pick up the wingman
  return g;
}
{
  const g = droneSetup();
  ok(!!g.drone, 'drone exists after pickup');
  const s = g.ship;
  for (let i = 0; i < Math.round(4 / DT); i++) CORE.updateGame(g, {}, DT);  // ship idle 4s
  const ta = s.a + Math.PI * 0.78;
  const tx = s.x + Math.cos(ta) * 34, ty = s.y + Math.sin(ta) * 34;
  const err = Math.hypot(g.drone.x - tx, g.drone.y - ty);
  ok(err < 2, 'drone follows: converges to lagged offset near player', 'err=' + err.toFixed(2) + 'px');

  // fire mirroring
  g.ship.cool = 0;
  const dx = g.drone.x, dy = g.drone.y;
  CORE.updateGame(g, { mode: 'mouse', aim: s.a, fire: true }, DT);
  ok(g.bullets.length === 2, 'player fire spawns an extra drone shot',
     g.bullets.length + ' bullets');
  const near = Math.min(...g.bullets.map(b => Math.hypot(b.x - dx, b.y - dy)));
  ok(near < 25, 'extra shot originates near the drone', 'dist=' + near.toFixed(1) + 'px');
}
{
  const g = droneSetup();
  const s = g.ship;
  for (let i = 0; i < 30; i++) CORE.updateGame(g, {}, DT);   // let drone settle
  const lives0 = g.lives;
  // enemy bullet dead on the drone
  g.ebullets.push({ x: g.drone.x, y: g.drone.y, vx: 0, vy: 0, r: 3, life: 1 });
  CORE.updateGame(g, {}, DT);
  ok(g.drone === null, 'one enemy-bullet hit kills the drone');
  ok(g.ebullets.length === 0, 'drone absorbs the enemy bullet');
  ok(g.lives === lives0 && s.dead <= 0, 'player survives the absorbed hit',
     'lives=' + g.lives);
  ok(g.events.some(e => e.t === 'dronedeath'), 'dronedeath event emitted');

  // re-pickup gives a fresh drone (only one at a time)
  CORE.applyPowerup(g, { type: 'D' });
  ok(!!g.drone, 'drone can be re-acquired after death');
}

if (failures) { console.error(failures + ' FAILURE(S)'); process.exit(1); }
console.log('ALL ASTRO BLASTER TESTS PASSED');
