/* ============================================================
 * LEVELS — the level designer's file.
 *
 * Each level is a plain object:
 *   name        display name
 *   theme       key into THEMES (config.js)
 *   width/height  map size in world units
 *   time        seconds on the clock
 *   seed        any integer — same seed = same layout every run
 *   roadSpacing distance between roads (0 or omitted = no roads)
 *   movingCars  if true, most cars/buses drive along the roads
 *   spawns      { objectType: count } — types from OBJECT_TYPES
 *               (bomb: N for hazards, speed/magnet/x2/clock for power-ups)
 *   rivals      number of AI rival holes (0-3)
 *   rivalSpeed  optional speed multiplier for rivals (default 0.92)
 *   goal        ends the level EARLY (with a time bonus) when met:
 *                 { type: 'score3' }                  reach the 3-star score (default)
 *                 { type: 'size', value: 5 }          grow to ×5 starting size
 *                 { type: 'eatType', obj: 'car', count: 20 }
 *                 { type: 'clear' }                   swallow everything
 *   features    terrain & structured placement:
 *                 river: true      a river crosses the map (roads become bridges)
 *                 lakes: N         round lakes (holes can't cross water!)
 *                 plazas: N        tiled plaza with fountain, benches, crowd
 *                 forests: N       dense tree clusters
 *                 parkingLots: N   packed rows of parked cars
 *                 crowds: N        groups of people
 *   starFracs   optional [f1,f2,f3] override of CONFIG.game.starFracs
 *
 * Star thresholds are computed automatically from the total points
 * available on the map (discounted when rivals are present), so
 * tweaking spawn counts never breaks the balance.
 * ============================================================ */

const LEVELS = [
  {
    name: 'First Bite',
    theme: 'park',
    width: 1300, height: 950,
    time: 80,
    seed: 101,
    goal: { type: 'size', value: 3 },
    features: { forests: 2, crowds: 1 },
    spawns: { bush: 34, tree: 16, bench: 12, person: 16, cone: 10, streetlight: 8, mailbox: 6, trashcan: 10, bike: 6, flowerbed: 8, table: 6, kiosk: 4, house: 2, speed: 1 },
    starFracs: [0.2, 0.45, 0.72],
  },
  {
    name: 'Picnic Panic',
    theme: 'park',
    width: 1600, height: 1200,
    time: 100,
    seed: 202,
    goal: { type: 'clear' },
    features: { lakes: 2, forests: 2, crowds: 2, plazas: 1 },
    spawns: { bush: 34, tree: 22, bench: 16, person: 24, kiosk: 8, house: 4, cone: 12, streetlight: 10, hydrant: 6, table: 12, flowerbed: 10, trashcan: 10, bike: 8, statue: 3, speed: 1, magnet: 1 },
  },
  {
    name: 'Sleepy Suburb',
    theme: 'suburb',
    width: 1800, height: 1300,
    time: 110,
    seed: 303,
    roadSpacing: 360,
    goal: { type: 'eatType', obj: 'house', count: 12 },
    features: { lakes: 1, forests: 2, parkingLots: 1, crowds: 1 },
    spawns: { house: 18, tree: 24, bush: 22, car: 18, person: 20, mailbox: 14, hydrant: 12, bench: 10, streetlight: 14, trashcan: 10, bike: 8, flowerbed: 10, table: 6, speed: 1, clock: 1 },
  },
  {
    name: 'Rush Hour',
    theme: 'city',
    width: 2000, height: 1400,
    time: 115,
    seed: 404,
    roadSpacing: 340,
    movingCars: true,
    goal: { type: 'eatType', obj: 'car', count: 20 },
    features: { plazas: 1, parkingLots: 2, crowds: 2 },
    spawns: { building: 10, house: 10, car: 30, bus: 4, person: 28, cone: 16, hydrant: 10, streetlight: 18, kiosk: 10, tree: 14, mailbox: 8, trashcan: 12, bike: 10, statue: 2, speed: 2, magnet: 1, clock: 1 },
  },
  {
    name: 'Copy Cat',
    theme: 'city',
    width: 1900, height: 1350,
    time: 110,
    seed: 4242,
    roadSpacing: 360,
    rivals: 1,
    features: { plazas: 1, crowds: 2, parkingLots: 1 },
    spawns: { building: 8, house: 12, car: 20, bus: 2, person: 26, cone: 14, hydrant: 8, streetlight: 14, kiosk: 10, tree: 14, bench: 10, trashcan: 10, bike: 8, statue: 2, speed: 2, magnet: 1, x2: 1 },
  },
  {
    name: 'Market Day',
    theme: 'suburb',
    width: 1900, height: 1400,
    time: 115,
    seed: 505,
    roadSpacing: 380,
    goal: { type: 'eatType', obj: 'kiosk', count: 14 },
    features: { plazas: 2, crowds: 3 },
    spawns: { kiosk: 20, person: 34, bench: 14, tree: 16, car: 12, cone: 18, mailbox: 8, house: 8, building: 4, table: 14, trashcan: 12, flowerbed: 8, statue: 2, fountain: 1, bike: 10, speed: 1, magnet: 2, clock: 1 },
  },
  {
    name: 'Neon Nights',
    theme: 'night',
    width: 2200, height: 1500,
    time: 125,
    seed: 606,
    roadSpacing: 340,
    movingCars: true,
    rivals: 1,
    features: { river: true, plazas: 2, parkingLots: 2, crowds: 2 },
    spawns: { building: 14, tower: 2, car: 26, bus: 4, person: 30, streetlight: 24, kiosk: 12, cone: 14, hydrant: 8, tree: 10, trashcan: 12, bike: 8, statue: 3, bomb: 8, speed: 2, magnet: 1, x2: 2, clock: 1 },
  },
  {
    name: 'Dust & Cactus',
    theme: 'desert',
    width: 2200, height: 1600,
    time: 125,
    seed: 707,
    roadSpacing: 420,
    goal: { type: 'size', value: 8 },
    features: { lakes: 2, forests: 1, crowds: 1, parkingLots: 1 },
    spawns: { house: 20, bush: 30, tree: 14, car: 16, person: 18, cone: 12, kiosk: 10, building: 8, hydrant: 6, trashcan: 8, bike: 6, statue: 3, table: 8, bomb: 10, speed: 2, clock: 2 },
  },
  {
    name: 'Snow Day',
    theme: 'snow',
    width: 2300, height: 1600,
    time: 135,
    seed: 808,
    roadSpacing: 400,
    goal: { type: 'clear' },
    features: { lakes: 3, forests: 3, crowds: 2 },
    spawns: { house: 20, tree: 30, person: 24, car: 18, bus: 2, bench: 14, hydrant: 8, streetlight: 16, building: 8, kiosk: 8, trashcan: 10, bike: 6, statue: 3, flowerbed: 6, bomb: 8, speed: 2, magnet: 2, clock: 2, x2: 1 },
  },
  {
    name: 'Harbor District',
    theme: 'harbor',
    width: 2500, height: 1700,
    time: 145,
    seed: 909,
    roadSpacing: 380,
    movingCars: true,
    rivals: 1,
    goal: { type: 'eatType', obj: 'building', count: 10 },
    features: { river: true, plazas: 1, parkingLots: 2, crowds: 2 },
    spawns: { building: 14, kiosk: 14, car: 24, bus: 4, person: 28, cone: 20, tree: 12, bench: 12, house: 12, tower: 3, mailbox: 8, trashcan: 14, bike: 10, statue: 3, fountain: 1, bomb: 10, speed: 2, magnet: 2, x2: 1, clock: 1 },
  },
  {
    name: 'Metropolis',
    theme: 'metro',
    width: 2800, height: 2000,
    time: 175,
    seed: 1010,
    roadSpacing: 330,
    movingCars: true,
    rivals: 2,
    features: { river: true, plazas: 2, parkingLots: 3, crowds: 3 },
    spawns: { tower: 10, building: 22, car: 34, bus: 6, person: 38, streetlight: 26, kiosk: 14, cone: 18, hydrant: 14, tree: 16, bush: 12, house: 10, bench: 12, trashcan: 16, bike: 12, statue: 4, fountain: 2, bomb: 12, speed: 3, magnet: 2, x2: 2, clock: 2 },
  },
  {
    name: 'Feeding Frenzy',
    theme: 'night',
    width: 3000, height: 2200,
    time: 190,
    seed: 1313,
    roadSpacing: 350,
    movingCars: true,
    rivals: 3,
    rivalSpeed: 0.98,
    features: { river: true, plazas: 2, parkingLots: 3, crowds: 4 },
    spawns: { tower: 12, building: 24, house: 14, car: 36, bus: 6, person: 44, streetlight: 28, kiosk: 16, cone: 20, hydrant: 14, tree: 18, bush: 14, bench: 14, mailbox: 10, trashcan: 16, bike: 12, statue: 4, fountain: 2, bomb: 16, speed: 3, magnet: 3, x2: 3, clock: 2 },
  },
  {
    name: 'Golden Hour',
    theme: 'park',
    width: 2000, height: 1450,
    time: 110,
    seed: 1414,
    goal: { type: 'eatType', obj: 'person', count: 60 },
    features: { lakes: 2, forests: 2, crowds: 5, plazas: 2 },
    spawns: { person: 50, bush: 24, tree: 20, bench: 14, table: 12, kiosk: 10, flowerbed: 10, trashcan: 10, bike: 8, statue: 4, fountain: 2, house: 6, streetlight: 12, speed: 2, magnet: 2, x2: 1 },
  },
  {
    name: 'Bomb Alley',
    theme: 'desert',
    width: 2300, height: 1600,
    time: 130,
    seed: 1515,
    roadSpacing: 380,
    movingCars: true,
    features: { parkingLots: 2, crowds: 2, lakes: 1 },
    spawns: { house: 18, building: 10, car: 24, bus: 4, person: 20, bush: 18, tree: 10, kiosk: 10, cone: 14, hydrant: 8, trashcan: 10, statue: 3, bomb: 24, speed: 3, clock: 2, x2: 1 },
  },
  {
    name: 'Frozen Frenzy',
    theme: 'snow',
    width: 2400, height: 1700,
    time: 140,
    seed: 1616,
    roadSpacing: 380,
    movingCars: true,
    rivals: 1,
    goal: { type: 'clear' },
    features: { lakes: 3, forests: 3, crowds: 2 },
    spawns: { house: 20, tree: 28, person: 24, car: 18, bus: 3, bench: 12, building: 8, kiosk: 8, streetlight: 14, trashcan: 10, bike: 6, statue: 3, bomb: 8, speed: 2, magnet: 2, clock: 2 },
  },
  {
    name: 'Twin Harbors',
    theme: 'harbor',
    width: 2600, height: 1800,
    time: 150,
    seed: 1717,
    roadSpacing: 370,
    movingCars: true,
    rivals: 1,
    goal: { type: 'eatType', obj: 'tree', count: 18 },
    features: { river: true, lakes: 2, plazas: 2, parkingLots: 2, crowds: 2 },
    spawns: { building: 14, kiosk: 12, car: 22, bus: 4, person: 26, tree: 22, bench: 12, house: 10, tower: 4, mailbox: 8, trashcan: 12, statue: 3, fountain: 2, bomb: 10, speed: 2, magnet: 2, x2: 2 },
  },
  {
    name: 'Twilight Towers',
    theme: 'metro',
    width: 2800, height: 2000,
    time: 165,
    seed: 1818,
    roadSpacing: 340,
    movingCars: true,
    rivals: 2,
    goal: { type: 'eatType', obj: 'tower', count: 8 },
    features: { river: true, plazas: 2, parkingLots: 3, crowds: 3 },
    spawns: { tower: 14, building: 20, house: 8, car: 30, bus: 6, person: 34, streetlight: 24, kiosk: 12, cone: 16, hydrant: 12, tree: 12, trashcan: 14, bike: 10, statue: 4, bomb: 12, speed: 3, magnet: 2, x2: 2, clock: 2 },
  },
  {
    name: 'The Gauntlet',
    theme: 'night',
    width: 3000, height: 2200,
    time: 200,
    seed: 1919,
    roadSpacing: 350,
    movingCars: true,
    rivals: 3,
    rivalSpeed: 1.0,
    goal: { type: 'size', value: 12 },
    features: { river: true, plazas: 2, parkingLots: 3, crowds: 3, forests: 1 },
    spawns: { tower: 12, building: 24, house: 14, car: 36, bus: 6, person: 42, streetlight: 28, kiosk: 16, cone: 20, hydrant: 12, tree: 16, bush: 12, bench: 12, trashcan: 16, bike: 12, statue: 4, fountain: 2, bomb: 20, speed: 4, magnet: 3, x2: 3, clock: 3 },
  },
  {
    name: 'The Big One',
    theme: 'metro',
    width: 2600, height: 1900,
    time: 210,
    seed: 2001,
    roadSpacing: 340,
    movingCars: true,
    boss: true, // GOLIATH: one giant rival. Outgrow him by 25%, then eat him.
    goal: { type: 'boss' },
    features: { river: true, plazas: 2, parkingLots: 2, crowds: 3 },
    spawns: { tower: 10, building: 22, house: 14, car: 32, bus: 6, person: 40, streetlight: 26, kiosk: 14, cone: 18, hydrant: 12, tree: 16, bush: 12, bench: 12, mailbox: 8, trashcan: 14, bike: 10, statue: 4, fountain: 2, bomb: 12, speed: 3, magnet: 2, x2: 2, clock: 3 },
  },
  {
    // Epilogue: the city threw a carnival. No roads, no cars — a pedestrian
    // midway of game booths and fountain squares. Two rivals crash the party
    // and race you to strip the fairground bare.
    name: 'The Midway',
    theme: 'night',
    width: 2100, height: 1500,
    time: 135,
    seed: 2424,
    rivals: 2,
    rivalSpeed: 0.94,
    goal: { type: 'clear' },
    features: { plazas: 3, crowds: 4, forests: 1, lakes: 1, parkingLots: 1 },
    spawns: { kiosk: 24, person: 40, streetlight: 20, cone: 16, table: 12, bench: 12, tree: 12, bush: 12, trashcan: 12, bike: 10, mailbox: 6, statue: 5, fountain: 3, house: 6, building: 6, tower: 2, bomb: 10, speed: 2, magnet: 2, x2: 2, clock: 2 },
  },
];

/* Hole Wars: Reversal — the tables turn. You don't control a hole;
 * AI holes eat YOUR city while you place bait, bombs and towers to
 * starve them. Survive the clock with the city intact. */
const REVERSAL_LEVEL = {
  name: 'Hole Wars: Reversal',
  reversal: true,
  theme: 'city',
  width: 2000, height: 1400,
  time: 150,
  seed: 4004,
  roadSpacing: 340,
  movingCars: true,
  rivals: 2,
  rivalSpeed: 0.9,
  features: { plazas: 1, parkingLots: 2, crowds: 2 },
  spawns: { building: 12, house: 14, car: 26, bus: 4, person: 30, cone: 14, hydrant: 10, streetlight: 16, kiosk: 10, tree: 14, mailbox: 8, trashcan: 12, bike: 8, statue: 3, bench: 10, table: 6, flowerbed: 6 },
};

/* Endless mode: no clock, no stars — objects respawn forever and a new
 * rival joins the feast every so often. How big can you get? */
const ENDLESS_LEVEL = {
  name: 'Endless City',
  endless: true,
  theme: 'city',
  width: 2600, height: 1900,
  time: 0,
  seed: 777,
  roadSpacing: 340,
  movingCars: true,
  features: { river: true, plazas: 2, parkingLots: 2, crowds: 3, forests: 1 },
  spawns: { tower: 8, building: 18, house: 12, car: 30, bus: 5, person: 36, streetlight: 22, kiosk: 12, cone: 16, hydrant: 12, tree: 16, bush: 12, bench: 12, mailbox: 8, trashcan: 14, bike: 10, statue: 4, fountain: 2, table: 8, flowerbed: 8, bomb: 10, speed: 2, magnet: 2, x2: 2, clock: 1 },
};
