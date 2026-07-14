/* ============================================================
 * MAIN — game loop, input, camera, UI wiring, audio, saves.
 * ============================================================ */

(function () {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  let state = 'title'; // title | playing | paused | result
  let world = null;
  let levelIndex = 0;
  const cam = { x: 0, y: 0, zoom: 1.5 };
  let viewW = 0, viewH = 0, dpr = 1;

  /* ---------------- Save data ---------------- */
  const SAVE_KEY = 'hungry-hole-save';
  // v1 saves were keyed by level index in the original 10-level order.
  const V1_LEVEL_ORDER = ['First Bite', 'Picnic Panic', 'Sleepy Suburb', 'Rush Hour', 'Market Day',
    'Neon Nights', 'Dust & Cactus', 'Snow Day', 'Harbor District', 'Metropolis'];
  function loadSave() {
    let s;
    try {
      s = Object.assign({ stars: {}, best: {}, skin: 'classic', muted: false },
        JSON.parse(localStorage.getItem(SAVE_KEY) || '{}'));
    } catch { s = { stars: {}, best: {}, skin: 'classic', muted: false }; }
    for (const map of [s.stars, s.best]) {
      for (const k of Object.keys(map)) {
        if (/^\d+$/.test(k)) {
          const name = V1_LEVEL_ORDER[+k];
          if (name && !(name in map)) map[name] = map[k];
          delete map[k];
        }
      }
    }
    return s;
  }
  const save = loadSave();
  function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch {} }

  // Shared arcade economy: coins earned here are spendable arcade-wide.
  // Applies Vault collection power, lucky multipliers, and rare ticket drops.
  function awardCoinsPlus(base) {
    try {
      const w = JSON.parse(localStorage.getItem('arcade-wallet')) || { coins: 0, earned: {}, spent: 0, tickets: 0 };
      let n = Math.max(1, Math.min(200, Math.round(base)));
      n = Math.round(n * (1 + (w.bonusPct || 0) / 100));
      let lucky = 1;
      const r = Math.random();
      if (r < 0.01) lucky = 5; else if (r < 0.04) lucky = 3; else if (r < 0.14) lucky = 2;
      n *= lucky;
      const ticket = Math.random() < 0.03;
      w.coins += n;
      w.earned['hungry-hole'] = (w.earned['hungry-hole'] || 0) + n;
      if (ticket) w.tickets = (w.tickets || 0) + 1;
      localStorage.setItem('arcade-wallet', JSON.stringify(w));
      return { n, lucky, ticket, total: w.coins };
    } catch { return { n: 0, lucky: 1, ticket: false, total: 0 }; }
  }
  function rewardText(res) {
    let t = `  ·  +${res.n} 🪙 (${res.total.toLocaleString()})`;
    if (res.lucky > 1) { t += `  🍀 LUCKY ×${res.lucky}!`; sfx.goal(); buzz(30); }
    if (res.ticket) t += '  🎟 PULL TICKET!';
    return t;
  }
  function buzz(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch {} }

  // anime.js result-screen juice (no-ops if lib/anime.min.js failed to load)
  const FX = window.anime || null;
  const fxSpring = FX ? FX.createSpring({ stiffness: 260, damping: 15 }) : null;
  function fxPop(elm, s0) { if (FX && elm) FX.animate(elm, { scale: [s0 || 1.35, 1], ease: fxSpring }); }
  function fxCountUp(elm, prefix, target, suffix) {
    if (!FX || !(target > 0)) { elm.textContent = prefix + target + suffix; return; }
    const o = { v: 0 };
    FX.animate(o, { v: target, duration: Math.min(1500, 600 + target / 3), ease: 'outExpo',
      onUpdate: () => { elm.textContent = prefix + Math.round(o.v) + suffix; } });
  }

  // Saves are keyed by level NAME so reordering/inserting levels never breaks progress.
  function starsFor(i) { return save.stars[LEVELS[i].name] || 0; }
  function totalStars() { return LEVELS.reduce((s, lv, i) => s + starsFor(i), 0); }

  function currentSkin() {
    const s = SKINS.find(k => k.id === save.skin) || SKINS[0];
    return save.dev || (s.unlockStars || 0) <= totalStars() ? s : SKINS[0];
  }
  function isUnlocked(i) {
    return save.dev || i === 0 || starsFor(i - 1) >= 1;
  }

  /* ---------------- Canvas sizing ---------------- */
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    viewW = window.innerWidth;
    viewH = window.innerHeight;
    canvas.width = Math.round(viewW * dpr);
    canvas.height = Math.round(viewH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  /* ---------------- Input ---------------- */
  const keys = {};
  const mouse = { x: 0, y: 0, active: false };
  const joy = { active: false, ox: 0, oy: 0, dx: 0, dy: 0 };
  let lastInput = 'mouse';

  const joyEl = document.getElementById('joystick');
  const joyBase = document.getElementById('joy-base');
  const joyKnob = document.getElementById('joy-knob');

  window.addEventListener('keydown', e => {
    keys[e.key.toLowerCase()] = true;
    lastInput = 'keys';
    if ((e.key === 'Escape' || e.key.toLowerCase() === 'p')) {
      if (state === 'playing') pauseGame();
      else if (state === 'paused') resumeGame();
    }
  });
  window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

  canvas.addEventListener('pointermove', e => {
    if (e.pointerType === 'mouse') {
      mouse.x = e.clientX; mouse.y = e.clientY;
      mouse.active = true;
      lastInput = 'mouse';
    } else if (joy.active) {
      let dx = e.clientX - joy.ox, dy = e.clientY - joy.oy;
      const len = Math.hypot(dx, dy);
      const max = 55;
      if (len > max) { dx = dx / len * max; dy = dy / len * max; }
      joy.dx = dx; joy.dy = dy;
      joyKnob.style.left = (joy.ox + dx) + 'px';
      joyKnob.style.top = (joy.oy + dy) + 'px';
    }
  });
  // Reversal placement: tap/click the battlefield to build the selected item.
  let revDown = null;
  canvas.addEventListener('pointerdown', e => {
    if (world && world.reversal && state === 'playing') {
      revDown = { x: e.clientX, y: e.clientY };
    }
  });
  canvas.addEventListener('pointerup', e => {
    if (revDown && world && world.reversal && state === 'playing') {
      const moved = Math.hypot(e.clientX - revDown.x, e.clientY - revDown.y);
      revDown = null;
      if (moved < 14) {
        const wx = (e.clientX - viewW / 2) / cam.zoom + cam.x;
        const wy = (e.clientY - viewH / 2) / cam.zoom + cam.y;
        if (placeReversalItem(world, revKind, wx, wy)) {
          sfx.powerup();
          buzz(15);
        } else {
          blip(180, 120, 0.12, 'square', 0.2); // can't place here / too broke
        }
      }
    }
  });

  canvas.addEventListener('pointerdown', e => {
    if (world && world.reversal) return; // no joystick in reversal
    if (e.pointerType !== 'mouse') {
      joy.active = true;
      joy.ox = e.clientX; joy.oy = e.clientY;
      joy.dx = joy.dy = 0;
      lastInput = 'touch';
      joyEl.classList.remove('hidden');
      joyBase.style.left = joy.ox + 'px'; joyBase.style.top = joy.oy + 'px';
      joyKnob.style.left = joy.ox + 'px'; joyKnob.style.top = joy.oy + 'px';
      canvas.setPointerCapture(e.pointerId);
    }
    initAudio();
  });
  function endTouch() {
    joy.active = false;
    joy.dx = joy.dy = 0;
    joyEl.classList.add('hidden');
  }
  canvas.addEventListener('pointerup', e => { if (e.pointerType !== 'mouse') endTouch(); });
  canvas.addEventListener('pointercancel', endTouch);

  function getDir() {
    // Keyboard wins, then touch joystick, then mouse-follow.
    let x = 0, y = 0;
    if (keys['w'] || keys['arrowup']) y -= 1;
    if (keys['s'] || keys['arrowdown']) y += 1;
    if (keys['a'] || keys['arrowleft']) x -= 1;
    if (keys['d'] || keys['arrowright']) x += 1;
    if (x || y) {
      const len = Math.hypot(x, y);
      return { x: x / len, y: y / len, mag: 1 };
    }
    if (joy.active && (joy.dx || joy.dy)) {
      const len = Math.hypot(joy.dx, joy.dy);
      return { x: joy.dx / len, y: joy.dy / len, mag: Math.min(1, len / 45) };
    }
    if (lastInput === 'mouse' && mouse.active && world) {
      const wx = (mouse.x - viewW / 2) / cam.zoom + cam.x;
      const wy = (mouse.y - viewH / 2) / cam.zoom + cam.y;
      const dx = wx - world.hole.x, dy = wy - world.hole.y;
      const d = Math.hypot(dx, dy);
      if (d > 4) return { x: dx / d, y: dy / d, mag: Math.min(1, d / 60) };
    }
    return { x: 0, y: 0, mag: 0 };
  }

  /* ---------------- Audio (tiny WebAudio synth) ---------------- */
  let actx = null;
  function initAudio() {
    if (!actx && CONFIG.audio.enabled) {
      try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch {}
    }
    if (actx && actx.state === 'suspended') actx.resume();
  }

  /* ---------------- Background music (procedural chiptune loop) ---------------- */
  function mnote(freq, when, dur, type, vol) {
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(CONFIG.audio.volume * vol, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + dur);
    o.connect(g).connect(actx.destination);
    o.start(when);
    o.stop(when + dur + 0.02);
  }
  const semi = s => Math.pow(2, s / 12);
  let musicNext = 0, musicStep = 0;
  setInterval(() => {
    if (!actx || save.muted || state !== 'playing') { musicNext = 0; return; }
    if (musicNext < actx.currentTime) musicNext = actx.currentTime + 0.05;
    const eighth = (world && world.fever) ? 0.19 : 0.214; // music speeds up in fever
    while (musicNext < actx.currentTime + 0.4) {
      const step = musicStep;
      const root = [0, 0, -4, -2][Math.floor(step / 16) % 4]; // i–i–VI–VII-ish
      if (step % 8 === 0) mnote(110 * semi(root), musicNext, 0.45, 'triangle', 0.14);
      if (step % 8 === 4) mnote(110 * semi(root), musicNext, 0.3, 'triangle', 0.09);
      if (step % 2 === 0) {
        const pent = [0, 3, 5, 7, 10, 12];
        const n = pent[(step * 5 + Math.floor(step / 16) * 7) % pent.length];
        mnote(330 * semi(root + n), musicNext, 0.16, 'square', 0.028);
      }
      musicNext += eighth;
      musicStep = (musicStep + 1) % 64;
    }
  }, 120);
  function blip(freq, endFreq, dur, type, vol) {
    if (!actx || save.muted) return;
    const t0 = actx.currentTime;
    const osc = actx.createOscillator();
    const gain = actx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, endFreq), t0 + dur);
    gain.gain.setValueAtTime(CONFIG.audio.volume * vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(actx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }
  const sfx = {
    swallow(size) { blip(320 - Math.min(200, size * 2), 90, 0.18, 'square', 0.25); },
    star() { blip(660, 990, 0.25, 'sine', 0.35); setTimeout(() => blip(880, 1320, 0.3, 'sine', 0.3), 110); },
    end() { blip(440, 220, 0.5, 'triangle', 0.35); },
    bomb() { blip(140, 35, 0.5, 'sawtooth', 0.5); },
    eatRival() { blip(330, 660, 0.16, 'square', 0.35); setTimeout(() => blip(440, 880, 0.16, 'square', 0.3), 90); setTimeout(() => blip(550, 1100, 0.25, 'square', 0.3), 180); },
    eaten() { blip(520, 60, 0.6, 'sawtooth', 0.45); },
    powerup() { blip(500, 1000, 0.2, 'sine', 0.4); setTimeout(() => blip(750, 1500, 0.22, 'sine', 0.3), 100); },
    golden() { blip(880, 1760, 0.3, 'triangle', 0.4); },
    unlock() { blip(392, 784, 0.2, 'triangle', 0.35); setTimeout(() => blip(523, 1046, 0.28, 'triangle', 0.3), 120); },
    goal() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => blip(f, f * 1.2, 0.25, 'sine', 0.35), i * 100)); },
    hunted() { blip(200, 140, 0.3, 'sawtooth', 0.3); setTimeout(() => blip(200, 140, 0.3, 'sawtooth', 0.3), 350); },
  };

  /* ---------------- Action feedback: banners + screen flash ---------------- */
  const bannerEl = document.getElementById('banner');
  const flashEl = document.getElementById('flash');
  let bannerQueue = [], bannerBusy = false;
  function banner(text, color) {
    bannerQueue.push({ text, color });
    if (!bannerBusy) nextBanner();
  }
  function nextBanner() {
    const b = bannerQueue.shift();
    if (!b) { bannerBusy = false; return; }
    bannerBusy = true;
    bannerEl.textContent = b.text;
    bannerEl.style.color = b.color || '#fff';
    bannerEl.classList.remove('hidden', 'show');
    void bannerEl.offsetWidth; // restart animation
    bannerEl.classList.add('show');
    setTimeout(() => { bannerEl.classList.add('hidden'); nextBanner(); }, 1400);
  }
  function flash(color) {
    flashEl.style.background = color;
    flashEl.classList.remove('hidden', 'show');
    void flashEl.offsetWidth;
    flashEl.classList.add('show');
    setTimeout(() => flashEl.classList.add('hidden'), 450);
  }
  function clearBanners() {
    bannerQueue = [];
    bannerEl.classList.add('hidden');
  }

  const POWERUP_BANNERS = {
    speed: ['⚡ SPEED BOOST', '#ffd23c'],
    magnet: ['🧲 MEGA MAGNET', '#f45d9a'],
    x2: ['×2 DOUBLE SCORE', '#a78bfa'],
    clock: ['⏱ EXTRA TIME', '#39c2e8'],
  };

  /* ---------------- Screen shake ---------------- */
  const shake = { t: 0, mag: 0 };
  function addShake(mag) { shake.mag = Math.max(shake.mag, mag); shake.t = 0.35; }
  function updateShake(dt) {
    if (shake.t > 0) {
      shake.t -= dt;
      const k = Math.max(0, shake.t / 0.35) * shake.mag;
      cam.sx = (Math.random() * 2 - 1) * k / cam.zoom;
      cam.sy = (Math.random() * 2 - 1) * k / cam.zoom;
      if (shake.t <= 0) { shake.mag = 0; cam.sx = cam.sy = 0; }
    }
  }

  /* ---------------- Camera ---------------- */
  function updateCamera(dt, snap) {
    if (!world) return;
    const C = CONFIG.camera;
    const minDim = Math.min(viewW, viewH);
    const growth = Math.log2(world.hole.r / CONFIG.hole.startRadius);
    const frac = Math.min(C.maxSizeFrac, C.baseSizeFrac + C.growSizeFrac * Math.max(0, growth));
    let targetZoom = Math.max(C.minZoom, Math.min(C.maxZoom, (minDim * frac) / world.hole.r));

    // Reversal: fixed overview of the whole battlefield.
    if (world.reversal) {
      cam.zoom = Math.min(viewW / world.W, viewH / world.H) * 0.96;
      cam.x = world.W / 2;
      cam.y = world.H / 2;
      return;
    }

    // Cinematic fly-over: start showing the whole map, ease down to the hole.
    if (world.introT > 0) {
      const fit = Math.min(viewW / world.W, viewH / world.H) * 0.92;
      const p = 1 - world.introT / 1.6;
      const ease = p * p * (3 - 2 * p);
      cam.zoom = fit + (targetZoom - fit) * ease;
      const vw = viewW / cam.zoom, vh = viewH / cam.zoom;
      const tx = world.W / 2 + (world.hole.x - world.W / 2) * ease;
      const ty = world.H / 2 + (world.hole.y - world.H / 2) * ease;
      cam.x = vw >= world.W ? world.W / 2 : Math.max(vw / 2, Math.min(world.W - vw / 2, tx));
      cam.y = vh >= world.H ? world.H / 2 : Math.max(vh / 2, Math.min(world.H - vh / 2, ty));
      return;
    }

    if (snap) cam.zoom = targetZoom;
    else cam.zoom += (targetZoom - cam.zoom) * Math.min(1, dt * C.zoomLerp);

    // follow hole, clamped to map (centers if map smaller than view)
    const vw = viewW / cam.zoom, vh = viewH / cam.zoom;
    cam.x = vw >= world.W ? world.W / 2 : Math.max(vw / 2, Math.min(world.W - vw / 2, world.hole.x));
    cam.y = vh >= world.H ? world.H / 2 : Math.max(vh / 2, Math.min(world.H - vh / 2, world.hole.y));
  }

  /* ---------------- HUD ---------------- */
  const el = id => document.getElementById(id);
  const hud = el('hud');
  const hudTimer = el('hud-timer'), hudScore = el('hud-score'), hudSize = el('hud-size');
  const hudCombo = el('hud-combo');
  const hudStars = [...document.querySelectorAll('.hud-star')];

  function updateHUD() {
    const t = Math.max(0, Math.ceil(world.time));
    hudTimer.textContent = `${world.endless ? '∞ ' : ''}${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    hudTimer.classList.toggle('low', !world.endless && t <= 10 && !world.over);
    const next = !world.endless && !world.reversal && world.starsHit < 3 ? ` / ${world.starScores[world.starsHit]}` : '';
    hudScore.textContent = world.reversal ? `City ${(world.remainFrac * 100).toFixed(0)}%` : world.score + next;
    el('hud-stars').style.display = world.endless || world.reversal ? 'none' : '';
    hudSize.style.display = world.reversal ? 'none' : '';
    hudStars.forEach((s, i) => s.classList.toggle('lit', i < world.starsHit));
    hudSize.textContent = `Size ×${(world.hole.r / CONFIG.hole.startRadius).toFixed(1)}`;
    const c = world.combo.count;
    if (c >= 3 && world.combo.timer > 0) {
      hudCombo.textContent = `COMBO ×${(1 + Math.min(CONFIG.game.comboMaxBonus, (c - 1) * CONFIG.game.comboStep)).toFixed(2)}`;
      hudCombo.classList.remove('hidden');
    } else {
      hudCombo.classList.add('hidden');
    }
    // goal progress
    el('hud-goal').textContent = goalText(world);
    // active boosts
    const boosts = [];
    if (world.boosts.speed > 0) boosts.push(`⚡ ${world.boosts.speed.toFixed(0)}s`);
    if (world.boosts.magnet > 0) boosts.push(`🧲 ${world.boosts.magnet.toFixed(0)}s`);
    if (world.boosts.x2 > 0) boosts.push(`×2 ${world.boosts.x2.toFixed(0)}s`);
    const bEl = el('hud-boosts');
    bEl.textContent = boosts.join('   ');
    bEl.classList.toggle('hidden', boosts.length === 0);
  }

  /* ---------------- Screens ---------------- */
  const screens = { title: el('title-screen'), pause: el('pause-screen'), result: el('result-screen') };
  function showScreen(name) {
    for (const k in screens) screens[k].classList.toggle('hidden', k !== name);
    hud.classList.toggle('hidden', name !== null); // HUD only while actively playing
  }

  function buildSkinRow() {
    const row = el('skin-row');
    row.innerHTML = '';
    const stars = totalStars();
    for (const s of SKINS) {
      const need = s.unlockStars || 0;
      const locked = !save.dev && need > stars;
      const wrap = document.createElement('div');
      wrap.className = 'skin-wrap';
      const b = document.createElement('button');
      b.className = 'skin-btn' + (s.id === save.skin && !locked ? ' selected' : '') + (locked ? ' locked' : '');
      b.title = locked ? `${s.name} — earn ${need} total stars` : s.name;
      b.style.background = `radial-gradient(circle, ${s.pit} 55%, ${s.rim} 72%, ${s.glow} 82%, transparent 84%)`;
      if (!locked) b.addEventListener('click', () => { save.skin = s.id; persist(); buildSkinRow(); });
      wrap.appendChild(b);
      const tag = document.createElement('div');
      tag.className = 'skin-tag';
      tag.textContent = locked ? `🔒 ${need}★` : s.name;
      wrap.appendChild(tag);
      row.appendChild(wrap);
    }
    el('star-count').textContent = `★ ${stars}`;
  }

  function buildLevelGrid() {
    const grid = el('level-grid');
    grid.innerHTML = '';
    LEVELS.forEach((lv, i) => {
      const unlocked = isUnlocked(i);
      const stars = starsFor(i);
      const b = document.createElement('button');
      b.className = 'level-btn' + (unlocked ? '' : ' locked');
      const badges = (lv.rivals ? ' <span class="lv-badge">☠×' + lv.rivals + '</span>' : '') +
                     (lv.spawns.bomb ? ' <span class="lv-badge">💣</span>' : '');
      b.innerHTML = `
        <span class="lv-num">${unlocked ? i + 1 : '🔒'}</span>
        <span class="lv-name">${lv.name}${badges}</span>
        <span class="lv-stars">${'★★★'.split('').map((c, j) => `<span class="${j < stars ? '' : 'off'}">★</span>`).join('')}</span>`;
      if (unlocked) b.addEventListener('click', () => { initAudio(); startLevel(i); });
      grid.appendChild(b);
    });
  }

  function updateMuteBtn() {
    el('btn-mute').textContent = save.muted ? '🔇 Muted' : '🔊 Sound';
  }

  /* ---------------- Game flow ---------------- */
  function startLevel(i) {
    levelIndex = i;
    world = buildWorld(i);
    world.trailColor = currentSkin().glow;
    state = 'playing';
    clearBanners();
    showScreen(null);
    el('btn-quit').textContent = 'Level select';
    updateCamera(0, true);
    updateHUD();
    banner(goalText(world), '#7dd3fc'); // tell the player what to do
  }

  function startEndless() {
    levelIndex = -1;
    world = buildWorld(ENDLESS_LEVEL);
    world.trailColor = currentSkin().glow;
    state = 'playing';
    clearBanners();
    showScreen(null);
    el('btn-quit').textContent = 'End run';
    updateCamera(0, true);
    updateHUD();
    banner('∞ ENDLESS — eat forever!', '#7dd3fc');
  }

  function startReversal() {
    levelIndex = -2;
    world = buildWorld(REVERSAL_LEVEL);
    world.introT = 0; // fixed overview camera — no flyover
    state = 'playing';
    clearBanners();
    showScreen(null);
    el('btn-quit').textContent = 'Give up';
    el('reversal-bar').classList.remove('hidden');
    updateCamera(0, true);
    updateHUD();
    banner('🏙 DEFEND THE CITY! Place bait & bombs!', '#7dd3fc');
  }

  let revKind = 'bait';
  document.querySelectorAll('.rev-item').forEach(b => {
    b.addEventListener('click', () => {
      revKind = b.dataset.kind;
      document.querySelectorAll('.rev-item').forEach(x => x.classList.toggle('selected', x === b));
      initAudio();
    });
  });
  function updateReversalBar() {
    const pts = world.buildPts;
    el('rev-pts-fill').style.width = pts + '%';
    el('rev-pts-label').textContent = Math.floor(pts);
    document.querySelectorAll('.rev-item').forEach(b => {
      b.classList.toggle('broke', REVERSAL_ITEMS[b.dataset.kind].cost > pts);
    });
  }

  function finishEndlessRun() {
    state = 'result';
    const prev = save.endlessBest || { score: 0 };
    const isRecord = world.score > prev.score;
    if (isRecord) {
      save.endlessBest = {
        score: world.score,
        size: world.maxSize,
        time: Math.floor(world.time),
      };
      persist();
    }
    const reward = awardCoinsPlus(Math.round(world.score / 400));
    el('result-title').textContent = '∞ Endless Run';
    fxPop(el('result-title'), 1.5);
    document.querySelectorAll('.result-star').forEach(s => s.classList.remove('lit'));
    fxCountUp(el('result-score'), 'Score: ', world.score,
      ` · Size ×${world.maxSize.toFixed(1)} · ${Math.floor(world.time / 60)}:${String(Math.floor(world.time) % 60).padStart(2, '0')}`);
    const best = save.endlessBest || { score: 0, size: 1, time: 0 };
    el('result-best').textContent = `Best: ${best.score}${isRecord ? ' — new record!' : ''}` + rewardText(reward);
    fxPop(el('result-best'), 1.2);
    const nextBtn = el('btn-next');
    nextBtn.disabled = false;
    nextBtn.textContent = 'Run it back ∞';
    showScreen('result');
    updateEndlessBtn();
  }

  function updateEndlessBtn() {
    const best = save.endlessBest;
    el('btn-endless').textContent = best ? `∞ Endless Mode — best ${best.score}` : '∞ Endless Mode';
  }

  function pauseGame() {
    state = 'paused';
    showScreen('pause');
  }
  function resumeGame() {
    state = 'playing';
    showScreen(null);
  }
  function quitToTitle() {
    state = 'title';
    world = null;
    buildLevelGrid();
    showScreen('title');
  }

  function finishLevel() {
    state = 'result';
    const stars = world.starsHit;
    const key = world.level.name;
    const prevStars = save.stars[key] || 0;
    const prevBest = save.best[key] || 0;
    save.stars[key] = Math.max(prevStars, stars);
    save.best[key] = Math.max(prevBest, world.reversal ? Math.round(world.remainFrac * 100) : world.score);
    persist();
    const reward = awardCoinsPlus(world.reversal
      ? Math.round(world.remainFrac * 50)
      : stars * 10 + Math.round(world.score / 400));

    el('result-title').textContent =
      world.reversal ? (stars === 0 ? 'City Devoured…' : '🏙 City Saved!') :
      stars === 0 ? 'Time Up…' :
      world.goal.type === 'boss' && world.goalDone ? '👑 GOLIATH DEFEATED!' :
      world.cleared ? 'ALL CLEAR!' :
      world.goalDone ? '🎯 Goal Complete!' : 'Level Complete!';
    document.querySelectorAll('.result-star').forEach((s, i) => {
      s.classList.remove('lit');
      // re-trigger CSS animation
      void s.offsetWidth;
      if (i < stars) s.classList.add('lit');
    });
    fxPop(el('result-title'), 1.5);
    if (world.reversal) fxCountUp(el('result-score'), 'City survived: ', Math.round(world.remainFrac * 100), '%');
    else fxCountUp(el('result-score'), 'Score: ', world.score, '');
    el('result-best').textContent =
      `Best: ${save.best[key]}${(world.reversal ? Math.round(world.remainFrac * 100) : world.score) > prevBest ? ' — new record!' : ''}` +
      rewardText(reward);
    fxPop(el('result-best'), 1.2);
    const nextBtn = el('btn-next');
    if (world.reversal) {
      nextBtn.disabled = false;
      nextBtn.textContent = 'Defend again 🏙';
    } else {
      const hasNext = levelIndex + 1 < LEVELS.length;
      nextBtn.disabled = !(hasNext && stars >= 1);
      nextBtn.textContent = hasNext ? 'Next level ▶' : 'All levels done!';
    }
    el('reversal-bar').classList.add('hidden');
    showScreen('result');
  }

  /* ---------------- Buttons ---------------- */
  el('btn-pause').addEventListener('click', () => { if (state === 'playing') pauseGame(); });
  el('btn-resume').addEventListener('click', resumeGame);
  const restartCurrent = () => world && world.reversal ? startReversal() : world && world.endless ? startEndless() : startLevel(levelIndex);
  el('btn-restart').addEventListener('click', restartCurrent);
  el('btn-quit').addEventListener('click', () => {
    el('reversal-bar').classList.add('hidden');
    if (world && world.endless) finishEndlessRun();
    else if (world && world.reversal) finishLevel();
    else quitToTitle();
  });
  el('btn-retry').addEventListener('click', restartCurrent);
  el('btn-next').addEventListener('click', () => world && world.reversal ? startReversal() : world && world.endless ? startEndless() : startLevel(levelIndex + 1));
  el('btn-endless').addEventListener('click', () => { initAudio(); startEndless(); });
  el('btn-reversal').addEventListener('click', () => { initAudio(); startReversal(); });
  el('btn-levels').addEventListener('click', quitToTitle);
  el('btn-mute').addEventListener('click', () => { save.muted = !save.muted; persist(); updateMuteBtn(); });
  el('btn-dev').addEventListener('click', () => {
    save.dev = !save.dev;
    persist();
    el('btn-dev').textContent = save.dev ? '🛠 Dev ON' : '🛠 Dev';
    buildSkinRow();
    buildLevelGrid();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state === 'playing') pauseGame();
  });

  /* ---------------- Main loop ---------------- */
  let lastTs = 0;
  function loop(ts) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (ts - lastTs) / 1000) || 0.016;
    lastTs = ts;

    if (state === 'playing' && world && world.introT > 0) {
      // fly-over: camera only, world frozen
      world.introT -= dt;
      updateCamera(dt, false);
      if (world.introT <= 0) { banner('GO!', '#7CFC8E'); sfx.unlock(); }
    } else if (state === 'playing' && world) {
      const events = updateWorld(world, dt, getDir());
      for (const ev of events) {
        if (ev.type === 'swallow') { sfx.swallow(ev.size); if (ev.size > 40) { addShake(5); buzz(12); } }
        else if (ev.type === 'star') { sfx.star(); buzz(20); banner(`★ ${ev.n} STAR${ev.n > 1 ? 'S' : ''}!`, '#ffd43b'); }
        else if (ev.type === 'end') sfx.end();
        else if (ev.type === 'bomb') { sfx.bomb(); addShake(14); buzz(40); flash('rgba(255,90,40,0.35)'); banner('💥 BOOM! You shrank!', '#ff8c42'); }
        else if (ev.type === 'eatRival') { sfx.eatRival(); addShake(10); buzz(30); flash('rgba(124,252,142,0.25)'); banner(`☠ ${ev.name} DEVOURED!`, '#7CFC8E'); }
        else if (ev.type === 'playerEaten') { sfx.eaten(); addShake(16); buzz(60); flash('rgba(255,60,60,0.4)'); banner(`${ev.name} swallowed you!`, '#ff6b6b'); }
        else if (ev.type === 'powerup') { sfx.powerup(); buzz(15); const [txt, col] = POWERUP_BANNERS[ev.kind] || ['POWER-UP!', '#fff']; flash(col + '44'); banner(txt, col); }
        else if (ev.type === 'golden') { sfx.golden(); buzz(15); }
        else if (ev.type === 'preyUnlock') { sfx.unlock(); buzz(15); banner(`🍽 You can now eat ${ev.label.toUpperCase()}!`, '#a5f3fc'); }
        else if (ev.type === 'hunted') { sfx.hunted(); flash('rgba(255,40,40,0.22)'); banner(`⚠ ${ev.name} IS HUNTING YOU!`, '#ff6b6b'); }
        else if (ev.type === 'goal') { sfx.goal(); buzz(30); banner('🎯 GOAL COMPLETE!', '#7dd3fc'); }
        else if (ev.type === 'feverStart') { sfx.goal(); buzz(25); flash('rgba(255,255,255,0.25)'); banner('🔥 FEVER MODE! 🔥', '#ff9500'); }
        else if (ev.type === 'feverEnd') banner('fever over…', '#9a9ab0');
        else if (ev.type === 'rivalJoin') { sfx.hunted(); banner(`☠ ${ev.name} joined the feast!`, '#ff6b6b'); }
        else if (ev.type === 'rivalBomb') { sfx.bomb(); buzz(20); banner(`💥 ${ev.name} ate your bomb!`, '#7CFC8E'); }
      }
      if (world.reversal) updateReversalBar();
      updateShake(dt);
      updateCamera(dt, false);
      updateHUD();
      if (world.over && world.endDelay <= 0) finishLevel();
    }

    if (world) {
      renderWorld(ctx, world, cam, viewW, viewH, currentSkin());
    } else {
      // idle background behind the title screen
      ctx.fillStyle = '#12121a';
      ctx.fillRect(0, 0, viewW, viewH);
    }
  }

  /* ---------------- Boot ---------------- */
  buildSkinRow();
  buildLevelGrid();
  updateMuteBtn();
  el('btn-dev').textContent = save.dev ? '🛠 Dev ON' : '🛠 Dev';
  updateEndlessBtn();
  showScreen('title');
  requestAnimationFrame(loop);
})();
