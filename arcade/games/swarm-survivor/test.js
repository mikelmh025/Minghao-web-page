#!/usr/bin/env node
/* Headless verification for Swarm Survivor.
   - extracts the inline <script> from index.html
   - node --check syntax validation
   - runs a 5-sim-minute bot at 60Hz and asserts core behaviors
*/
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const HTML = path.join(__dirname, 'index.html');
const html = fs.readFileSync(HTML, 'utf8');
const a = html.indexOf('<script>');
const b = html.lastIndexOf('<\/script>');
if (a < 0 || b < 0) { console.error('FAIL: could not find inline script'); process.exit(1); }
const js = html.slice(a + '<script>'.length, b);
const tmp = path.join(os.tmpdir(), 'swarm-survivor-sim.js');
fs.writeFileSync(tmp, js);

execSync(`node --check "${tmp}"`);
console.log('PASS  node --check (inline script is valid JS)');

const sim = require(tmp);

let failures = 0;
function assert(cond, label, extra) {
  if (cond) console.log('PASS  ' + label + (extra ? '  [' + extra + ']' : ''));
  else { console.error('FAIL  ' + label + (extra ? '  [' + extra + ']' : '')); failures++; }
}

/* ---------- spatial hash vs brute force on a synthetic sample ---------- */
{
  const g = sim.createGame({ seed: 42 });
  // scatter enemies deterministically
  for (let i = 0; i < 500; i++) {
    g.enemies.push({ id: 1000 + i, x: Math.sin(i * 12.9898) * 1200, y: Math.cos(i * 78.233) * 1200, r: 10, dead: false });
  }
  sim.rebuildHash(g);
  let same = true;
  for (let q = 0; q < 60; q++) {
    const qx = Math.sin(q * 3.7) * 1000, qy = Math.cos(q * 5.1) * 1000, qr = 40 + (q % 7) * 60;
    const h = sim.queryEnemies(g, qx, qy, qr).map(e => e.id).sort((x, y) => x - y);
    const bf = sim.queryEnemiesBrute(g, qx, qy, qr).map(e => e.id).sort((x, y) => x - y);
    if (h.length !== bf.length || h.some((v, i) => v !== bf[i])) { same = false; break; }
  }
  assert(same, 'spatial hash matches brute force (60 queries, 500 entities)');
}

/* ---------- 5-minute bot run ---------- */
function hasNaN(g) {
  const p = g.player;
  const vals = [p.x, p.y, p.hp, p.maxhp, g.xp, g.xpNext, g.time, g.coins];
  for (const v of vals) if (typeof v !== 'number' || Number.isNaN(v)) return 'player/core';
  for (const e of g.enemies) if (Number.isNaN(e.x) || Number.isNaN(e.y) || Number.isNaN(e.hp)) return 'enemy';
  for (const s of g.shots) if (Number.isNaN(s.x) || Number.isNaN(s.y)) return 'shot';
  for (const gm of g.gems) if (Number.isNaN(gm.x) || Number.isNaN(gm.v)) return 'gem';
  return null;
}

function botInput(g) {
  const p = g.player;
  let fx = 0, fy = 0, danger = 0;
  // flee density: inverse-distance weighted repulsion from nearby enemies
  for (const e of g.enemies) {
    const dx = p.x - e.x, dy = p.y - e.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < 320 * 320) {
      const d = Math.sqrt(d2) || 1;
      const w = (1 - d / 320) * ((e.elite || e.boss) ? 2 : 1);
      fx += dx / d * w; fy += dy / d * w;
      if (d < 130) danger += (1 - d / 130);
    }
  }
  const fm = Math.hypot(fx, fy);
  let vx = 0, vy = 0;
  if (fm > 0.001) { fx /= fm; fy /= fm; }
  if (danger > 0.35) {
    // enemies close: run straight away with a slight strafe
    vx = fx + -fy * 0.15; vy = fy + fx * 0.15;
  } else {
    // kite tangentially around the swarm so we sweep over gem fields
    vx = fx * 0.75 + -fy * 0.65; vy = fy * 0.75 + fx * 0.65;
    // loot attraction: chest >> pickup > gem — but never through the swarm
    let best = null, bd = 1e18;
    const consider = (x, y, pri) => {
      let d = Math.hypot(x - p.x, y - p.y);
      if (d > 480) return;
      if (fm > 0.4) {
        const dot = ((x - p.x) / (d || 1)) * fx + ((y - p.y) / (d || 1)) * fy;
        if (dot < -0.25) return; // loot lies behind the threat
      }
      d *= pri;
      if (d < bd) { bd = d; best = { x, y }; }
    };
    for (const it of g.pickups) consider(it.x, it.y, it.t === 'chest' ? 0.25 : 0.7);
    for (const gm of g.gems) consider(gm.x, gm.y, 1);
    if (best) {
      const d = Math.hypot(best.x - p.x, best.y - p.y) || 1;
      const w = fm < 0.2 ? 1.6 : 0.7;
      vx += (best.x - p.x) / d * w; vy += (best.y - p.y) / d * w;
    }
  }
  const mm = Math.hypot(vx, vy) || 1;
  g.input.x = vx / mm; g.input.y = vy / mm;
}

function pickChoice(g) {
  const opts = g.pendingChoices;
  // priority: evolve > bolt upgrade > damage passive > any owned weapon > anything
  let pick = opts.find(o => o.kind === 'evolve')
    || opts.find(o => o.kind === 'weapon' && o.key === 'bolt')
    || opts.find(o => o.kind === 'passive' && o.key === 'damage')
    || opts.find(o => o.kind === 'weapon' && !o.isNew)
    || opts[0];
  sim.applyChoice(g, pick);
  return pick;
}

{
  const g = sim.createGame({ seed: 20260712 });
  const STEPS = 5 * 60 * 60; // 5 minutes @ 60Hz
  const DT = 1 / 60;
  let peak = 0, choicesMade = 0, chestsOpened = 0, evolvedKey = null, nanWhere = null;
  let simNs = 0n, steps = 0, maxStepNs = 0n;

  for (let i = 0; i < STEPS; i++) {
    botInput(g);
    const t0 = process.hrtime.bigint();
    sim.stepGame(g, DT);
    const el = process.hrtime.bigint() - t0;
    simNs += el; steps++;
    if (el > maxStepNs) maxStepNs = el;
    if (g.enemies.length > peak) peak = g.enemies.length;

    let guard = 0;
    while ((g.pendingChoices || g.pendingChest) && guard++ < 20) {
      if (g.pendingChest) { sim.applyChest(g); chestsOpened++; }
      if (g.pendingChoices) {
        const pick = pickChoice(g);
        choicesMade++;
        if (pick.kind === 'evolve') evolvedKey = pick.key;
      }
    }
    if (g.evolved) evolvedKey = g.evolved;

    if (i % 300 === 0) {
      const w = hasNaN(g);
      if (w) { nanWhere = w + ' @t=' + g.time.toFixed(1); break; }
    }
    if (g.state !== 'run') break;
  }
  const finalNaN = nanWhere || hasNaN(g);

  const avgUs = Number(simNs / BigInt(steps)) / 1000;
  const maxUs = Number(maxStepNs) / 1000;

  assert(g.state === 'run' && g.time >= 299, 'bot survives 5 sim-minutes',
    'state=' + g.state + ' t=' + g.time.toFixed(1) + 's hp=' + g.player.hp.toFixed(0) + '/' + g.player.maxhp);
  assert(peak >= 200, '200+ concurrent enemies handled', 'peak=' + peak);
  assert(g.kills > 100, 'kills accumulate', 'kills=' + g.kills);
  assert(choicesMade >= 5 && g.level > 5, 'XP level-ups trigger choices (auto-picked)',
    'level=' + g.level + ' choices=' + choicesMade);
  assert(evolvedKey !== null, 'a weapon reached max level and EVOLVED', 'weapon=' + (evolvedKey || 'none') +
    ' boltLv=' + (g.player.weapons.bolt ? g.player.weapons.bolt.lv : 0) +
    ' evo=' + (g.player.weapons.bolt ? g.player.weapons.bolt.evo : false));
  assert(g.chestsDropped >= 1, 'elite kill drops treasure chest',
    'dropped=' + g.chestsDropped + ' opened=' + chestsOpened);
  assert(g.coins > 0, 'coins awarded during run', 'runCoins=' + g.coins +
    ' endBonus=' + sim.runBonusCoins(g) + ' total=' + (g.coins + sim.runBonusCoins(g)));
  assert(finalNaN === null, 'no NaN in sim state', finalNaN || 'clean');
  console.log('PERF  avg step ' + avgUs.toFixed(1) + 'us, worst ' + maxUs.toFixed(0) +
    'us over ' + steps + ' steps (60fps budget = 16667us/frame)');
}

if (failures) { console.error('\n' + failures + ' FAILURE(S)'); process.exit(1); }
console.log('\nALL TESTS PASSED');
