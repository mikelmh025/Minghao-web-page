/* ============================================================
 * RENDER — all canvas drawing. Objects are vector-drawn from
 * simple shapes so no image assets are needed. To add a new
 * object type: add a DRAW function here and reference it from
 * OBJECT_TYPES in config.js.
 * ============================================================ */

const CAR_COLORS = ['#d64545', '#3f7fd6', '#e0b23c', '#57a05a', '#8a67c2', '#e07b39', '#c9cdd4'];
const SHIRT_COLORS = ['#d64545', '#3f7fd6', '#e0b23c', '#57a05a', '#c2569a', '#5bb8c9'];
const ROOF_COLORS = ['#b0543f', '#8c5b3f', '#6d7f8c', '#a3453c', '#7a6a55'];

function pick(arr, seed) { return arr[Math.floor(seed * arr.length) % arr.length]; }

// roundRect landed in Safari 16 — fall back to a plain rect on older engines.
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h) {
    this.rect(x, y, w, h);
  };
}

/* Each function draws centered at (0,0); e.r is the footprint radius. */
const DRAW = {
  cone(ctx, e) {
    const R = e.r;
    circle(ctx, 0, 0, R, '#e8722c');
    ring(ctx, 0, 0, R * 0.62, R * 0.28, '#f5f0e6');
    circle(ctx, 0, 0, R * 0.3, '#c95d1e');
  },

  hydrant(ctx, e) {
    const R = e.r;
    circle(ctx, 0, 0, R, '#c93b3b');
    circle(ctx, -R * 0.9, 0, R * 0.32, '#a82f2f');
    circle(ctx, R * 0.9, 0, R * 0.32, '#a82f2f');
    circle(ctx, 0, 0, R * 0.45, '#e05252');
    circle(ctx, 0, 0, R * 0.18, '#8f2626');
  },

  bush(ctx, e, theme) {
    const R = e.r;
    const c = theme.bush;
    circle(ctx, -R * 0.4, R * 0.15, R * 0.62, c);
    circle(ctx, R * 0.4, R * 0.12, R * 0.6, c);
    circle(ctx, 0, -R * 0.25, R * 0.68, shade(c, 12));
    circle(ctx, 0, 0, R * 0.34, shade(c, 24));
  },

  mailbox(ctx, e) {
    const R = e.r;
    rrect(ctx, -R * 0.85, -R * 0.65, R * 1.7, R * 1.3, R * 0.35, '#3565b0');
    rrect(ctx, -R * 0.55, -R * 0.32, R * 1.1, R * 0.28, R * 0.12, '#274e8d');
  },

  streetlight(ctx, e) {
    const R = e.r;
    circle(ctx, 0, 0, R * 0.5, '#5b6068');
    circle(ctx, 0, 0, R * 0.26, '#3e4249');
    // lamp glow
    ctx.globalAlpha = 0.45;
    circle(ctx, R * 0.75, 0, R * 0.55, '#ffe9a3');
    ctx.globalAlpha = 1;
    circle(ctx, R * 0.75, 0, R * 0.3, '#ffd75e');
  },

  person(ctx, e, theme, t) {
    const R = e.r;
    const bob = Math.sin(t * 10 + e.seed * 20) * R * 0.12;
    // shoulders + head, top-down
    circle(ctx, 0, bob * 0.3, R, pick(SHIRT_COLORS, e.seed));
    circle(ctx, R * 0.25 + bob * 0.2, 0, R * 0.55, '#e8b58c');
    circle(ctx, R * 0.25 + bob * 0.2, 0, R * 0.34, '#4a3222');
  },

  bench(ctx, e) {
    const R = e.r;
    rrect(ctx, -R, -R * 0.45, R * 2, R * 0.9, R * 0.15, '#8a5a33');
    ctx.fillStyle = '#75482a';
    for (let i = -2; i <= 2; i++) ctx.fillRect(i * R * 0.36 - R * 0.06, -R * 0.45, R * 0.12, R * 0.9);
  },

  tree(ctx, e, theme) {
    const R = e.r;
    circle(ctx, 0, 0, R * 0.22, '#6b4a2a'); // trunk peeking through
    circle(ctx, 0, 0, R, theme.tree);
    circle(ctx, -R * 0.25, -R * 0.25, R * 0.55, shade(theme.tree, 14));
  },

  car(ctx, e) {
    const R = e.r;
    const c = pick(CAR_COLORS, e.seed);
    const L = R * 1.9, Wd = R * 1.0;
    rrect(ctx, -L / 2, -Wd / 2, L, Wd, R * 0.28, c);
    rrect(ctx, -L * 0.18, -Wd * 0.38, L * 0.42, Wd * 0.76, R * 0.18, shade(c, -20)); // roof
    rrect(ctx, -L * 0.14, -Wd * 0.34, L * 0.1, Wd * 0.68, R * 0.08, '#bcd6e8');     // windshield
    circle(ctx, L / 2 - R * 0.14, -Wd * 0.3, R * 0.11, '#fff3c4');
    circle(ctx, L / 2 - R * 0.14, Wd * 0.3, R * 0.11, '#fff3c4');
  },

  kiosk(ctx, e) {
    const R = e.r;
    const S = R * 1.5;
    rrect(ctx, -S / 2, -S / 2, S, S, R * 0.15, '#b8895a');
    // striped awning
    const stripes = 6;
    for (let i = 0; i < stripes; i++) {
      ctx.fillStyle = i % 2 ? '#e8e2d4' : '#c94f4f';
      ctx.fillRect(-S / 2 + (S / stripes) * i, -S / 2, S / stripes, S * 0.3);
    }
    rrect(ctx, -S * 0.18, -S * 0.05, S * 0.36, S * 0.4, R * 0.08, '#7a5230');
  },

  house(ctx, e) {
    const R = e.r;
    const Wd = R * 1.7, Hd = R * 1.35;
    const roof = pick(ROOF_COLORS, e.seed);
    rrect(ctx, -Wd / 2, -Hd / 2, Wd, Hd, R * 0.08, roof);
    // roof ridge highlight
    ctx.fillStyle = shade(roof, 16);
    ctx.beginPath();
    ctx.moveTo(-Wd / 2, -Hd / 2); ctx.lineTo(Wd / 2, -Hd / 2);
    ctx.lineTo(0, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = shade(roof, -18);
    ctx.beginPath();
    ctx.moveTo(-Wd / 2, Hd / 2); ctx.lineTo(Wd / 2, Hd / 2);
    ctx.lineTo(0, 0); ctx.closePath(); ctx.fill();
    circle(ctx, Wd * 0.28, -Hd * 0.22, R * 0.12, '#5b5f66'); // chimney
  },

  building(ctx, e) {
    const R = e.r;
    const Wd = R * 1.6, Hd = R * 1.6;
    const base = pick(['#8d99a8', '#a89a8d', '#98a08d', '#9a8f9e'], e.seed);
    rrect(ctx, -Wd / 2, -Hd / 2, Wd, Hd, R * 0.06, base);
    rrect(ctx, -Wd * 0.42, -Hd * 0.42, Wd * 0.84, Hd * 0.84, R * 0.04, shade(base, 10));
    // rooftop units
    rrect(ctx, -Wd * 0.28, -Hd * 0.28, Wd * 0.22, Hd * 0.22, R * 0.03, shade(base, -22));
    rrect(ctx, Wd * 0.08, Hd * 0.05, Wd * 0.26, Hd * 0.18, R * 0.03, shade(base, -16));
    circle(ctx, Wd * 0.2, -Hd * 0.22, R * 0.09, shade(base, -30));
  },

  tower(ctx, e) {
    const R = e.r;
    const Wd = R * 1.5, Hd = R * 1.5;
    rrect(ctx, -Wd / 2, -Hd / 2, Wd, Hd, R * 0.05, '#5f6b7a');
    rrect(ctx, -Wd * 0.4, -Hd * 0.4, Wd * 0.8, Hd * 0.8, R * 0.04, '#717d8c');
    rrect(ctx, -Wd * 0.28, -Hd * 0.28, Wd * 0.56, Hd * 0.56, R * 0.03, '#828e9e');
    circle(ctx, 0, 0, R * 0.16, '#4a545f');
    circle(ctx, 0, 0, R * 0.07, '#d64545'); // antenna beacon
    rrect(ctx, Wd * 0.12, Hd * 0.12, Wd * 0.2, Hd * 0.14, R * 0.02, '#4a545f');
  },

  trashcan(ctx, e) {
    const R = e.r;
    circle(ctx, 0, 0, R, '#6b7178');
    ring(ctx, 0, 0, R * 0.78, R * 0.16, '#565c63');
    rrect(ctx, -R * 0.45, -R * 0.1, R * 0.9, R * 0.2, R * 0.08, '#3f444a');
  },

  bike(ctx, e) {
    const R = e.r;
    ring(ctx, -R * 0.55, 0, R * 0.42, R * 0.14, '#2e3238');
    ring(ctx, R * 0.55, 0, R * 0.42, R * 0.14, '#2e3238');
    ctx.strokeStyle = '#c9463d';
    ctx.lineWidth = R * 0.16;
    ctx.beginPath();
    ctx.moveTo(-R * 0.55, 0); ctx.lineTo(0, -R * 0.18); ctx.lineTo(R * 0.55, 0);
    ctx.stroke();
    rrect(ctx, R * 0.38, -R * 0.32, R * 0.34, R * 0.14, R * 0.06, '#2e3238'); // handlebars
    rrect(ctx, -R * 0.68, -R * 0.3, R * 0.28, R * 0.12, R * 0.05, '#4a3222'); // seat
  },

  flowerbed(ctx, e) {
    const R = e.r;
    rrect(ctx, -R, -R * 0.65, R * 2, R * 1.3, R * 0.25, '#6d4c2f');
    rrect(ctx, -R * 0.85, -R * 0.5, R * 1.7, R, R * 0.2, '#4f7a34');
    const petals = ['#e35d6a', '#f2c14e', '#e88ac2', '#f0f0f0', '#c05de3'];
    for (let i = 0; i < 6; i++) {
      const a = e.seed * 7 + i * 1.9;
      circle(ctx, Math.cos(a) * R * 0.55, Math.sin(a) * R * 0.3, R * 0.16, petals[(i + Math.floor(e.seed * 5)) % petals.length]);
    }
  },

  statue(ctx, e) {
    const R = e.r;
    circle(ctx, 0, 0, R, '#9aa0a4');
    circle(ctx, 0, 0, R * 0.72, '#aab0b5');
    circle(ctx, 0, R * 0.05, R * 0.4, '#8d9397');   // shoulders
    circle(ctx, 0, -R * 0.12, R * 0.22, '#b8bec2'); // head
    ring(ctx, 0, 0, R * 0.9, R * 0.1, '#84898d');
  },

  table(ctx, e) {
    const R = e.r;
    // umbrella over a picnic table, top-down
    circle(ctx, R * 0.2, R * 0.2, R * 0.5, '#8a5a33'); // table peeking out
    const cols = e.seed > 0.5 ? ['#d64545', '#f0ead8'] : ['#3f7fd6', '#f0ead8'];
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = cols[i % 2];
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, R, (i / 8) * Math.PI * 2, ((i + 1) / 8) * Math.PI * 2);
      ctx.closePath();
      ctx.fill();
    }
    circle(ctx, 0, 0, R * 0.12, '#5b6068'); // pole
  },

  fountain(ctx, e, theme, t) {
    const R = e.r;
    circle(ctx, 0, 0, R, '#9aa0a4');
    ring(ctx, 0, 0, R * 0.88, R * 0.14, '#84898d');
    circle(ctx, 0, 0, R * 0.72, theme.water);
    circle(ctx, 0, 0, R * 0.2, '#aab0b5');
    // animated spray droplets
    for (let i = 0; i < 6; i++) {
      const a = t * 1.2 + i * 1.05;
      const d = R * (0.3 + ((t * 0.5 + i * 0.37) % 0.4));
      ctx.globalAlpha = 0.7;
      circle(ctx, Math.cos(a) * d, Math.sin(a) * d, R * 0.06, theme.waterEdge);
      ctx.globalAlpha = 1;
    }
  },

  bus(ctx, e) {
    const R = e.r;
    const c = pick(['#e0a83c', '#4a8ad4', '#5aa86a', '#d05a4a'], e.seed);
    const L = R * 2.6, Wd = R * 0.95;
    rrect(ctx, -L / 2, -Wd / 2, L, Wd, R * 0.18, c);
    rrect(ctx, -L * 0.42, -Wd * 0.36, L * 0.84, Wd * 0.72, R * 0.1, shade(c, -22)); // roof
    for (let i = 0; i < 5; i++) {
      rrect(ctx, -L * 0.36 + i * L * 0.16, -Wd * 0.3, L * 0.09, Wd * 0.6, R * 0.04, '#bcd6e8'); // skylights
    }
    circle(ctx, L / 2 - R * 0.12, -Wd * 0.3, R * 0.1, '#fff3c4');
    circle(ctx, L / 2 - R * 0.12, Wd * 0.3, R * 0.1, '#fff3c4');
  },

  powerup(ctx, e, theme, t) {
    const R = e.r;
    const bob = Math.sin(t * 3 + e.seed * 20) * R * 0.18;
    ctx.translate(0, bob);
    const pulse = 1 + Math.sin(t * 5 + e.seed * 10) * 0.12;
    ctx.globalAlpha = 0.35;
    circle(ctx, 0, 0, R * 1.7 * pulse, e.def.puColor);
    ctx.globalAlpha = 1;
    const grad = ctx.createRadialGradient(-R * 0.3, -R * 0.3, R * 0.1, 0, 0, R * 1.15);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(1, e.def.puColor);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, R * 1.15, 0, Math.PI * 2);
    ctx.fill();
    ring(ctx, 0, 0, R * 1.15, R * 0.14, shade(e.def.puColor, -40));
    ctx.fillStyle = '#1c1c22';
    ctx.font = `900 ${R * 1.15}px -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(e.def.puGlyph, 0, R * 0.06);
  },

  bomb(ctx, e, theme, t) {
    const R = e.r;
    circle(ctx, 0, 0, R, '#1c1c22');
    circle(ctx, -R * 0.3, -R * 0.3, R * 0.32, '#3a3a44'); // highlight
    ctx.strokeStyle = '#8a6d3b';
    ctx.lineWidth = R * 0.18;
    ctx.beginPath();
    ctx.moveTo(R * 0.5, -R * 0.5);
    ctx.quadraticCurveTo(R * 1.1, -R * 0.9, R * 0.9, -R * 1.25); // fuse
    ctx.stroke();
    // blinking warning light
    if (Math.sin(t * 9 + e.seed * 30) > 0) {
      ctx.globalAlpha = 0.85;
      circle(ctx, 0, 0, R * 0.3, '#ff4d4d');
      ctx.globalAlpha = 0.25;
      circle(ctx, 0, 0, R * 1.5, '#ff4d4d');
      ctx.globalAlpha = 1;
    }
  },
};

/* ---------- tiny shape helpers ---------- */
function circle(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.1, r), 0, Math.PI * 2);
  ctx.fill();
}
function ring(ctx, x, y, r, w, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.1, r), 0, Math.PI * 2);
  ctx.stroke();
}
function rrect(ctx, x, y, w, h, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}
// Lighten (+) or darken (-) a hex color by `amt` (0-255-ish).
function shade(hex, amt) {
  if (hex[0] !== '#') return hex; // hsl()/rgb() strings pass through untouched
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + amt));
  const b = Math.max(0, Math.min(255, (n & 0xff) + amt));
  return `rgb(${r},${g},${b})`;
}

/* ---------------- Main world draw ---------------- */

function renderWorld(ctx, world, cam, viewW, viewH, skin) {
  const theme = world.theme;
  const hole = world.hole;

  ctx.clearRect(0, 0, viewW, viewH);
  ctx.save();
  ctx.translate(viewW / 2, viewH / 2);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x + (cam.sx || 0), -cam.y + (cam.sy || 0)); // sx/sy = screen shake

  // Visible world rect (for culling)
  const vx0 = cam.x - viewW / 2 / cam.zoom, vx1 = cam.x + viewW / 2 / cam.zoom;
  const vy0 = cam.y - viewH / 2 / cam.zoom, vy1 = cam.y + viewH / 2 / cam.zoom;
  const inView = (x, y, r) => x + r > vx0 && x - r < vx1 && y + r > vy0 && y - r < vy1;

  // --- Ground ---
  ctx.fillStyle = theme.outside;
  ctx.fillRect(vx0 - 10, vy0 - 10, vx1 - vx0 + 20, vy1 - vy0 + 20);
  ctx.fillStyle = theme.ground;
  ctx.fillRect(0, 0, world.W, world.H);

  // subtle checker variation
  const cell = 130;
  ctx.fillStyle = theme.groundAlt;
  const cx0 = Math.max(0, Math.floor(vx0 / cell)), cx1 = Math.min(Math.ceil(world.W / cell), Math.ceil(vx1 / cell));
  const cy0 = Math.max(0, Math.floor(vy0 / cell)), cy1 = Math.min(Math.ceil(world.H / cell), Math.ceil(vy1 / cell));
  for (let gx = cx0; gx < cx1; gx++)
    for (let gy = cy0; gy < cy1; gy++)
      if ((gx + gy) % 2 === 0)
        ctx.fillRect(gx * cell, gy * cell, Math.min(cell, world.W - gx * cell), Math.min(cell, world.H - gy * cell));

  // --- Border tree line (just outside the playable area) ---
  for (const bt of world.deco.borderTrees) {
    if (!inView(bt.x, bt.y, bt.r * 2)) continue;
    circle(ctx, bt.x, bt.y, bt.r, shade(theme.tree, -14));
    circle(ctx, bt.x - bt.r * 0.2, bt.y - bt.r * 0.2, bt.r * 0.6, theme.tree);
  }

  // --- Plazas (tiled circles under their fountain/benches) ---
  for (const pz of world.deco.plazas) {
    if (!inView(pz.x, pz.y, pz.r)) continue;
    circle(ctx, pz.x, pz.y, pz.r, theme.plaza);
    ring(ctx, pz.x, pz.y, pz.r * 0.66, 2.5, theme.plazaLine);
    ring(ctx, pz.x, pz.y, pz.r * 0.33, 2.5, theme.plazaLine);
    ring(ctx, pz.x, pz.y, pz.r - 3, 5, theme.plazaLine);
  }

  // --- Water (river + lakes) ---
  const wtr = world.water;
  if (wtr.river) {
    const rv = wtr.river;
    ctx.fillStyle = theme.water;
    if (rv.axis === 'v') ctx.fillRect(rv.pos - rv.w / 2, 0, rv.w, world.H);
    else ctx.fillRect(0, rv.pos - rv.w / 2, world.W, rv.w);
    ctx.strokeStyle = theme.waterEdge;
    ctx.lineWidth = 5;
    ctx.beginPath();
    if (rv.axis === 'v') {
      ctx.moveTo(rv.pos - rv.w / 2, 0); ctx.lineTo(rv.pos - rv.w / 2, world.H);
      ctx.moveTo(rv.pos + rv.w / 2, 0); ctx.lineTo(rv.pos + rv.w / 2, world.H);
    } else {
      ctx.moveTo(0, rv.pos - rv.w / 2); ctx.lineTo(world.W, rv.pos - rv.w / 2);
      ctx.moveTo(0, rv.pos + rv.w / 2); ctx.lineTo(world.W, rv.pos + rv.w / 2);
    }
    ctx.stroke();
  }
  for (const L of wtr.lakes) {
    if (!inView(L.x, L.y, L.r + 10)) continue;
    circle(ctx, L.x, L.y, L.r, theme.water);
    ring(ctx, L.x, L.y, L.r - 2, 5, theme.waterEdge);
    // lapping ripple
    const rip = (world.t * 0.12) % 0.45;
    ctx.globalAlpha = 0.5 * (1 - rip / 0.45);
    ring(ctx, L.x, L.y, L.r * (0.35 + rip), 2, theme.waterEdge);
    ctx.globalAlpha = 1;
  }

  // --- Roads (drawn after water = bridges!) ---
  const rw = world.roads.width;
  for (const rx of world.roads.xs) {
    ctx.fillStyle = theme.sidewalk;
    ctx.fillRect(rx - rw / 2 - 8, 0, rw + 16, world.H);
    ctx.fillStyle = theme.road;
    ctx.fillRect(rx - rw / 2, 0, rw, world.H);
  }
  for (const ry of world.roads.ys) {
    ctx.fillStyle = theme.sidewalk;
    ctx.fillRect(0, ry - rw / 2 - 8, world.W, rw + 16);
    ctx.fillStyle = theme.road;
    ctx.fillRect(0, ry - rw / 2, world.W, rw);
  }
  // dashed center lines
  ctx.strokeStyle = theme.roadLine;
  ctx.lineWidth = 3;
  ctx.setLineDash([18, 22]);
  ctx.beginPath();
  for (const rx of world.roads.xs) { ctx.moveTo(rx, 0); ctx.lineTo(rx, world.H); }
  for (const ry of world.roads.ys) { ctx.moveTo(0, ry); ctx.lineTo(world.W, ry); }
  ctx.stroke();
  ctx.setLineDash([]);

  // map edge
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 6;
  ctx.strokeRect(0, 0, world.W, world.H);

  // --- Holes (player + rivals), each with its falling prey clipped inside ---
  const playerBlink = world.graceT > 0 && Math.sin(world.t * 14) > 0;
  let playerSkin = skin;
  if (world.fever) {
    const hue = (world.t * 300) % 360;
    playerSkin = { pit: skin.pit, rim: `hsl(${hue},95%,62%)`, glow: `hsl(${(hue + 60) % 360},95%,75%)` };
  }
  drawHole(ctx, world, hole, playerSkin, theme, playerBlink ? 0.45 : 1, world.holePulse || 0);
  for (const rv of world.rivals) {
    if (rv.dead) continue;
    drawHole(ctx, world, rv, rv.style, theme, 1);
    // name tag
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.font = `800 ${13 / cam.zoom}px -apple-system, sans-serif`;
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 3 / cam.zoom;
    ctx.strokeText(rv.style.name, rv.x, rv.y - rv.r - 6 / cam.zoom);
    ctx.fillStyle = rv.style.rim;
    ctx.fillText(rv.style.name, rv.x, rv.y - rv.r - 6 / cam.zoom);
  }

  // --- Idle entities (with shadow) ---
  for (const e of world.entities) {
    if (e.state !== 'idle' || !inView(e.x, e.y, e.r * 2.2)) continue;
    ctx.globalAlpha = 0.18;
    circle(ctx, e.x + e.r * 0.18, e.y + e.r * 0.24, e.r * 0.95, '#000');
    ctx.globalAlpha = 1;
    drawEntity(ctx, e, theme, world.t, 1);
  }

  // --- Surface phase of falling: still tipping over the rim, unclipped ---
  for (const e of world.entities) {
    if (e.state !== 'falling' || e.depth >= 0.25) continue;
    drawEntity(ctx, e, theme, world.t, Math.pow(1 - e.depth, 1.4));
  }

  // --- Particles ---
  for (const p of world.particles) {
    const a = 1 - p.t / p.life;
    ctx.globalAlpha = a * 0.9;
    circle(ctx, p.x, p.y, p.size * a, p.color);
  }
  ctx.globalAlpha = 1;

  // --- Score popups ---
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const p of world.popups) {
    const a = 1 - p.t;
    ctx.globalAlpha = a;
    ctx.fillStyle = p.color || '#ffffff';
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 4 / cam.zoom;
    ctx.font = `800 ${18 / cam.zoom}px -apple-system, sans-serif`; // constant on-screen size
    const py = p.y - p.t * 40;
    ctx.strokeText(p.txt, p.x, py);
    ctx.fillText(p.txt, p.x, py);
  }
  ctx.globalAlpha = 1;

  ctx.restore();
}

/* Draw one hole (player or rival) plus its sinking prey. */
function drawHole(ctx, world, h, colors, theme, alpha, pulse) {
  ctx.globalAlpha = alpha;
  const grad = ctx.createRadialGradient(h.x, h.y, h.r * 0.1, h.x, h.y, h.r);
  grad.addColorStop(0, colors.pit);
  grad.addColorStop(0.75, colors.pit);
  grad.addColorStop(1, shade(colors.rim, -60));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2);
  ctx.fill();

  // rim, puffing up briefly on each swallow
  const p = pulse || 0;
  ring(ctx, h.x, h.y, h.r * (1 + p * 0.05), Math.max(2.5, h.r * 0.07) * (1 + p * 0.8), colors.rim);
  ctx.globalAlpha = alpha * 0.5;
  ring(ctx, h.x, h.y, h.r * 0.9, Math.max(1.5, h.r * 0.05), colors.glow);
  ctx.globalAlpha = alpha;

  ctx.save();
  ctx.beginPath();
  ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2);
  ctx.clip();
  for (const e of world.entities) {
    if (e.state !== 'falling' || e.sink !== h || e.depth < 0.25) continue;
    drawEntity(ctx, e, theme, world.t, Math.max(0, Math.pow(1 - e.depth, 1.4)));
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawEntity(ctx, e, theme, t, scale) {
  ctx.save();
  ctx.translate(e.x, e.y);
  // golden prey glows
  if (e.golden && e.state === 'idle') {
    const pulse = 1 + Math.sin(t * 4 + e.seed * 20) * 0.15;
    ctx.globalAlpha = 0.3;
    circle(ctx, 0, 0, e.r * 1.35 * pulse, '#ffd700');
    ctx.globalAlpha = 1;
  }
  // tipping toward a hole rim: shift + directional squash (reads as leaning in)
  if (e.tiltK > 0 && e.state === 'idle') {
    ctx.translate(Math.cos(e.tiltA) * e.tiltK * e.r * 0.35, Math.sin(e.tiltA) * e.tiltK * e.r * 0.35);
    ctx.rotate(e.tiltA);
    ctx.scale(1 - e.tiltK * 0.35, 1);
    ctx.rotate(-e.tiltA);
  }
  ctx.rotate(e.rot);
  ctx.scale(scale, scale);
  (DRAW[e.def.draw] || DRAW.cone)(ctx, e, theme, t);
  if (e.golden && e.state === 'idle') ring(ctx, 0, 0, e.r * 1.12, 2.5, '#ffd700');
  ctx.restore();
}
