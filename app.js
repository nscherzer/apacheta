"use strict";

const $ = (id) => document.getElementById(id);
const els = {
  page: $("page"), text: $("pageText"), source: $("pageSource"),
  toolbar: $("toolbar"), viewbar: $("viewbar"),
  undo: $("undoBtn"), allLabel: $("allLabel"), toast: $("toast"),
  help: $("helpSheet"), result: $("resultSheet"),
  preview: $("preview"), poem: $("poemText"),
};

const state = {
  index: [],          // [{id, title, author, pages}]
  cache: {},          // id -> [páginas]
  book: null,         // entrada del índice
  pageNo: 0,
  words: [],          // spans .w en orden
  spaces: [],         // spaces[i] = span entre la palabra i y la i+1 (o null)
  struck: new Set(),
  history: [],
  viewing: false,
  confirmNew: false,
  imageBlob: null,
  drawSeed: 0,        // "Otro dibujo" lo cambia
};

const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

function toast(msg) {
  els.toast.textContent = msg;
  els.toast.classList.add("show");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => els.toast.classList.remove("show"), 1800);
}

// ---------- datos ----------
async function loadIndex() {
  state.index = await (await fetch("books/index.json")).json();
}

async function loadBook(id) {
  if (!state.cache[id]) state.cache[id] = await (await fetch(`books/${id}.json`)).json();
  return state.cache[id];
}

function randomPick() {
  const total = state.index.reduce((s, b) => s + b.pages, 0);
  let r = Math.floor(Math.random() * total);
  for (const b of state.index) {
    if (r < b.pages) return { id: b.id, p: r };
    r -= b.pages;
  }
}

// ---------- tachado codificado en el link ----------
function encodeStruck(set, n) {
  const bytes = new Uint8Array(Math.ceil(n / 8));
  set.forEach((i) => { bytes[i >> 3] |= 1 << (i & 7); });
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeStruck(s, n) {
  const set = new Set();
  try {
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
    for (let i = 0; i < n; i++) if (bin.charCodeAt(i >> 3) & (1 << (i & 7))) set.add(i);
  } catch {}
  return set;
}

function shareUrl() {
  const x = encodeStruck(state.struck, state.words.length);
  return `${location.origin}${location.pathname}#b=${state.book.id}&p=${state.pageNo}&x=${x}`;
}

// ---------- render ----------
async function showPage(id, p, struck = new Set(), viewing = false) {
  els.text.innerHTML = '<p class="loading">Abriendo el libro…</p>';
  const pages = await loadBook(id);
  state.book = state.index.find((b) => b.id === id) || state.index[0];
  state.pageNo = Math.min(p, pages.length - 1);
  state.history = [];
  state.viewing = viewing;
  state.confirmNew = false;

  const frag = document.createDocumentFragment();
  state.words = [];
  state.spaces = [];
  pages[state.pageNo].split("\n").forEach((para) => {
    const pEl = document.createElement("p");
    para.split(/\s+/).filter(Boolean).forEach((w, k) => {
      if (k > 0) {
        const sp = document.createElement("span");
        sp.className = "sp";
        sp.textContent = " ";
        pEl.appendChild(sp);
        state.spaces[state.words.length - 1] = sp;
      }
      const span = document.createElement("span");
      span.className = "w";
      span.dataset.i = state.words.length;
      span.textContent = w;
      pEl.appendChild(span);
      state.words.push(span);
    });
    frag.appendChild(pEl);
  });
  els.text.replaceChildren(frag);
  els.source.innerHTML = `<span>${state.book.title} · ${state.book.author}</span><span>p. ${state.pageNo + 1}</span>`;

  state.struck = new Set([...struck].filter((i) => i < state.words.length));
  paint();
  fitText();
  els.page.classList.toggle("viewing", viewing);
  els.toolbar.hidden = viewing;
  els.viewbar.hidden = !viewing;
  if (!viewing) save();
}

function paint() {
  state.words.forEach((w, i) => w.classList.toggle("x", state.struck.has(i)));
  state.spaces.forEach((sp, i) => sp && sp.classList.toggle("x", state.struck.has(i) && state.struck.has(i + 1)));
  els.undo.disabled = state.history.length === 0;
  els.allLabel.textContent = state.struck.size > state.words.length / 2 ? "Limpiar" : "Tachar todo";
}

function fitText() {
  let size = 20;
  els.text.style.fontSize = size + "px";
  while (els.text.scrollHeight > els.text.clientHeight + 1 && size > 13) {
    size -= 0.5;
    els.text.style.fontSize = size + "px";
  }
}

function save() {
  if (state.book) store.set("apacheta:actual", { b: state.book.id, p: state.pageNo, x: [...state.struck] });
}

function commit(before) {
  state.history.push(before);
  if (state.history.length > 100) state.history.shift();
  state.confirmNew = false;
  paint();
  save();
}

// ---------- tachar con toque o deslizando ----------
let drag = null;

els.text.addEventListener("pointerdown", (e) => {
  if (state.viewing) return;
  const w = e.target.closest(".w");
  if (!w) return;
  e.preventDefault();
  const i = +w.dataset.i;
  drag = { mode: !state.struck.has(i), before: new Set(state.struck), last: i };
  apply(i);
});

els.text.addEventListener("pointermove", (e) => {
  if (!drag) return;
  const el = document.elementFromPoint(e.clientX, e.clientY);
  const w = el && el.closest && el.closest(".w");
  if (!w) return;
  const i = +w.dataset.i;
  if (i === drag.last) return;
  // completa las palabras salteadas si el dedo va rápido
  const [a, b] = i > drag.last ? [drag.last + 1, i] : [i, drag.last - 1];
  for (let k = a; k <= b; k++) apply(k);
  drag.last = i;
});

function endDrag() {
  if (!drag) return;
  commit(drag.before);
  drag = null;
}
window.addEventListener("pointerup", endDrag);
window.addEventListener("pointercancel", endDrag);

function apply(i) {
  if (drag.mode) state.struck.add(i); else state.struck.delete(i);
  paint();
}

// ---------- toolbar ----------
$("undoBtn").onclick = () => {
  if (!state.history.length) return;
  state.struck = state.history.pop();
  paint();
  save();
};

$("allBtn").onclick = () => {
  const before = new Set(state.struck);
  const clearing = state.struck.size > state.words.length / 2;
  state.struck = clearing ? new Set() : new Set(state.words.map((_, i) => i));
  commit(before);
  if (!clearing) toast("Ahora tocá las palabras que querés dejar");
};

async function newPage() {
  const { id, p } = randomPick();
  history.replaceState(null, "", location.pathname);
  await showPage(id, p);
}

$("newBtn").onclick = () => {
  if (state.struck.size && !state.confirmNew) {
    state.confirmNew = true;
    toast("Vas a perder lo tachado. Tocá de nuevo");
    return;
  }
  newPage();
};
$("viewNewBtn").onclick = newPage;

$("remixBtn").onclick = () => {
  history.replaceState(null, "", location.pathname);
  showPage(state.book.id, state.pageNo);
  toast("Misma página, tu poema");
};

$("helpBtn").onclick = () => els.help.showModal();
$("helpClose").onclick = () => { els.help.close(); store.set("apacheta:vioAyuda", true); };

// ---------- resultado ----------
function poemText() {
  const lines = [];
  let cur = [];
  state.words.forEach((w, i) => {
    if (state.struck.has(i)) {
      if (cur.length) { lines.push(cur.join(" ")); cur = []; }
    } else {
      cur.push(w.textContent);
    }
  });
  if (cur.length) lines.push(cur.join(" "));
  return lines
    .map((l) => l.replace(/^[—«»"“”(\s]+|[—«»"“”)\s,;:]+$/g, ""))
    .filter(Boolean)
    .join("\n");
}

function credit() {
  return `de «${state.book.title}», ${state.book.author}, p. ${state.pageNo + 1}`;
}

async function renderImage() {
  await document.fonts.ready;
  const pageRect = els.page.getBoundingClientRect();
  const W = 1080;
  const s = W / pageRect.width;
  const rel = (r) => ({ x: (r.left - pageRect.left) * s, y: (r.top - pageRect.top) * s, w: r.width * s, h: r.height * s });
  const rects = state.words.map((w) => rel(w.getBoundingClientRect()));
  const textBottom = Math.max(...rects.map((r) => r.y + r.h));
  const footerH = 120;
  const H = Math.round(textBottom + 60 + footerH);
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d");
  const css = getComputedStyle(document.documentElement);
  const color = (v) => css.getPropertyValue(v).trim();

  ctx.fillStyle = color("--paper");
  ctx.fillRect(0, 0, W, H);

  const fontSize = parseFloat(getComputedStyle(els.text).fontSize) * s;
  ctx.font = `${fontSize}px "EB Garamond", Georgia, serif`;
  ctx.textBaseline = "middle";
  ctx.fillStyle = color("--ink");

  // lo tachado queda apenas visible debajo del dibujo, como la letra impresa bajo la tinta
  ctx.globalAlpha = 0.28;
  rects.forEach((r, i) => { if (state.struck.has(i)) ctx.fillText(state.words[i].textContent, r.x, r.y + r.h / 2); });
  ctx.globalAlpha = 1;

  const runs = drawZentangle(ctx, {
    rects,
    kept: rects.map((_, i) => !state.struck.has(i)),
    u: fontSize,
    seed: `${state.book.id}-${state.pageNo}-${encodeStruck(state.struck, state.words.length)}-${state.drawSeed}`,
    ink: color("--ink"),
    paper: color("--paper"),
    limits: { x1: 24, x2: W - 24, y1: 24, y2: H - footerH - 24 },
  });
  ctx.font = `${fontSize}px "EB Garamond", Georgia, serif`;
  ctx.textBaseline = "middle";
  runs.forEach((b) => b.words.forEach((i) => ctx.fillText(state.words[i].textContent, rects[i].x, rects[i].y + rects[i].h / 2)));

  // pie: fuente + marca
  const fy = H - footerH / 2;
  ctx.strokeStyle = color("--line");
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(60, H - footerH); ctx.lineTo(W - 60, H - footerH); ctx.stroke();
  ctx.fillStyle = color("--muted");
  ctx.font = `italic 32px "EB Garamond", Georgia, serif`;
  ctx.fillText(credit(), 60, fy);
  ctx.font = `500 34px "EB Garamond", Georgia, serif`;
  ctx.fillStyle = color("--accent");
  ctx.textAlign = "right";
  ctx.fillText("apacheta", W - 60, fy);

  return new Promise((res) => c.toBlob(res, "image/png"));
}

$("doneBtn").onclick = async () => {
  const text = poemText();
  if (!state.struck.size) { toast("Primero tachá algunas palabras"); return; }
  if (!text) { toast("Tachaste todo: dejá alguna palabra"); return; }
  els.poem.textContent = text;
  els.result.showModal();
  state.drawSeed = 0;
  await refreshImage();
};

async function refreshImage() {
  els.preview.removeAttribute("src");
  state.imageBlob = await renderImage();
  els.preview.src = URL.createObjectURL(state.imageBlob);
}

$("redrawBtn").onclick = () => { state.drawSeed++; refreshImage(); };

$("backBtn").onclick = () => els.result.close();
$("closeResult").onclick = () => els.result.close();

$("copyBtn").onclick = async () => {
  await copy(`${poemText()}\n\n— ${credit()}`);
  toast("Texto copiado");
};

$("linkBtn").onclick = async () => {
  await copy(shareUrl());
  toast("Link copiado");
};

$("downloadBtn").onclick = () => {
  if (!state.imageBlob) return;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(state.imageBlob);
  a.download = `apacheta-${state.book.id}-${state.pageNo + 1}.png`;
  a.click();
};

$("shareBtn").onclick = async () => {
  const url = shareUrl();
  const text = `${poemText()}\n\n— ${credit()}`;
  const file = state.imageBlob && new File([state.imageBlob], "apacheta.png", { type: "image/png" });
  try {
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], text: `${text}\n${url}` });
    } else if (navigator.share) {
      await navigator.share({ title: "Apacheta", text, url });
    } else {
      await copy(url);
      toast("Link copiado");
    }
  } catch (err) {
    if (err.name !== "AbortError") { await copy(url); toast("Link copiado"); }
  }
};

async function copy(t) {
  try { await navigator.clipboard.writeText(t); }
  catch {
    const ta = document.createElement("textarea");
    ta.value = t; document.body.appendChild(ta); ta.select();
    document.execCommand("copy"); ta.remove();
  }
}

// ---------- sin zoom ----------
// iOS ignora user-scalable=no: hay que frenar el gesto de pellizcar a mano
["gesturestart", "gesturechange"].forEach((ev) => document.addEventListener(ev, (e) => e.preventDefault()));
document.addEventListener("touchmove", (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
// y tampoco hace caso siempre a touch-action: un segundo toque rápido no tiene que hacer zoom
let lastTouchEnd = 0;
document.addEventListener("touchend", (e) => {
  const now = Date.now();
  if (now - lastTouchEnd < 350) {
    e.preventDefault();
    const btn = e.target.closest && e.target.closest("button");
    if (btn && !btn.disabled) btn.click(); // el preventDefault se come el click: Deshacer dos veces rápido tiene que andar
  }
  lastTouchEnd = now;
}, { passive: false });
document.addEventListener("dblclick", (e) => e.preventDefault());

// ---------- arranque ----------
window.addEventListener("resize", () => { clearTimeout(fitText.t); fitText.t = setTimeout(fitText, 150); });

(async function init() {
  await loadIndex();
  const h = new URLSearchParams(location.hash.slice(1));
  if (h.has("b") && state.index.some((b) => b.id === +h.get("b"))) {
    const id = +h.get("b");
    const pages = await loadBook(id);
    const n = (pages[+h.get("p")] || "").split(/\s+/).filter(Boolean).length;
    await showPage(id, +h.get("p") || 0, decodeStruck(h.get("x") || "", n), true);
    return;
  }
  const last = store.get("apacheta:actual");
  if (last && state.index.some((b) => b.id === last.b) && last.x && last.x.length) {
    await showPage(last.b, last.p, new Set(last.x));
  } else {
    await newPage();
  }
  if (!store.get("apacheta:vioAyuda")) els.help.showModal();
})();
