/* ============================================================
 * ENGINE — world generation and simulation. No rendering here.
 *
 * "Eaters" are the player hole and any AI rival holes: they all
 * swallow with the same rules. Entities physically tip over the
 * rim and spiral down into whichever eater captured them (e.sink).
 * ============================================================ */

// Deterministic RNG so a level's seed always produces the same map.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function dist(x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

/* Water test: lakes are circles, the river is a band across the map.
 * Roads crossing the river count as bridges (walkable/drivable). */
function inWaterAt(water, roads, x, y) {
  if (water.river) {
    const rv = water.river;
    const p = rv.axis === 'v' ? x : y;
    if (Math.abs(p - rv.pos) < rv.w / 2) {
      const cross = rv.axis === 'v' ? roads.ys : roads.xs;
      const q = rv.axis === 'v' ? y : x;
      const half = roads.width / 2 + 14;
      if (!cross.some(c => Math.abs(q - c) < half)) return true;
    }
  }
  for (const L of water.lakes) {
    if (dist(x, y, L.x, L.y) < L.r) return true;
  }
  return false;
}

/* ---------------- World generation ---------------- */

function buildWorld(levelIndex) {
  // Accepts a LEVELS index or a level object (e.g. ENDLESS_LEVEL).
  const level = typeof levelIndex === 'object' ? levelIndex : LEVELS[levelIndex];
  const rng = mulberry32(level.seed || (levelIndex + 1) * 7919);
  const W = level.width, H = level.height;
  const F = level.features || {};

  // --- Roads ---
  const roads = { xs: [], ys: [], width: level.roadWidth || 46 };
  const spacing = level.roadSpacing || 0;
  if (spacing > 0) {
    for (let x = spacing; x < W - spacing * 0.4; x += spacing) roads.xs.push(x);
    for (let y = spacing; y < H - spacing * 0.4; y += spacing) roads.ys.push(y);
  }

  const nearRoad = (x, y, r) => {
    const half = roads.width / 2 + r;
    return roads.xs.some(rx => Math.abs(x - rx) < half) ||
           roads.ys.some(ry => Math.abs(y - ry) < half);
  };

  // --- Water ---
  const water = { lakes: [], river: null };
  if (F.river && (roads.xs.length || roads.ys.length)) {
    // A vertical band if horizontal roads exist to bridge it, else horizontal.
    const axis = roads.ys.length ? 'v' : 'h';
    const span = axis === 'v' ? W : H;
    const lanes = axis === 'v' ? roads.xs : roads.ys;
    for (let tries = 0; tries < 30; tries++) {
      const pos = span * (0.28 + rng() * 0.44);
      const w = 85;
      if (Math.abs(pos - span / 2) < 200) continue; // keep the spawn area dry
      if (lanes.some(l => Math.abs(l - pos) < w / 2 + roads.width / 2 + 30)) continue;
      water.river = { axis, pos, w };
      break;
    }
  }
  for (let i = 0; i < (F.lakes || 0); i++) {
    for (let tries = 0; tries < 30; tries++) {
      const r = 75 + rng() * 75;
      const x = r + 60 + rng() * (W - r * 2 - 120);
      const y = r + 60 + rng() * (H - r * 2 - 120);
      if (dist(x, y, W / 2, H / 2) < 260 + r) continue;
      if (nearRoad(x, y, r + 20)) continue;
      if (water.river && Math.abs((water.river.axis === 'v' ? x : y) - water.river.pos) < r + water.river.w / 2 + 40) continue;
      if (water.lakes.some(L => dist(x, y, L.x, L.y) < r + L.r + 50)) continue;
      water.lakes.push({ x, y, r });
      break;
    }
  }
  const wet = (x, y) => inWaterAt(water, roads, x, y);

  // --- Entities ---
  const entities = [];
  let nextId = 1;

  const overlaps = (x, y, r, factor) =>
    entities.some(e => dist(x, y, e.x, e.y) < (r + e.r) * (factor || CONFIG.game.overlapFactor));

  function makeEntity(type, x, y) {
    const def = OBJECT_TYPES[type];
    const e = {
      id: nextId++,
      type, def,
      x, y,
      r: def.r * (0.9 + rng() * 0.2),
      rot: 0,
      seed: rng(), // per-entity visual variation (color pick, etc.)
      state: 'idle', // idle | falling | gone
      depth: 0,      // 0..1 how far it has sunk
      sink: null,    // which eater it's falling into
      fvx: 0, fvy: 0, spin: 0, // fall physics
      tiltK: 0, tiltA: 0,      // rim-tipping visual
      vx: 0, vy: 0,
      moveTimer: 0,
      golden: false,
    };
    if (def.points >= 5 && !def.hazard && !def.powerup && rng() < CONFIG.game.goldenChance) {
      e.golden = true; // worth goldenMult × points, sparkles
    }
    return e;
  }

  function placeAt(type, x, y, opts) {
    const def = OBJECT_TYPES[type];
    const o = opts || {};
    const margin = def.r + 16;
    if (x < margin || x > W - margin || y < margin || y > H - margin) return null;
    if (!o.skipCenter && dist(x, y, W / 2, H / 2) < 150 + def.r) return null;
    if (wet(x, y) || wet(x + def.r * 0.7, y) || wet(x - def.r * 0.7, y) || wet(x, y + def.r * 0.7) || wet(x, y - def.r * 0.7)) return null;
    if (def.r >= 28 && !o.onRoadOk && nearRoad(x, y, def.r * 0.8)) return null;
    if (def.r < 28 && !o.onRoadOk && nearRoad(x, y, -def.r * 0.4)) return null;
    if (overlaps(x, y, def.r, o.factor)) return null;
    const e = makeEntity(type, x, y);
    e.rot = o.rot !== undefined ? o.rot : rng() * Math.PI * 2;
    if (['house', 'building', 'tower', 'kiosk', 'bench', 'table', 'flowerbed'].includes(def.draw) && o.rot === undefined) {
      e.rot = Math.floor(rng() * 4) * Math.PI / 2;
    }
    if (def.mover === 'walk') {
      const a = rng() * Math.PI * 2;
      e.vx = Math.cos(a) * def.speed;
      e.vy = Math.sin(a) * def.speed;
      e.moveTimer = 1 + rng() * 3;
    }
    entities.push(e);
    return e;
  }

  function placeScattered(type, count) {
    const def = OBJECT_TYPES[type];
    for (let i = 0; i < count; i++) {
      for (let tries = 0; tries < 70; tries++) {
        const margin = def.r + 20;
        const x = margin + rng() * (W - margin * 2);
        const y = margin + rng() * (H - margin * 2);
        if (placeAt(type, x, y)) break;
      }
    }
  }

  // Cars & buses snap to roads (when roads exist) and optionally drive.
  function placeVehicle(type, count, moving) {
    const def = OBJECT_TYPES[type];
    for (let i = 0; i < count; i++) {
      for (let tries = 0; tries < 60; tries++) {
        let x, y, rot, axis;
        if (roads.xs.length + roads.ys.length > 0) {
          const vertical = rng() < roads.xs.length / (roads.xs.length + roads.ys.length);
          const lane = (rng() < 0.5 ? -1 : 1) * roads.width * 0.22;
          if (vertical) {
            x = roads.xs[Math.floor(rng() * roads.xs.length)] + lane;
            y = def.r + 30 + rng() * (H - def.r * 2 - 60);
            rot = lane < 0 ? Math.PI / 2 : -Math.PI / 2;
            axis = 'y';
          } else {
            y = roads.ys[Math.floor(rng() * roads.ys.length)] + lane;
            x = def.r + 30 + rng() * (W - def.r * 2 - 60);
            rot = lane < 0 ? Math.PI : 0;
            axis = 'x';
          }
        } else {
          x = def.r + 20 + rng() * (W - def.r * 2 - 40);
          y = def.r + 20 + rng() * (H - def.r * 2 - 40);
          rot = rng() * Math.PI * 2;
          axis = null;
        }
        if (dist(x, y, W / 2, H / 2) < 150 + def.r) continue;
        if (overlaps(x, y, def.r)) continue;
        const e = makeEntity(type, x, y);
        e.rot = rot;
        if (moving && axis && rng() < 0.65) {
          e.driveAxis = axis;
          const dirSign = axis === 'y' ? (Math.sin(rot) > 0 ? 1 : -1) : (Math.cos(rot) > 0 ? 1 : -1);
          e.vx = axis === 'x' ? dirSign * def.speed : 0;
          e.vy = axis === 'y' ? dirSign * def.speed : 0;
        }
        entities.push(e);
        break;
      }
    }
  }

  // --- Structured clusters (density with shape) ---
  const deco = { plazas: [], borderTrees: [] };
  const CF = CONFIG.game.clusterOverlap;

  function clusterCenter(clearR) {
    for (let tries = 0; tries < 40; tries++) {
      const x = clearR + 40 + rng() * (W - clearR * 2 - 80);
      const y = clearR + 40 + rng() * (H - clearR * 2 - 80);
      if (dist(x, y, W / 2, H / 2) < 220 + clearR) continue;
      if (nearRoad(x, y, clearR * 0.55)) continue;
      if (wet(x, y) || wet(x + clearR * 0.7, y) || wet(x - clearR * 0.7, y) || wet(x, y + clearR * 0.7) || wet(x, y - clearR * 0.7)) continue;
      return { x, y };
    }
    return null;
  }

  for (let i = 0; i < (F.forests || 0); i++) {
    const c = clusterCenter(140);
    if (!c) continue;
    for (let j = 0; j < 11; j++) {
      const a = rng() * Math.PI * 2, d = rng() * 130;
      placeAt('tree', c.x + Math.cos(a) * d, c.y + Math.sin(a) * d, { factor: CF });
    }
    for (let j = 0; j < 5; j++) {
      const a = rng() * Math.PI * 2, d = 40 + rng() * 120;
      placeAt('bush', c.x + Math.cos(a) * d, c.y + Math.sin(a) * d, { factor: CF });
    }
  }

  for (let i = 0; i < (F.crowds || 0); i++) {
    const c = clusterCenter(90);
    if (!c) continue;
    for (let j = 0; j < 11; j++) {
      const a = rng() * Math.PI * 2, d = rng() * 85;
      placeAt('person', c.x + Math.cos(a) * d, c.y + Math.sin(a) * d, { factor: CF });
    }
  }

  for (let i = 0; i < (F.parkingLots || 0); i++) {
    const c = clusterCenter(150);
    if (!c) continue;
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 5; col++) {
        placeAt('car', c.x + (col - 2) * 56, c.y + (row - 0.5) * 62, { factor: CF, rot: Math.PI / 2 });
      }
    }
  }

  for (let i = 0; i < (F.plazas || 0); i++) {
    const c = clusterCenter(160);
    if (!c) continue;
    deco.plazas.push({ x: c.x, y: c.y, r: 150 });
    placeAt('fountain', c.x, c.y, { factor: CF, skipCenter: true });
    for (let j = 0; j < 6; j++) {
      const a = (j / 6) * Math.PI * 2 + rng();
      placeAt('bench', c.x + Math.cos(a) * 78, c.y + Math.sin(a) * 78, { factor: CF, rot: a + Math.PI / 2 });
      placeAt('person', c.x + Math.cos(a + 0.5) * 115, c.y + Math.sin(a + 0.5) * 115, { factor: CF });
    }
    for (let j = 0; j < 3; j++) {
      const a = rng() * Math.PI * 2;
      placeAt('flowerbed', c.x + Math.cos(a) * 130, c.y + Math.sin(a) * 130, { factor: CF });
    }
  }

  // --- Scattered spawns, largest first so big footprints find room ---
  const types = Object.keys(level.spawns).sort((a, b) => OBJECT_TYPES[b].r - OBJECT_TYPES[a].r);
  for (const type of types) {
    if (OBJECT_TYPES[type].mover === 'drive') placeVehicle(type, level.spawns[type], !!level.movingCars);
    else placeScattered(type, level.spawns[type]);
  }

  // --- Decorative tree line around the map edge ---
  const step = 105;
  for (let x = step / 2; x < W; x += step) {
    for (const y of [-26, H + 26]) {
      const cx = Math.min(W, Math.max(0, x)), cy = Math.min(H, Math.max(0, y));
      if (!wet(cx, cy)) deco.borderTrees.push({ x: x + (rng() - 0.5) * 40, y: y + (rng() - 0.5) * 16, r: 16 + rng() * 14, seed: rng() });
    }
  }
  for (let y = step / 2; y < H; y += step) {
    for (const x of [-26, W + 26]) {
      const cx = Math.min(W, Math.max(0, x)), cy = Math.min(H, Math.max(0, y));
      if (!wet(cx, cy)) deco.borderTrees.push({ x: x + (rng() - 0.5) * 16, y: y + (rng() - 0.5) * 40, r: 16 + rng() * 14, seed: rng() });
    }
  }

  // --- AI rival holes spawn near the corners, away from the player ---
  const rivals = [];
  const corners = [[0.15, 0.15], [0.85, 0.85], [0.85, 0.15], [0.15, 0.85]];
  function makeRival(style, x, y, r, speedMult) {
    return {
      isRival: true, style, x, y, r, speedMult,
      dead: false, respawnT: 0,
      thinkT: 0, mode: 'wander', target: null, dirX: 0, dirY: 0,
      stuckT: 0, lastX: 0, lastY: 0, huntCd: 0,
    };
  }
  const rivalCount = Math.min(level.rivals || 0, RIVAL_STYLES.length, corners.length);
  for (let i = 0; i < rivalCount; i++) {
    rivals.push(makeRival(RIVAL_STYLES[i], W * corners[i][0], H * corners[i][1],
      CONFIG.hole.startRadius, level.rivalSpeed || 0.92));
  }
  if (level.boss) {
    const b = makeRival(BOSS_STYLE, W * 0.85, H * 0.85, CONFIG.hole.startRadius * 3.2, 0.85);
    b.isBoss = true;
    rivals.push(b);
  }

  // --- Scoring ---
  const totalPoints = entities.reduce((s, e) => s + e.def.points * (e.golden ? CONFIG.game.goldenMult : 1), 0);
  const fracs = level.starFracs || CONFIG.game.starFracs;
  const rivalDiscount = Math.max(0.5, 1 - rivals.length * CONFIG.game.rivalStarDiscount);
  const starScores = fracs.map(f => Math.round(totalPoints * f * rivalDiscount / 10) * 10);

  // --- Prey-unlock announcements: size thresholds for types on this map ---
  const preySizes = [...new Set(
    entities.filter(e => e.def.points > 0).map(e => e.def.r)
  )].sort((a, b) => a - b);

  return {
    level, levelIndex,
    theme: THEMES[level.theme] || THEMES.city,
    W, H, roads, water, deco, entities, rivals,
    // In Reversal mode there is no player hole — park it far off-map so
    // rival AI never reacts to it and it never renders in view.
    hole: level.reversal
      ? { isPlayer: true, x: -99999, y: -99999, r: 1 }
      : { isPlayer: true, x: W / 2, y: H / 2, r: CONFIG.hole.startRadius },
    reversal: !!level.reversal,
    buildPts: 60,
    initialPts: totalPoints,
    remainFrac: 1,
    fracAcc: 0,
    score: 0,
    time: level.time,
    t: 0,               // elapsed time (drives animations)
    starScores,
    starsHit: 0,
    combo: { count: 0, timer: 0 },
    boosts: { speed: 0, magnet: 0, x2: 0 },
    fever: false,
    trailAcc: 0,
    eatenByType: {},
    goal: level.reversal ? { type: 'reversal' } : level.endless ? { type: 'endless' } : (level.goal || { type: 'score3' }),
    goalDone: false,
    endless: !!level.endless,
    spawnAcc: 0, rivalAcc: 0, rivalJoins: 0,
    initialCount: entities.filter(e => !e.def.hazard && !e.def.powerup).length,
    maxSize: 1,
    introT: 1.6,        // cinematic fly-over before play starts
    preySizes,
    graceT: 1.5,        // spawn protection from rivals
    popups: [],
    particles: [],
    idleCount: entities.filter(e => !e.def.hazard && !e.def.powerup).length,
    over: false,
    cleared: false,
    endDelay: 0,
  };
}

/* ---------------- Goal helpers ---------------- */

function goalMet(world) {
  const g = world.goal;
  if (g.type === 'size') return world.hole.r >= CONFIG.hole.startRadius * g.value;
  if (g.type === 'eatType') return (world.eatenByType[g.obj] || 0) >= g.count;
  if (g.type === 'score3') return world.starsHit >= 3;
  if (g.type === 'boss') return world.rivals.some(r => r.isBoss && r.dead);
  return false; // 'clear' is handled by the all-clear check, 'endless' never ends
}

function goalText(world) {
  const g = world.goal;
  const s0 = CONFIG.hole.startRadius;
  if (g.type === 'size') {
    const cur = world.hole.r / s0;
    return `🎯 Grow to ×${g.value} (now ×${cur.toFixed(1)})`;
  }
  if (g.type === 'eatType') {
    const label = (OBJECT_TYPES[g.obj] && OBJECT_TYPES[g.obj].label) || g.obj;
    return `🎯 Eat ${g.count} ${label} (${world.eatenByType[g.obj] || 0}/${g.count})`;
  }
  if (g.type === 'clear') return `🎯 Eat everything (${world.idleCount} left)`;
  if (g.type === 'boss') {
    const boss = world.rivals.find(r => r.isBoss);
    if (boss && !boss.dead) return `👑 Eat GOLIATH (you ×${(world.hole.r / s0).toFixed(1)} vs him ×${(boss.r / s0).toFixed(1)})`;
    return '👑 GOLIATH is down!';
  }
  if (g.type === 'endless') return `∞ Endless — size ×${(world.hole.r / s0).toFixed(1)}`;
  if (g.type === 'reversal') return `🏙 City ${(world.remainFrac * 100).toFixed(0)}% · ⚒ ${Math.floor(world.buildPts)}`;
  return `🎯 Reach ${world.starScores[2]} pts`;
}

/* ---------------- Reversal mode: player places, holes eat ---------------- */

const REVERSAL_ITEMS = {
  bait:  { cost: 25, type: 'kiosk', golden: true, hint: 'Irresistible — lures holes away' },
  bomb:  { cost: 20, type: 'bomb', hint: 'Shrinks whatever swallows it' },
  tower: { cost: 60, type: 'tower', hint: 'Too big to eat (for a while)' },
};

function placeReversalItem(world, kind, x, y) {
  const it = REVERSAL_ITEMS[kind];
  if (!it || world.buildPts < it.cost) return false;
  const def = OBJECT_TYPES[it.type];
  if (x < def.r || x > world.W - def.r || y < def.r || y > world.H - def.r) return false;
  if (inWaterAt(world.water, world.roads, x, y)) return false;
  if (world.entities.some(e => e.state === 'idle' && dist(x, y, e.x, e.y) < (def.r + e.r) * 0.55)) return false;
  if (world.rivals.some(r => !r.dead && dist(x, y, r.x, r.y) < r.r + def.r)) return false;
  world.entities.push({
    id: Math.floor(Math.random() * 1e9),
    type: it.type, def, x, y,
    r: def.r,
    rot: Math.random() * Math.PI * 2,
    seed: Math.random(),
    state: 'idle', depth: 0, sink: null,
    fvx: 0, fvy: 0, spin: 0, tiltK: 0, tiltA: 0,
    vx: 0, vy: 0, moveTimer: 0,
    golden: !!it.golden,
    placed: true, // player-built: not part of the city being defended
  });
  world.buildPts -= it.cost;
  spawnBurst(world, x, y, '#7dd3fc', 10, 150, 4);
  return true;
}

function cityRemaining(world) {
  let pts = 0;
  for (const e of world.entities) {
    if (e.state === 'gone' || e.placed || e.def.hazard || e.def.powerup) continue;
    pts += e.def.points * (e.golden ? CONFIG.game.goldenMult : 1);
  }
  return world.initialPts > 0 ? pts / world.initialPts : 0;
}

/* ---------------- FX helpers ---------------- */

function spawnBurst(world, x, y, color, n, speed, size) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = speed * (0.4 + Math.random() * 0.6);
    world.particles.push({
      x, y,
      vx: Math.cos(a) * v, vy: Math.sin(a) * v,
      t: 0, life: 0.35 + Math.random() * 0.35,
      size: size * (0.6 + Math.random() * 0.8),
      color,
    });
  }
}

function updateFx(world, dt) {
  if (world.holePulse > 0) world.holePulse = Math.max(0, world.holePulse - dt * 3.5);
  for (const p of world.popups) p.t += dt;
  world.popups = world.popups.filter(p => p.t < 1);
  for (const p of world.particles) {
    p.t += dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 1 - dt * 4;
    p.vy *= 1 - dt * 4;
  }
  world.particles = world.particles.filter(p => p.t < p.life);
}

/* ---------------- Swallow resolution ---------------- */

function comboMult(count) {
  const G = CONFIG.game;
  return 1 + Math.min(G.comboMaxBonus, Math.max(0, count - 1) * G.comboStep);
}

function resolveSwallow(world, e, eater, events) {
  e.state = 'gone';
  const C = CONFIG.hole;
  const G = CONFIG.game;
  const maxR = Math.min(world.W, world.H) * C.maxRadiusFrac;

  if (e.def.hazard) {
    // Bomb: the eater shrinks instead of growing.
    eater.r = Math.max(C.startRadius * 0.8, eater.r * (1 - G.bombShrink));
    spawnBurst(world, eater.x, eater.y, '#ff8c42', 22, 260, 7);
    spawnBurst(world, eater.x, eater.y, '#ffd166', 12, 180, 5);
    if (eater.isPlayer) {
      world.combo.count = 0;
      world.combo.timer = 0;
      world.popups.push({ x: eater.x, y: eater.y - eater.r, txt: 'BOOM!', t: 0, color: '#ff8c42' });
      events.push({ type: 'bomb' });
    } else {
      world.popups.push({ x: eater.x, y: eater.y - eater.r, txt: `${eater.style.name} BOOM!`, t: 0, color: '#ff8c42' });
      events.push({ type: 'rivalBomb', name: eater.style.name });
    }
    return;
  }

  if (e.def.powerup) {
    if (eater.isPlayer) {
      const P = e.def.powerup;
      if (P === 'clock') {
        world.time += G.clockPlus;
        world.popups.push({ x: eater.x, y: eater.y - eater.r, txt: `+${G.clockPlus}s`, t: 0, color: e.def.puColor });
      } else {
        world.boosts[P] = G.powerupDur[P];
      }
      spawnBurst(world, eater.x, eater.y, e.def.puColor, 16, 220, 5);
      events.push({ type: 'powerup', kind: P });
    }
    return; // power-ups grant no growth or points
  }

  const wasCapture = eater.r * C.captureRatio; // for prey-unlock check below
  const gf = C.growthFactor * (eater.isPlayer ? 1 : eater.isBoss ? G.bossGrowthMult : G.rivalGrowthMult);
  eater.r = Math.min(maxR, Math.sqrt(eater.r * eater.r + gf * e.r * e.r));

  if (eater.isPlayer) {
    world.holePulse = 1; // rim puffs up on every gulp
    world.combo.count++;
    world.combo.timer = G.comboWindow;
    if (!world.fever && world.combo.count >= G.feverCombo) {
      world.fever = true;
      events.push({ type: 'feverStart' });
    }
    const golden = e.golden ? G.goldenMult : 1;
    const x2 = world.boosts.x2 > 0 ? 2 : 1;
    const fever = world.fever ? G.feverScoreMult : 1;
    const pts = Math.round(e.def.points * golden * comboMult(world.combo.count) * x2 * fever);
    world.score += pts;
    world.eatenByType[e.type] = (world.eatenByType[e.type] || 0) + 1;
    world.popups.push({
      x: eater.x, y: eater.y - eater.r,
      txt: (e.golden ? '★' : '') + '+' + pts, t: 0,
      color: e.golden ? '#ffd700' : x2 > 1 || comboMult(world.combo.count) > 1 ? '#ffd166' : '#ffffff',
    });
    spawnBurst(world, e.x, e.y, e.golden ? '#ffd700' : '#ffffff', e.golden ? 14 : 5, 140, 3);
    events.push({ type: 'swallow', size: e.r });
    if (e.golden) events.push({ type: 'golden' });

    // New prey category unlocked by this growth?
    for (const pr of world.preySizes) {
      if (pr > wasCapture && pr <= eater.r * C.captureRatio) {
        const t = Object.values(OBJECT_TYPES).find(d => d.r === pr && d.points > 0);
        if (t) events.push({ type: 'preyUnlock', label: t.label || 'new prey' });
        break; // announce at most one per swallow
      }
    }
  }
}

/* ---------------- Movement with water blocking ---------------- */

function tryMove(world, h, nx, ny) {
  nx = Math.max(h.r * 0.6, Math.min(world.W - h.r * 0.6, nx));
  ny = Math.max(h.r * 0.6, Math.min(world.H - h.r * 0.6, ny));
  const wet = (x, y) => inWaterAt(world.water, world.roads, x, y);
  if (!wet(nx, ny)) { h.x = nx; h.y = ny; return true; }
  if (!wet(nx, h.y)) { h.x = nx; return true; } // slide along the shore
  if (!wet(h.x, ny)) { h.y = ny; return true; }
  return false;
}

/* ---------------- Rival AI ---------------- */

function respawnSpot(world, awayFrom, minDist) {
  for (let tries = 0; tries < 30; tries++) {
    const x = 80 + Math.random() * (world.W - 160);
    const y = 80 + Math.random() * (world.H - 160);
    if (inWaterAt(world.water, world.roads, x, y)) continue;
    if (awayFrom.every(a => dist(x, y, a.x, a.y) > minDist)) return { x, y };
  }
  return { x: world.W / 2, y: world.H / 2 };
}

function updateRival(world, rv, dt, events) {
  const C = CONFIG.hole;
  const hole = world.hole;

  if (rv.dead) {
    if (rv.isBoss) return; // the boss stays down
    rv.respawnT -= dt;
    if (rv.respawnT <= 0) {
      const spot = respawnSpot(world, [hole], 500);
      rv.x = spot.x; rv.y = spot.y;
      rv.r = C.startRadius;
      rv.dead = false;
      rv.mode = 'wander';
      spawnBurst(world, rv.x, rv.y, rv.style.rim, 14, 180, 5);
    }
    return;
  }
  if (rv.huntCd > 0) rv.huntCd -= dt;

  rv.thinkT -= dt;
  if (rv.thinkT <= 0) {
    rv.thinkT = 0.35 + Math.random() * 0.4;
    const dPlayer = dist(rv.x, rv.y, hole.x, hole.y);
    const wasMode = rv.mode;
    const chaseChance = rv.isBoss ? 0.85 : 0.6;
    const chaseDist = rv.isBoss ? 800 : 520;

    if (!rv.isBoss && hole.r >= rv.r * CONFIG.game.holeEatRatio && dPlayer < 340) {
      rv.mode = 'flee'; // the boss never runs
      const a = Math.atan2(rv.y - hole.y, rv.x - hole.x) + (Math.random() - 0.5) * 0.8;
      rv.dirX = Math.cos(a); rv.dirY = Math.sin(a);
    } else if (rv.r >= hole.r * CONFIG.game.holeEatRatio && dPlayer < chaseDist && world.graceT <= 0 && Math.random() < chaseChance) {
      rv.mode = 'chase'; // hunt the player!
      if (wasMode !== 'chase' && rv.huntCd <= 0) {
        rv.huntCd = 8;
        events.push({ type: 'hunted', name: rv.style.name });
      }
    } else {
      // Pick a target: usually the tastiest (value vs distance), but
      // rivals aren't perfect — sometimes they grab whatever's around.
      const edible = [];
      let best = null, bestScore = -1;
      for (const e of world.entities) {
        if (e.state !== 'idle' || e.def.hazard || e.def.powerup) continue;
        if (e.r > rv.r * C.captureRatio) continue;
        const d = dist(rv.x, rv.y, e.x, e.y);
        if (d < 700) edible.push(e);
        // golden prey and player-placed bait are extra tempting
        const worth = e.def.points * (e.golden ? CONFIG.game.goldenMult : 1) * (e.placed ? 3 : 1);
        const s = worth / (80 + d);
        if (s > bestScore) { bestScore = s; best = e; }
      }
      if (Math.random() > CONFIG.game.rivalGreed && edible.length) {
        best = edible[Math.floor(Math.random() * edible.length)];
      }
      if (best) { rv.mode = 'eat'; rv.target = best; }
      else {
        rv.mode = 'wander';
        const a = Math.random() * Math.PI * 2;
        rv.dirX = Math.cos(a); rv.dirY = Math.sin(a);
      }
    }
  }

  // Steer per-frame based on mode.
  let dx = rv.dirX, dy = rv.dirY;
  if (rv.mode === 'eat') {
    if (!rv.target || rv.target.state !== 'idle') { rv.thinkT = 0; dx = dy = 0; }
    else { dx = rv.target.x - rv.x; dy = rv.target.y - rv.y; }
  } else if (rv.mode === 'chase') {
    if (rv.r < hole.r * CONFIG.game.holeEatRatio) rv.thinkT = 0; // lost the size edge
    dx = hole.x - rv.x; dy = hole.y - rv.y;
  }
  const len = Math.hypot(dx, dy);
  if (len > 1) {
    const speed = C.baseSpeed * rv.speedMult * Math.pow(C.startRadius / rv.r, C.sizeSlowdown);
    const beforeX = rv.x, beforeY = rv.y;
    tryMove(world, rv, rv.x + (dx / len) * speed * dt, rv.y + (dy / len) * speed * dt);
    // Stuck against water/edge? Give up on this target and wander off.
    const moved = dist(beforeX, beforeY, rv.x, rv.y);
    if (moved < speed * dt * 0.3) {
      rv.stuckT += dt;
      if (rv.stuckT > 0.7) {
        rv.stuckT = 0;
        rv.mode = 'wander';
        rv.thinkT = 0.8;
        const a = Math.random() * Math.PI * 2;
        rv.dirX = Math.cos(a); rv.dirY = Math.sin(a);
      }
    } else rv.stuckT = 0;
  }
}

/* ---------------- Endless mode helpers ---------------- */

function endlessRespawn(world) {
  const E = CONFIG.game.endless;
  // weighted type pool from the level's spawn table
  const pool = [];
  for (const [t, c] of Object.entries(world.level.spawns)) {
    for (let i = 0; i < c; i++) pool.push(t);
  }
  let placed = 0;
  for (let tries = 0; tries < 80 && placed < E.spawnBatch; tries++) {
    const type = pool[Math.floor(Math.random() * pool.length)];
    const def = OBJECT_TYPES[type];
    const m = def.r + 20;
    const x = m + Math.random() * (world.W - m * 2);
    const y = m + Math.random() * (world.H - m * 2);
    if (dist(x, y, world.hole.x, world.hole.y) < 420 + def.r) continue; // never pop in on-screen
    if (inWaterAt(world.water, world.roads, x, y)) continue;
    if (world.entities.some(e => e.state === 'idle' && dist(x, y, e.x, e.y) < (def.r + e.r) * 0.8)) continue;
    const e = {
      id: Math.floor(Math.random() * 1e9),
      type, def, x, y,
      r: def.r * (0.9 + Math.random() * 0.2),
      rot: Math.random() * Math.PI * 2,
      seed: Math.random(),
      state: 'idle', depth: 0, sink: null,
      fvx: 0, fvy: 0, spin: 0, tiltK: 0, tiltA: 0,
      vx: 0, vy: 0, moveTimer: 0,
      golden: def.points >= 5 && !def.hazard && !def.powerup && Math.random() < CONFIG.game.goldenChance,
    };
    if (def.mover === 'walk') {
      const a = Math.random() * Math.PI * 2;
      e.vx = Math.cos(a) * def.speed;
      e.vy = Math.sin(a) * def.speed;
      e.moveTimer = 1 + Math.random() * 3;
    }
    world.entities.push(e);
    if (!def.hazard && !def.powerup) world.idleCount++;
    spawnBurst(world, x, y, '#ffffff', 5, 80, 3);
    placed++;
  }
}

function endlessRivalJoin(world, events) {
  const style = RIVAL_STYLES[world.rivalJoins % RIVAL_STYLES.length];
  world.rivalJoins++;
  const spot = respawnSpot(world, [world.hole], 600);
  world.rivals.push({
    isRival: true, style,
    x: spot.x, y: spot.y,
    r: Math.max(CONFIG.hole.startRadius, world.hole.r * 0.75),
    speedMult: 0.95,
    dead: false, respawnT: 0,
    thinkT: 0, mode: 'wander', target: null, dirX: 0, dirY: 0,
    stuckT: 0, lastX: 0, lastY: 0, huntCd: 0,
  });
  spawnBurst(world, spot.x, spot.y, style.rim, 20, 220, 6);
  events.push({ type: 'rivalJoin', name: style.name });
}

/* ---------------- Simulation ----------------
 * dir: {x, y, mag} normalized input direction + magnitude 0..1
 * Returns a list of events for main.js (audio / shake / banners).
 */
function updateWorld(world, dt, dir) {
  const events = [];
  updateFx(world, dt); // popups/particles keep animating even during the end delay
  if (world.over) {
    world.endDelay -= dt;
    return events;
  }

  const hole = world.hole;
  const C = CONFIG.hole;
  const G = CONFIG.game;
  world.t += dt;
  if (world.graceT > 0) world.graceT -= dt;

  // Boost + combo timers
  for (const k of ['speed', 'magnet', 'x2']) {
    if (world.boosts[k] > 0) world.boosts[k] = Math.max(0, world.boosts[k] - dt);
  }
  if (world.combo.timer > 0) {
    world.combo.timer -= dt;
    if (world.combo.timer <= 0) {
      world.combo.count = 0;
      if (world.fever) {
        world.fever = false;
        events.push({ type: 'feverEnd' });
      }
    }
  }

  // --- Move the player hole (not in Reversal — there is no player hole) ---
  if (!world.reversal) {
    let speed = C.baseSpeed * Math.pow(C.startRadius / hole.r, C.sizeSlowdown);
    if (world.boosts.speed > 0) speed *= C.speedBoostMult;
    if (world.fever) speed *= G.feverSpeedMult;
    tryMove(world, hole, hole.x + dir.x * dir.mag * speed * dt, hole.y + dir.y * dir.mag * speed * dt);
    world.maxSize = Math.max(world.maxSize, hole.r / C.startRadius);
  }

  // Skin trail: a subtle wake in your skin's colors whenever you're moving
  if (!world.reversal && dir.mag > 0.5) {
    world.skinTrailAcc = (world.skinTrailAcc || 0) + dt;
    while (world.skinTrailAcc > 0.09) {
      world.skinTrailAcc -= 0.09;
      const a = Math.random() * Math.PI * 2;
      world.particles.push({
        x: hole.x - dir.x * hole.r + Math.cos(a) * hole.r * 0.25,
        y: hole.y - dir.y * hole.r + Math.sin(a) * hole.r * 0.25,
        vx: -dir.x * 30, vy: -dir.y * 30,
        t: 0, life: 0.5, size: 3,
        color: world.trailColor || '#c4b5fd',
      });
    }
  }

  // Speed/fever trail streaming off the rim
  if ((world.boosts.speed > 0 || world.fever) && dir.mag > 0.3) {
    world.trailAcc += dt;
    while (world.trailAcc > 0.045) {
      world.trailAcc -= 0.045;
      const a = Math.random() * Math.PI * 2;
      world.particles.push({
        x: hole.x - dir.x * hole.r * 0.9 + Math.cos(a) * hole.r * 0.3,
        y: hole.y - dir.y * hole.r * 0.9 + Math.sin(a) * hole.r * 0.3,
        vx: -dir.x * 60, vy: -dir.y * 60,
        t: 0, life: 0.35,
        size: 4,
        color: world.fever ? `hsl(${(world.t * 300) % 360},90%,60%)` : '#ffd23c',
      });
    }
  }

  // --- Rivals ---
  for (const rv of world.rivals) updateRival(world, rv, dt, events);
  const eaters = world.reversal
    ? world.rivals.filter(r => !r.dead)
    : [hole, ...world.rivals.filter(r => !r.dead)];

  // --- Entities ---
  for (const e of world.entities) {
    if (e.state === 'gone') continue;

    if (e.state === 'falling') {
      // Physical fall: gravity pull toward the pit + tangential swirl,
      // tumbling faster and sinking quicker the deeper it gets.
      const k = e.sink;
      const dx = k.x - e.x, dy = k.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      const g = 900;
      e.fvx += (dx / d) * g * dt;
      e.fvy += (dy / d) * g * dt;
      e.fvx *= 1 - 2.2 * dt;
      e.fvy *= 1 - 2.2 * dt;
      e.x += e.fvx * dt;
      e.y += e.fvy * dt;
      // once it's deep, keep it inside the pit
      if (e.depth > 0.35 && d > k.r * 0.85) {
        e.x = k.x - (dx / d) * k.r * 0.8;
        e.y = k.y - (dy / d) * k.r * 0.8;
      }
      e.depth += (dt / G.fallDuration) * (0.55 + e.depth * 1.9);
      e.rot += e.spin * dt * (1 + e.depth * 2.5);
      if (e.depth >= 1) resolveSwallow(world, e, e.sink, events);
      continue;
    }

    // --- Movers ---
    if (e.def.mover === 'walk') {
      // Panic: run from the nearest hole (player or rival).
      let nearest = null, nd = 1e9;
      for (const k of eaters) {
        const d = dist(e.x, e.y, k.x, k.y);
        if (d < nd) { nd = d; nearest = k; }
      }
      if (nearest && nd < G.fleeRadius + nearest.r) {
        const away = Math.atan2(e.y - nearest.y, e.x - nearest.x);
        e.vx = Math.cos(away) * G.fleeSpeed;
        e.vy = Math.sin(away) * G.fleeSpeed;
      } else {
        e.moveTimer -= dt;
        if (e.moveTimer <= 0) {
          const a = Math.random() * Math.PI * 2;
          e.vx = Math.cos(a) * e.def.speed;
          e.vy = Math.sin(a) * e.def.speed;
          e.moveTimer = 1 + Math.random() * 3;
        }
      }
      const nx = e.x + e.vx * dt, ny = e.y + e.vy * dt;
      if (inWaterAt(world.water, world.roads, nx, ny)) {
        e.vx *= -1; e.vy *= -1; // nobody walks into the lake
      } else {
        e.x = nx; e.y = ny;
      }
      if (e.x < e.r || e.x > world.W - e.r) { e.vx *= -1; e.x = Math.max(e.r, Math.min(world.W - e.r, e.x)); }
      if (e.y < e.r || e.y > world.H - e.r) { e.vy *= -1; e.y = Math.max(e.r, Math.min(world.H - e.r, e.y)); }
      e.rot = Math.atan2(e.vy, e.vx);
    } else if (e.driveAxis) {
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      const m = e.r + 26;
      if (e.driveAxis === 'x' && (e.x < m || e.x > world.W - m)) { e.vx *= -1; e.rot += Math.PI; e.x = Math.max(m, Math.min(world.W - m, e.x)); }
      if (e.driveAxis === 'y' && (e.y < m || e.y > world.H - m)) { e.vy *= -1; e.rot += Math.PI; e.y = Math.max(m, Math.min(world.H - m, e.y)); }
    }

    // --- Capture / magnet, against every eater ---
    e.tiltK = 0;
    const magnetRange = C.magnetRange * (world.boosts.magnet > 0 ? C.magnetBoostMult : 1);
    for (const k of eaters) {
      if (e.r > k.r * C.captureRatio) continue;
      const kRange = k.isPlayer ? magnetRange : C.magnetRange;
      const d = dist(e.x, e.y, k.x, k.y);
      if (d < k.r + e.r * 0.35) {
        // Tips over the rim: inherit drift, get a swirl kick, start sinking.
        e.state = 'falling';
        e.depth = 0;
        e.sink = k;
        const ux = (k.x - e.x) / (d || 1), uy = (k.y - e.y) / (d || 1);
        const swirl = (e.seed - 0.5) * 170;
        e.fvx = e.vx * 0.5 + ux * 50 - uy * swirl;
        e.fvy = e.vy * 0.5 + uy * 50 + ux * swirl;
        e.spin = (e.seed - 0.5) * 11;
        spawnBurst(world, e.x, e.y, 'rgba(90,80,70,0.8)', 4, 70, 2.5); // rim dust
        if (!e.def.hazard && !e.def.powerup) world.idleCount--;
        break;
      } else if (d < k.r * kRange) {
        // Accelerating slide toward the rim + a visible tip/tilt.
        const t = 1 - (d - k.r) / (k.r * (kRange - 1) + 1e-6);
        const pull = C.magnetSpeed * Math.max(0, t) * Math.max(0, t) * 2.2;
        e.x += ((k.x - e.x) / d) * pull * dt;
        e.y += ((k.y - e.y) / d) * pull * dt;
        e.tiltK = Math.min(0.55, Math.max(0, t) * 0.7);
        e.tiltA = Math.atan2(k.y - e.y, k.x - e.x);
        break;
      }
    }
  }

  // --- Reversal mode: build points, city health, its own clock ---
  if (world.reversal) {
    world.buildPts = Math.min(100, world.buildPts + 7 * dt);
    world.fracAcc += dt;
    if (world.fracAcc > 0.5) {
      world.fracAcc = 0;
      world.remainFrac = cityRemaining(world);
    }
    world.time -= dt;
    if (world.time <= 0 || world.remainFrac < 0.3) {
      world.time = Math.max(0, world.time);
      world.remainFrac = cityRemaining(world);
      const f = world.remainFrac;
      world.starsHit = f >= 0.7 ? 3 : f >= 0.55 ? 2 : f >= 0.4 ? 1 : 0;
      world.goalDone = world.starsHit > 0;
      world.cleared = false;
      world.over = true;
      world.endDelay = 1.0;
      events.push({ type: 'end' });
    }
    return events;
  }

  // --- Hole vs hole ---
  const eatRatio = G.holeEatRatio;
  for (const rv of world.rivals) {
    if (rv.dead) continue;
    const d = dist(hole.x, hole.y, rv.x, rv.y);
    if (hole.r >= rv.r * eatRatio && d < hole.r * 0.8) {
      // Player devours the rival.
      const pts = Math.round(rv.r) * 10;
      world.score += pts;
      const maxR = Math.min(world.W, world.H) * C.maxRadiusFrac;
      hole.r = Math.min(maxR, Math.sqrt(hole.r * hole.r + 0.5 * rv.r * rv.r));
      world.popups.push({ x: hole.x, y: hole.y - hole.r, txt: `RIVAL DOWN! +${pts}`, t: 0, color: '#7CFC8E' });
      spawnBurst(world, rv.x, rv.y, rv.style.rim, 26, 300, 7);
      rv.dead = true;
      rv.respawnT = G.rivalRespawn;
      events.push({ type: 'eatRival', name: rv.style.name });
    } else if (rv.r >= hole.r * eatRatio && d < rv.r * 0.8 && world.graceT <= 0) {
      // Rival devours the player: shrink, relocate, brief protection.
      spawnBurst(world, hole.x, hole.y, '#ffffff', 26, 300, 7);
      const spot = respawnSpot(world, world.rivals.filter(r => !r.dead), 450);
      hole.x = spot.x; hole.y = spot.y;
      hole.r = C.startRadius;
      world.graceT = G.eatenGrace;
      world.combo.count = 0;
      world.combo.timer = 0;
      world.popups.push({ x: hole.x, y: hole.y - hole.r - 16, txt: 'SWALLOWED!', t: 0, color: '#ff6b6b' });
      events.push({ type: 'playerEaten', name: rv.style.name });
    }
  }

  // --- Endless mode: the map refills and rivals keep joining ---
  if (world.endless) {
    const E = G.endless;
    world.time += dt; // counts up
    world.spawnAcc += dt;
    if (world.spawnAcc >= E.spawnInterval) {
      world.spawnAcc = 0;
      if (world.idleCount < world.initialCount * E.targetFill) endlessRespawn(world);
      // keep the array from growing forever
      if (world.entities.length > world.initialCount * 3) {
        world.entities = world.entities.filter(e => e.state !== 'gone');
      }
    }
    world.rivalAcc += dt;
    if (world.rivalAcc >= E.rivalInterval && world.rivals.filter(r => !r.dead).length < E.maxRivals) {
      world.rivalAcc = 0;
      endlessRivalJoin(world, events);
    }
    return events; // no stars, no clock, no game over
  }

  // --- Stars ---
  while (world.starsHit < 3 && world.score >= world.starScores[world.starsHit]) {
    world.starsHit++;
    events.push({ type: 'star', n: world.starsHit });
  }

  // --- Clock / end conditions ---
  world.time -= dt;
  const swallowedEverything = world.idleCount <= 0 &&
    !world.entities.some(e => e.state === 'falling' && !e.def.hazard && !e.def.powerup);

  if (swallowedEverything) {
    const bonus = Math.round(Math.max(0, world.time) * G.allClearBonusPerSec);
    world.score += bonus;
    world.popups.push({ x: hole.x, y: hole.y - hole.r - 20, txt: 'ALL CLEAR! +' + bonus, t: 0, color: '#7CFC8E' });
    while (world.starsHit < 3 && world.score >= world.starScores[world.starsHit]) {
      world.starsHit++;
      events.push({ type: 'star', n: world.starsHit });
    }
    world.over = true;
    world.cleared = true;
    world.goalDone = true;
    world.endDelay = 1.2;
    events.push({ type: 'end' });
  } else if (!world.goalDone && goalMet(world)) {
    // Goal reached: finish early with a time bonus.
    const bonus = Math.round(Math.max(0, world.time) * G.goalBonusPerSec);
    world.score += bonus;
    world.popups.push({ x: hole.x, y: hole.y - hole.r - 20, txt: 'GOAL! +' + bonus, t: 0, color: '#7dd3fc' });
    while (world.starsHit < 3 && world.score >= world.starScores[world.starsHit]) {
      world.starsHit++;
      events.push({ type: 'star', n: world.starsHit });
    }
    world.over = true;
    world.goalDone = true;
    world.endDelay = 1.4;
    events.push({ type: 'goal' });
    events.push({ type: 'end' });
  } else if (world.time <= 0) {
    world.time = 0;
    world.over = true;
    world.endDelay = 0.6;
    events.push({ type: 'end' });
  }

  return events;
}
