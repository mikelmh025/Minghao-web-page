#!/usr/bin/env node
/* Headless test suite for Herdmind's DOM-free core.
   Extracts the inline <script> from index.html, requires it under Node,
   and exercises every emergent verb plus scripted playthroughs. */
'use strict';
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error('FAIL: no inline <script> found'); process.exit(1); }
const tmp = path.join(require('os').tmpdir(), 'herdmind-core-test.js');
fs.writeFileSync(tmp, m[1]);
const { Core } = require(tmp);

const DT = 1 / 60;
let pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  [' + extra + ']' : '')); }
}
function assertNoNaN(s, tag) {
  let bad = false;
  const chk = v => { if (typeof v === 'number' && !isFinite(v)) bad = true; };
  chk(s.hero.d); chk(s.hero.x); chk(s.hero.y);
  s.wisps.forEach(w => { chk(w.x); chk(w.y); chk(w.vx); chk(w.vy); });
  s.arrows.forEach(a => { chk(a.x); chk(a.y); });
  s.wolves.forEach(w => { chk(w.x); chk(w.y); });
  if (s.troll) { chk(s.troll.x); chk(s.troll.y); }
  if (bad) throw new Error('NaN detected in ' + tag);
  return true;
}
function run(s, seconds, botFn) {
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) {
    const inp = botFn ? (botFn(s, i * DT) || {}) : {};
    Core.step(s, inp, DT);
    if (i % 120 === 0) assertNoNaN(s, 'step ' + i);
    if (s.phase !== 'play') break;
  }
  assertNoNaN(s, 'end');
  return s;
}
const straight = (len, y) => [[100, y], [100 + len, y]];

/* ---------- 1. Boids cohesive & finite over 60s ---------- */
console.log('\n[1] Boids: cohesion + finiteness over 60 simulated seconds');
{
  const s = Core.createLevel({ name: 'boids', wisps: 30, path: straight(30000, 500), ents: [] });
  const tgt = { x: 1400, y: 300 };
  run(s, 60, () => ({ hold: true, x: tgt.x, y: tgt.y }));
  let cx = 0, cy = 0;
  s.wisps.forEach(w => { cx += w.x; cy += w.y; });
  cx /= s.wisps.length; cy /= s.wisps.length;
  const maxFromC = Math.max(...s.wisps.map(w => Math.hypot(w.x - cx, w.y - cy)));
  ok(s.wisps.length === 30, 'no wisps lost in empty field');
  ok(Math.hypot(cx - tgt.x, cy - tgt.y) < 120, 'flock centroid settles on held target',
    'off by ' + Math.hypot(cx - tgt.x, cy - tgt.y).toFixed(1));
  ok(maxFromC < 300, 'flock stays cohesive (max spread ' + maxFromC.toFixed(1) + 'px)');
  ok(assertNoNaN(s, 'boids'), 'all values finite after 60s');
  // idle-follow also cohesive
  const s2 = Core.createLevel({ name: 'idle', wisps: 30, path: straight(30000, 500), ents: [] });
  run(s2, 20, () => ({}));
  const spread = Math.max(...s2.wisps.map(w => Math.hypot(w.x - s2.hero.x, w.y - s2.hero.y)));
  ok(spread < 260, 'idle herd trails the hero (max dist ' + spread.toFixed(1) + 'px)');
}

/* ---------- 2. Shield ---------- */
console.log('\n[2] Shield: wisps between archer and hero intercept arrows');
{
  const lvl = () => ({ name: 'shield', wisps: 14, path: straight(1400, 500), ents: [{ t: 'archer', x: 700, y: 160 }] });
  // With shield: hold herd between archer and hero
  const a = Core.createLevel(lvl());
  run(a, 40, s => {
    const h = s.hero, ax = 700, ay = 160;
    const d = Math.hypot(ax - h.x, ay - h.y) || 1;
    return { hold: true, x: h.x + (ax - h.x) / d * 80, y: h.y + (ay - h.y) / d * 80 };
  });
  ok(a.phase === 'clear', 'shielded hero reaches the castle');
  ok(a.hero.hearts === 3, 'shielded hero keeps all 3 hearts', 'hearts=' + a.hero.hearts);
  ok(a.lost > 0, 'at least one wisp was sacrificed to an arrow', 'lost=' + a.lost);
  // Without shield: herd parked far away
  const b = Core.createLevel(lvl());
  run(b, 40, () => ({ hold: true, x: 120, y: 950 }));
  ok(b.hero.hearts < 3, 'unshielded hero loses at least one heart', 'hearts=' + b.hero.hearts);
  ok(b.lost === 0, 'far-away wisps were not hit', 'lost=' + b.lost);
}

/* ---------- 3. Bridge ---------- */
console.log('\n[3] Bridge: hero crosses the gap only with 6+ wisps held over it');
{
  const lvl = n => ({ name: 'bridge', wisps: n, path: straight(1500, 500), gapAt: [0.4, 0.5], ents: [] });
  const gapMid = { x: 100 + 1500 * 0.45, y: 500 };
  const withSix = Core.createLevel(lvl(8));
  run(withSix, 60, () => ({ hold: true, x: gapMid.x, y: gapMid.y }));
  ok(withSix.phase === 'clear', 'hero crosses with 8 wisps bridging');
  const withFive = Core.createLevel(lvl(5));
  run(withFive, 60, () => ({ hold: true, x: gapMid.x, y: gapMid.y }));
  const gd0 = withFive.gaps[0].d0;
  ok(withFive.phase === 'play' && withFive.hero.d <= gd0 + 6,
    'hero waits at the edge with only 5 wisps', 'd=' + withFive.hero.d.toFixed(1) + ' gap at ' + gd0.toFixed(1));
  const noBridge = Core.createLevel(lvl(20));
  run(noBridge, 60, () => ({ hold: true, x: 120, y: 950 }));
  ok(noBridge.phase === 'play' && noBridge.hero.d <= noBridge.gaps[0].d0 + 6,
    'hero never falls in / never crosses when herd is elsewhere');
}

/* ---------- 4. Haul ---------- */
console.log('\n[4] Haul: boulder moves only with 8+ wisps');
{
  const lvl = n => ({ name: 'haul', wisps: n, path: straight(1500, 500), ents: [{ t: 'boulder', f: 0.5 }] });
  const eight = Core.createLevel(lvl(9));
  const b0 = { x: eight.boulders[0].x, y: eight.boulders[0].y };
  run(eight, 60, s => {
    const b = s.boulders[0];
    return b.cleared ? {} : { hold: true, x: b.x, y: b.y };
  });
  ok(eight.boulders[0].cleared, 'boulder hauled clear with 9 wisps');
  ok(Math.hypot(eight.boulders[0].x - b0.x, eight.boulders[0].y - b0.y) > 60, 'boulder physically moved');
  ok(eight.phase === 'clear', 'hero completes the level once path is clear');
  const seven = Core.createLevel(lvl(7));
  const c0 = { x: seven.boulders[0].x, y: seven.boulders[0].y };
  run(seven, 20, s => ({ hold: true, x: s.boulders[0].x, y: s.boulders[0].y }));
  ok(!seven.boulders[0].cleared, 'boulder does NOT clear with 7 wisps');
  ok(Math.hypot(seven.boulders[0].x - c0.x, seven.boulders[0].y - c0.y) < 1, 'boulder does not budge with 7 wisps');
  ok(seven.hero.d <= seven.boulders[0].d - 60, 'hero stays blocked behind the boulder');
}

/* ---------- 5. Distract ---------- */
console.log('\n[5] Distract: wolf retargets from hero to nearby wisps');
{
  const s = Core.createLevel({ name: 'distract', wisps: 12, path: straight(1500, 600), ents: [{ t: 'wolf', x: 700, y: 660 }] });
  let sawHeroTarget = false, sawWispTarget = false;
  run(s, 30, (st, t) => {
    const w = st.wolves[0];
    if (t < 6) { // keep herd far away; let wolf notice the hero
      if (w.targetType === 'hero') sawHeroTarget = true;
      return { hold: true, x: 120, y: 120 };
    }
    if (w.targetType === 'wisp') sawWispTarget = true;
    return { hold: true, x: 700, y: 480 }; // bring the herd near the wolf
  });
  ok(sawHeroTarget, 'wolf first targeted the hero');
  ok(sawWispTarget, 'wolf retargeted to nearby wisps (distracted)');
}

/* ---------- 6. Smother ---------- */
console.log('\n[6] Smother: 10+ wisps dogpile kills a wolf');
{
  const s = Core.createLevel({ name: 'smother', wisps: 14, path: straight(1600, 900), ents: [{ t: 'wolf', x: 800, y: 300 }] });
  run(s, 14, st => {
    const w = st.wolves[0];
    return w.state === 'dead' ? {} : { hold: true, x: w.x, y: w.y };
  });
  ok(s.wolves[0].state === 'dead', 'wolf smothered by dogpile', 'state=' + s.wolves[0].state);
  // Control: few wisps cannot smother
  const c = Core.createLevel({ name: 'nosmother', wisps: 6, path: straight(1600, 900), ents: [{ t: 'wolf', x: 800, y: 300 }] });
  run(c, 10, st => {
    const w = st.wolves[0];
    return { hold: true, x: w.x, y: w.y };
  });
  ok(c.wolves[0].state !== 'dead', 'a handful of wisps cannot smother a wolf');
}

/* ---------- 7. Hero death -> defeat ---------- */
console.log('\n[7] Hero death: 3 leaked hits end the level in defeat');
{
  const s = Core.createLevel({
    name: 'death', wisps: 10, path: straight(1600, 500),
    ents: [{ t: 'archer', x: 500, y: 320 }, { t: 'archer', x: 900, y: 680 }, { t: 'archer', x: 1300, y: 320 }]
  });
  run(s, 60, () => ({ hold: true, x: 120, y: 950 }));
  ok(s.hero.hearts === 0, 'hero loses all hearts undefended', 'hearts=' + s.hero.hearts);
  ok(s.phase === 'dead', "phase becomes 'dead' (defeat)", 'phase=' + s.phase);
  // stepping a dead state stays safe
  for (let i = 0; i < 120; i++) Core.step(s, { hold: true, x: 0, y: 0 }, DT);
  ok(assertNoNaN(s, 'post-death'), 'post-death stepping stays finite');
}

/* ---------- 8. Scripted controllers clear levels 1-3 ---------- */
console.log('\n[8] Scripted controller completes real levels 1-3');
{
  // Level 1: keep the herd between the archer and the hero
  const l1 = Core.createLevel(0);
  run(l1, 90, s => {
    const h = s.hero, a = s.archers[0];
    const d = Math.hypot(a.x - h.x, a.y - h.y) || 1;
    return { hold: true, x: h.x + (a.x - h.x) / d * 85, y: h.y + (a.y - h.y) / d * 85 };
  });
  ok(l1.phase === 'clear', 'Level 1 cleared (shield bot)', 'phase=' + l1.phase + ' hearts=' + l1.hero.hearts);
  ok(l1.hero.hearts > 0, 'Level 1 hero survives', 'hearts=' + l1.hero.hearts);

  // Level 2: park the herd over the chasm
  const l2 = Core.createLevel(1);
  run(l2, 90, s => {
    const g = s.gaps[0];
    return { hold: true, x: g.cx, y: g.cy };
  });
  ok(l2.phase === 'clear', 'Level 2 cleared (bridge bot)', 'phase=' + l2.phase);

  // Level 3: pile onto the boulder until it clears, then follow
  const l3 = Core.createLevel(2);
  run(l3, 90, s => {
    const b = s.boulders[0];
    return b.cleared ? {} : { hold: true, x: b.x, y: b.y };
  });
  ok(l3.phase === 'clear', 'Level 3 cleared (haul bot)', 'phase=' + l3.phase);
}

/* ---------- 9. Split / regroup / cages / catapult cushion ---------- */
console.log('\n[9] Extras: split, regroup, cage rescue, catapult cushion, timer');
{
  const s = Core.createLevel({ name: 'split', wisps: 20, path: straight(20000, 500), ents: [] });
  Core.step(s, { split: { x: 900, y: 200 } }, DT);
  const anchored = s.wisps.filter(w => w.anchor).length;
  ok(anchored === 10, 'double-tap splits herd in half (10/20 anchored)', 'anchored=' + anchored);
  run(s, 4, () => ({ hold: true, x: 300, y: 800 }));
  const nearAnchor = Core.wispsIn(s, 900, 200, 160);
  const nearHold = Core.wispsIn(s, 300, 800, 160);
  ok(nearAnchor >= 8 && nearHold >= 8, 'split halves hold two positions',
    'anchor=' + nearAnchor + ' hold=' + nearHold);
  Core.step(s, { regroup: true }, DT);
  ok(s.wisps.every(w => !w.anchor), 'R regroups everyone (anchors cleared)');

  const c = Core.createLevel({ name: 'cage', wisps: 10, path: straight(20000, 500), ents: [{ t: 'cage', x: 600, y: 300, n: 7 }] });
  run(c, 6, () => ({ hold: true, x: 600, y: 300 }));
  ok(c.cages[0].open && c.wisps.length === 17, 'cage rescue adds 7 wisps', 'wisps=' + c.wisps.length);

  // Catapult: cushion vs no cushion
  const noCush = Core.createLevel({ name: 'cata', wisps: 12, path: straight(2400, 500), ents: [{ t: 'catapult', x: 600, y: 160 }] });
  run(noCush, 45, () => ({ hold: true, x: 120, y: 950 }));
  ok(noCush.hero.hearts < 3, 'undefended hero is hurt by catapult stones', 'hearts=' + noCush.hero.hearts);
  const cush = Core.createLevel({ name: 'cata2', wisps: 20, path: straight(2400, 500), ents: [{ t: 'catapult', x: 600, y: 160 }] });
  run(cush, 45, s => {
    const sh = s.shots[0];
    if (sh) return { hold: true, x: sh.tx, y: sh.ty };
    return { hold: true, x: s.hero.x + 60, y: s.hero.y };
  });
  ok(cush.hero.hearts > noCush.hero.hearts, 'shield-blob on the shadow cushions the blow',
    'cushioned=' + cush.hero.hearts + ' vs ' + noCush.hero.hearts);

  // Timer
  const tl = Core.createLevel({ name: 'timed', wisps: 8, path: straight(20000, 500), time: 2, ents: [] });
  run(tl, 5, () => ({}));
  ok(tl.phase === 'timeup', 'time limit expiring ends the level', 'phase=' + tl.phase);

  // Troll: cannot be smothered, retargets to wisps
  const tr = Core.createLevel({ name: 'troll', wisps: 16, path: straight(2000, 900), ents: [{ t: 'troll', x: 900, y: 300 }] });
  let trollDistracted = false;
  run(tr, 12, s => {
    if (s.troll.targetType === 'wisp') trollDistracted = true;
    return { hold: true, x: s.troll.x + 120, y: s.troll.y };
  });
  ok(trollDistracted, 'troll chases nearby wisps (distract works)');
  ok(tr.troll && tr.troll.state !== 'dead', 'troll cannot be smothered');

  // Gate haul
  const gt = Core.createLevel({ name: 'gate', wisps: 12, path: straight(1500, 500), ents: [{ t: 'gate', f: 0.6 }] });
  run(gt, 60, s => (s.gate.open < 1 ? { hold: true, x: s.gate.x, y: s.gate.y } : {}));
  ok(gt.gate.open >= 1, 'gate hauled open with 8+ wisps');
  ok(gt.phase === 'clear', 'hero passes the opened gate');
  const gt2 = Core.createLevel({ name: 'gate2', wisps: 6, path: straight(1500, 500), ents: [{ t: 'gate', f: 0.6 }] });
  run(gt2, 20, s => ({ hold: true, x: s.gate.x, y: s.gate.y }));
  ok(gt2.gate.open === 0 && gt2.phase === 'play', 'gate stays shut with only 6 wisps');
}

/* ---------- 10. All 8 shipped levels construct and step cleanly ---------- */
console.log('\n[10] All 8 shipped levels construct and simulate without NaN');
{
  let good = true;
  for (let i = 0; i < 8; i++) {
    const s = Core.createLevel(i);
    try { run(s, 10, (st, t) => ({ hold: true, x: st.hero.x + 40, y: st.hero.y - 40 })); }
    catch (e) { good = false; console.log('   level ' + (i + 1) + ' threw: ' + e.message); }
  }
  ok(good, 'levels 1-8 all step 10s cleanly with herd active');
}

console.log('\n==========================================');
console.log(' ' + pass + ' passed, ' + fail + ' failed');
console.log('==========================================');
process.exit(fail ? 1 : 0);
