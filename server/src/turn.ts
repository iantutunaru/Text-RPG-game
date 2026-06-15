// Structured turn resolution.
//
// Small local models won't reliably *choose* to call tools, but they reliably
// fill a forced JSON schema (Ollama `format`). So the engine drives the turn in
// stages and applies the parsed result deterministically — the dice and all
// numbers stay owned by code, never by the model.

import type {
  AttributeKey,
  GameState,
  Item,
  RollResult,
  TimeOfDay,
} from "../../shared/types.js";
import { ATTRIBUTE_KEYS } from "../../shared/special.js";
import { clamp, toNum } from "./gameState.js";
const TIMES: TimeOfDay[] = [
  "dawn",
  "morning",
  "midday",
  "afternoon",
  "evening",
  "night",
];

// --- Stage A: which dice checks does the action require? ---
// `commitment` rides this call so the engine can enforce player agency: an
// "exploratory" action (approach/look/ask) must never spend gold or move items,
// even if Stage B proposes it. See `applyResolution` for the deterministic backstop.
export const CHECKS_SCHEMA = {
  type: "object",
  properties: {
    checks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          attribute: { type: "string", enum: ATTRIBUTE_KEYS },
          difficulty: { type: "integer" },
          reason: { type: "string" },
        },
        required: ["attribute", "difficulty", "reason"],
      },
    },
    commitment: { type: "string", enum: ["exploratory", "committal"] },
  },
  required: ["checks", "commitment"],
};

export type Commitment = "exploratory" | "committal";

/** Read Stage-A's commitment classification. Defaults to "committal" so a
 *  missing/garbled value never blocks a genuine transaction (fail safe). */
export function readCommitment(parsed: Record<string, unknown>): Commitment {
  return parsed.commitment === "exploratory" ? "exploratory" : "committal";
}

// --- Stage B: mechanical effects, choices, and ending ---
export const RESOLVE_SCHEMA = {
  type: "object",
  properties: {
    hpDelta: { type: "integer" },
    goldDelta: { type: "integer" },
    reputationDelta: { type: "integer" },
    xpDelta: { type: "integer" },
    addItems: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          qty: { type: "integer" },
        },
        required: ["name"],
      },
    },
    removeItems: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          qty: { type: "integer" },
        },
        required: ["name"],
      },
    },
    location: { type: "string" },
    dayDelta: { type: "integer" },
    timeOfDay: { type: "string", enum: TIMES },
    choices: { type: "array", items: { type: "string" } },
    gameOver: { type: "boolean" },
    endingOutcome: { type: "string" },
    endingEpitaph: { type: "string" },
  },
  required: ["choices"],
};

export interface TurnEffects {
  rolls: RollResult[];
  choices: string[] | null;
  ended: boolean;
}

export function newEffects(): TurnEffects {
  return { rolls: [], choices: null, ended: false };
}

function d20(): number {
  return Math.floor(Math.random() * 20) + 1;
}

/** Roll every requested check in code. Returns a summary string for the model. */
export function applyChecks(
  state: GameState,
  rawChecks: unknown,
  effects: TurnEffects
): string {
  const checks = Array.isArray(rawChecks) ? rawChecks : [];
  if (checks.length === 0) return "No checks were required for this action.";

  const lines: string[] = [];
  for (const raw of checks) {
    if (!raw || typeof raw !== "object") continue;
    const c = raw as Record<string, unknown>;
    const attribute = ATTRIBUTE_KEYS.includes(c.attribute as AttributeKey)
      ? (c.attribute as AttributeKey)
      : "strength";
    const difficulty = clamp(toNum(c.difficulty, 12), 5, 30);
    const reason = String(c.reason ?? "an uncertain action");
    const roll = d20();
    const modifier = state.character.attributes[attribute];
    const total = roll + modifier;
    const success = total >= difficulty;
    const result: RollResult = {
      attribute,
      difficulty,
      roll,
      modifier,
      total,
      success,
      margin: total - difficulty,
      reason,
    };
    effects.rolls.push(result);
    lines.push(
      `- ${reason}: d20(${roll})+${attribute}(${modifier})=${total} vs ${difficulty} -> ${
        success ? "SUCCESS" : "FAILURE"
      } (margin ${result.margin})`
    );
  }
  return `Dice results (these are final — narrate consequences to match):\n${lines.join(
    "\n"
  )}`;
}

/** Apply the parsed Stage-B resolution to the game state.
 *
 *  `commitment` enforces player agency. On an "exploratory" action the player
 *  has committed to nothing, so we deterministically refuse the "buy/give"
 *  pattern: no item changes, and gold cannot go negative. This fails safe — if
 *  the classifier wrongly tags a real purchase as exploratory, the player just
 *  gets a "Buy X" choice to click rather than a surprise transaction. (Trade-off:
 *  a world-initiated loss like a pickpocket is also suppressed on these turns.)
 *  HP / reputation / xp / time still apply — the world can still react. */
export function applyResolution(
  state: GameState,
  res: Record<string, unknown>,
  effects: TurnEffects,
  commitment: Commitment = "committal"
): void {
  const c = state.character;
  const exploratory = commitment === "exploratory";

  // Vital stats (clamped). On exploratory turns, gold can't be spent.
  c.hp = clamp(c.hp + toNum(res.hpDelta), 0, c.maxHp);
  const goldDelta = exploratory ? Math.max(0, toNum(res.goldDelta)) : toNum(res.goldDelta);
  c.gold = Math.max(0, c.gold + goldDelta);
  c.reputation = clamp(c.reputation + toNum(res.reputationDelta), -100, 100);
  c.xp = Math.max(0, c.xp + toNum(res.xpDelta));
  while (c.xp >= c.level * 100) {
    c.level += 1;
    c.maxHp += 5;
    c.hp = Math.min(c.maxHp, c.hp + 5);
  }

  // Inventory — suppressed entirely on exploratory turns (no buying/looting/giving).
  const add = exploratory || !Array.isArray(res.addItems) ? [] : res.addItems;
  for (const raw of add) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const name = String(item.name ?? "").trim();
    if (!name) continue;
    const qty = Math.max(1, toNum(item.qty, 1));
    const existing = state.inventory.find(
      (i) => i.name.toLowerCase() === name.toLowerCase()
    );
    if (existing) existing.qty += qty;
    else {
      const newItem: Item = {
        name,
        description: String(item.description ?? ""),
        qty,
      };
      state.inventory.push(newItem);
    }
  }
  const remove = exploratory || !Array.isArray(res.removeItems) ? [] : res.removeItems;
  for (const raw of remove) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const name = String(item.name ?? "").trim();
    if (!name) continue;
    const idx = state.inventory.findIndex(
      (i) => i.name.toLowerCase() === name.toLowerCase()
    );
    if (idx < 0) continue;
    const qty = Math.max(1, toNum(item.qty, state.inventory[idx].qty));
    state.inventory[idx].qty -= qty;
    if (state.inventory[idx].qty <= 0) state.inventory.splice(idx, 1);
  }

  // Scene.
  if (typeof res.location === "string" && res.location.trim()) {
    state.world.location = res.location.trim();
  }
  const dayDelta = toNum(res.dayDelta);
  if (dayDelta) state.world.day = Math.max(1, state.world.day + dayDelta);
  if (TIMES.includes(res.timeOfDay as TimeOfDay)) {
    state.world.timeOfDay = res.timeOfDay as TimeOfDay;
  }

  // Choices.
  const rawChoices = Array.isArray(res.choices) ? res.choices : [];
  const choices = rawChoices
    .map((x) => String(x).trim())
    .filter(Boolean)
    .slice(0, 4);
  if (choices.length) effects.choices = choices;

  // Ending — also force an ending if HP hit 0.
  const gameOver = res.gameOver === true || c.hp <= 0;
  if (gameOver) {
    state.status = "ended";
    state.ending = {
      outcome:
        (typeof res.endingOutcome === "string" && res.endingOutcome.trim()) ||
        (c.hp <= 0 ? "death" : "an ending"),
      epitaph:
        (typeof res.endingEpitaph === "string" && res.endingEpitaph.trim()) ||
        "Thus ended their tale beneath the Roman sky.",
    };
    effects.ended = true;
  }
}

/** Forgiving JSON parse for model output (handles stray prose/code fences). */
export function parseJSON(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        /* fall through */
      }
    }
    return {};
  }
}
