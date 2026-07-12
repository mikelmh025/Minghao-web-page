#!/usr/bin/env node
/* Headless test harness for Lucky Wheel.
   Extracts the inline <script> from index.html, syntax-checks it,
   then unit-tests the DOM-free logic core (LW). */
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

const LW = require(EXTRACTED);

let failures = 0, passes = 0;
function ok(cond, name, detail) {
  if (cond) { passes++; console.log('PASS  ' + name + (detail ? '  [' + detail + ']' : '')); }
  else { failures++; console.error('FAIL  ' + name + (detail ? '  [' + detail + ']' : '')); }
}

/* ================= roulette physics ================= */
{
  const rng = LW.mulberry32(20260712);
  const N = 500;
  const counts = new Array(37).fill(0);
  let maxT = 0, unsettled = 0;
  for (let i = 0; i < N; i++) {
    const s = LW.runSpin(rng);
    if (s.phase !== 'settled' || s.result < 0 || s.result > 36) unsettled++;
    else counts[LW.WHEEL_ORDER.indexOf(s.result)]++;
    if (s.t > maxT) maxT = s.t;
  }
  ok(unsettled === 0, 'physics: every spin settles on a valid number', 'max spin time ' + maxT.toFixed(1) + 's');
  const missing = counts.filter(c => c === 0).length;
  ok(missing === 0, 'physics: all 37 pockets hit over ' + N + ' spins', missing + ' missing');
  const exp = N / 37;
  const maxC = Math.max(...counts);
  ok(maxC < 2 * exp, 'physics: no pocket > 2x expected', 'max ' + maxC + ' vs limit ' + (2 * exp).toFixed(1));
  const chi2 = counts.reduce((a, c) => a + (c - exp) * (c - exp) / exp, 0);
  ok(chi2 < 67.99, 'physics: chi-square uniformity sanity (df=36, p=.001 crit 67.99)', 'chi2=' + chi2.toFixed(1));
}

/* ================= roulette payouts ================= */
{
  const P = (bet, n) => LW.payoutFor(bet, n);
  ok(P({ type: 'straight', nums: [17], amount: 10 }, 17) === 360, 'payout: straight 35:1 win (10 -> 360)');
  ok(P({ type: 'straight', nums: [17], amount: 10 }, 18) === 0, 'payout: straight loss');
  ok(P({ type: 'straight', nums: [0], amount: 5 }, 0) === 180, 'payout: straight on zero');
  ok(P({ type: 'split', nums: [17, 20], amount: 10 }, 20) === 180, 'payout: split 17:1 win');
  ok(P({ type: 'split', nums: [17, 20], amount: 10 }, 19) === 0, 'payout: split loss');
  ok(P({ type: 'corner', nums: [17, 18, 20, 21], amount: 10 }, 21) === 90, 'payout: corner 8:1 win');
  ok(P({ type: 'corner', nums: [17, 18, 20, 21], amount: 10 }, 22) === 0, 'payout: corner loss');
  ok(P({ type: 'red', amount: 10 }, 32) === 20, 'payout: red 1:1 win');
  ok(P({ type: 'red', amount: 10 }, 26) === 0, 'payout: red loses on black');
  ok(P({ type: 'red', amount: 10 }, 0) === 0, 'payout: red loses on zero');
  ok(P({ type: 'black', amount: 10 }, 26) === 20, 'payout: black win');
  ok(P({ type: 'black', amount: 10 }, 0) === 0, 'payout: black loses on zero');
  ok(P({ type: 'odd', amount: 10 }, 35) === 20 && P({ type: 'odd', amount: 10 }, 0) === 0, 'payout: odd win, zero loses');
  ok(P({ type: 'even', amount: 10 }, 8) === 20 && P({ type: 'even', amount: 10 }, 0) === 0, 'payout: even win, zero loses');
  ok(P({ type: 'low', amount: 10 }, 18) === 20 && P({ type: 'low', amount: 10 }, 19) === 0, 'payout: low 1-18 boundary');
  ok(P({ type: 'high', amount: 10 }, 19) === 20 && P({ type: 'high', amount: 10 }, 0) === 0, 'payout: high 19-36, zero loses');
  ok(P({ type: 'dozen', d: 0, amount: 9 }, 12) === 27 && P({ type: 'dozen', d: 0, amount: 9 }, 13) === 0, 'payout: dozen 1 (2:1)');
  ok(P({ type: 'dozen', d: 2, amount: 9 }, 25) === 27 && P({ type: 'dozen', d: 2, amount: 9 }, 0) === 0, 'payout: dozen 3, zero loses');
  ok(P({ type: 'column', d: 0, amount: 9 }, 34) === 27, 'payout: column 1 contains 34');
  ok(P({ type: 'column', d: 1, amount: 9 }, 35) === 27, 'payout: column 2 contains 35');
  ok(P({ type: 'column', d: 2, amount: 9 }, 36) === 27 && P({ type: 'column', d: 2, amount: 9 }, 0) === 0, 'payout: column 3, zero loses');
}

/* ================= wallet ================= */
{
  function fakeStorage(init) {
    const map = { 'arcade-wallet': init };
    return { getItem: k => (k in map ? map[k] : null), setItem: (k, v) => { map[k] = v; }, _map: map };
  }
  let w = LW.loadWallet(fakeStorage('{"coins":150,"earned":{"pong":30},"spent":80}'));
  ok(w.coins === 150 && w.earned.pong === 30 && w.spent === 80, 'wallet: loads well-formed wallet');
  w = LW.loadWallet(fakeStorage('not json {{{'));
  ok(w.coins === 0 && typeof w.earned === 'object' && w.spent === 0, 'wallet: corrupt JSON -> safe defaults');
  w = LW.loadWallet(fakeStorage('{"coins":"NaN","earned":null,"spent":-5}'));
  ok(w.coins === 0 && w.spent === 0 && w.earned && typeof w.earned === 'object', 'wallet: NaN/negative sanitized');
  w = { coins: 50, earned: {}, spent: 0 };
  ok(LW.walletSpend(w, 30) === true && w.coins === 20 && w.spent === 30, 'wallet: spend deducts + tracks spent');
  ok(LW.walletSpend(w, 21) === false && w.coins === 20, 'wallet: overdraft refused, balance unchanged');
  ok(LW.walletSpend(w, -5) === false && LW.walletSpend(w, NaN) === false && w.coins === 20, 'wallet: negative/NaN spend refused');
  LW.walletCredit(w, 70, 40);
  ok(w.coins === 90 && w.earned['lucky-wheel'] === 40, 'wallet: credit pays coins, net win into earned[lucky-wheel]');
  LW.walletCredit(w, 10, -10);
  ok(w.coins === 100 && w.earned['lucky-wheel'] === 40, 'wallet: non-positive net not added to earned');
  // fuzz: random ops never produce negative or NaN balance
  const rng = LW.mulberry32(7);
  w = { coins: 100, earned: {}, spent: 0 };
  let bad = false;
  for (let i = 0; i < 2000; i++) {
    const amt = Math.floor(rng() * 300) - 20;
    if (rng() < 0.5) LW.walletSpend(w, amt); else LW.walletCredit(w, amt, amt - 10);
    if (!Number.isFinite(w.coins) || w.coins < 0 || !Number.isFinite(w.spent)) { bad = true; break; }
  }
  ok(!bad, 'wallet: 2000-op fuzz — coins never negative or NaN');
  // stimulus cooldown
  const t0 = 1000000;
  ok(LW.canStimulus(0, t0) === true, 'stimulus: available with no prior grant');
  w = { coins: 5, earned: {}, spent: 0 };
  ok(LW.grantStimulus(w, 0, t0) === true && w.coins === 5 + LW.STIM_AMOUNT, 'stimulus: grants +' + LW.STIM_AMOUNT);
  ok(LW.canStimulus(t0, t0 + 59999) === false, 'stimulus: blocked at 59.999s');
  ok(LW.grantStimulus(w, t0, t0 + 30000) === false && w.coins === 205, 'stimulus: re-grant refused during cooldown');
  ok(LW.canStimulus(t0, t0 + 60000) === true, 'stimulus: available again at exactly 60s');
}

/* ================= blackjack ================= */
{
  const rng = LW.mulberry32(99);
  const C = r => ({ r, s: 0 });
  // rig(drawOrder): cards popped from end of shoe; pad below so no reshuffle triggers
  function rigged(drawOrder) {
    const g = new LW.Blackjack(rng);
    const pad = [];
    for (let i = 0; i < 80; i++) pad.push(C(2));
    g.shoe = pad.concat(drawOrder.map(C).reverse());
    return g;
  }
  // 1) dealer stands on SOFT 17 (A+6), player 20 wins 1:1
  let g = rigged([10, 1, 10, 6]); // p:10, d:A(up), p:10, d:6(hole)
  g.startRound(10);
  ok(g.phase === 'insurance', 'bj: insurance offered vs dealer ace');
  g.insurance(false);
  ok(g.phase === 'player', 'bj: play continues after peek (no dealer BJ)');
  g.stand();
  let res = g.settle();
  ok(g.dealer.length === 2 && LW.handValue(g.dealer).total === 17 && LW.handValue(g.dealer).soft,
    'bj: dealer STANDS on soft 17 (A,6 — no extra card)');
  ok(res.outcomes[0] === 'win' && res.credit === 20, 'bj: player 20 beats soft 17, paid 1:1', 'credit=' + res.credit);

  // 2) dealer hits 16
  g = rigged([10, 10, 9, 6, 5]); // p:10, d:10, p:9, d:6 -> dealer 16 must hit -> 5 => 21
  g.startRound(10);
  g.stand();
  res = g.settle();
  ok(g.dealer.length === 3 && LW.handValue(g.dealer).total === 21, 'bj: dealer hits hard 16');
  ok(res.outcomes[0] === 'lose' && res.credit === 0, 'bj: dealer 21 beats player 19');

  // 3) blackjack pays 3:2
  g = rigged([1, 9, 13, 7]); // p:A, d:9, p:K, d:7
  g.startRound(20);
  ok(g.phase === 'settle', 'bj: natural ends the round immediately');
  res = g.settle();
  ok(res.outcomes[0] === 'blackjack' && res.credit === 50, 'bj: blackjack pays 3:2 (20 -> 50)', 'credit=' + res.credit);

  // 3b) blackjack vs dealer blackjack = push
  g = rigged([1, 1, 13, 12]); // p:A, d:A, p:K, d:Q -> both BJ
  g.startRound(20);
  g.insurance(false);
  res = g.settle();
  ok(res.dealerBJ && res.outcomes[0] === 'push' && res.credit === 20, 'bj: BJ vs BJ pushes');

  // 4) double: 11 vs dealer 17, draw 10 -> 21 wins double bet
  g = rigged([5, 10, 6, 7, 10]); // p:5, d:10, p:6, d:7 ; double draws 10
  g.startRound(10);
  ok(g.canDouble(), 'bj: double offered on 2 cards');
  g.double();
  ok(g.bets[0] === 20, 'bj: double doubles the bet');
  res = g.settle();
  ok(res.outcomes[0] === 'win' && res.credit === 40, 'bj: doubled 21 vs 17 pays 40 on 10 base bet', 'credit=' + res.credit);

  // 5) split 8,8 vs dealer 17: hands 18 (win) + 17 (push)
  g = rigged([8, 10, 8, 7, 10, 9]); // p:8, d:10, p:8, d:7 ; split -> h0 gets 10 (18), h1 gets 9 (17)
  g.startRound(10);
  ok(g.canSplit(), 'bj: split offered on pair');
  g.splitHand();
  ok(g.hands.length === 2 && g.hands[0].length === 2 && g.hands[1].length === 2, 'bj: split makes two 2-card hands');
  g.stand(); // hand 0 at 18
  g.stand(); // hand 1 at 17
  res = g.settle();
  ok(res.outcomes[0] === 'win' && res.outcomes[1] === 'push' && res.credit === 30,
    'bj: split resolves per-hand (win + push = 30)', 'credit=' + res.credit);
  ok(g.canSplit() === false, 'bj: only one split allowed');

  // 5b) split aces: one card each, auto-stand, 21 is NOT blackjack
  g = rigged([1, 10, 1, 7, 13, 5]); // p:A, d:10, p:A, d:7 ; split -> A+K(21), A+5(16)
  g.startRound(10);
  g.splitHand();
  ok(g.phase === 'settle', 'bj: split aces auto-stand after one card each');
  res = g.settle();
  ok(res.outcomes[0] === 'win' && res.credit === 20 + 0, 'bj: split-ace 21 pays 1:1 (not 3:2)', 'credit=' + res.credit);

  // 6) insurance: dealer has BJ, insurance pays 2:1
  g = rigged([10, 1, 9, 13]); // p:10, d:A, p:9, d:K -> dealer BJ
  g.startRound(20);
  ok(g.phase === 'insurance', 'bj: insurance phase vs ace');
  g.insurance(true);
  ok(g.insuranceBet === 10, 'bj: insurance costs half the bet');
  res = g.settle();
  ok(res.insuranceWon && res.credit === 30 && res.outcomes[0] === 'lose',
    'bj: dealer BJ -> hand loses, insurance returns 3x side bet (30)', 'credit=' + res.credit);

  // 6b) insurance declined, dealer no BJ, normal play
  g = rigged([10, 1, 9, 8, 2]); // p:10, d:A, p:9, d:8 (soft 19 stands)
  g.startRound(10);
  g.insurance(false);
  g.stand();
  res = g.settle();
  ok(res.outcomes[0] === 'push' && res.credit === 10, 'bj: declined insurance, 19 vs soft 19 pushes');

  // 7) bust
  g = rigged([10, 10, 6, 7, 10]); // p 16, dealer 17; hit -> 10 = 26 bust
  g.startRound(10);
  g.hit();
  ok(g.phase === 'settle', 'bj: bust ends hand');
  res = g.settle();
  ok(res.outcomes[0] === 'bust' && res.credit === 0, 'bj: bust loses stake');
  ok(g.dealer.length === 2, 'bj: dealer draws no cards when all player hands bust');

  // 8) shoe reshuffles at 25% penetration (<= 52 of 208)
  g = new LW.Blackjack(LW.mulberry32(5));
  ok(g.shoe.length === 208, 'bj: 4-deck shoe holds 208 cards');
  g.shoe = g.shoe.slice(0, 52); // force to penetration point
  const before = g.shuffles;
  g.startRound(10);
  ok(g.shuffles === before + 1 && g.shoe.length === 208 - 4, 'bj: shoe reshuffles at 25% penetration');
  // depletion across many rounds never errors
  let okDeplete = true;
  const g2 = new LW.Blackjack(LW.mulberry32(6));
  for (let i = 0; i < 400; i++) {
    g2.startRound(10);
    if (g2.phase === 'insurance') g2.insurance(false);
    while (g2.phase === 'player') {
      if (LW.handValue(g2.hands[g2.active]).total < 17) g2.hit(); else g2.stand();
    }
    const r = g2.settle();
    if (!r || !Number.isFinite(r.credit) || r.credit < 0) { okDeplete = false; break; }
  }
  ok(okDeplete, 'bj: 400 auto-played rounds, shoe depletion/reshuffle never breaks payouts');
}

/* ================= slots ================= */
{
  ok(LW.slotPayoutMult(['seven', 'seven', 'seven']) === 120, 'slots: 7-7-7 pays 120x');
  ok(LW.slotPayoutMult(['star', 'star', 'star']) === 40, 'slots: star triple 40x');
  ok(LW.slotPayoutMult(['bell', 'bell', 'bell']) === 20, 'slots: bell triple 20x');
  ok(LW.slotPayoutMult(['coin', 'coin', 'coin']) === 12, 'slots: coin triple 12x');
  ok(LW.slotPayoutMult(['cherry', 'cherry', 'cherry']) === 6, 'slots: cherry triple 6x');
  ok(LW.slotPayoutMult(['cherry', 'cherry', 'bell']) === 2, 'slots: left two cherries 2x');
  ok(LW.slotPayoutMult(['bell', 'cherry', 'cherry']) === 0, 'slots: right two cherries pay nothing');
  ok(LW.slotPayoutMult(['seven', 'seven', 'bell']) === 0, 'slots: two sevens pay nothing');
  // strip matches weights
  const stripCount = {};
  LW.SLOT_STRIP.forEach(s => { stripCount[s] = (stripCount[s] || 0) + 1; });
  const stripOK = LW.SLOT_SYMBOLS.every(s => stripCount[s] === LW.SLOT_WEIGHTS[s]);
  ok(stripOK && LW.SLOT_STRIP.length === 19, 'slots: visual strip matches reel weights');
  // RTP over 100k pulls
  const rng = LW.mulberry32(424242);
  let staked = 0, returned = 0;
  for (let i = 0; i < 100000; i++) {
    staked += 1;
    returned += LW.slotPayoutMult(LW.spinReels(rng));
  }
  const rtp = returned / staked;
  ok(rtp >= 0.85 && rtp <= 0.98, 'slots: RTP in [85%, 98%] over 100k pulls', 'RTP=' + (rtp * 100).toFixed(2) + '%');
}

console.log('\n' + passes + ' passed, ' + failures + ' failed');
process.exit(failures ? 1 : 0);
