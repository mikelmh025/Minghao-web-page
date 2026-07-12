#!/usr/bin/env node
/* Headless test harness for Tiny Metropolis.
   Extracts the inline <script> from index.html, syntax-checks it,
   then unit-tests the DOM-free economy core (TM). */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const HTML = path.join(__dirname, 'index.html');
const EXTRACTED = path.join(__dirname, '.extracted.js');

const html = fs.readFileSync(HTML, 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error('FAIL: no <script> block found'); process.exit(1); }
fs.writeFileSync(EXTRACTED, m[1]);

const chk = spawnSync(process.execPath, ['--check', EXTRACTED], { encoding: 'utf8' });
if (chk.status !== 0) {
  console.error('FAIL: node --check\n' + chk.stderr);
  process.exit(1);
}
console.log('PASS  node --check (extracted inline script)');

const TM = require(EXTRACTED);

let failures = 0, passes = 0;
function ok(cond, name, detail) {
  if (cond) { passes++; console.log('PASS  ' + name + (detail ? '  [' + detail + ']' : '')); }
  else { failures++; console.error('FAIL  ' + name + (detail ? '  [' + detail + ']' : '')); }
}
function approx(a, b, eps) { return Math.abs(a - b) <= (eps || 1e-9) * Math.max(1, Math.abs(a), Math.abs(b)); }

/* ================= income/sec math with upgrades ================= */
{
  const s = TM.newState();
  ok(TM.incomePerSec(s) === 0, 'income: empty city earns 0');
  s.counts.house = 4;
  ok(approx(TM.incomePerSec(s), 4 * 0.6), 'income: 4 houses = 2.4/s', TM.incomePerSec(s));
  s.levels.house = 2; // x4
  ok(approx(TM.incomePerSec(s), 4 * 0.6 * 4), 'income: upgrade Lv2 doubles twice (x4)', TM.incomePerSec(s));
  s.counts.office = 3; s.levels.office = 1;
  const expect = 4 * 0.6 * 4 + 3 * 24 * 2;
  ok(approx(TM.incomePerSec(s), expect), 'income: mixed types sum correctly', TM.incomePerSec(s) + ' vs ' + expect);
  s.stars = 5; // x1.5
  ok(approx(TM.incomePerSec(s), expect * 1.5), 'income: 5 stars apply x1.5 multiplier');
  // boost: x2 only while now < boostUntil
  s.boostUntil = 1000000;
  ok(approx(TM.incomePerSec(s, 999999), expect * 1.5 * 2), 'income: active blimp boost doubles');
  ok(approx(TM.incomePerSec(s, 1000001), expect * 1.5), 'income: expired boost does not apply');
  ok(approx(TM.incomePerSec(s), expect * 1.5), 'income: omitted `now` never applies boost (deterministic)');
  // tick accumulates into cash and lifetime
  const s2 = TM.newState();
  s2.counts.house = 10;
  const c0 = s2.cash, l0 = s2.lifetime;
  const earned = TM.tick(s2, 10);
  ok(approx(earned, 60) && approx(s2.cash - c0, 60) && approx(s2.lifetime - l0, 60),
    'income: tick(10s) with 10 houses adds $60 to cash & lifetime');
}

/* ================= cost curves ================= */
{
  const s = TM.newState();
  ok(TM.costOf(s, 'house') === 15, 'cost: first house = base cost 15');
  s.counts.house = 5;
  ok(approx(TM.costOf(s, 'house'), 15 * Math.pow(1.18, 5)), 'cost: x1.18 per purchase', TM.costOf(s, 'house').toFixed(2));
  // bulkCost equals sum of singles
  let sum = 0;
  for (let k = 0; k < 7; k++) sum += TM.buildingCost('shop', 3 + k);
  ok(approx(TM.bulkCost('shop', 3, 7), sum, 1e-9), 'cost: bulkCost(7) == sum of 7 singles');
  // maxAffordable consistency
  const cash = 12345;
  const k = TM.maxAffordable('house', 2, cash);
  ok(TM.bulkCost('house', 2, k) <= cash && TM.bulkCost('house', 2, k + 1) > cash,
    'cost: maxAffordable is the exact affordability boundary', 'k=' + k);
  // buy deducts and increments
  const s3 = TM.newState();
  s3.cash = 100;
  ok(TM.buy(s3, 'house') === 1 && s3.counts.house === 1 && approx(s3.cash, 85), 'buy: deducts cost, increments count');
  ok(TM.buy(s3, 'lab') === 0, 'buy: locked type refused');
  s3.cash = 0.01;
  ok(TM.buy(s3, 'house') === 0 && s3.counts.house === 1, 'buy: refused when unaffordable');
  // upgrade curve
  const s4 = TM.newState();
  s4.counts.house = 1;
  ok(approx(TM.upgradeCost(s4, 'house'), 15 * 30), 'upgrade: Lv1 cost = base*30');
  s4.levels.house = 3;
  ok(approx(TM.upgradeCost(s4, 'house'), 15 * 30 * Math.pow(8, 3)), 'upgrade: x8 growth per level');
  s4.cash = 1e9;
  ok(TM.upgrade(s4, 'house') && s4.levels.house === 4, 'upgrade: applies and increments level');
  const s5 = TM.newState(); s5.cash = 1e9;
  ok(!TM.upgrade(s5, 'house'), 'upgrade: refused with zero buildings owned');
}

/* ================= prestige star math ================= */
{
  ok(TM.starsFor(999999) === 0, 'prestige: $999,999 lifetime -> 0 stars');
  ok(TM.starsFor(1e6) === 1, 'prestige: $1M -> 1 star');
  ok(TM.starsFor(4e6) === 2, 'prestige: $4M -> 2 stars');
  ok(TM.starsFor(9e6) === 3, 'prestige: $9M -> 3 stars');
  ok(TM.starsFor(1e8) === 10, 'prestige: $100M -> 10 stars');
  ok(TM.starsFor(-5) === 0 && TM.starsFor(NaN) === 0, 'prestige: negative/NaN lifetime -> 0 stars');
  const s = TM.newState();
  s.lifetime = 5e6; s.cash = 12345; s.counts.house = 20; s.levels.house = 2; s.stars = 0;
  ok(TM.prestigeGain(s) === 2, 'prestige: projected gain = floor(sqrt(5)) = 2');
  const g = TM.doPrestige(s);
  ok(g === 2 && s.stars === 2, 'prestige: reset grants projected stars');
  ok(s.cash === TM.START_CASH && Object.keys(s.counts).length === 0 && Object.keys(s.levels).length === 0,
    'prestige: cash/buildings/upgrades reset');
  ok(s.lifetime === 5e6, 'prestige: lifetime earnings preserved');
  ok(approx(TM.starMult(s.stars), 1.2), 'prestige: 2 stars -> x1.2 income multiplier');
  s.counts.house = 1;
  ok(approx(TM.incomePerSec(s), 0.6 * 1.2), 'prestige: multiplier applied to income');
  // second prestige only grants the delta
  s.lifetime = 9e6;
  ok(TM.prestigeGain(s) === 1, 'prestige: gain is delta over current stars (3-2=1)');
  ok(TM.doPrestige(TM.newState()) === 0, 'prestige: refused with no stars to gain');
}

/* ================= offline earnings ================= */
{
  const s = TM.newState();
  s.counts.house = 10; // 6/s
  s.stars = 10;        // x2  -> 12/s
  ok(approx(TM.offlineEarnings(s, 3600), 12 * 3600), 'offline: 1h away = income*3600 (deterministic)');
  ok(approx(TM.offlineEarnings(s, 3600), TM.offlineEarnings(s, 3600)), 'offline: repeatable, no randomness');
  ok(approx(TM.offlineEarnings(s, 20 * 3600), 12 * 8 * 3600), 'offline: 20h away capped at 8h');
  ok(approx(TM.offlineEarnings(s, TM.OFFLINE_CAP), 12 * 8 * 3600), 'offline: exactly 8h hits the cap');
  ok(TM.offlineEarnings(s, -100) === 0, 'offline: negative away time earns 0');
  s.boostUntil = Date.now() + 1e9;
  ok(approx(TM.offlineEarnings(s, 3600), 12 * 3600), 'offline: blimp boost never applies offline');
}

/* ================= export-coins math ================= */
{
  ok(TM.exportBase(1e6, 0) === 48, 'export: log10(1e6)*8 = 48 coins');
  ok(TM.exportBase(1e9, 0) === 72, 'export: log10(1e9)*8 = 72 coins');
  ok(TM.exportBase(1e20, 0) === 120, 'export: capped at 120 coins');
  ok(TM.exportBase(0, 0) === 1 && TM.exportBase(5, 0) >= 1, 'export: minimum 1 coin');
  ok(TM.exportBase(1e6, 50) === 72, 'export: bonusPct 50% -> 48*1.5 = 72');
  ok(TM.exportBase(1e20, 25) === 150, 'export: bonusPct applies after 120 cap (120*1.25=150)');
  ok(TM.luckyMult(0.005) === 5 && TM.luckyMult(0.02) === 3 && TM.luckyMult(0.1) === 2 && TM.luckyMult(0.5) === 1,
    'export: lucky thresholds 1%/3%/10% -> x5/x3/x2');
  const r = TM.exportResult(1e6, 0, 0.005, 0.01);
  ok(r.n === 240 && r.lucky === 5 && r.ticket === true, 'export: result combines base*lucky + ticket roll');
  const r2 = TM.exportResult(1e6, 0, 0.99, 0.5);
  ok(r2.n === 48 && r2.lucky === 1 && r2.ticket === false, 'export: unlucky roll pays base, no ticket');
  // lucky distribution sanity with seeded RNG
  const rng = TM.mulberry32(42);
  let c5 = 0, c3 = 0, c2 = 0, N = 100000;
  for (let i = 0; i < N; i++) { const l = TM.luckyMult(rng()); if (l === 5) c5++; else if (l === 3) c3++; else if (l === 2) c2++; }
  ok(Math.abs(c5 / N - 0.01) < 0.003 && Math.abs(c3 / N - 0.03) < 0.005 && Math.abs(c2 / N - 0.10) < 0.008,
    'export: lucky odds ~1%/3%/10% over 100k rolls', (c5 / N * 100).toFixed(2) + '/' + (c3 / N * 100).toFixed(2) + '/' + (c2 / N * 100).toFixed(2) + '%');
  // cooldown
  ok(!TM.canExport(1000, 1000 + TM.EXPORT_CD - 1), 'export: refused 1ms before 10min cooldown');
  ok(TM.canExport(1000, 1000 + TM.EXPORT_CD), 'export: allowed exactly at 10min');
  ok(TM.canExport(0, Date.now()), 'export: allowed on fresh save');
}

/* ================= milestone unlock thresholds ================= */
{
  const s = TM.newState();
  ok(TM.unlockedTypes(s).map(t => t.id).join() === 'house', 'unlock: fresh city has only House');
  s.lifetime = 299;
  ok(!TM.isUnlocked(s, 'shop'), 'unlock: Shop locked at $299 lifetime');
  s.lifetime = 300;
  ok(TM.isUnlocked(s, 'shop'), 'unlock: Shop unlocks at $300 lifetime');
  s.lifetime = 2e7;
  ok(TM.unlockedTypes(s).length === TM.TYPES.length, 'unlock: all 8 types at $20M lifetime');
  // unlocks survive prestige (lifetime persists)
  TM.doPrestige.length; // no-op
  const s2 = TM.newState();
  s2.lifetime = 4e6; s2.counts.house = 1;
  TM.doPrestige(s2);
  ok(TM.isUnlocked(s2, 'bank'), 'unlock: milestones persist through prestige');
  // owning one keeps it unlocked regardless
  const s3 = TM.newState();
  s3.counts.lab = 1;
  ok(TM.isUnlocked(s3, 'lab'), 'unlock: owned type counts as unlocked');
  // thresholds are ascending & greater than a fresh wallet
  let asc = true;
  for (let i = 1; i < TM.TYPES.length; i++) if (TM.TYPES[i].unlock <= TM.TYPES[i - 1].unlock) asc = false;
  ok(asc, 'unlock: thresholds strictly ascending across the 8 types');
  // population milestones
  const s4 = TM.newState();
  s4.counts.house = 25; // pop 100
  ok(TM.population(s4) === 100, 'milestone: 25 houses -> population 100');
  ok(TM.POP_MILESTONES.every(m => m.pop > 0 && typeof m.msg === 'string'), 'milestone: table well-formed');
}

/* ================= save/load roundtrip identity ================= */
{
  const s = TM.newState();
  s.cash = 123456.789; s.lifetime = 9.87e8; s.stars = 7;
  s.counts = { house: 42, shop: 13, lab: 2 };
  s.levels = { house: 3, lab: 1 };
  s.lastSeen = 1770000000000; s.lastExport = 1769999000000; s.boostUntil = 1770000050000;
  s.muted = true; s.seenIntro = true; s.seen = { pop100: true, pop1000: true };
  s.city = [{ t: 'house', lot: 11, fl: 3, q: 0 }, { t: 'lab', lot: 12, fl: 1, q: 1 }];
  s.exported = 321;
  const back = TM.deserialize(JSON.parse(JSON.stringify(TM.serialize(s))));
  ok(back.cash === s.cash && back.lifetime === s.lifetime && back.stars === s.stars,
    'save: cash/lifetime/stars roundtrip exactly');
  ok(back.counts.house === 42 && back.counts.shop === 13 && back.counts.lab === 2 &&
     back.levels.house === 3 && back.levels.lab === 1,
    'save: counts & levels roundtrip');
  ok(back.lastSeen === s.lastSeen && back.lastExport === s.lastExport && back.boostUntil === s.boostUntil,
    'save: timestamps roundtrip');
  ok(back.muted === true && back.seenIntro === true && back.seen.pop1000 === true && back.exported === 321,
    'save: flags & milestone memory roundtrip');
  ok(JSON.stringify(back.city) === JSON.stringify(s.city), 'save: skyline layout roundtrip');
  ok(approx(TM.incomePerSec(back), TM.incomePerSec(s)), 'save: income identical after roundtrip');
  // hostile/corrupt saves
  const junk = TM.deserialize({ cash: 'NaN', lifetime: -50, stars: 'x', counts: { house: 'y', shop: 3.7 }, city: [{ t: 'nope', lot: 1 }, null, { t: 'house', lot: 'z' }] });
  ok(isFinite(junk.cash) && junk.lifetime === 0 && junk.stars === 0 && junk.counts.house === 0 &&
     junk.counts.shop === 3 && junk.city.length === 0,
    'save: corrupt fields sanitized (no NaN, floors floored, bad city rows dropped)');
  ok(TM.deserialize(null).cash === TM.START_CASH, 'save: null save -> fresh state');
}

/* ================= 10h fuzz: no NaN, monotone lifetime ================= */
{
  const rng = TM.mulberry32(20260712);
  const s = TM.newState();
  let bad = 0, lastLifetime = 0, buys = 0, upgrades = 0, prestiges = 0, exports = 0;
  let simNow = 1770000000000;
  for (let step = 0; step < 36000; step++) { // 10h at 1s steps
    simNow += 1000;
    TM.tick(s, 1, simNow);
    if (rng() < 0.15) {
      const t = TM.TYPES[(rng() * TM.TYPES.length) | 0].id;
      const mode = rng();
      if (mode < 0.6) buys += TM.buy(s, t, 1);
      else if (mode < 0.8) buys += TM.buy(s, t, [10, -0][0] && 10);
      else if (TM.upgrade(s, t)) upgrades++;
    }
    if (rng() < 0.002) { const b = TM.maxAffordable('house', TM.countOf(s, 'house'), s.cash); buys += TM.buy(s, 'house', b); }
    if (rng() < 0.001 && TM.canExport(s.lastExport, simNow)) {
      const r = TM.exportResult(s.lifetime, 10, rng(), rng());
      if (!isFinite(r.n) || r.n < 1) bad++;
      s.lastExport = simNow; exports++;
    }
    if (rng() < 0.0005 && TM.prestigeGain(s) >= 1) { TM.doPrestige(s); prestiges++; }
    if (rng() < 0.01) s.boostUntil = simNow + 60000;
    // invariants
    if (!isFinite(s.cash) || !isFinite(s.lifetime) || s.cash < 0 || s.lifetime < lastLifetime - 1e-6) bad++;
    if (!isFinite(TM.incomePerSec(s, simNow)) || !isFinite(TM.population(s))) bad++;
    for (const t of TM.TYPES) {
      if (!isFinite(TM.costOf(s, t.id)) || !isFinite(TM.upgradeCost(s, t.id))) bad++;
    }
    lastLifetime = s.lifetime;
    // serialize roundtrip spot check
    if (step % 6000 === 0) {
      const b2 = TM.deserialize(JSON.parse(JSON.stringify(TM.serialize(s))));
      if (!approx(b2.cash, s.cash) || !approx(TM.incomePerSec(b2), TM.incomePerSec(s))) bad++;
    }
  }
  ok(bad === 0, 'fuzz: 10h simulated progression, zero NaN/negative/regression',
    'buys=' + buys + ' upgrades=' + upgrades + ' prestiges=' + prestiges + ' exports=' + exports +
    ' lifetime=$' + TM.fmt(s.lifetime));
  ok(TM.fmt(s.lifetime).length > 0 && !/NaN/.test(TM.fmt(s.lifetime)), 'fuzz: formatter clean on big numbers');
}

/* ================= number formatting ================= */
{
  ok(TM.fmt(0) === '0' && TM.fmt(999) === '999', 'fmt: small integers verbatim');
  ok(TM.fmt(1234) === '1.23K', 'fmt: 1234 -> 1.23K');
  ok(TM.fmt(3.4e6) === '3.40M', 'fmt: 3.4M');
  ok(TM.fmt(5.6e9) === '5.60B', 'fmt: 5.6B');
  ok(TM.fmt(1.23e12) === '1.23T', 'fmt: 1.23T');
  ok(TM.fmt(0.6) === '0.6', 'fmt: sub-10 fractions get 1 decimal');
  ok(!/NaN|undefined/.test(TM.fmt(NaN)), 'fmt: NaN handled');
}

/* ================= balance curve: time to first prestige ================= */
function simulate(checkEverySec, label) {
  const s = TM.newState();
  let t = 0;
  const DT = 1, LIMIT = 48 * 3600;
  const events = [];
  let nextCheck = 0;
  while (s.lifetime < 1e6 && t < LIMIT) {
    TM.tick(s, DT);
    t += DT;
    if (t >= nextCheck) {
      nextCheck = t + checkEverySec;
      // greedy: repeatedly take the affordable option with best income-gain per $ (payback)
      let acted = true;
      while (acted) {
        acted = false;
        let best = null, bestRatio = 0;
        for (const ty of TM.TYPES) {
          if (!TM.isUnlocked(s, ty.id)) continue;
          const bc = TM.costOf(s, ty.id);
          if (bc <= s.cash) {
            const gain = ty.baseIncome * Math.pow(2, TM.levelOf(s, ty.id)) * TM.starMult(s.stars);
            if (gain / bc > bestRatio) { bestRatio = gain / bc; best = { kind: 'buy', id: ty.id }; }
          }
          const uc = TM.upgradeCost(s, ty.id);
          if (TM.countOf(s, ty.id) > 0 && uc <= s.cash) {
            const ug = TM.typeIncome(s, ty.id) * TM.starMult(s.stars); // doubling adds current income again
            if (ug / uc > bestRatio) { bestRatio = ug / uc; best = { kind: 'up', id: ty.id }; }
          }
        }
        if (best) {
          if (best.kind === 'buy') acted = TM.buy(s, best.id) > 0;
          else acted = TM.upgrade(s, best.id);
          if (acted) events.push(t);
        }
      }
    }
  }
  return { seconds: t, income: TM.incomePerSec(s), actions: events.length, reached: s.lifetime >= 1e6 };
}
{
  const active = simulate(5, 'active');
  const idle = simulate(600, 'idle');
  ok(active.reached, 'balance: active play reaches first prestige', (active.seconds / 60).toFixed(1) + ' min, ' + active.actions + ' purchases');
  ok(idle.reached, 'balance: idle play (10-min check-ins) reaches first prestige', (idle.seconds / 3600).toFixed(2) + ' h');
  ok(active.seconds >= 600 && active.seconds <= 5400, 'balance: first prestige (active) lands in 10-90 min band', (active.seconds / 60).toFixed(1) + ' min');
  ok(idle.seconds <= 12 * 3600, 'balance: first prestige (idle) within 12h', (idle.seconds / 3600).toFixed(2) + ' h');
  ok(idle.seconds > active.seconds, 'balance: active play strictly faster than idle');
  console.log('BALANCE  time to first prestige: active(5s check-ins) = ' + (active.seconds / 60).toFixed(1) +
    ' min  |  idle(10min check-ins) = ' + (idle.seconds / 3600).toFixed(2) + ' h');
  // one 8h offline stint from a decent mid city ~ what fraction of a star?
  const s = TM.newState();
  s.counts = { house: 30, shop: 15, office: 10, factory: 5 };
  const off = TM.offlineEarnings(s, 8 * 3600);
  console.log('BALANCE  8h offline with a mid-game city (30/15/10/5) earns $' + TM.fmt(off) +
    ' (' + (off / 1e6).toFixed(2) + 'x of first-star requirement)');
}

console.log('\n' + passes + ' passed, ' + failures + ' failed');
try { fs.unlinkSync(EXTRACTED); } catch (e) {}
process.exit(failures ? 1 : 0);
