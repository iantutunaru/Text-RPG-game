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

import type { GameState, TimeOfDay } from "../../shared/types.js";
import { journeyPlan, matchAnchor } from "../../shared/mapData.js";
import { SERVICE_PRICES, matchService } from "../../shared/economy.js";
import { clamp } from "./gameState.js";
import { TIMES, rollCheck, type Intent, type TurnEffects } from "./turn.js";

// --- Tuning ---
const TRAVEL_LEG_ENERGY = 4; // stamina each leg of a journey costs
const LOCAL_MOVE_ENERGY = 1; // a walk across the city
const REST_HP_RESTORE = 3; // HP healed by a full night's rest
const FOOD_ENERGY = 3; // stamina a hot meal restores
const BATH_ENERGY = 2; // stamina the baths restore
const LEG_HAZARD_DIFFICULTY = 12; // the road's per-leg check

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
