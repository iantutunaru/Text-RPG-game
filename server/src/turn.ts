// Structured turn resolution.
//
// Small local models won't reliably *choose* to call tools, but they reliably
// fill a forced JSON schema (Ollama `format`). So the engine drives the turn in
// stages and applies the parsed result deterministically — the dice and all
// numbers stay owned by code, never by the model.

import type {
  AttributeKey,
  EquipIntent,
  GameState,
  Item,
  Journal,
  RollResult,
  ScenePresence,
  TimeOfDay,
} from "../../shared/types.js";
import { ATTRIBUTE_KEYS } from "../../shared/special.js";
import {
  armorOf,
  carryWeight,
  effectiveAttributes,
  equippedInSlot,
  isEquippable,
  maxCarry,
  resolveItem,
  weaponDamageOf,
} from "../../shared/items.js";
import { clamp, toNum } from "./gameState.js";
export const TIMES: TimeOfDay[] = [
  "dawn",
  "morning",
  "midday",
  "afternoon",
  "evening",
  "night",
];

// Energy (stamina) tuning. Strenuous checks tire the body; once energy is spent,
// the exhausted roll at a penalty until they rest. Travel/rest energy costs and
// restoration live with those mechanics in actions.ts.
const STRENUOUS_CHECK_ENERGY = 1;
const EXHAUSTION_PENALTY = 3;
const STRENUOUS_ATTRS: AttributeKey[] = ["strength", "endurance", "agility"];

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
    // The action's primary KIND. The engine OWNS the consequences of travel/rest/
    // service (day, location, gold, energy) deterministically, so a small model
    // that forgets to emit dayDelta/location/goldDelta can no longer break them.
    // "generic" keeps the normal model-driven Stage-B path. `target` carries the
    // destination (travel) or the service/place (service), e.g. "Ostia", "lodging".
    intent: { type: "string", enum: ["generic", "travel", "rest", "service"] },
    target: { type: "string" },
  },
  required: ["checks", "commitment", "intent"],
};

export type Commitment = "exploratory" | "committal";
export type Intent = "generic" | "travel" | "rest" | "service";

/** Read Stage-A's commitment classification. Defaults to "committal" so a
 *  missing/garbled value never blocks a genuine transaction (fail safe). */
export function readCommitment(parsed: Record<string, unknown>): Commitment {
  return parsed.commitment === "exploratory" ? "exploratory" : "committal";
}

/** Read Stage-A's intent. Defaults to "generic" so anything the model garbles
 *  falls through to the normal model-driven Stage-B path (fail safe). */
export function readIntent(parsed: Record<string, unknown>): Intent {
  const i = parsed.intent;
  return i === "travel" || i === "rest" || i === "service" ? i : "generic";
}

/** The free-form destination/service target Stage A attached to the intent. */
export function readTarget(parsed: Record<string, unknown>): string {
  return typeof parsed.target === "string" ? parsed.target.trim() : "";
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
    // Each choice is the short imperative `label` shown to the player, plus an
    // OPTIONAL `requires` declaring the state it depends on. The engine validates
    // every declared precondition against the truth it owns and DROPS choices that
    // contradict it (see `coherentChoices`), so the GM can't offer impossible
    // actions (sheathe an already-stowed sword, buy with coin you lack, …).
    choices: {
      type: "array",
      items: {
        type: "object",
        properties: {
          label: { type: "string" },
          requires: {
            type: "object",
            properties: {
              equip: { type: "string" }, // item held but NOT yet equipped
              unequip: { type: "string" }, // item that must currently be equipped
              hasItem: { type: "string" }, // item that must be in inventory
              gold: { type: "integer" }, // minimum sestertii the player must hold
              flag: {
                type: "object",
                properties: {
                  key: { type: "string" },
                  equals: { type: "string" },
                },
                required: ["key", "equals"],
              },
            },
          },
        },
        required: ["label"],
      },
    },
    // Durable scene facts to record for later choice-gating (e.g. door_open=true).
    // Array-of-pairs (not an open-ended object) so the JSON-schema grammar stays
    // simple on small models; values are strings, compared stringified.
    setFlags: {
      type: "array",
      items: {
        type: "object",
        properties: {
          key: { type: "string" },
          value: { type: "string" },
        },
        required: ["key", "value"],
      },
    },
    // The named NPCs physically present with the player at the END of this turn,
    // each with a short note (role/manner). The engine records these for the
    // journal and the live scene tracker (see `recordScene`); they are advisory,
    // never a mechanical gate. Empty/omitted means the player is alone. Same
    // flat array-of-pairs shape as `setFlags` so the grammar stays small-model-safe.
    npcsPresent: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          note: { type: "string" },
        },
        required: ["name"],
      },
    },
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
  encumbered: string[]; // items refused because they'd exceed carry capacity
}

export function newEffects(): TurnEffects {
  return { rolls: [], choices: null, ended: false, encumbered: [] };
}

function d20(): number {
  return Math.floor(Math.random() * 20) + 1;
}

/** Roll a single d20 check against an EFFECTIVE attribute (equipped gear folded
 *  in) and record it on `effects`. A depleted body (energy 0) rolls at a penalty.
 *  Shared by Stage-A checks and the engine's own travel hazard rolls (actions.ts). */
export function rollCheck(
  state: GameState,
  effects: TurnEffects,
  attribute: AttributeKey,
  difficulty: number,
  reason: string
): RollResult {
  const eff = effectiveAttributes(state.character.attributes, state.inventory);
  const roll = d20();
  let modifier = eff[attribute];
  if (state.character.energy <= 0) modifier -= EXHAUSTION_PENALTY; // exhaustion
  const total = roll + modifier;
  const result: RollResult = {
    attribute,
    difficulty,
    roll,
    modifier,
    total,
    success: total >= difficulty,
    margin: total - difficulty,
    reason,
  };
  effects.rolls.push(result);
  return result;
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
    const result = rollCheck(state, effects, attribute, difficulty, reason);
    // Physical effort tires the body — a small stamina cost per strenuous check.
    if (STRENUOUS_ATTRS.includes(attribute)) {
      state.character.energy = Math.max(0, state.character.energy - STRENUOUS_CHECK_ENERGY);
    }
    lines.push(
      `- ${reason}: d20(${result.roll})+${attribute}(${result.modifier})=${result.total} vs ${difficulty} -> ${
        result.success ? "SUCCESS" : "FAILURE"
      } (margin ${result.margin})`
    );
  }
  return `Dice results (these are final — narrate consequences to match):\n${lines.join(
    "\n"
  )}`;
}

// --- Choice coherence guard --------------------------------------------------
// Stage-B choices are model text, but the ENGINE owns inventory/gold/scene truth.
// A choice may declare the state it depends on (`requires`); we validate every
// declared precondition and DROP choices that contradict the current state, so the
// player is never offered an impossible action (sheathe an already-stowed sword,
// buy with coin they lack, use an item they don't hold). Choices with no `requires`
// are always kept — fail-open, including legacy bare-string choices.

interface ChoiceRequires {
  equip?: string; // item held but NOT yet equipped
  unequip?: string; // item that must currently be equipped
  hasItem?: string; // item that must be in inventory
  gold?: number; // minimum sestertii the player must hold
  flag?: { key: string; equals: string }; // a recorded scene fact
}

const LEADING_ARTICLE = /^(?:the|your|my|a|an)\s+/i;

function normalizeItemName(name: string): string {
  return name.trim().toLowerCase().replace(LEADING_ARTICLE, "").trim();
}

/** Match a model-named item against the inventory: normalized exact match first,
 *  then a loose contains match (so `unequip: "lorica"` finds an equipped
 *  "Lorica hamata"). Mirrors the forgiving spirit of `resolveItem`. */
function findInventoryItem(inventory: Item[], name: string): Item | undefined {
  const n = normalizeItemName(name);
  if (!n) return undefined;
  const exact = inventory.find((i) => normalizeItemName(i.name) === n);
  if (exact) return exact;
  return inventory.find((i) => {
    const m = normalizeItemName(i.name);
    return m.includes(n) || n.includes(m);
  });
}

/** Does the current state satisfy every precondition a choice declared? */
function requiresMet(state: GameState, req: ChoiceRequires): boolean {
  const inv = state.inventory;
  if (typeof req.equip === "string" && req.equip.trim()) {
    const it = findInventoryItem(inv, req.equip);
    // Can only equip an item you hold, that is equippable and not already worn.
    if (!it || it.equipped === true || !isEquippable(it.name)) return false;
  }
  if (typeof req.unequip === "string" && req.unequip.trim()) {
    const it = findInventoryItem(inv, req.unequip);
    if (!it || it.equipped !== true) return false; // must currently be equipped
  }
  if (typeof req.hasItem === "string" && req.hasItem.trim()) {
    if (!findInventoryItem(inv, req.hasItem)) return false;
  }
  if (req.gold != null) {
    if (state.character.gold < toNum(req.gold)) return false;
  }
  if (req.flag && typeof req.flag.key === "string" && req.flag.key.trim()) {
    const flags = state.world.flags ?? {};
    const key = req.flag.key.trim();
    // Only act on a flag the engine has actually recorded; an unknown key is
    // fail-open, since the model's flag keys can drift between turns.
    if (key in flags && String(flags[key]) !== String(req.flag.equals)) {
      return false;
    }
  }
  return true;
}

/** Validate the Stage-B `choices` against engine-owned state and return the
 *  surviving label strings (deduped, capped at 4). The rest of the pipeline stays
 *  string-based, so this is the only place that understands the structured shape. */
export function coherentChoices(state: GameState, raw: unknown): string[] {
  const arr = Array.isArray(raw) ? raw : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const el of arr) {
    let label = "";
    let requires: ChoiceRequires | undefined;
    if (typeof el === "string") {
      label = el.trim();
    } else if (el && typeof el === "object") {
      const o = el as Record<string, unknown>;
      label = String(o.label ?? "").trim();
      if (o.requires && typeof o.requires === "object") {
        requires = o.requires as ChoiceRequires;
      }
    }
    if (!label) continue;
    if (requires && !requiresMet(state, requires)) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
    if (out.length >= 4) break;
  }
  return out;
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
  // Incoming damage is softened by equipped armor — but a real hit always
  // stings (≥1), so armor protects without granting invincibility.
  const rawHp = toNum(res.hpDelta);
  let hpDelta = rawHp;
  if (rawHp < 0) {
    const taken = Math.max(1, -rawHp - armorOf(state.inventory));
    hpDelta = -taken;
  }
  c.hp = clamp(c.hp + hpDelta, 0, c.maxHp);
  // TODO(enemy-hp): once an enemy combatant model exists, subtract
  // resolveAttackDamage(state) from the target's HP here. For now the player's
  // weapon damage only informs narration — there is no entity to apply it to.
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
  const carryCap = maxCarry(c.attributes.strength);
  let load = carryWeight(state.inventory);
  for (const raw of add) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const name = String(item.name ?? "").trim();
    if (!name) continue;
    const qty = Math.max(1, toNum(item.qty, 1));
    // Encumbrance: refuse pickups that would exceed carrying capacity. The
    // refused name is surfaced so the narration can say it's too heavy to carry.
    const addedWeight = resolveItem(name).weight * qty;
    if (load + addedWeight > carryCap) {
      effects.encumbered.push(name);
      continue;
    }
    load += addedWeight;
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

  // Durable scene flags the GM records so later choices can be gated on them
  // (e.g. door_open=true). Stored stringified and capped, so a noisy model can't
  // bloat the save. (`??=` also heals older saves that predate the flags field.)
  if (Array.isArray(res.setFlags)) {
    const flags = (state.world.flags ??= {});
    for (const raw of res.setFlags) {
      if (!raw || typeof raw !== "object") continue;
      const f = raw as Record<string, unknown>;
      const key = String(f.key ?? "").trim().slice(0, 40);
      if (!key) continue;
      if (!(key in flags) && Object.keys(flags).length >= 16) continue;
      flags[key] = String(f.value ?? "").slice(0, 80);
    }
  }

  // Choices — drop any the engine's own state contradicts (impossible actions).
  // An empty result leaves effects.choices null, so gm.ts falls back (no soft-lock).
  const choices = coherentChoices(state, res.choices);
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

// --- Journal & scene tracking -------------------------------------------------
// NPCs have no structured existence in this game — they live only in narration —
// so Stage B reports who is present (`npcsPresent`) and the engine records it.
// Places ARE engine-owned (`world.location`), so visited-place tracking is purely
// deterministic. All of this is advisory: a best-effort chronicle, never a gate.

const MAX_SCENE_NPCS = 8; // present NPCs recorded per turn
const MAX_MET_NPCS = 60; // journal roster cap (first-met kept; later ones drop)
const MAX_VISITED = 60; // journal places cap

function blankJournal(): Journal {
  return { places: [], people: [], days: [], currentDay: 1, dayLog: "" };
}

/** Loose key for deduping model-named scene entities (NPCs, places). */
function sceneKey(s: string): string {
  return s.trim().toLowerCase();
}

/** Record the scene the turn left behind: who is present now (replacing the live
 *  list), any newly-met NPC and newly-visited place folded into the journal, and a
 *  bump of the per-turn counter that keys the cached chronicle. Runs AFTER
 *  `applyResolution` so `world.location` already reflects any move this turn.
 *  Self-heals `journal`/`npcsPresent` on saves that predate the feature. */
export function recordScene(state: GameState, res: Record<string, unknown>): void {
  const journal = (state.journal ??= blankJournal());

  // Who is present right now — sanitize, dedupe, cap, and replace the live list.
  const present: ScenePresence[] = [];
  const seen = new Set<string>();
  const raw = Array.isArray(res.npcsPresent) ? res.npcsPresent : [];
  for (const el of raw) {
    if (!el || typeof el !== "object") continue;
    const o = el as Record<string, unknown>;
    const name = String(o.name ?? "").trim().slice(0, 40);
    if (!name) continue;
    const key = sceneKey(name);
    if (seen.has(key)) continue;
    seen.add(key);
    const note = String(o.note ?? "").trim().slice(0, 80);
    present.push(note ? { name, note } : { name });
    if (present.length >= MAX_SCENE_NPCS) break;
  }
  state.world.npcsPresent = present;

  // Fold any newly-met NPC into the journal roster (logged once, never removed).
  const known = new Set(journal.people.map((p) => sceneKey(p.name)));
  for (const p of present) {
    if (known.has(sceneKey(p.name))) continue;
    if (journal.people.length >= MAX_MET_NPCS) break;
    known.add(sceneKey(p.name));
    journal.people.push({
      name: p.name,
      ...(p.note ? { note: p.note } : {}),
      firstSeenLocation: state.world.location,
      day: state.world.day,
    });
  }

  // Record the current location if it's new to the journal.
  const loc = state.world.location?.trim();
  if (loc && journal.places.length < MAX_VISITED) {
    const here = sceneKey(loc);
    if (!journal.places.some((pl) => sceneKey(pl.name) === here)) {
      journal.places.push({
        name: loc,
        day: state.world.day,
        timeOfDay: state.world.timeOfDay,
      });
    }
  }
}

/** Attack damage the player would deal this turn (equipped weapon, or unarmed).
 *
 *  PLACEHOLDER for the upcoming enemy-HP combat model. Today there is no enemy
 *  entity to apply it to, so this value only informs narration; the function and
 *  its future call site (see the `TODO(enemy-hp)` marker in `applyResolution`)
 *  exist so that wiring real combat later is additive, not a refactor. */
export function resolveAttackDamage(state: GameState): number {
  return weaponDamageOf(state.inventory);
}

/** Apply a player's equip/unequip request deterministically — the engine owns the
 *  change; the GM merely narrates it (see `runTurn`), so equipping costs a turn and
 *  can't be abused mid-battle. Enforces one item per slot. */
export function applyEquip(state: GameState, intent: EquipIntent): void {
  const key = intent.item.trim().toLowerCase();
  if (!key) return;
  const item = state.inventory.find((i) => i.name.toLowerCase() === key);
  if (!item) return;
  if (intent.type === "unequip") {
    item.equipped = false;
    return;
  }
  // Equip: the item must map to a slot; vacate that slot first (one per slot).
  const slot = resolveItem(item.name).slot;
  if (!slot) return;
  const current = equippedInSlot(state.inventory, slot);
  if (current && current !== item) current.equipped = false;
  item.equipped = true;
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
