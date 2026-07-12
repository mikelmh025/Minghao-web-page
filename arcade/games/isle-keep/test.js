#!/usr/bin/env node
/* Headless test for Isle Keep — extracts the inline <script> from index.html
   (DOM-free sim core + guarded UI block) and runs a scripted 5-night run. */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const m = html.match(/<script>([\s\S]*)<\/script>/);
if (!m) { console.error('FAIL: no <script> block found'); process.exit(1); }
const tmp = path.join(os.tmpdir(), 'isle-keep-sim-test.js');
fs.writeFileSync(tmp, m[1]);

const { Game, astar, depthCmp, BUILD, T, N, DAY_LEN, NIGHT_LEN } = require(tmp);

let pass = 0, fail = 0;
function assert(cond, name) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name); }
}
function isFiniteNum(v) { return typeof v === 'number' && Number.isFinite(v); }
function scanNaN(g) {
  if (!isFiniteNum(g.res.wood) || !isFiniteNum(g.res.stone) || !isFiniteNum(g.res.food)) return 'resources';
  for (const v of g.villagers) if (!isFiniteNum(v.x) || !isFiniteNum(v.y) || !isFiniteNum(v.hp)) return 'villager';
  for (const r of g.raiders) if (!isFiniteNum(r.x) || !isFiniteNum(r.y) || !isFiniteNum(r.hp)) return 'raider';
  for (const b of g.buildings) if (!isFiniteNum(b.hp) || !isFiniteNum(b.build)) return 'building';
  for (const p of g.projectiles) if (!isFiniteNum(p.x) || !isFiniteNum(p.y)) return 'projectile';
  for (const b of g.boats) if (!isFiniteNum(b.x) || !isFiniteNum(b.y)) return 'boat';
  return null;
}

console.log('--- painter-sort comparator is a valid ordering ---');
{
  const sample = [];
  for (let i = 0; i < 14; i++) sample.push({ depth: [3, 1, 7, 7, 2, 9, 4.5, 7, 0, 12, 3, 6, 6, 1][i], tie: i % 4 });
  let ok = true;
  const sgn = x => (x > 0) - (x < 0);
  for (const a of sample) for (const b of sample) {
    if (sgn(depthCmp(a, b)) !== -sgn(depthCmp(b, a))) ok = false;      // antisymmetry
    if (a === b && depthCmp(a, b) !== 0) ok = false;                    // reflexivity
    for (const c of sample)                                             // transitivity (no cycles)
      if (depthCmp(a, b) < 0 && depthCmp(b, c) < 0 && depthCmp(a, c) >= 0) ok = false;
  }
  assert(ok, 'depthCmp is antisymmetric + transitive on sample set (no cycles)');
  assert(!isNaN(depthCmp(sample[0], sample[1])), 'depthCmp returns numeric');
}

console.log('--- world generation ---');
const g = new Game(12345);
{
  assert(g.keep && g.keep.type === 'keep' && g.keep.hp === 600, 'keep exists at full HP');
  assert(g.villagers.length === 3, 'starts with 3 villagers');
  let trees = 0, rocks = 0;
  g.props.forEach(p => p.kind === 'tree' ? trees++ : rocks++);
  assert(trees > 5 && rocks > 2, `island has trees (${trees}) and rocks (${rocks})`);
  assert(g.coast.length > 8, `island has beach coastline (${g.coast.length} tiles)`);
}

console.log('--- A* never paths through water/cliffs/buildings ---');
{
  // give the map some walls first so blocked tiles exist, then check villager paths
  const passable = (x, y) => {
    const t = g.terrain[y][x];
    if (t !== T.SAND && t !== T.GRASS) return false;
    const b = g.occ[y][x];
    return !b || (b.type === 'gate' && b.build >= 1);
  };
  const land = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (passable(x, y)) land.push({ x, y });
  let checked = 0, bad = 0, found = 0;
  const rng = (() => { let s = 99; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  for (let i = 0; i < 250; i++) {
    const a = land[(rng() * land.length) | 0], b = land[(rng() * land.length) | 0];
    const p = astar(g, a.x, a.y, b.x, b.y, 'villager');
    if (!p) continue;
    found++;
    for (const n of p) { checked++; if (!passable(n.x, n.y)) bad++; }
    if (p.length && (p[p.length - 1].x !== b.x || p[p.length - 1].y !== b.y)) bad++;
  }
  assert(found > 100, `paths found for random pairs (${found}/250)`);
  assert(bad === 0, `all ${checked} path nodes avoid water/cliffs/buildings`);
}

console.log('--- scripted 5-night run: build defenses, then simulate ---');
{
  g.res.wood = 9999; g.res.stone = 9999; g.res.food = 300;

  // towers/ballistae at ring corners, walls around the keep (ring at chebyshev 4 of keep center)
  const placed = { wall: [], tower: [], other: [] };
  for (const [x, y] of [[8, 8], [15, 8], [8, 15], [15, 15]])
    if (g.tryPlace('ballista', x, y)) placed.tower.push([x, y]);
  for (const [x, y] of [[11, 8], [12, 15], [8, 11], [15, 12]])
    if (g.tryPlace('tower', x, y)) placed.tower.push([x, y]);
  let gatePlaced = false;
  for (let x = 8; x <= 15; x++) for (let y = 8; y <= 15; y++) {
    if (x !== 8 && x !== 15 && y !== 8 && y !== 15) continue;
    if (!gatePlaced && x === 13 && y === 15) { gatePlaced = !!g.tryPlace('gate', x, y); continue; }
    const b = g.tryPlace('wall', x, y);
    if (b) placed.wall.push(b);
  }
  // economy + housing
  for (const t of ['lumber', 'quarry', 'farm', 'farm', 'house', 'house']) {
    let done = false;
    for (let rad = 3; rad <= 9 && !done; rad++)
      for (let y = 12 - rad; y <= 12 + rad && !done; y++)
        for (let x = 12 - rad; x <= 12 + rad && !done; x++)
          if ((x < 8 || x > 15 || y < 8 || y > 15) === (t === 'lumber' || t === 'quarry') ? false : true) {
            // economy inside the ring; lumber/quarry also fine inside (workers exit via gate)
            if (g.canPlace(t, x, y) && x > 8 && x < 15 && y > 8 && y < 15) { g.tryPlace(t, x, y); done = true; }
          }
    if (!done) { const b2 = (() => { for (let y = 9; y < 15; y++) for (let x = 9; x < 15; x++) if (g.canPlace(t, x, y)) return g.tryPlace(t, x, y); return null; })(); done = !!b2; }
    placed.other.push([t, done]);
  }
  // 28 ring tiles - 8 towers - 1 gate = 19 walls when every slot fits
  assert(placed.wall.length >= 18, `wall ring placed (${placed.wall.length} walls)`);
  assert(placed.tower.length >= 6, `towers placed (${placed.tower.length})`);
  assert(gatePlaced, 'gate placed in wall ring');
  assert(placed.other.every(o => o[1]), 'lumber/quarry/farms/houses placed: ' + JSON.stringify(placed.other));

  const dt = 0.05;
  const woodStart = { t: 10, val: null }, snapshotAt = 68;
  let woodSnap0 = null, woodSnap1 = null, stoneSnap0 = null, stoneSnap1 = null, foodMax0 = null;
  let raidersSeen = 0, minKeepDist = 99, boatsSeen = 0, wallDamagedSeen = false, repairedOk = false;
  let builtAll = false, nanAt = null, lastPhase = 'day';
  let steps = 0;
  const maxSteps = Math.ceil((5 * (DAY_LEN + NIGHT_LEN) + 30) / dt);

  while (g.state === 'running' && g.nightsSurvived < 5 && steps < maxSteps) {
    g.update(dt);
    steps++;
    const t = g.time;
    if (t >= 12 && woodSnap0 === null) { woodSnap0 = g.res.wood; stoneSnap0 = g.res.stone; foodMax0 = g.res.food; }
    if (t >= snapshotAt && woodSnap1 === null) { woodSnap1 = g.res.wood; stoneSnap1 = g.res.stone; }
    if (t >= 15 && !builtAll) builtAll = g.buildings.every(b => b.build >= 1);
    boatsSeen = Math.max(boatsSeen, g.boats.length);
    raidersSeen = Math.max(raidersSeen, g.raiders.length);
    for (const r of g.raiders) {
      const d = Math.hypot(r.x - 12, r.y - 12);
      if (d < minKeepDist) minKeepDist = d;
    }
    // wall damage + scripted repair at dawn (models player upkeep)
    for (const w of placed.wall) if (!w.dead && w.hp < w.maxHp) wallDamagedSeen = true;
    if (lastPhase === 'night' && g.phase === 'day') {
      g.res.wood = Math.max(g.res.wood, 2000); g.res.stone = Math.max(g.res.stone, 2000); g.res.food = Math.max(g.res.food, 150);
      for (const w of placed.wall) if (!w.dead && w.hp < w.maxHp) { if (g.repairBuilding(w) && w.hp === w.maxHp) repairedOk = true; }
    }
    lastPhase = g.phase;
    if (steps % 200 === 0 && !nanAt) { const bad = scanNaN(g); if (bad) nanAt = bad + ' @t=' + t.toFixed(1); }
  }

  assert(builtAll, 'all placed buildings finished construction');
  assert(woodSnap1 !== null && woodSnap1 > woodSnap0, `villagers gather wood (${woodSnap0?.toFixed(1)} -> ${woodSnap1?.toFixed(1)} during day 1)`);
  assert(stoneSnap1 !== null && stoneSnap1 > stoneSnap0, `villagers gather stone (${stoneSnap0?.toFixed(1)} -> ${stoneSnap1?.toFixed(1)})`);
  assert(boatsSeen > 0, `raider boats approached (${boatsSeen} at once)`);
  assert(raidersSeen > 0, `raiders landed (${raidersSeen} at once)`);
  assert(minKeepDist < 6.5, `raiders pathed toward the keep (closest ${minKeepDist.toFixed(2)} tiles)`);
  assert(g.kills > 0, `towers/militia killed raiders (${g.kills} kills)`);
  assert(wallDamagedSeen, 'walls took damage during sieges');
  assert(repairedOk, 'damaged wall repaired back to full HP');
  assert(nanAt === null, 'no NaN in sim state' + (nanAt ? ' (found: ' + nanAt + ')' : ''));
  assert(g.state === 'running' && g.nightsSurvived >= 5, `survived 5 nights with defenses (nights=${g.nightsSurvived}, state=${g.state})`);
  console.log(`  info: steps=${steps}, kills=${g.kills}, villagers=${g.villagers.length}, buildings=${g.buildings.length}, score=${g.score()}`);
}

console.log('--- keep destruction triggers defeat ---');
{
  const g2 = new Game(777);
  g2.damageBuilding(g2.keep, 99999);
  assert(g2.state === 'defeat', 'destroying the keep sets state=defeat');
  g2.update(0.05); // must not throw / resurrect
  assert(g2.state === 'defeat', 'defeat state is stable after update');
}

console.log('--- sell / repair economics ---');
{
  const g3 = new Game(4242);
  g3.res.wood = 100; g3.res.stone = 100;
  const h = g3.tryPlace('house', 9, 9);
  assert(!!h && g3.res.wood === 70, 'placing house deducts cost');
  h.build = 1;
  g3.damageBuilding(h, 40);
  const rc = g3.repairCost(h);
  assert(rc.wood > 0, 'repair cost scales with damage');
  assert(g3.repairBuilding(h) && h.hp === h.maxHp, 'repair restores full HP');
  const woodBefore = g3.res.wood;
  assert(g3.sellBuilding(h) && g3.res.wood === woodBefore + Math.floor(30 * 0.6), 'sell refunds 60%');
  assert(g3.occ[9][9] === null, 'sold building frees its tile');
}

console.log('---------------------------------------------');
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
