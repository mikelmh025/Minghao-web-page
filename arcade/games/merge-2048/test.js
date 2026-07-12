#!/usr/bin/env node
/* Headless test harness for Merge 2048.
   Extracts the inline <script> from index.html, syntax-checks it,
   then unit-tests the DOM-free core:
   - regression: classic merge behavior, scoring, spawn-after-move
   - DAILY PUZZLE: seeded deterministic boards + spawn stream
   - 40-move limit: only board-changing moves consume; locks when spent
   - milestones: 512/1024/2048 fire once per run */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const HTML = path.join(__dirname, 'index.html');
const EXTRACTED = path.join(os.tmpdir(), 'merge-2048-core.js');

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
const vals = g => JSON.stringify(CORE.gridValues(g));
const countTiles = g => CORE.gridValues(g).flat().filter(v => v > 0).length;

/* ---------- 1. Regression: normal merge mechanics ---------- */
{
  const g = CORE.gridFromValues([[2, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
  const res = CORE.applyMove(g, 'left');
  const row = CORE.gridValues(res.grid)[0];
  ok(JSON.stringify(row) === '[4,0,0,0]', 'row [2,2,0,0] left-merges to [4,0,0,0]', JSON.stringify(row));
  ok(res.moved && res.gained === 4 && res.merges.length === 1,
     'merge counts as a move and scores +4', 'gained=' + res.gained);

  // single-pass merge: [2,2,2,2] -> [4,4,0,0], not [8,...]
  const g2 = CORE.gridFromValues([[2, 2, 2, 2], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
  const r2 = CORE.applyMove(g2, 'left');
  ok(JSON.stringify(CORE.gridValues(r2.grid)[0]) === '[4,4,0,0]',
     'each tile merges at most once per move');

  // score accumulation + spawn after each changing move (via daily engine)
  const game = CORE.createDailyGame(424242);
  const dirs = ['left', 'up', 'right', 'down'];
  let sum = 0, sawSpawn = false;
  for (let i = 0; i < 12 && !game.over; i++) {
    const before = countTiles(game.grid);
    const r = CORE.dailyMove(game, dirs[i % 4]);
    if (r.moved) {
      sum += r.gained;
      if (r.spawned && countTiles(game.grid) === before - r.merges.length + 1) sawSpawn = true;
    }
  }
  ok(sawSpawn, 'a new tile spawns after a board-changing move');
  ok(sum > 0 && game.score === sum, 'score accumulates across moves', 'score=' + game.score);
}

/* ---------- 2. Daily determinism ---------- */
{
  const a = CORE.createDailyGame(20260712);
  const b = CORE.createDailyGame(20260712);
  ok(vals(a.grid) === vals(b.grid), 'same seed → identical starting boards', vals(a.grid));
  const n = countTiles(a.grid);
  ok(n >= 4 && n <= 6, 'daily board has 4-6 pre-placed tiles', n + ' tiles');
  ok(CORE.gridValues(a.grid).flat().every(v => [0, 2, 4, 8, 16].indexOf(v) !== -1),
     'pre-placed tiles are from {2,4,8,16}');

  const seq = ['left', 'up', 'right', 'down', 'left', 'down', 'up', 'right', 'left', 'up'];
  for (const d of seq) { CORE.dailyMove(a, d); CORE.dailyMove(b, d); }
  ok(vals(a.grid) === vals(b.grid) && a.score === b.score,
     'same move sequence → identical boards and scores', 'score=' + a.score);

  const c = CORE.createDailyGame(19991231);
  const fresh = CORE.createDailyGame(20260712);
  ok(vals(c.grid) !== vals(fresh.grid), 'different seed → different starting board');
}

/* ---------- 3. 40-move limit ---------- */
{
  ok(CORE.createDailyGame(1).moveLimit === 40 && CORE.DAILY_MOVE_LIMIT === 40,
     'daily move limit is 40');

  // non-changing move does NOT consume a move
  const manual = CORE.createDailyGame(7);
  manual.grid = CORE.gridFromValues([[2, 0, 0, 0], [4, 0, 0, 0], [8, 0, 0, 0], [16, 0, 0, 0]]);
  const before = vals(manual.grid);
  const r0 = CORE.dailyMove(manual, 'left');
  ok(!r0.moved && manual.movesUsed === 0 && vals(manual.grid) === before,
     'non-changing move does not consume a move (no spawn either)');

  // changing moves decrement remaining; game locks after 40
  const game = CORE.createDailyGame(20260712);
  const dirs = ['left', 'up', 'right', 'down'];
  let changing = 0, decOk = true, i = 0;
  while (!game.over && i < 400) {
    const r = CORE.dailyMove(game, dirs[i % 4]); i++;
    if (r.moved) {
      changing++;
      if (r.movesLeft !== 40 - changing) decOk = false;
    }
  }
  ok(decOk, 'each changing move decrements remaining moves by exactly 1');
  ok(game.over && game.movesUsed === 40 && changing === 40,
     'game over/locked after exactly 40 changing moves',
     'movesUsed=' + game.movesUsed + ' score=' + game.score);

  const locked = vals(game.grid);
  const rr = CORE.dailyMove(game, 'left');
  ok(!rr.moved && rr.over && vals(game.grid) === locked && game.movesUsed === 40,
     'further moves are rejected once the daily run is over');
}

/* ---------- 4. Milestones fire once per run ---------- */
{
  const t = CORE.createMilestoneTracker();
  let fired = CORE.checkMilestones(t, [512]);
  ok(fired.length === 1 && fired[0] === 512, 'first 512 merge fires the 512 milestone');
  fired = CORE.checkMilestones(t, [512]);
  ok(fired.length === 0, 'second 512 in the same run does NOT re-fire');
  fired = CORE.checkMilestones(t, [64, 1024, 2048]);
  ok(fired.length === 2 && fired.indexOf(1024) !== -1 && fired.indexOf(2048) !== -1,
     '1024 and 2048 fire; non-milestone values (64) do not');
  const t2 = CORE.createMilestoneTracker();
  ok(CORE.checkMilestones(t2, [512]).length === 1, 'a new run (new tracker) re-arms milestones');
}

if (failures) { console.error(failures + ' FAILURE(S)'); process.exit(1); }
console.log('ALL MERGE 2048 TESTS PASSED');
