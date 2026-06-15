// Single source of truth for the SPECIAL-style attribute system, reskinned for
// Ancient Rome — shared by the server (engine + validation) and the client
// (creation UI + stat display). Attribute KEYS stay plain English so the small
// local model fills Stage-A JSON reliably; the Roman names players see live in
// `SPECIAL` below.
//
// Runtime module (like `mapData.ts`), so import the VALUES via a relative path
// (`../../shared/special.js` on the server; `../../../shared/special` on the
// client) — the `@shared` alias is types-only.

import type { Archetype, AttributeKey, Attributes } from "./types.js";

// ---- The seven attributes (in S.P.E.C.I.A.L. order) ----

export const ATTRIBUTE_KEYS: AttributeKey[] = [
  "strength",
  "perception",
  "endurance",
  "charisma",
  "intelligence",
  "agility",
  "luck",
];

export interface SpecialMeta {
  roman: string; // display name the player sees
  english: string; // plain meaning (used in the GM prompt)
  abbr: string; // compact label for the stats panel
  blurb: string; // what it governs — shown in the UI and the prompt
}

export const SPECIAL: Record<AttributeKey, SpecialMeta> = {
  strength: {
    roman: "Vires",
    english: "Strength",
    abbr: "VIR",
    blurb: "raw power — melee, breaking, lifting",
  },
  perception: {
    roman: "Sensus",
    english: "Perception",
    abbr: "SEN",
    blurb: "awareness — spotting danger, traps, reading people",
  },
  endurance: {
    roman: "Vigor",
    english: "Endurance",
    abbr: "VIG",
    blurb: "toughness & stamina — sets your max HP",
  },
  charisma: {
    roman: "Dignitas",
    english: "Charisma",
    abbr: "DIG",
    blurb: "standing & charm — persuasion, command",
  },
  intelligence: {
    roman: "Ingenium",
    english: "Intelligence",
    abbr: "ING",
    blurb: "wit & learning — schemes, lore, languages",
  },
  agility: {
    roman: "Celeritas",
    english: "Agility",
    abbr: "CEL",
    blurb: "speed & dexterity — stealth, reflexes",
  },
  luck: {
    roman: "Fortuna",
    english: "Luck",
    abbr: "FOR",
    blurb: "fate's favor — lucky breaks",
  },
};

// ---- Balance constants (tune here) ----

export const STAT_MIN = 1;
export const STAT_MAX = 10;
export const POINT_POOL = 5; // points to distribute on top of the baseline
export const MAX_ABILITIES = 2;
const HP_BASE = 14;
const HP_PER_ENDURANCE = 2;

// ---- Per-archetype baseline spreads (each sums to 35; avg 5/stat) ----

const BASELINES: Record<Archetype, Attributes> = {
  gladiator: { strength: 8, perception: 5, endurance: 7, charisma: 3, intelligence: 2, agility: 6, luck: 4 },
  senator: { strength: 2, perception: 6, endurance: 3, charisma: 8, intelligence: 8, agility: 4, luck: 4 },
  legionary: { strength: 7, perception: 6, endurance: 7, charisma: 3, intelligence: 4, agility: 6, luck: 2 },
  merchant: { strength: 3, perception: 6, endurance: 3, charisma: 7, intelligence: 7, agility: 4, luck: 5 },
  freedman: { strength: 5, perception: 6, endurance: 5, charisma: 3, intelligence: 4, agility: 6, luck: 6 },
  custom: { strength: 5, perception: 5, endurance: 5, charisma: 5, intelligence: 5, agility: 5, luck: 5 },
};

export function archetypeBaseline(archetype: Archetype): Attributes {
  return { ...(BASELINES[archetype] ?? BASELINES.custom) };
}

// ---- Curated abilities (Fallout-style traits; effects baked in at creation) ----

export interface AbilityDef {
  name: string;
  description: string;
  effects: Partial<Record<AttributeKey, number>>;
}

export const ABILITIES: AbilityDef[] = [
  { name: "Blessed by Mars", description: "Mars favors the bold in battle.", effects: { strength: 1, luck: -1 } },
  { name: "Silver Tongue", description: "A born orator; words open doors fists cannot.", effects: { charisma: 1, strength: -1 } },
  { name: "Street-Sharp", description: "Raised among the Subura's cutpurses; little escapes you.", effects: { perception: 1, charisma: -1 } },
  { name: "Iron Gut", description: "Survived plague and famine; hard to put down.", effects: { endurance: 1, intelligence: -1 } },
  { name: "Fleet of Foot", description: "Quick as Mercury, if quick to tire.", effects: { agility: 1, endurance: -1 } },
  { name: "Born Schemer", description: "Always three moves ahead, if slow to act.", effects: { intelligence: 1, agility: -1 } },
  { name: "Fortune's Darling", description: "The dice and the gods love you — at a price.", effects: { luck: 2, strength: -1, charisma: -1 } },
  { name: "Hawk-Eyed", description: "You see the arrow before it flies.", effects: { perception: 1, strength: -1 } },
];

const ABILITY_BY_NAME = new Map(ABILITIES.map((a) => [a.name, a]));

export function isCuratedAbility(name: string): boolean {
  return ABILITY_BY_NAME.has(name);
}

export function getAbility(name: string): AbilityDef | undefined {
  return ABILITY_BY_NAME.get(name);
}

export function effectsOf(name: string): Partial<Record<AttributeKey, number>> {
  return ABILITY_BY_NAME.get(name)?.effects ?? {};
}

/** Render attribute deltas using Roman names, e.g. "+1 Dignitas, −1 Vires".
 *  Shared by character creation and the in-game character sheet. */
export function formatEffects(
  effects: Partial<Record<AttributeKey, number>>
): string {
  return ATTRIBUTE_KEYS.filter((k) => effects[k])
    .map((k) => {
      const v = effects[k] as number;
      return `${v > 0 ? "+" : "−"}${Math.abs(v)} ${SPECIAL[k].roman}`;
    })
    .join(", ");
}

// ---- Suggested ancestries (narrative flavor only; free text also allowed) ----

export const ANCESTRIES: string[] = [
  "Roman",
  "Latin",
  "Greek",
  "Gaul",
  "Iberian",
  "Numidian",
  "Egyptian",
  "Syrian",
  "Thracian",
  "Germanic",
  "Punic",
  "Briton",
];

// ---- Helpers ----

export function clampStat(value: number): number {
  if (!Number.isFinite(value)) return STAT_MIN;
  return Math.max(STAT_MIN, Math.min(STAT_MAX, Math.round(value)));
}

export function statTotal(stats: Attributes): number {
  return ATTRIBUTE_KEYS.reduce((sum, k) => sum + (stats[k] ?? 0), 0);
}

/** Endurance (Vigor) drives starting max HP, faithful to SPECIAL. */
export function deriveMaxHp(endurance: number): number {
  return HP_BASE + clampStat(endurance) * HP_PER_ENDURANCE;
}

export interface StatValidation {
  stats: Attributes; // always clamped to [STAT_MIN, STAT_MAX]
  error: string | null; // non-null ⇒ the allocation is illegal (reject in non-dev)
}

/**
 * Validate (and sanitize) a player's allocated attributes — the server is the
 * authority, never the client. Each value is clamped to 1–10. In dev mode any
 * such spread is accepted. Otherwise the pool rules apply: no stat below its
 * archetype baseline (additive-only), and the total may not exceed
 * baselineTotal + POINT_POOL.
 */
export function validateStats(
  raw: Partial<Attributes> | undefined,
  archetype: Archetype,
  devMode = false
): StatValidation {
  const baseline = archetypeBaseline(archetype);
  const stats = {} as Attributes;
  for (const k of ATTRIBUTE_KEYS) {
    const v = raw && typeof raw[k] === "number" ? (raw[k] as number) : baseline[k];
    stats[k] = clampStat(v);
  }
  if (devMode) return { stats, error: null };

  for (const k of ATTRIBUTE_KEYS) {
    if (stats[k] < baseline[k]) {
      return {
        stats,
        error: `${SPECIAL[k].roman} cannot be set below its ${archetype} baseline of ${baseline[k]}.`,
      };
    }
  }
  const budget = statTotal(baseline) + POINT_POOL;
  const total = statTotal(stats);
  if (total > budget) {
    return {
      stats,
      error: `Attributes exceed the budget (${total} > ${budget}). You have ${POINT_POOL} points to spend above the baseline.`,
    };
  }
  return { stats, error: null };
}

/** Bake curated-ability effects into a stat block (clamped). */
export function applyAbilityEffects(
  stats: Attributes,
  abilityNames: string[]
): Attributes {
  const result = { ...stats };
  for (const name of abilityNames) {
    const eff = effectsOf(name);
    for (const k of ATTRIBUTE_KEYS) {
      const delta = eff[k];
      if (delta) result[k] = clampStat(result[k] + delta);
    }
  }
  return result;
}
