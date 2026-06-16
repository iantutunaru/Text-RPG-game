// Engine-owned action resolvers (travel / rest / service).
//
// The small local model reliably CLASSIFIES an action's intent (Stage A) but
// unreliably FILLS the structured fields that make a consequence happen
// (dayDelta, location, goldDelta). So for these three intents the ENGINE owns the
// mechanics outright: it advances the day, moves the player, drains/restores
// energy, and spends gold — deterministically — and the model is left to do the
// one thing it does well, narrate (Stage C). Each resolver mutates `state` and
// sets `effects.choices`, then returns a plain-language summary of what it did
// (fed to Stage C as ground truth). Returning `null` means "not resolvable as
// this intent — fall back to the normal model-driven Stage B."

import type { Enemy, GameState, TimeOfDay } from "../../shared/types.js";
import { journeyPlan, matchAnchor } from "../../shared/mapData.js";
import { SERVICE_PRICES, matchService } from "../../shared/economy.js";
import {
  armorOf,
  carryWeight,
  effectiveAttributes,
  maxCarry,
  resolveItem,
} from "../../shared/items.js";
import { enemyGear, parseFoeCount, resolveEnemy } from "../../shared/enemies.js";
import { softenDamage } from "../../shared/combat.js";
import { clamp } from "./gameState.js";
import {
  TIMES,
  d20,
  grantXp,
  resolveAttackDamage,
  rollCheck,
  type Intent,
  type TurnEffects,
} from "./turn.js";

// --- Tuning ---
const TRAVEL_LEG_ENERGY = 4; // stamina each leg of a journey costs
const LOCAL_MOVE_ENERGY = 1; // a walk across the city
const REST_HP_RESTORE = 3; // HP healed by a full night's rest
const FOOD_ENERGY = 3; // stamina a hot meal restores
const BATH_ENERGY = 2; // stamina the baths restore
const LEG_HAZARD_DIFFICULTY = 12; // the road's per-leg check

// Combat tuning.
const CRIT_ROLL = 20; // a natural 20 doubles the player's strike
const XP_PER_ENEMY_HP = 2; // victory XP per point of a slain foe's max HP
const COMBAT_ROUND_ENERGY = 1; // stamina spent each round of a fight
const FLEE_BASE_DIFFICULTY = 10; // +2 per foe to break away

// ---- Time helpers ----------------------------------------------------------

/** Step the clock forward `steps` slots, rolling the day over past nightfall. */
function stepTimeOfDay(state: GameState, steps: number): void {
  let idx = TIMES.indexOf(state.world.timeOfDay as TimeOfDay);
  if (idx < 0) idx = 0;
  let day = state.world.day;
  for (let s = 0; s < steps; s++) {
    idx += 1;
    if (idx >= TIMES.length) {
      idx = 0;
      day += 1;
    }
  }
  state.world.timeOfDay = TIMES[idx];
  state.world.day = day;
}

/** A night's sleep: always wakes at the next morning, turning the day over (so a
 *  "sleep until morning" reliably advances the day and fires the journal recap). */
function advanceToMorning(state: GameState): void {
  if (state.world.timeOfDay !== "dawn") state.world.day += 1;
  state.world.timeOfDay = "morning";
}

// ---- Dispatch --------------------------------------------------------------

/** Resolve an engine-owned intent. Returns a ground-truth summary for Stage C, or
 *  null to fall back to the normal model-driven Stage-B path. */
export function resolveIntentAction(
  state: GameState,
  intent: Intent,
  target: string,
  effects: TurnEffects
): string | null {
  switch (intent) {
    case "travel":
      return resolveTravel(state, target, effects);
    case "rest":
      return resolveRest(state, effects);
    case "service":
      return resolveService(state, target, effects);
    case "attack":
      return resolveAttack(state, target, effects);
    case "loot":
      return resolveLoot(state, effects);
    default:
      return null;
  }
}

// ---- Travel ----------------------------------------------------------------

export function resolveTravel(
  state: GameState,
  target: string,
  effects: TurnEffects
): string | null {
  // A fight can't be calmly travelled out of — a travel intent becomes a flee.
  if (state.world.combat) return fleeCombat(state, effects);
  const c = state.character;
  const t = (target || "").toLowerCase();

  // Mid-journey: continue, or abandon and turn back.
  if (state.world.travel) {
    if (/\b(back|return|turn back|go home|abandon|give up)\b/.test(t)) {
      return turnBack(state, effects);
    }
    return advanceLeg(state, effects, false);
  }

  // Beginning a journey needs a known destination; if none, let the generic path
  // handle the ambiguous phrasing rather than guess.
  const destAnchor = matchAnchor(target);
  if (!destAnchor) return null;
  state.world.loot = undefined; // leaving the scene — any unclaimed spoils are left behind
  const fromAnchor = matchAnchor(state.world.location);

  // Status gate: an enslaved character is bound and cannot simply leave. Offer the
  // legal roads forward instead of a dead end (never a soft-lock).
  if (c.status === "enslaved") {
    const boundId = (c.boundLocation ? matchAnchor(c.boundLocation) : fromAnchor)?.id ?? fromAnchor?.id ?? null;
    if (destAnchor.id !== boundId) {
      effects.choices = [
        "Train at the ludus",
        "Win the lanista's favor",
        "Plot an escape",
        "Seek to win your freedom",
      ];
      return `REFUSED: The player is ENSLAVED, bound to ${c.boundLocation ?? "this place"}, and cannot travel to ${destAnchor.label}. Guards, walls, and the lanista's authority stop them — there is no walking out. No time passed; location unchanged. Their only roads out are manumission or escape.`;
    }
  }

  // Already there.
  if (fromAnchor && fromAnchor.id === destAnchor.id) {
    effects.choices = ["Look around", "Seek someone out", "Rest a while"];
    return `TRAVEL: The player is already at ${destAnchor.label}; they simply take in their surroundings. No time passed.`;
  }

  const plan = journeyPlan(fromAnchor ?? destAnchor, destAnchor);

  // A walk across the city — one leg, no day lost, resolves immediately.
  if (plan.perLegDays === 0 && plan.legs <= 1) {
    c.energy = Math.max(0, c.energy - LOCAL_MOVE_ENERGY);
    stepTimeOfDay(state, 1);
    state.world.location = destAnchor.label;
    effects.choices = ["Look around", "Seek someone out", "Ask a local"];
    return `TRAVEL: The player crossed the city to ${destAnchor.label} — a short walk. It is now ${state.world.timeOfDay}, day ${state.world.day}. Energy ${c.energy}/${c.maxEnergy}.`;
  }

  // A real journey: set it up, then walk the first leg this turn.
  state.world.travel = {
    destAnchorId: destAnchor.id,
    destLabel: destAnchor.label,
    fromLabel: state.world.location,
    legsTotal: plan.legs,
    legsDone: 0,
    perLegDays: plan.perLegDays,
    perLegEnergy: TRAVEL_LEG_ENERGY,
  };
  return advanceLeg(state, effects, true);
}

/** Walk one leg of the active journey: time and stamina pass, the road is rolled
 *  for hazards, and on the final leg the player arrives. */
function advanceLeg(state: GameState, effects: TurnEffects, first: boolean): string {
  const c = state.character;
  const travel = state.world.travel;
  if (!travel) return null as unknown as string; // unreachable; guarded by callers
  travel.legsDone += 1;

  c.energy = Math.max(0, c.energy - travel.perLegEnergy);
  state.world.day += travel.perLegDays;
  state.world.timeOfDay = "evening"; // a day's march ends at dusk

  // The road taxes the body: a hazard check each leg (bandits, weather, fatigue).
  const attr = c.attributes.endurance >= c.attributes.agility ? "endurance" : "agility";
  const check = rollCheck(state, effects, attr, LEG_HAZARD_DIFFICULTY, "the dangers of the road");
  let mishap = "";
  if (!check.success) {
    const hpLoss = 2 + Math.floor(Math.random() * 3); // 2–4
    c.hp = clamp(c.hp - hpLoss, 0, c.maxHp);
    c.energy = Math.max(0, c.energy - 2);
    mishap = ` The road went badly — lost ${hpLoss} HP.`;
    if (c.hp <= 0) {
      state.world.travel = undefined;
      state.status = "ended";
      state.ending = { outcome: "death", epitaph: "Lost on the long roads of empire." };
      effects.ended = true;
      return `TRAVEL: Disaster on the road to ${travel.destLabel} — the player has died (leg ${travel.legsDone} of ${travel.legsTotal}).${mishap}`;
    }
  }

  // Arrived?
  if (travel.legsDone >= travel.legsTotal) {
    const dest = travel.destLabel;
    state.world.location = dest;
    state.world.travel = undefined;
    effects.choices = ["Look around", "Find lodging", "Seek someone out", "Take stock"];
    return `TRAVEL: The player has ARRIVED at ${dest} after a journey of ${travel.legsTotal} leg(s). It is day ${state.world.day}, ${state.world.timeOfDay}. HP ${c.hp}/${c.maxHp}, energy ${c.energy}/${c.maxEnergy}.${mishap}`;
  }

  // Still on the road.
  state.world.location = `the road to ${travel.destLabel}`;
  effects.choices = ["Press on", "Make camp", "Turn back"];
  const verb = first ? "set out toward" : "presses on toward";
  return `TRAVEL: The player ${verb} ${travel.destLabel} — leg ${travel.legsDone} of ${travel.legsTotal} done. It is day ${state.world.day}, ${state.world.timeOfDay}. Energy ${c.energy}/${c.maxEnergy}. They are NOT there yet; the road continues.${mishap}`;
}

function turnBack(state: GameState, effects: TurnEffects): string {
  const travel = state.world.travel!;
  const home = travel.fromLabel;
  state.world.location = home;
  state.world.travel = undefined;
  stepTimeOfDay(state, 1);
  state.character.energy = Math.max(0, state.character.energy - 1);
  effects.choices = ["Look around", "Rest a while", "Set out again"];
  return `TRAVEL: The player abandoned the journey to ${travel.destLabel} and turned back toward ${home}. It is now ${state.world.timeOfDay}, day ${state.world.day}.`;
}

// ---- Rest ------------------------------------------------------------------

export function resolveRest(state: GameState, effects: TurnEffects): string {
  if (state.world.combat) {
    effects.choices = ["Press the attack", "Flee"];
    return "REFUSED: You cannot rest with blades drawn — finish the fight or break away first.";
  }
  const c = state.character;
  const before = c.energy;
  c.energy = c.maxEnergy;
  c.hp = Math.min(c.maxHp, c.hp + REST_HP_RESTORE);
  advanceToMorning(state);

  // Resting mid-journey doesn't end the journey — you wake and may press on.
  if (state.world.travel) {
    effects.choices = ["Press on", "Turn back"];
    return `REST: The player made camp and slept. Energy ${before}→${c.energy}, HP ${c.hp}/${c.maxHp}. It is now ${state.world.timeOfDay}, day ${state.world.day}. The journey to ${state.world.travel.destLabel} is unfinished (leg ${state.world.travel.legsDone} of ${state.world.travel.legsTotal}).`;
  }
  effects.choices = ["Look around", "Set out somewhere", "Find food", "Take stock"];
  return `REST: The player rested through the night. Energy ${before}→${c.energy}, HP ${c.hp}/${c.maxHp}. It is now ${state.world.timeOfDay}, day ${state.world.day}.`;
}

// ---- Service ---------------------------------------------------------------

export function resolveService(
  state: GameState,
  target: string,
  effects: TurnEffects
): string | null {
  if (state.world.combat) {
    effects.choices = ["Press the attack", "Flee"];
    return "REFUSED: You cannot barter with blades drawn — finish the fight or break away first.";
  }
  const c = state.character;
  const kind = matchService(target);
  if (!kind) return null; // couldn't price it → fall back to the generic path

  // Is this plausibly available here? (the knowledge base — no inn on the Forum)
  const here = matchAnchor(state.world.location);
  if (here && !here.services.includes(kind)) {
    effects.choices = ["Look elsewhere", "Ask a local", "Move on"];
    return `SERVICE-REFUSED: There is no ${kind} to be had at ${state.world.location} — it isn't offered here. No gold spent.`;
  }

  const price = SERVICE_PRICES[kind];
  if (c.gold < price) {
    effects.choices = ["Haggle the price", "Walk away", "Look for something cheaper"];
    return `SERVICE-REFUSED: The player cannot afford ${kind} — it costs ${price} sestertii and they hold only ${c.gold}. No gold spent.`;
  }

  const goldBefore = c.gold;
  c.gold = Math.max(0, c.gold - price);

  // Some services also refresh the body.
  let extra = "";
  if (kind === "lodging") {
    advanceToMorning(state);
    c.energy = c.maxEnergy;
    c.hp = Math.min(c.maxHp, c.hp + REST_HP_RESTORE);
    extra = ` They slept the night: energy full, HP ${c.hp}/${c.maxHp}; it is now ${state.world.timeOfDay}, day ${state.world.day}.`;
  } else if (kind === "food") {
    c.energy = Math.min(c.maxEnergy, c.energy + FOOD_ENERGY);
    extra = ` A hot meal restored some vigor (energy ${c.energy}/${c.maxEnergy}).`;
  } else if (kind === "bath") {
    c.energy = Math.min(c.maxEnergy, c.energy + BATH_ENERGY);
    extra = ` The baths eased their limbs (energy ${c.energy}/${c.maxEnergy}).`;
  }

  effects.choices = ["Look around", "Set out somewhere", "Rest a while", "Take stock"];
  return `SERVICE: The player paid ${price} sestertii for ${kind}. Gold ${goldBefore}→${c.gold}.${extra}`;
}

// ---- Combat & loot ---------------------------------------------------------

/** Spawn (if needed) and resolve ONE round of a fight. Engine-owned: it rolls the
 *  player's strike and every foe's swing in initiative order, softens damage by
 *  armour both ways, grants XP and stashes loot as foes fall, and settles victory
 *  or death. Returns null only when there is no fight and no foe can be named
 *  (→ Stage-B fallback, like resolveService). */
export function resolveAttack(
  state: GameState,
  target: string,
  effects: TurnEffects
): string | null {
  const c = state.character;

  // No fight yet → open one from the named foe(s). The model NAMES them; the
  // engine composes their stats (shared/enemies.ts) and rolls initiative.
  if (!state.world.combat) {
    if (!target.trim()) return null; // nothing to attack → let Stage B narrate
    state.world.loot = undefined; // a fresh fight clears any spoils left lying about
    const count = parseFoeCount(target);
    const enemies: Enemy[] = [];
    for (let n = 0; n < count; n++) {
      const foe = resolveEnemy(target);
      if (count > 1) foe.name = `${foe.name} (${n + 1})`;
      foe.initiative = d20() + foe.initMod;
      enemies.push(foe);
    }
    const playerInitiative =
      d20() + effectiveAttributes(c.attributes, state.inventory).agility;
    state.world.combat = { enemies, playerInitiative, round: 0 };
  }

  return resolveCombatRound(state, target, effects);
}

/** One initiative-ordered exchange: faster foes swing first, the player strikes a
 *  chosen mark, slower foes swing after. Settles deaths, loot, XP, and the end. */
function resolveCombatRound(
  state: GameState,
  target: string,
  effects: TurnEffects
): string {
  const c = state.character;
  const combat = state.world.combat!;
  combat.round += 1;
  c.energy = Math.max(0, c.energy - COMBAT_ROUND_ENERGY);

  const markIdx = pickTargetIndex(combat.enemies, target);
  const log: string[] = [];

  // Initiative order over all combatants; the player wins ties (+0.5).
  const order: { foe: Enemy | null; init: number }[] = [
    ...combat.enemies.map((foe) => ({ foe, init: foe.initiative })),
    { foe: null, init: combat.playerInitiative + 0.5 },
  ];
  order.sort((a, b) => b.init - a.init);

  for (const slot of order) {
    if (effects.ended) break;
    if (slot.foe === null) {
      // The player's strike at the chosen mark (retargets if it has already fallen).
      const mark = livingMark(combat.enemies, markIdx);
      if (!mark) continue;
      const eff = effectiveAttributes(c.attributes, state.inventory);
      const attr = eff.strength >= eff.agility ? "strength" : "agility";
      const hit = rollCheck(state, effects, attr, mark.defenseDc, `strike ${mark.name}`);
      if (hit.success) {
        const crit = hit.roll === CRIT_ROLL;
        const dealt = softenDamage(resolveAttackDamage(state) * (crit ? 2 : 1), mark.armor);
        mark.hp = Math.max(0, mark.hp - dealt);
        log.push(
          `${crit ? "A perfect strike! " : ""}You hit ${mark.name} for ${dealt}${
            mark.hp <= 0 ? " — it falls" : ` (${mark.hp}/${mark.maxHp})`
          }.`
        );
      } else {
        log.push(`Your strike at ${mark.name} misses.`);
      }
    } else if (slot.foe.hp > 0) {
      foeSwing(state, slot.foe, effects, log);
    }
  }

  // Player down? The foe's swing already set the ending.
  if (effects.ended) {
    state.world.combat = undefined;
    return `COMBAT: ${log.join(" ")}`;
  }

  // Settle the fallen: XP per kill, and their gear drops onto the spoils pile.
  const slain = combat.enemies.filter((e) => e.hp <= 0);
  combat.enemies = combat.enemies.filter((e) => e.hp > 0);
  for (const foe of slain) grantXp(state, foe.maxHp * XP_PER_ENEMY_HP);
  stashLoot(state, slain);

  // Victory — the last foe is down.
  if (combat.enemies.length === 0) {
    state.world.combat = undefined;
    const spoils = state.world.loot ?? [];
    effects.choices = spoils.length
      ? ["Take the spoils", "Set out somewhere", "Catch your breath"]
      : ["Catch your breath", "Look around", "Set out somewhere"];
    const spoilsLine = spoils.length
      ? ` Gear lies within reach: ${spoils.map((i) => i.name).join(", ")}.`
      : "";
    return `COMBAT (round ${combat.round}): ${log.join(" ")} The last foe is down. (Level ${c.level}, XP ${c.xp}.)${spoilsLine} The fight is over.`;
  }

  // The fight goes on.
  effects.choices = ["Press the attack", "Flee"];
  const standing = combat.enemies.map((e) => `${e.name} ${e.hp}/${e.maxHp}`).join(", ");
  return `COMBAT (round ${combat.round}): ${log.join(" ")} Still standing: ${standing}. HP ${c.hp}/${c.maxHp}, energy ${c.energy}/${c.maxEnergy}.`;
}

/** A single foe's swing at the player (armour-softened). Sets the death ending if
 *  it drops the player. */
function foeSwing(state: GameState, foe: Enemy, effects: TurnEffects, log: string[]): void {
  const c = state.character;
  const taken = softenDamage(foe.damage, armorOf(state.inventory));
  c.hp = clamp(c.hp - taken, 0, c.maxHp);
  log.push(`${foe.name} hits you for ${taken} (HP ${c.hp}/${c.maxHp}).`);
  if (c.hp <= 0) {
    state.status = "ended";
    state.ending = {
      outcome: "death",
      epitaph: `Cut down by ${foe.name} beneath the Roman sky.`,
    };
    effects.ended = true;
  }
}

/** Attempt to break off a fight (a travel intent while engaged). Success ends the
 *  encounter in place; failure costs a parting swing from each foe. */
export function fleeCombat(state: GameState, effects: TurnEffects): string {
  const c = state.character;
  const combat = state.world.combat!;
  const dc = FLEE_BASE_DIFFICULTY + 2 * combat.enemies.length;
  const roll = rollCheck(state, effects, "agility", dc, "break away from the fight");
  if (roll.success) {
    state.world.combat = undefined;
    effects.choices = ["Catch your breath", "Look around", "Set out somewhere"];
    return `COMBAT: You break off and slip away from the fight. HP ${c.hp}/${c.maxHp}.`;
  }
  const log: string[] = [];
  for (const foe of combat.enemies) {
    if (effects.ended) break;
    foeSwing(state, foe, effects, log);
  }
  if (effects.ended) {
    state.world.combat = undefined;
    return `COMBAT: You try to break away — ${log.join(" ")}`;
  }
  effects.choices = ["Press the attack", "Flee"];
  return `COMBAT: You fail to break away. ${log.join(" ")} The fight goes on (HP ${c.hp}/${c.maxHp}).`;
}

/** Take the spoils dropped by slain foes, respecting carry capacity. Returns null
 *  when there is nothing to take (→ Stage-B fallback). */
export function resolveLoot(state: GameState, effects: TurnEffects): string | null {
  if (state.world.combat) {
    effects.choices = ["Press the attack", "Flee"];
    return "REFUSED: There is no time to loot while the fight rages.";
  }
  const pile = state.world.loot ?? [];
  if (!pile.length) return null; // nothing on the ground → let Stage B handle it

  const c = state.character;
  const cap = maxCarry(c.attributes.strength);
  let load = carryWeight(state.inventory);
  const taken: string[] = [];
  for (const drop of pile) {
    const addedWeight = resolveItem(drop.name).weight * Math.max(1, drop.qty);
    if (load + addedWeight > cap) {
      effects.encumbered.push(drop.name);
      continue;
    }
    load += addedWeight;
    const existing = state.inventory.find(
      (i) => i.name.toLowerCase() === drop.name.toLowerCase()
    );
    if (existing) existing.qty += drop.qty;
    else
      state.inventory.push({ name: drop.name, description: drop.description, qty: drop.qty });
    taken.push(drop.qty > 1 ? `${drop.name} x${drop.qty}` : drop.name);
  }
  state.world.loot = undefined;
  effects.choices = ["Look around", "Set out somewhere", "Take stock"];
  const heavy = effects.encumbered.length
    ? ` Too heavy to carry, left behind: ${effects.encumbered.join(", ")}.`
    : "";
  const took = taken.length
    ? `You take ${taken.join(", ")}.`
    : "You take nothing you can carry.";
  return `LOOT: ${took}${heavy}`;
}

// ---- Combat helpers --------------------------------------------------------

/** The foe the player is striking: a name/kind match, else the first living foe. */
function pickTargetIndex(enemies: Enemy[], target: string): number {
  const t = (target || "").toLowerCase();
  if (t) {
    const byName = enemies.findIndex(
      (e) =>
        e.hp > 0 &&
        (t.includes(e.name.toLowerCase()) ||
          e.name.toLowerCase().includes(t) ||
          (e.kind.length > 2 && t.includes(e.kind)))
    );
    if (byName >= 0) return byName;
  }
  const firstLiving = enemies.findIndex((e) => e.hp > 0);
  return firstLiving >= 0 ? firstLiving : 0;
}

/** The preferred mark if still alive, else any living foe (or null if none). */
function livingMark(enemies: Enemy[], idx: number): Enemy | null {
  const pref = enemies[idx];
  if (pref && pref.hp > 0) return pref;
  return enemies.find((e) => e.hp > 0) ?? null;
}

/** Add slain foes' gear to the spoils pile (stacking by name). Beasts drop nothing. */
function stashLoot(state: GameState, slain: Enemy[]): void {
  const drops = slain.flatMap(enemyGear);
  if (!drops.length) return;
  const pile = (state.world.loot ??= []);
  for (const drop of drops) {
    const existing = pile.find((p) => p.name.toLowerCase() === drop.name.toLowerCase());
    if (existing) existing.qty += drop.qty;
    else pile.push(drop);
  }
}
