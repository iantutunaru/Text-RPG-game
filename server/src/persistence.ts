// Simple JSON-file persistence for saved games (server/saves/<id>.json).

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { GameState } from "../../shared/types.js";
import {
  ATTRIBUTE_KEYS,
  archetypeBaseline,
  clampStat,
  deriveMaxHp,
} from "../../shared/special.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAVES_DIR = path.join(__dirname, "..", "saves");

async function ensureDir(): Promise<void> {
  await fs.mkdir(SAVES_DIR, { recursive: true });
}

function saveFile(id: string): string {
  // Guard against path traversal — ids come from nanoid, but be safe.
  const safe = id.replace(/[^A-Za-z0-9_-]/g, "");
  return path.join(SAVES_DIR, `${safe}.json`);
}

export async function saveGame(state: GameState): Promise<void> {
  await ensureDir();
  state.updatedAt = new Date().toISOString();
  await fs.writeFile(saveFile(state.id), JSON.stringify(state, null, 2), "utf8");
}

export async function loadGame(id: string): Promise<GameState | null> {
  try {
    const raw = await fs.readFile(saveFile(id), "utf8");
    return normalizeState(JSON.parse(raw) as GameState);
  } catch {
    return null;
  }
}

/**
 * Migrate older saves to the current character shape so they keep loading:
 *  - 4-attribute (might/agility/wits/charm) → 7-attribute SPECIAL;
 *  - backfill age/ancestry/appearance/background/abilities.
 * Existing hp/maxHp are preserved (not recomputed) to avoid disrupting a game
 * already in progress. Saves are flat JSON with no version field, so this is the
 * one place that reconciles old shapes.
 */
function normalizeState(state: GameState): GameState {
  // The parsed object may predate the current schema, so work loosely here.
  const c = state?.character as unknown as Record<string, unknown>;
  if (!c) return state;

  const attrs = (c.attributes ?? {}) as Record<string, number | undefined>;
  if (attrs.strength === undefined) {
    // Map the old 4 onto their SPECIAL counterparts; default the rest.
    const mapped: Record<string, number | undefined> = {
      strength: attrs.might,
      perception: undefined,
      endurance: undefined,
      charisma: attrs.charm,
      intelligence: attrs.wits,
      agility: attrs.agility,
      luck: undefined,
    };
    const baseline = archetypeBaseline((c.archetype as GameState["character"]["archetype"]) ?? "custom");
    const next: Record<string, number> = {};
    for (const k of ATTRIBUTE_KEYS) {
      const v = mapped[k];
      next[k] = typeof v === "number" ? clampStat(v) : baseline[k];
    }
    c.attributes = next;
  }

  if (typeof c.age !== "number") c.age = 25;
  if (typeof c.ancestry !== "string") c.ancestry = "Roman";
  if (typeof c.appearance !== "string") c.appearance = "";
  if (typeof c.background !== "string") c.background = "";
  if (!Array.isArray(c.abilities)) c.abilities = [];

  const a = c.attributes as Record<string, number>;
  if (typeof c.maxHp !== "number" || (c.maxHp as number) <= 0) {
    c.maxHp = deriveMaxHp(a.endurance);
  }
  if (typeof c.hp !== "number") c.hp = c.maxHp;

  return state;
}
