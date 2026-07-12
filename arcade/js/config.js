/* ============================================================
 * CONFIG — the main customization surface of Hungry Hole.
 * Everything gameplay-related that isn't a level definition
 * lives here. Tweak freely; no other file needs to change.
 * ============================================================ */

const CONFIG = {
  hole: {
    startRadius: 22,      // world units (~pixels at zoom 1)
    captureRatio: 0.92,   // object is swallowable if its radius <= hole radius * this
    growthFactor: 0.25,   // fraction of a swallowed object's area added to the hole's area
    baseSpeed: 250,       // movement speed in world units / second at start size
    sizeSlowdown: 0.15,   // exponent: bigger hole moves slower (0 = no slowdown)
    maxRadiusFrac: 0.35,  // hole radius cap, as a fraction of the map's smaller dimension
    magnetRange: 1.3,     // swallowable objects inside radius*this get pulled toward the hole
    magnetSpeed: 90,      // max pull speed of that magnet effect
    speedBoostMult: 1.5,  // ⚡ power-up speed multiplier
    magnetBoostMult: 2.2, // 🧲 power-up magnet range multiplier
  },

  camera: {
    baseSizeFrac: 0.055,  // hole's on-screen radius as fraction of the smaller screen dimension
    growSizeFrac: 0.035,  // extra fraction per doubling of hole size (zooms out as you grow)
    maxSizeFrac: 0.13,    // cap on the hole's on-screen size fraction
    minZoom: 0.3,
    maxZoom: 3.0,
    zoomLerp: 2.5,        // zoom smoothing speed (higher = snappier)
  },

  game: {
    fallDuration: 0.45,        // seconds an object takes to fall into the hole
    allClearBonusPerSec: 15,   // bonus points per remaining second when you swallow everything
    starFracs: [0.25, 0.5, 0.78], // default star thresholds as fractions of a level's total points
    fleeRadius: 150,           // people start running when a hole gets this close
    fleeSpeed: 75,

    // Combos: keep swallowing without pause to build a score multiplier.
    comboWindow: 1.6,          // seconds between swallows to keep the streak alive
    comboStep: 0.05,           // each streak step adds +5% points…
    comboMaxBonus: 1.0,        // …up to +100% (×2)

    // Hazards & rivals
    bombShrink: 0.22,          // swallowing a bomb shrinks the hole by this fraction
    holeEatRatio: 1.25,        // a hole must be this many times bigger to eat another hole
    rivalRespawn: 7,           // seconds before a devoured rival comes back
    eatenGrace: 3,             // seconds of protection after the player gets swallowed
    rivalGrowthMult: 0.55,     // rivals grow this fraction as fast as the player
    bossGrowthMult: 1.0,       // the boss keeps full pace — outgrow him fast or he snowballs
    rivalGreed: 0.65,          // chance a rival picks the BEST target (else a random one)
    rivalStarDiscount: 0.12,   // star thresholds drop this fraction per rival on the level

    // Power-ups & goodies
    powerupDur: { speed: 6, magnet: 7, x2: 8 }, // seconds each boost lasts
    clockPlus: 12,             // seconds the ⏱ power-up adds to the clock
    goldenChance: 0.05,        // chance any object spawns golden…
    goldenMult: 3,             // …worth this many times its points

    // Goals: every level has one; reaching it ends the level early with a bonus.
    goalBonusPerSec: 12,       // bonus points per remaining second when the goal is met

    // Placement density (lower = tighter packing)
    overlapFactor: 0.8,        // scattered objects
    clusterOverlap: 0.68,      // objects inside forests/crowds/plazas/lots

    // FEVER: hit this combo count to go into fever mode until the streak breaks
    feverCombo: 10,
    feverSpeedMult: 1.25,      // extra speed while feverish
    feverScoreMult: 1.5,       // extra score while feverish

    // Endless mode pacing
    endless: {
      spawnInterval: 2.5,      // seconds between respawn batches
      spawnBatch: 8,           // objects per batch (when below targetFill)
      targetFill: 0.85,        // respawn until map is this full again
      rivalInterval: 75,       // a new rival joins every N seconds…
      maxRivals: 3,            // …up to this many alive at once
    },
  },

  audio: {
    enabled: true,
    volume: 0.5,
  },
};

/* ------------------------------------------------------------
 * SKINS — the look of the hole itself. Add your own!
 * rim: ring color, glow: inner glow color, pit: center color.
 * unlockStars: total stars (across all levels) needed to equip.
 * ------------------------------------------------------------ */
const SKINS = [
  { id: 'classic', name: 'Classic', rim: '#8b5cf6', glow: '#c4b5fd', pit: '#08080f', unlockStars: 0 },
  { id: 'lava',    name: 'Lava',    rim: '#f97316', glow: '#fdba74', pit: '#180500', unlockStars: 2 },
  { id: 'neon',    name: 'Neon',    rim: '#22d3ee', glow: '#a5f3fc', pit: '#020617', unlockStars: 5 },
  { id: 'toxic',   name: 'Toxic',   rim: '#84cc16', glow: '#d9f99d', pit: '#051403', unlockStars: 9 },
  { id: 'gold',    name: 'Gold',    rim: '#facc15', glow: '#fef08a', pit: '#141003', unlockStars: 14 },
  { id: 'rose',    name: 'Rose',    rim: '#fb7185', glow: '#fecdd3', pit: '#170208', unlockStars: 20 },
];

/* Rival hole identities, used in level order. */
const RIVAL_STYLES = [
  { name: 'CHOMP',  rim: '#ef4444', glow: '#fca5a5', pit: '#170404' },
  { name: 'GOBBLE', rim: '#3b82f6', glow: '#93c5fd', pit: '#040917' },
  { name: 'NIBBLE', rim: '#10b981', glow: '#6ee7b7', pit: '#041710' },
];

/* The boss. Starts huge, never flees, always hungry. */
const BOSS_STYLE = { name: 'GOLIATH', rim: '#ff9500', glow: '#ffc966', pit: '#1a0e00' };

/* ------------------------------------------------------------
 * THEMES — the look of the world, referenced by levels.
 * ------------------------------------------------------------ */
const THEMES = {
  park:    { ground: '#69a95c', groundAlt: '#5f9e53', outside: '#2c4a28', road: '#c9bd9d', roadLine: '#b5a883', sidewalk: '#d6cbae', tree: '#2f7031', bush: '#3f8a3c', water: '#4f93c4', waterEdge: '#8fc3e0', plaza: '#d9cfb4', plazaLine: '#c4b795' },
  suburb:  { ground: '#8fb573', groundAlt: '#85ab69', outside: '#3a5230', road: '#6f7278', roadLine: '#e8e6df', sidewalk: '#b7bcc0', tree: '#356e33', bush: '#4a8a44', water: '#4f93c4', waterEdge: '#8fc3e0', plaza: '#d3cbb6', plazaLine: '#beb397' },
  city:    { ground: '#9aa0a6', groundAlt: '#90969c', outside: '#42464c', road: '#54575e', roadLine: '#d8d5c8', sidewalk: '#b6bbc2', tree: '#3f7a3d', bush: '#4d8a48', water: '#3d7fb5', waterEdge: '#7db2d6', plaza: '#c8c2b2', plazaLine: '#b0a88f' },
  night:   { ground: '#3b3f52', groundAlt: '#363a4c', outside: '#14161f', road: '#23252f', roadLine: '#8f8f6a', sidewalk: '#4d5268', tree: '#274d33', bush: '#2e5c3a', water: '#1d3b5c', waterEdge: '#3d6b96', plaza: '#565a70', plazaLine: '#464a5e' },
  desert:  { ground: '#dcb877', groundAlt: '#d3af6e', outside: '#7a5f34', road: '#a98d5c', roadLine: '#e9dcb8', sidewalk: '#cbb083', tree: '#5e8a3c', bush: '#7d9944', water: '#3f97b8', waterEdge: '#83c6dd', plaza: '#e3cfa0', plazaLine: '#cdb582' },
  snow:    { ground: '#e8edf2', groundAlt: '#dde4ec', outside: '#8d9aab', road: '#aab4c0', roadLine: '#e8e6df', sidewalk: '#cfd8e2', tree: '#3c6647', bush: '#557a5e', water: '#9fc8e8', waterEdge: '#d3e8f6', plaza: '#d8dfe8', plazaLine: '#bfc9d6' },
  harbor:  { ground: '#a8a294', groundAlt: '#9e988a', outside: '#31556b', road: '#5d6166', roadLine: '#d8d5c8', sidewalk: '#bdb7a8', tree: '#437842', bush: '#548a4d', water: '#33688c', waterEdge: '#6f9fc0', plaza: '#cec6b0', plazaLine: '#b7ab8e' },
  metro:   { ground: '#7d838c', groundAlt: '#747a83', outside: '#22252b', road: '#43464e', roadLine: '#c9c6ba', sidewalk: '#9aa1ab', tree: '#3a703b', bush: '#478245', water: '#2d5c80', waterEdge: '#5d92b6', plaza: '#b8b2a2', plazaLine: '#a09884' },
};

/* ------------------------------------------------------------
 * OBJECT TYPES — everything a hole can swallow.
 * r:      footprint radius in world units (also gates when it's edible)
 * points: score awarded
 * draw:   which vector sprite to use (see render.js DRAW registry)
 * mover:  'walk' wanders (and flees the hole), 'drive' follows roads
 * Add new types here + a draw function in render.js, then use
 * them in any level's spawn table.
 * ------------------------------------------------------------ */
const OBJECT_TYPES = {
  cone:        { r: 7,  points: 5,   draw: 'cone', label: 'cones' },
  trashcan:    { r: 8,  points: 6,   draw: 'trashcan', label: 'trash cans' },
  hydrant:     { r: 8,  points: 8,   draw: 'hydrant', label: 'hydrants' },
  bush:        { r: 11, points: 8,   draw: 'bush', label: 'bushes' },
  mailbox:     { r: 9,  points: 10,  draw: 'mailbox', label: 'mailboxes' },
  flowerbed:   { r: 13, points: 10,  draw: 'flowerbed', label: 'flower beds' },
  streetlight: { r: 10, points: 12,  draw: 'streetlight', label: 'streetlights' },
  bike:        { r: 10, points: 12,  draw: 'bike', label: 'bikes' },
  person:      { r: 7,  points: 15,  draw: 'person', mover: 'walk', speed: 32, label: 'people' },
  bench:       { r: 14, points: 15,  draw: 'bench', label: 'benches' },
  tree:        { r: 16, points: 20,  draw: 'tree', label: 'trees' },
  statue:      { r: 15, points: 30,  draw: 'statue', label: 'statues' },
  table:       { r: 18, points: 25,  draw: 'table', label: 'picnic tables' },
  car:         { r: 24, points: 45,  draw: 'car', mover: 'drive', speed: 95, label: 'cars' },
  kiosk:       { r: 30, points: 70,  draw: 'kiosk', label: 'kiosks' },
  bus:         { r: 30, points: 80,  draw: 'bus', mover: 'drive', speed: 70, label: 'buses' },
  fountain:    { r: 34, points: 90,  draw: 'fountain', label: 'fountains' },
  house:       { r: 48, points: 150, draw: 'house', label: 'houses' },
  building:    { r: 68, points: 320, draw: 'building', label: 'buildings' },
  tower:       { r: 92, points: 650, draw: 'tower', label: 'towers' },
  bomb:        { r: 10, points: 0,   draw: 'bomb', hazard: true, label: 'bombs' }, // shrinks whoever swallows it!

  // Power-ups (only affect the player; rivals that grab one just waste it)
  speed:       { r: 9, points: 0, draw: 'powerup', powerup: 'speed',  puColor: '#ffd23c', puGlyph: '⚡', label: 'speed boosts' },
  magnet:      { r: 9, points: 0, draw: 'powerup', powerup: 'magnet', puColor: '#f45d9a', puGlyph: '🧲', label: 'magnets' },
  x2:          { r: 9, points: 0, draw: 'powerup', powerup: 'x2',     puColor: '#7c5cff', puGlyph: '×2', label: 'score doublers' },
  clock:       { r: 9, points: 0, draw: 'powerup', powerup: 'clock',  puColor: '#39c2e8', puGlyph: '⏱', label: 'time bonuses' },
};
