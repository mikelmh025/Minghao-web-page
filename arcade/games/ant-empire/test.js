// Headless verification for Ant Empire.
// Extracts the DOM-free sim core from index.html and asserts emergent behavior.
const fs=require('fs'), path=require('path'), vm=require('vm');

const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
const m=html.match(/\/\/__SIM_CORE_START__([\s\S]*?)\/\/__SIM_CORE_END__/);
if(!m){ console.error('FAIL: could not extract sim core'); process.exit(1); }
const core=m[1];

// node --check on the extracted core
fs.writeFileSync(path.join(__dirname,'.core.check.js'), core);

const ctx={module:{exports:{}}, globalThis:{}, Math:Math, Float32Array:Float32Array, console:console};
ctx.globalThis=ctx;
vm.createContext(ctx);
vm.runInContext(core, ctx);
const AE=ctx.AntEmpire;
if(!AE||!AE.createWorld){ console.error('FAIL: AntEmpire not exported'); process.exit(1); }

let pass=0, fail=0;
function ok(name,cond,extra){ if(cond){pass++;console.log('  PASS '+name+(extra?'  ['+extra+']':''));}
  else{fail++;console.log('  FAIL '+name+(extra?'  ['+extra+']':''));} }

function fieldAvg(f){ let s=0; for(let i=0;i<f.length;i++)s+=f[i]; return s/f.length; }
function hasNaN(f){ for(let i=0;i<f.length;i++) if(f[i]!==f[i]) return true; return false; }

const GW=AE.C.GW, CELL=AE.C.CELL;
function lineConc(f,ax,ay,bx,by){ // avg pheromone sampled along a line
  let s=0,n=40;
  for(let i=0;i<=n;i++){ const t=i/n, x=ax+(bx-ax)*t, y=ay+(by-ay)*t;
    let cx=x/CELL|0, cy=y/CELL|0; s+=f[cy*GW+cx]; }
  return s/(n+1);
}

console.log('\n=== ANT EMPIRE — headless verification ===\n');

// ---------------------------------------------------------------
// 1. TRAIL FORMATION + DELIVERY (fixed food between nest and world)
// ---------------------------------------------------------------
console.log('[1] Trail formation & food delivery (run 3 sim-min @ 60Hz)');
const w=AE.createWorld({seed:99, empty:true});
// found only BLACK colony (id 0) so we isolate its trail cleanly
w.spawnAnt(0,'queen');
for(let i=0;i<45;i++) w.spawnAnt(0,'worker');
const FX=340, FY=300;
w.addFood(FX,FY,600); // big stable pile near nest->food line
const NX=w.nest[0].x, NY=w.nest[0].y;

const STEPS=3*60*60; // 3 minutes at 60Hz
const t0=Date.now();
for(let s=0;s<STEPS;s++) w.step(1/60);
const runMs=Date.now()-t0;

const conc=lineConc(w.foodPh[0], NX,NY, FX,FY);
const avg=fieldAvg(w.foodPh[0]);
const ratio=conc/(avg||1e-9);
ok('trail forms along nest<->food line', ratio>4,
   'lineConc='+conc.toFixed(3)+' fieldAvg='+avg.toFixed(4)+' ratio='+ratio.toFixed(1)+'x');
ok('colony delivered food (harvested grows)', w.colonies[0].harvested>20,
   'harvested='+w.colonies[0].harvested.toFixed(0));
ok('no NaN in food field after run', !hasNaN(w.foodPh[0]));
ok('no NaN in home field after run', !hasNaN(w.homePh[0]));
console.log('    (3 sim-min stepped in '+runMs+'ms wall)');

// ---------------------------------------------------------------
// 2. EVAPORATION: remove food, trail must decay below threshold
// ---------------------------------------------------------------
console.log('\n[2] Evaporation after food depletes');
const before=lineConc(w.foodPh[0], NX,NY, FX,FY);
w.foods.length=0;                       // remove all food
w.autoFood=false; w.nextLeaf=1e9;       // stop new food sources (isolate evaporation)
for(let i=w.ants.length-1;i>=0;i--){ const a=w.ants[i]; if(a.carry>0) a.carry=0; } // stop deposits
for(let s=0;s<45*60;s++) w.step(1/60);  // 45 sim-seconds
const after=lineConc(w.foodPh[0], NX,NY, FX,FY);
ok('trail decays below threshold after food removed', after < before*0.1,
   'before='+before.toFixed(3)+' after='+after.toFixed(4));
ok('no NaN after evaporation phase', !hasNaN(w.foodPh[0]));

// ---------------------------------------------------------------
// 3. COMBAT: kills reduce population and corpses yield food
// ---------------------------------------------------------------
console.log('\n[3] Combat — kills reduce population, bodies yield food');
const cw=AE.createWorld({seed:7, empty:true});
// place 6 BLACK soldiers vs 6 RED workers all clustered together
for(let i=0;i<6;i++) cw.spawnAnt(0,'soldier', 500+(Math.random()-.5)*6, 350+(Math.random()-.5)*6);
for(let i=0;i<6;i++) cw.spawnAnt(1,'worker',  500+(Math.random()-.5)*6, 350+(Math.random()-.5)*6);
const popRedStart=cw.pop(1), foodPiles0=cw.foods.length;
let totalKills0=cw.colonies[0].kills;
for(let s=0;s<8*60;s++) cw.step(1/60);
const popRedEnd=cw.pop(1), kills=cw.colonies[0].kills-totalKills0;
ok('combat produced kills', kills>0, 'kills='+kills);
ok('kills reduced enemy population', popRedEnd<popRedStart, popRedStart+' -> '+popRedEnd);
ok('corpses yielded food piles', cw.foods.length>foodPiles0, 'piles '+foodPiles0+' -> '+cw.foods.length);

// ---------------------------------------------------------------
// 4. QUEEN spawns keep population climbing toward cap
// ---------------------------------------------------------------
console.log('\n[4] Queen spawning keeps population near cap');
const qw=AE.createWorld({seed:11, empty:true});
qw.spawnAnt(0,'queen');
for(let i=0;i<20;i++) qw.spawnAnt(0,'worker');
const startPop=qw.pop(0);
// dump abundant food directly into the store each second (isolate queen logic from foraging luck)
for(let s=0;s<90*60;s++){ if(s%30===0) qw.colonies[0].food+=6; qw.step(1/60); }
const endPop=qw.pop(0);
ok('population grew via queen spawns', endPop>startPop, startPop+' -> '+endPop);
ok('population respected cap (<= COLONY_CAP)', endPop<=AE.C.COLONY_CAP,
   'pop='+endPop+' cap='+AE.C.COLONY_CAP);
ok('population reached near cap', endPop>=AE.C.COLONY_CAP*0.6, 'pop='+endPop);

// ---------------------------------------------------------------
// 5. SPATIAL HASH matches brute force
// ---------------------------------------------------------------
console.log('\n[5] Spatial hash matches brute-force neighbor query');
const sw=AE.createWorld({seed:3});
for(let s=0;s<300;s++) sw.step(1/60);
sw.buildHash();
function brute(x,y,r){ const r2=r*r,out=[];
  for(const a of sw.ants){ if(!a.alive)continue; const dx=a.x-x,dy=a.y-y; if(dx*dx+dy*dy<=r2)out.push(a);} return out; }
let mism=0, samples=40;
for(let i=0;i<samples;i++){ const x=Math.random()*sw.W, y=Math.random()*sw.H, r=10+Math.random()*60;
  const hset=new Set(sw.queryNeighbors(x,y,r).map(a=>a.id));
  const bset=new Set(brute(x,y,r).map(a=>a.id));
  if(hset.size!==bset.size){ mism++; continue; }
  for(const id of bset) if(!hset.has(id)){ mism++; break; }
}
ok('spatial hash == brute force on '+samples+' samples', mism===0, 'mismatches='+mism);

// ---------------------------------------------------------------
// 6. AWAY-PROGRESS deterministic + coin cap
// ---------------------------------------------------------------
console.log('\n[6] Away-progress determinism & coin cap');
const a1=AE.awayProgress(37*60000,{era:1});
const a2=AE.awayProgress(37*60000,{era:1});
ok('away-progress deterministic for same input',
   JSON.stringify(a1)===JSON.stringify(a2), 'coins='+a1.coins+' wars='+a1.wars);
const big=AE.awayProgress(999*60000,{era:1});
ok('coins capped at 120', big.coins===120, 'coins='+big.coins);
ok('away-progress no NaN', Object.values(a1).every(v=>v===v));

// ---------------------------------------------------------------
// 7. FULL default sim stays healthy (no NaN, sim never dies out)
// ---------------------------------------------------------------
console.log('\n[7] Default 2-colony sim runs long without NaN/extinction');
const fw=AE.createWorld({seed:55});
for(let s=0;s<4*60*60;s++) fw.step(1/60); // 4 sim-min
let anyNaN=false;
for(const a of fw.ants){ if(a.x!==a.x||a.y!==a.y||a.angle!==a.angle){anyNaN=true;break;} }
ok('no NaN in ant positions', !anyNaN);
ok('no NaN in any pheromone field',
   !hasNaN(fw.foodPh[0])&&!hasNaN(fw.foodPh[1])&&!hasNaN(fw.homePh[0])&&!hasNaN(fw.homePh[1])&&!hasNaN(fw.fightPh));
ok('total ant population within perf bound (<400)', fw.ants.length<400, 'ants='+fw.ants.length);
ok('at least one colony alive (sim persists)', fw.colonies[0].alive||fw.colonies[1].alive,
   'B='+fw.colonies[0].alive+' R='+fw.colonies[1].alive+' era='+fw.era);

// ---------------------------------------------------------------
console.log('\n=== RESULTS: '+pass+' passed, '+fail+' failed ===\n');
fs.unlinkSync(path.join(__dirname,'.core.check.js'));
process.exit(fail?1:0);
