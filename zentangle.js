"use strict";

// Dibujo estilo zentangle sobre lo tachado: la zona del texto se parte en celdas
// irregulares, cada una con un patrón a tinta, y las palabras que quedan van en
// cajitas blancas encima (como las páginas intervenidas a mano).

function seededRandom(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => { // mulberry32
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- geometría ----------
const polyArea = (p) => Math.abs(p.reduce((s, a, i) => {
  const b = p[(i + 1) % p.length];
  return s + a.x * b.y - b.x * a.y;
}, 0)) / 2;

const centroid = (p) => ({
  x: p.reduce((s, a) => s + a.x, 0) / p.length,
  y: p.reduce((s, a) => s + a.y, 0) / p.length,
});

const bounds = (p) => {
  const xs = p.map((a) => a.x), ys = p.map((a) => a.y);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
};

// corta un polígono convexo con la recta que pasa por o con ángulo ang
function splitPoly(poly, o, ang) {
  const n = { x: -Math.sin(ang), y: Math.cos(ang) };
  const side = (a) => (a.x - o.x) * n.x + (a.y - o.y) * n.y;
  const A = [], B = [];
  poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length];
    const da = side(a), db = side(b);
    (da >= 0 ? A : B).push(a);
    if ((da >= 0) !== (db >= 0)) {
      const t = da / (da - db);
      const q = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      A.push(q); B.push(q);
    }
  });
  return [A, B];
}

function tracePoly(ctx, p) {
  ctx.beginPath();
  p.forEach((a, i) => (i ? ctx.lineTo(a.x, a.y) : ctx.moveTo(a.x, a.y)));
  ctx.closePath();
}

// ---------- patrones (cada uno llena el bbox b; el clip lo recorta a la celda) ----------
function rotated(ctx, b, ang, draw) {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2, D = Math.hypot(b.w, b.h) / 2 + 4;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(ang);
  draw(D);
  ctx.restore();
}

const PATTERNS = {
  espirales(ctx, b, u, rnd) {
    const step = u * (0.9 + rnd() * 0.5);
    for (let y = b.y - step; y < b.y + b.h + step; y += step * 0.86) {
      const off = (Math.round((y - b.y) / step) % 2) * step / 2;
      for (let x = b.x - step + off; x < b.x + b.w + step; x += step) {
        const R = step * 0.5, turns = 2.5 + rnd(), start = rnd() * Math.PI * 2;
        ctx.beginPath();
        for (let t = 0; t <= 1; t += 0.02) {
          const a = start + t * turns * Math.PI * 2, r = R * t;
          const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
          t ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
        }
        ctx.stroke();
      }
    }
  },
  ondas(ctx, b, u, rnd) {
    const gap = u * (0.35 + rnd() * 0.25), amp = u * (0.15 + rnd() * 0.2), len = u * (1 + rnd());
    rotated(ctx, b, rnd() * Math.PI, (D) => {
      for (let y = -D; y < D; y += gap) {
        ctx.beginPath();
        for (let x = -D; x <= D; x += 4) {
          const py = y + Math.sin(x / len * Math.PI * 2) * amp;
          x === -D ? ctx.moveTo(x, py) : ctx.lineTo(x, py);
        }
        ctx.stroke();
      }
    });
  },
  rayas(ctx, b, u, rnd) {
    const gap = u * (0.22 + rnd() * 0.2);
    rotated(ctx, b, rnd() * Math.PI, (D) => {
      ctx.beginPath();
      for (let y = -D; y < D; y += gap) { ctx.moveTo(-D, y); ctx.lineTo(D, y); }
      ctx.stroke();
    });
  },
  zigzag(ctx, b, u, rnd) {
    const gap = u * (0.4 + rnd() * 0.2), w = gap * 0.8;
    rotated(ctx, b, rnd() * Math.PI, (D) => {
      for (let y = -D; y < D; y += gap) {
        ctx.beginPath();
        ctx.moveTo(-D, y);
        for (let x = -D, k = 0; x <= D; x += w, k++) ctx.lineTo(x, y + (k % 2 ? gap * 0.45 : 0));
        ctx.stroke();
      }
    });
  },
  circulos(ctx, b, u, rnd, poly) {
    const c = poly[Math.floor(rnd() * poly.length)];
    const gap = u * (0.25 + rnd() * 0.2), D = Math.hypot(b.w, b.h) + u;
    for (let r = gap; r < D; r += gap) {
      ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2); ctx.stroke();
    }
  },
  burbujas(ctx, b, u, rnd) {
    const placed = [];
    for (let k = 0; k < 900 && placed.length < 250; k++) {
      const r = u * (0.12 + rnd() * rnd() * 0.7);
      const x = b.x + rnd() * b.w, y = b.y + rnd() * b.h;
      if (placed.some((c) => Math.hypot(c.x - x, c.y - y) < c.r + r + u * 0.06)) continue;
      placed.push({ x, y, r });
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
      if (r < u * 0.2 && rnd() < 0.5) ctx.fill(); else ctx.stroke();
      if (r > u * 0.35) { ctx.beginPath(); ctx.arc(x, y, r * 0.55, 0, Math.PI * 2); ctx.stroke(); }
    }
  },
  escamas(ctx, b, u, rnd) {
    const r = u * (0.35 + rnd() * 0.2);
    for (let y = b.y - r, row = 0; y < b.y + b.h + r; y += r * 0.9, row++) {
      for (let x = b.x - r + (row % 2) * r; x < b.x + b.w + r; x += r * 2) {
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI); ctx.stroke();
        ctx.beginPath(); ctx.arc(x, y, r * 0.5, 0, Math.PI); ctx.stroke();
      }
    }
  },
  flores(ctx, b, u, rnd) {
    const step = u * (1 + rnd() * 0.4);
    for (let y = b.y; y < b.y + b.h + step; y += step * 0.9) {
      for (let x = b.x + (rnd() - 0.5) * step; x < b.x + b.w + step; x += step) {
        const R = step * 0.42, n = 5 + Math.floor(rnd() * 3), rot = rnd() * Math.PI;
        for (let k = 0; k < n; k++) {
          const a = rot + (k / n) * Math.PI * 2;
          ctx.beginPath();
          ctx.ellipse(x + Math.cos(a) * R * 0.55, y + Math.sin(a) * R * 0.55, R * 0.45, R * 0.22, a, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.beginPath(); ctx.arc(x, y, R * 0.14, 0, Math.PI * 2); ctx.fill();
      }
    }
  },
  noche(ctx, b, u, rnd, poly, paper) {
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.save();
    ctx.fillStyle = paper;
    for (let k = 0; k < (b.w * b.h) / (u * u) * 0.6; k++) {
      ctx.beginPath();
      ctx.arc(b.x + rnd() * b.w, b.y + rnd() * b.h, u * (0.06 + rnd() * rnd() * 0.35), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  },
  hojas(ctx, b, u, rnd) {
    const gap = u * (0.9 + rnd() * 0.4);
    rotated(ctx, b, rnd() * Math.PI, (D) => {
      for (let x = -D; x < D; x += gap) {
        ctx.beginPath(); ctx.moveTo(x, -D); ctx.lineTo(x, D); ctx.stroke();
        for (let y = -D; y < D; y += gap * 0.55) {
          [-1, 1].forEach((s) => {
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.quadraticCurveTo(x + s * gap * 0.45, y - gap * 0.05, x + s * gap * 0.4, y - gap * 0.4);
            ctx.quadraticCurveTo(x + s * gap * 0.1, y - gap * 0.3, x, y);
            ctx.stroke();
          });
        }
      }
    });
  },
};
const PATTERN_NAMES = Object.keys(PATTERNS);

// ---------- dibujo ----------
// rects: cajas de las palabras (coords del canvas); kept[i]: si la palabra queda.
// Devuelve las tiras de palabras que quedan, para que el llamador escriba el texto.
function drawZentangle(ctx, { rects, kept, u, seed, ink, paper, limits }) {
  const rnd = seededRandom(seed);
  const pad = u * 0.3;
  const x1 = Math.max(limits.x1, Math.min(...rects.map((r) => r.x)) - pad);
  const x2 = Math.min(limits.x2, Math.max(...rects.map((r) => r.x + r.w)) + pad);
  const y1 = Math.max(limits.y1, Math.min(...rects.map((r) => r.y)) - pad);
  const y2 = Math.min(limits.y2, Math.max(...rects.map((r) => r.y + r.h)) + pad);

  // celdas: cortes rectos sucesivos, siempre a la celda más grande
  let cells = [[{ x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 }]];
  const target = Math.max(6, Math.min(22, Math.round(((x2 - x1) * (y2 - y1)) / (u * u * 14))));
  while (cells.length < target) {
    cells.sort((a, b) => polyArea(b) - polyArea(a));
    const big = cells.shift();
    const c = centroid(big), bb = bounds(big);
    const o = { x: c.x + (rnd() - 0.5) * bb.w * 0.4, y: c.y + (rnd() - 0.5) * bb.h * 0.4 };
    // cortes más bien perpendiculares al lado largo, con inclinación
    const ang = (bb.w > bb.h ? Math.PI / 2 : 0) + (rnd() - 0.5) * 1.3;
    const [a, b] = splitPoly(big, o, ang);
    if (a.length < 3 || b.length < 3 || Math.min(polyArea(a), polyArea(b)) < u * u * 2) { cells.push(big); break; }
    cells.push(a, b);
  }

  // figuras sueltas encima: círculos y triángulos, algunos asomando del borde
  const extras = [];
  const nExtra = 2 + Math.floor(rnd() * 3);
  for (let k = 0; k < nExtra; k++) {
    if (rnd() < 0.5) {
      const r = u * (1 + rnd() * 1.2), cx = x1 + r + rnd() * (x2 - x1 - 2 * r), cy = y1 + r + rnd() * (y2 - y1 - 2 * r);
      const p = [];
      for (let i = 0; i < 40; i++) p.push({ x: cx + Math.cos(i / 40 * Math.PI * 2) * r, y: cy + Math.sin(i / 40 * Math.PI * 2) * r });
      extras.push(p);
    } else {
      const onLeft = rnd() < 0.5, ex = onLeft ? x1 : x2, out = (onLeft ? -1 : 1) * u * (0.4 + rnd() * 0.6);
      const ty = y1 + rnd() * (y2 - y1 - 4 * u), th = u * (2.5 + rnd() * 3);
      const tip = { x: Math.max(limits.x1 - pad, Math.min(limits.x2 + pad, ex + out)), y: ty + rnd() * th };
      extras.push([{ x: ex - out * 3, y: ty }, tip, { x: ex - out * 3, y: ty + th }]);
    }
  }

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  let last = null;
  const fill = (p, cover) => {
    ctx.save();
    tracePoly(ctx, p);
    ctx.clip();
    if (cover) { ctx.fillStyle = paper; ctx.fill(); ctx.fillStyle = ink; }
    let name;
    do { name = PATTERN_NAMES[Math.floor(rnd() * PATTERN_NAMES.length)]; } while (name === last);
    last = name;
    ctx.lineWidth = u * (0.045 + rnd() * 0.025);
    PATTERNS[name](ctx, bounds(p), u, rnd, p, paper);
    ctx.restore();
    ctx.lineWidth = u * 0.09;
    tracePoly(ctx, p);
    ctx.stroke();
  };
  cells.forEach((p) => fill(p, false));
  extras.forEach((p) => fill(p, true));

  // cajitas para lo que queda: palabras seguidas en el mismo renglón van juntas
  const runs = [];
  rects.forEach((r, i) => {
    if (!kept[i]) return;
    const prev = runs[runs.length - 1];
    if (prev && prev.end === i - 1 && Math.abs(prev.y - r.y) < 2) { prev.x2 = r.x + r.w; prev.end = i; prev.words.push(i); }
    else runs.push({ x1: r.x, x2: r.x + r.w, y: r.y, h: r.h, end: i, words: [i] });
  });
  runs.forEach((b) => {
    const bx = b.x1 - u * 0.18, by = b.y + b.h * 0.02, bw = b.x2 - b.x1 + u * 0.36, bh = b.h * 0.96;
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, u * 0.1);
    ctx.fillStyle = paper;
    ctx.fill();
    ctx.lineWidth = u * 0.07;
    ctx.stroke();
  });
  ctx.fillStyle = ink;
  return runs;
}
