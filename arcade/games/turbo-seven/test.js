#!/usr/bin/env node
/* Headless test suite for Turbo Seven.
   Extracts the inline <script> from index.html (single source of truth),
   loads the DOM-free sim core, and exercises it. */
'use strict';
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m){ console.error('FAIL: no <script> found'); process.exit(1); }
const tmp = path.join(dir, '.tmp-sim.js');
fs.writeFileSync(tmp, m[1]);
const sim = require(tmp);

let pass = 0, fail = 0;
function assert(cond, msg){
  if (cond){ pass++; console.log('  PASS ' + msg); }
  else { fail++; console.log('  FAIL ' + msg); }
}
function noNaN(race, label){
  for (const k of race.karts){
    for (const f of ['x','y','heading','speed','totalProg','lateral','centerDist','boostTimer','spinTimer','starTimer','driftCharge']){
      if (!isFinite(k[f])){ assert(false, label + ': ' + k.name + '.' + f + ' is not finite (' + k[f] + ')'); return; }
    }
  }
  assert(true, label + ': all kart state finite (no NaN)');
}
function followInput(race, k, extra){
  const geo = race.geo;
  const c = geo.pts[(k.progIdx + 12) % geo.n];
  const want = Math.atan2(c.y - k.y, c.x - k.x);
  const inp = { steer: sim.clamp(sim.angDiff(want, k.heading) * 2.5, -1, 1), accel: true };
  return Object.assign(inp, extra || {});
}
function skipCountdown(race){
  while (race.state === 'countdown') sim.stepRace(race, 1/60, {});
}

/* ---------- Test 1: full autopilot race on all 3 tracks ---------- */
console.log('\n[1] Full races (AI-bot drives player, 3 laps, all tracks)');
let onroadMax = 0;
for (let t = 0; t < 3; t++){
  const race = sim.createRace(t, { autopilot: true, seed: 7 + t });
  const p = race.karts[0];
  let steps = 0;
  const maxSteps = 600 * 60; // 600s sim cap
  while (race.state !== 'finished' && steps < maxSteps){
    sim.stepRace(race, 1/60, {});
    if (p.speed > onroadMax && !p.offroad) onroadMax = p.speed;
    steps++;
  }
  const name = sim.TRACKS[t].name;
  assert(p.lap >= 3, name + ': player completed 3 laps (lap=' + p.lap + ', t=' + (steps/60).toFixed(1) + 's)');
  assert(p.lapTimes.length === 3, name + ': 3 lap times recorded (' + p.lapTimes.map(x=>x.toFixed(1)).join(',') + ')');
  assert(p.lapTimes.every(lt => lt > 5 && lt < 120), name + ': lap times sane (5s..120s)');
  assert(race.karts.every(k => k.finished), name + ': all 8 karts finished');
  assert(race.finishCount === 8, name + ': finishCount === 8');
  const orders = race.karts.map(k => k.finishOrder).sort((a,b)=>a-b).join(',');
  assert(orders === '1,2,3,4,5,6,7,8', name + ': finish orders are 1..8 (' + orders + ')');
  noNaN(race, name);
}
console.log('  (onroad max speed observed: ' + onroadMax.toFixed(1) + ' u/s)');

/* ---------- Test 2: off-road slows karts ---------- */
console.log('\n[2] Off-road slowdown');
{
  const race = sim.createRace(0, { seed: 3 });
  skipCountdown(race);
  const k = race.karts[0];
  const geo = race.geo;
  // find a grass spot 140..180 units from centerline
  let spot = null;
  for (let i = 0; i < geo.n && !spot; i += 10){
    for (const side of [-1, 1]){
      const c = geo.pts[i];
      const x = c.x + c.nx * side * 160, y = c.y + c.ny * side * 160;
      if (x < 100 || y < 100 || x > 924 || y > 924) continue;
      const d = sim.findNearest(geo.pts, x, y).d;
      if (d >= 140 && d <= 180){ spot = { x, y }; break; }
    }
  }
  assert(!!spot, 'found grass test spot');
  k.x = spot.x; k.y = spot.y; k.speed = 0;
  sim.snapKart(geo, k);
  let offMax = 0, offFrames = 0, frames = 6 * 60;
  for (let f = 0; f < frames; f++){
    sim.stepRace(race, 1/60, { steer: 1, accel: true }); // circle in the grass
    if (k.offroad) offFrames++;
    if (f > frames / 2 && k.speed > offMax) offMax = k.speed;
  }
  assert(offFrames / frames > 0.8, 'kart flagged offroad (' + (100*offFrames/frames).toFixed(0) + '% of frames)');
  assert(offMax > 10, 'kart still moves offroad (max ' + offMax.toFixed(1) + ')');
  assert(offMax < 0.6 * onroadMax, 'offroad max ' + offMax.toFixed(1) + ' < 60% of onroad max ' + onroadMax.toFixed(1));
  noNaN(race, 'offroad test');
}

/* ---------- Test 3: drift mini-turbo boost adds speed ---------- */
console.log('\n[3] Drift mini-turbo');
{
  const race = sim.createRace(0, { seed: 4 });
  skipCountdown(race);
  const k = race.karts[0];
  const geo = race.geo;
  const c = geo.pts[40];
  k.x = c.x; k.y = c.y; k.heading = Math.atan2(c.dy, c.dx); k.speed = 145;
  sim.snapKart(geo, k);
  // engage drift manually with a full charge, then release
  k.drifting = true; k.driftDir = 1; k.driftCharge = sim.DRIFT_T2 + 0.5;
  sim.stepRace(race, 1/60, followInput(race, k, { drift: false }));
  assert(k.boostTimer > 0, 'releasing charged drift grants boost (boostTimer=' + k.boostTimer.toFixed(2) + ')');
  let boostedMax = 0;
  for (let f = 0; f < 60; f++){
    sim.stepRace(race, 1/60, followInput(race, k));
    if (k.speed > boostedMax) boostedMax = k.speed;
  }
  assert(boostedMax > sim.BASE_MAX * 1.15, 'boost pushes speed above normal cap (' + boostedMax.toFixed(1) + ' > ' + (sim.BASE_MAX*1.15).toFixed(1) + ')');
  // charge accumulation while drifting
  const race2 = sim.createRace(0, { seed: 5 });
  skipCountdown(race2);
  const k2 = race2.karts[0];
  const c2 = race2.geo.pts[40];
  k2.x = c2.x; k2.y = c2.y; k2.heading = Math.atan2(c2.dy, c2.dx); k2.speed = 145;
  sim.snapKart(race2.geo, k2);
  for (let f = 0; f < 45; f++) sim.stepRace(race2, 1/60, { steer: 1, accel: true, drift: true });
  assert(k2.driftCharge > 0.5, 'drift held with steer accumulates charge (' + k2.driftCharge.toFixed(2) + ')');
  noNaN(race, 'drift test');
}

/* ---------- Test 4: items affect targets ---------- */
console.log('\n[4] Items');
{
  // banana
  let race = sim.createRace(0, { seed: 6 });
  skipCountdown(race);
  let A = race.karts[0], B = race.karts[1];
  const geo = race.geo;
  let c = geo.pts[100];
  A.x = c.x; A.y = c.y; A.heading = Math.atan2(c.dy, c.dx); sim.snapKart(geo, A);
  A.item = 'banana';
  sim.useItem(race, A);
  const ban = race.entities.find(e => e.type === 'banana');
  assert(!!ban, 'banana entity dropped behind kart');
  ban.age = 1; // past owner grace period
  B.x = ban.x; B.y = ban.y; B.spinTimer = 0; B.starTimer = 0;
  sim.snapKart(geo, B);
  sim.stepRace(race, 1/60, {});
  assert(B.spinTimer > 0, 'banana spins the kart that hits it (spinTimer=' + B.spinTimer.toFixed(2) + ')');
  assert(!race.entities.some(e => e.type === 'banana'), 'banana consumed on hit');

  // mushroom
  race = sim.createRace(0, { seed: 8 });
  skipCountdown(race);
  A = race.karts[0];
  A.item = 'mushroom';
  sim.useItem(race, A);
  assert(A.boostTimer >= 1.4, 'mushroom grants boost (boostTimer=' + A.boostTimer.toFixed(2) + ')');

  // star: invincible + spins others on contact
  A.item = 'star';
  sim.useItem(race, A);
  assert(A.starTimer === 5, 'star grants 5s invincibility');
  B = race.karts[1];
  B.x = A.x + 5; B.y = A.y; B.spinTimer = 0; B.starTimer = 0;
  sim.snapKart(race.geo, B);
  sim.stepRace(race, 1/60, {});
  assert(B.spinTimer > 0, 'star contact spins other kart');
  A.x = race.geo.pts[200].x; A.y = race.geo.pts[200].y; sim.snapKart(race.geo, A); // separate again
  const st = A.spinTimer;
  assert(st === 0, 'starred kart itself not spun');

  // shell homes at the kart directly ahead
  race = sim.createRace(0, { seed: 9 });
  skipCountdown(race);
  sim.stepRace(race, 1/60, {}); // establish ranks
  A = race.karts[0];
  c = race.geo.pts[60];
  A.x = c.x; A.y = c.y; A.heading = Math.atan2(c.dy, c.dx); A.speed = 0; sim.snapKart(race.geo, A);
  // put target kart ~90 units ahead on the centerline
  B = race.karts.find(k => k.rank === A.rank - 1) || race.karts[1];
  const c2 = race.geo.pts[85];
  B.x = c2.x; B.y = c2.y; B.speed = 0; B.spinTimer = 0; B.starTimer = 0; sim.snapKart(race.geo, B);
  A.item = 'shell';
  sim.useItem(race, A);
  assert(race.entities.some(e => e.type === 'shell'), 'shell entity fired');
  let hit = false;
  for (let f = 0; f < 180 && !hit; f++){
    // freeze karts so the shell chase is deterministic
    for (const k of race.karts){ k.speed = 0; }
    sim.stepRace(race, 1/60, {});
    if (B.spinTimer > 0) hit = true;
  }
  assert(hit, 'shell hits and spins the kart ahead');
  noNaN(race, 'items test');
}

/* ---------- Test 5: checkpoint anti-cheat ---------- */
console.log('\n[5] Checkpoint anti-cheat');
{
  const race = sim.createRace(0, { seed: 10 });
  skipCountdown(race);
  const k = race.karts[0];
  const geo = race.geo;
  const lap0 = k.lap;
  // teleport straight to just before the finish line (skipping checkpoints)
  const c = geo.pts[geo.n - 20];
  k.x = c.x; k.y = c.y; k.heading = Math.atan2(c.dy, c.dx); k.speed = 140;
  sim.snapKart(geo, k);
  for (let f = 0; f < 120; f++) sim.stepRace(race, 1/60, followInput(race, k));
  assert(k.lap === lap0, 'crossing line without checkpoints does NOT count a lap (lap=' + k.lap + ')');
}

/* ---------- Test 6: mode-7 scanline benchmark (node approximation) ---------- */
console.log('\n[6] Mode-7 scanline benchmark');
{
  const MAPW = 1024;
  const tex = new Uint32Array(MAPW * MAPW);
  for (let i = 0; i < tex.length; i++) tex[i] = (i * 2654435761) >>> 0;
  const IW = 640, IH = 360, HORIZON = Math.round(IH * 0.36), H = IH - HORIZON;
  const focal = IH * 0.85, CAMH = 26;
  const buf = new Uint32Array(IW * H);
  let camX = 512, camY = 512, yaw = 0;
  const t0 = process.hrtime.bigint();
  const FRAMES = 300;
  for (let fidx = 0; fidx < FRAMES; fidx++){
    yaw += 0.01; camX += 0.5;
    const fx = Math.cos(yaw), fy = Math.sin(yaw), rx = -fy, ry = fx, cx = IW / 2;
    for (let row = 0; row < H; row++){
      const dy = row + 1;
      const dist = CAMH * focal / dy;
      const o = row * IW;
      if (dist > 2600){ for (let x = 0; x < IW; x++) buf[o + x] = 0xff000000; continue; }
      const rs = dist / focal;
      let wx = camX + fx * dist - rx * cx * rs;
      let wy = camY + fy * dist - ry * cx * rs;
      const sx = rx * rs, sy = ry * rs;
      for (let x = 0; x < IW; x++){
        buf[o + x] = tex[(((wy | 0) & 1023) << 10) | ((wx | 0) & 1023)];
        wx += sx; wy += sy;
      }
    }
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / FRAMES;
  console.log('  ' + IW + 'x' + IH + ' internal res, ' + H + ' scanlines: ' + ms.toFixed(2) + ' ms/frame (' + FRAMES + ' frames)');
  assert(ms < 16, 'scanline fill well under a 60fps frame budget (' + ms.toFixed(2) + 'ms < 16ms)');
}

fs.unlinkSync(tmp);
console.log('\n==== ' + pass + ' passed, ' + fail + ' failed ====');
process.exit(fail ? 1 : 0);
