// Derives the code-owned map state from the GM's free-form location string.
//
// Called once per turn (after Stage B applies effects) and on resume. The LLM
// never sees or chooses any of this — it only writes `world.location`, which we
// classify into a known anchor (→ marker position + local-map theme). The ASCII
// local map "expands in chunks" as the narrative moves the player around a
// region; switching regions starts a fresh local map for the new place.

import type { GameState, LocalChunk, MapState, MapView } from "../../shared/types.js";
import { matchAnchor } from "../../shared/mapData.js";
import { CHUNK_W, CHUNK_H, generateChunk, hashString } from "./mapGen.js";

const DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];

function chunkSeed(id: string, theme: string, cx: number, cy: number): string {
  return `${id}:${theme}:${cx}:${cy}`;
}

const CENTER = { x: Math.floor(CHUNK_W / 2), y: Math.floor(CHUNK_H / 2) };

function makeChunk(
  id: string,
  theme: MapState["theme"],
  cx: number,
  cy: number
): LocalChunk {
  return {
    cx,
    cy,
    theme,
    rows: generateChunk(chunkSeed(id, theme, cx, cy), theme),
  };
}

/**
 * The four directions to consider this move, starting from a per-turn hashed
 * offset so the path varies, but always covering all four so we can prefer a
 * not-yet-revealed neighbour (this is what makes the map reliably grow).
 */
function dirOrder(state: GameState): ReadonlyArray<readonly [number, number]> {
  const start = hashString(`${state.id}:${state.transcript.length}`) % DIRS.length;
  return [0, 1, 2, 3].map((i) => DIRS[(start + i) % DIRS.length]);
}

/** Recompute `state.map` from the current location. Mutates `state` in place. */
export function updateMap(state: GameState): void {
  const anchor = matchAnchor(state.world.location);
  const theme = anchor?.theme ?? "generic";
  const anchorId = anchor?.id ?? null;
  const view: MapView = anchor?.view ?? "world";

  const prev = state.map;
  const regionChanged = !prev || prev.anchorId !== anchorId || prev.theme !== theme;

  // New region (or first map ever): start a fresh local map at its origin chunk.
  if (regionChanged) {
    state.map = {
      anchorId,
      view,
      theme,
      loc: state.world.location,
      pos: { cx: 0, cy: 0, x: CENTER.x, y: CENTER.y },
      chunks: [makeChunk(state.id, theme, 0, 0)],
    };
    return;
  }

  // Same region. Keep the revealed map; refresh marker view metadata.
  const map = prev as MapState;
  map.view = view;
  map.anchorId = anchorId;

  // Only move when the narrative actually changed where we are.
  if (map.loc === state.world.location) return;
  map.loc = state.world.location;

  // Step into an adjacent chunk — preferring one not yet revealed, so the map
  // grows outward as the story moves the player to new spots in this region.
  const revealed = (cx: number, cy: number) =>
    map.chunks.some((c) => c.cx === cx && c.cy === cy);
  const order = dirOrder(state);
  let target = order.find(([dx, dy]) => !revealed(map.pos.cx + dx, map.pos.cy + dy));
  if (!target) target = order[0]; // fully surrounded: revisit a neighbour
  const cx = map.pos.cx + target[0];
  const cy = map.pos.cy + target[1];

  if (!revealed(cx, cy)) map.chunks.push(makeChunk(state.id, theme, cx, cy));
  map.pos = { cx, cy, x: CENTER.x, y: CENTER.y };
}
