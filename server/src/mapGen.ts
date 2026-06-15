// Deterministic, procedural ASCII generation for the local map.
//
// A "chunk" is a fixed CHUNK_W x CHUNK_H grid of pure-ASCII terrain, themed by
// the kind of place the player is in. Generation is seeded purely from a string
// (game id + theme + chunk coords), so the same place always renders identically
// across turns and reloads — no RNG state is stored. The player glyph ("@") is
// NOT baked in; the client overlays it at the player's cell.

import type { LocalTheme } from "../../shared/types.js";

export const CHUNK_W = 24;
export const CHUNK_H = 12;

/** FNV-1a 32-bit string hash → uint32. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Small, fast, seedable PRNG. Returns floats in [0, 1). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Grid = string[][];

function makeGrid(fill: string): Grid {
  return Array.from({ length: CHUNK_H }, () =>
    Array.from({ length: CHUNK_W }, () => fill)
  );
}

function set(g: Grid, x: number, y: number, ch: string): void {
  if (x >= 0 && x < CHUNK_W && y >= 0 && y < CHUNK_H) g[y][x] = ch;
}

function border(g: Grid, ch: string): void {
  for (let x = 0; x < CHUNK_W; x++) {
    g[0][x] = ch;
    g[CHUNK_H - 1][x] = ch;
  }
  for (let y = 0; y < CHUNK_H; y++) {
    g[y][0] = ch;
    g[y][CHUNK_W - 1] = ch;
  }
}

function scatter(
  g: Grid,
  rnd: () => number,
  ch: string,
  p: number,
  onlyOn?: string
): void {
  for (let y = 0; y < CHUNK_H; y++) {
    for (let x = 0; x < CHUNK_W; x++) {
      if (onlyOn && g[y][x] !== onlyOn) continue;
      if (rnd() < p) g[y][x] = ch;
    }
  }
}

function toRows(g: Grid): string[] {
  return g.map((row) => row.join(""));
}

/** Generate one ASCII chunk for the given seed string and theme. */
export function generateChunk(seed: string, theme: LocalTheme): string[] {
  const rnd = mulberry32(hashString(seed));
  const g = build(theme, rnd);
  return toRows(g);
}

function build(theme: LocalTheme, rnd: () => number): Grid {
  switch (theme) {
    case "slum":
      return slum(rnd);
    case "forum":
      return forum(rnd);
    case "temple":
      return temple(rnd);
    case "ludus":
      return ludus(rnd);
    case "arena":
      return arena(rnd);
    case "harbor":
      return harbor(rnd);
    case "castrum":
      return castrum(rnd);
    case "wilderness":
      return wilderness(rnd);
    case "villa":
      return villa(rnd);
    case "market":
      return market(rnd);
    case "generic":
    default:
      return generic(rnd);
  }
}

// --- Themes -----------------------------------------------------------------

// Dense insula blocks split by narrow alleys.
function slum(rnd: () => number): Grid {
  const g = makeGrid("#");
  for (let y = 0; y < CHUNK_H; y++) {
    for (let x = 0; x < CHUNK_W; x++) {
      // Carve a rough street grid plus jitter.
      if (x % 5 === 0 || y % 4 === 0 || rnd() < 0.08) g[y][x] = ".";
    }
  }
  scatter(g, rnd, "%", 0.06, "."); // refuse heaps in the alleys
  return g;
}

// Open civic plaza with a colonnade and a temple block.
function forum(rnd: () => number): Grid {
  const g = makeGrid(".");
  for (let x = 1; x < CHUNK_W - 1; x += 2) {
    g[1][x] = "I";
    g[CHUNK_H - 2][x] = "I";
  }
  // Central temple.
  const tx = 9;
  const ty = 4;
  for (let y = ty; y < ty + 3; y++)
    for (let x = tx; x < tx + 6; x++) set(g, x, y, "#");
  for (let x = tx - 1; x < tx + 7; x++) set(g, x, ty + 3, "="); // steps
  scatter(g, rnd, ",", 0.04, "."); // crowd
  return g;
}

// Columned sanctuary: colonnade ring around a walled cella.
function temple(rnd: () => number): Grid {
  const g = makeGrid(".");
  for (let x = 1; x < CHUNK_W - 1; x += 2) {
    g[1][x] = "I";
    g[CHUNK_H - 2][x] = "I";
  }
  for (let y = 2; y < CHUNK_H - 2; y += 2) {
    g[y][1] = "I";
    g[y][CHUNK_W - 2] = "I";
  }
  for (let y = 4; y < 8; y++) for (let x = 9; x < 15; x++) set(g, x, y, "#");
  scatter(g, rnd, ",", 0.03, ".");
  return g;
}

// Walled training yard with practice posts.
function ludus(rnd: () => number): Grid {
  const g = makeGrid(".");
  border(g, "#");
  for (let y = 3; y < CHUNK_H - 2; y += 4)
    for (let x = 4; x < CHUNK_W - 3; x += 6) set(g, x, y, "I"); // posts (palus)
  for (let x = 2; x < CHUNK_W - 2; x++) set(g, x, CHUNK_H - 3, "="); // weapon rack row
  scatter(g, rnd, ",", 0.05, ".");
  return g;
}

// Oval of sand ringed by tiers of stands.
function arena(_rnd: () => number): Grid {
  const g = makeGrid("#");
  const cx0 = (CHUNK_W - 1) / 2;
  const cy0 = (CHUNK_H - 1) / 2;
  const rx = CHUNK_W / 2 - 1.5;
  const ry = CHUNK_H / 2 - 1.0;
  for (let y = 0; y < CHUNK_H; y++) {
    for (let x = 0; x < CHUNK_W; x++) {
      const dx = (x - cx0) / rx;
      const dy = (y - cy0) / ry;
      const v = dx * dx + dy * dy;
      if (v <= 0.82) g[y][x] = ".";
      else if (v <= 1.0) g[y][x] = "O";
    }
  }
  return g;
}

// Land up top, water below, a pier with moored ships.
function harbor(rnd: () => number): Grid {
  const g = makeGrid("~");
  const shore = 4;
  for (let y = 0; y < shore; y++)
    for (let x = 0; x < CHUNK_W; x++) g[y][x] = ".";
  for (let x = 0; x < CHUNK_W; x++) g[shore][x] = "="; // quay
  // Piers reaching into the water.
  for (const px of [5, 12, 19]) {
    for (let y = shore; y < shore + 5; y++) set(g, px, y, "=");
    set(g, px - 1, shore + 5, "#"); // moored hull
    set(g, px + 1, shore + 5, "#");
  }
  scatter(g, rnd, ",", 0.05, "."); // cargo on the shore
  return g;
}

// Playing-card-straight Roman fort: palisade, gates, crossroads, tent blocks.
function castrum(rnd: () => number): Grid {
  const g = makeGrid(".");
  border(g, "#");
  const mx = Math.floor(CHUNK_W / 2);
  const my = Math.floor(CHUNK_H / 2);
  for (let x = 1; x < CHUNK_W - 1; x++) set(g, x, my, "="); // via principalis
  for (let y = 1; y < CHUNK_H - 1; y++) set(g, mx, y, "="); // via praetoria
  set(g, mx, 0, "="); // gates
  set(g, mx, CHUNK_H - 1, "=");
  set(g, 0, my, "=");
  set(g, CHUNK_W - 1, my, "=");
  for (let y = 1; y < CHUNK_H - 1; y++) {
    for (let x = 1; x < CHUNK_W - 1; x++) {
      if (g[y][x] !== ".") continue;
      if (x % 3 !== 0 && y % 2 === 0 && rnd() < 0.8) g[y][x] = "A"; // tents
    }
  }
  // Principia (HQ) at the crossroads.
  for (let y = my - 1; y <= my + 1; y++)
    for (let x = mx - 2; x <= mx + 2; x++)
      if (g[y][x] === "A") set(g, x, y, "#");
  return g;
}

// Frontier countryside: trees, a winding river, a road.
function wilderness(rnd: () => number): Grid {
  const g = makeGrid(".");
  scatter(g, rnd, "^", 0.13, "."); // woods
  for (let x = 0; x < CHUNK_W; x++) set(g, x, Math.floor(CHUNK_H / 2), "="); // road
  for (let y = 0; y < CHUNK_H; y++) {
    const rx = Math.round(
      CHUNK_W * (0.3 + 0.18 * Math.sin((y / CHUNK_H) * Math.PI * 2))
    );
    set(g, rx, y, "~");
    set(g, rx + 1, y, "~");
  }
  return g;
}

// Walled estate: peristyle garden around a central pool.
function villa(rnd: () => number): Grid {
  const g = makeGrid(".");
  border(g, "#");
  for (let y = 4; y < 8; y++) for (let x = 9; x < 15; x++) set(g, x, y, "~"); // pool
  for (let x = 8; x < 16; x++) {
    set(g, x, 3, "I");
    set(g, x, 8, "I");
  }
  for (let y = 3; y < 9; y++) {
    set(g, 8, y, "I");
    set(g, 15, y, "I");
  }
  scatter(g, rnd, ",", 0.1, "."); // hedges
  return g;
}

// Rows of market stalls with goods and aisles.
function market(rnd: () => number): Grid {
  const g = makeGrid(".");
  for (let y = 1; y < CHUNK_H - 1; y += 3) {
    for (let x = 1; x < CHUNK_W - 1; x++) {
      if (x % 4 === 0) continue; // aisle gap
      g[y][x] = "#"; // stall counter
      if (rnd() < 0.5) g[y + 1] && set(g, x, y + 1, ":"); // wares spilling out
    }
  }
  scatter(g, rnd, ",", 0.04, ".");
  return g;
}

// Fallback: sparse buildings along a path.
function generic(rnd: () => number): Grid {
  const g = makeGrid(".");
  for (let x = 0; x < CHUNK_W; x++) set(g, x, Math.floor(CHUNK_H / 2), "=");
  scatter(g, rnd, "#", 0.12, ".");
  scatter(g, rnd, ",", 0.05, ".");
  return g;
}
