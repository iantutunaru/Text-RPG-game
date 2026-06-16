// Single source of truth for ENEMY MECHANICS — composed from orthogonal PARTS
// rather than read from a flat table, so foes stay flexible: "a veteran Gaulish
// spearman" needs no dedicated entry. Like `items.ts`/`special.ts` this is a
// RUNTIME module, so import the VALUES via a relative path
// (`../../shared/enemies.js` on the server) — the `@shared` alias is types-only.
//
// A foe is the model's to NAME and the engine's to STAT. The model only supplies a
// free-text name (the Stage-A `target`, e.g. "the two bandits"); the engine
// composes it and owns every number:
//   species — the body: base HP, natural attack/armour, base speed, can it wield gear
//   origin  — culture: a light tilt (barbarians hit harder, Romans fight tighter)
//   rank    — training: scales HP, accuracy (defenseDc), initiative, damage
//   role    — fighting style: small initiative/defence/damage flavor
//   gear    — weapon + armour, whose numbers come from the SHARED item catalog
//             (items.ts), so a foe's gladius hits exactly like the player's.
// Named presets (legionary, bandit, wolf) seed the parts; adjectives parsed from
// the name override them. Stats are balanced against a level-1 player (maxHp
// ~18–28; gladius dmg 6, unarmed 2), so a typical fight runs ~2–5 exchanges.

import type { Enemy, Item } from "./types.js";
import { resolveItem } from "./items.js";

// ---- Parts -----------------------------------------------------------------

interface Species {
  baseHp: number;
  natDamage: number; // unarmed/natural attack (animals; bare-fisted humans)
  natArmor: number; // thick hide (beasts); humans rely on worn armour instead
  initBase: number; // base initiative speed
  defenseBase: number; // base DC to land a blow on this body
  wieldsGear: boolean; // humans equip catalog weapons/armour; beasts don't
}
const SPECIES: Record<string, Species> = {
  human: { baseHp: 10, natDamage: 2, natArmor: 0, initBase: 0, defenseBase: 10, wieldsGear: true },
  wolf: { baseHp: 8, natDamage: 3, natArmor: 0, initBase: 4, defenseBase: 12, wieldsGear: false },
  boar: { baseHp: 16, natDamage: 5, natArmor: 1, initBase: 1, defenseBase: 10, wieldsGear: false },
  bigcat: { baseHp: 20, natDamage: 7, natArmor: 0, initBase: 3, defenseBase: 13, wieldsGear: false },
  bear: { baseHp: 24, natDamage: 8, natArmor: 1, initBase: 1, defenseBase: 11, wieldsGear: false },
};

interface Rank { hp: number; defense: number; init: number; damage: number; }
const RANKS: Record<string, Rank> = {
  rabble: { hp: 0, defense: 0, init: 0, damage: 0 },
  regular: { hp: 4, defense: 1, init: 0, damage: 0 },
  veteran: { hp: 8, defense: 2, init: 1, damage: 1 },
  elite: { hp: 12, defense: 3, init: 1, damage: 1 },
  officer: { hp: 14, defense: 4, init: 1, damage: 2 },
  wild: { hp: 0, defense: 0, init: 0, damage: 0 }, // beasts — no human training
};

interface Origin { damage: number; defense: number; }
const ORIGINS: Record<string, Origin> = {
  roman: { damage: 0, defense: 1 },
  gaul: { damage: 1, defense: 0 },
  german: { damage: 1, defense: 0 },
  greek: { damage: 0, defense: 0 },
  thracian: { damage: 1, defense: 0 },
  none: { damage: 0, defense: 0 },
};

interface Role { init: number; defense: number; damage: number; }
const ROLES: Record<string, Role> = {
  soldier: { init: 0, defense: 1, damage: 0 },
  skirmisher: { init: 2, defense: 0, damage: 0 },
  brute: { init: -1, defense: 0, damage: 1 },
  beast: { init: 0, defense: 0, damage: 0 },
};

// Full kit summed literally (lorica 4 + scutum 3 + galea 2 = 9) vs. the min-1
// softenDamage rule would make a soldier nearly unkillable, so gear armour is
// HALVED then capped here — foes still derive armour from gear, just abstracted.
const ARMOR_CAP = 6;

// ---- Composition -----------------------------------------------------------

export interface EnemyParts {
  species?: string;
  origin?: string;
  rank?: string;
  role?: string;
  weapon?: string; // item name (stats via items.ts)
  armor?: string[]; // item names (stats via items.ts)
}

function pick<T>(table: Record<string, T>, key: string | undefined, fallback: string): T {
  return (key && table[key]) || table[fallback];
}

/** Fold parts into a finished Enemy. All numbers are engine-owned; gear stats come
 *  from the shared item catalog so a foe's gladius matches the player's. */
export function composeEnemy(name: string, parts: EnemyParts): Enemy {
  const sp = pick(SPECIES, parts.species, "human");
  const rk = pick(RANKS, parts.rank, sp.wieldsGear ? "regular" : "wild");
  const or = pick(ORIGINS, parts.origin, "none");
  const ro = pick(ROLES, parts.role, sp.wieldsGear ? "soldier" : "beast");

  const weaponDmg =
    sp.wieldsGear && parts.weapon
      ? resolveItem(parts.weapon).damage || sp.natDamage
      : sp.natDamage;
  const gearArmor = sp.wieldsGear
    ? (parts.armor ?? []).reduce((s, a) => s + resolveItem(a).armor, 0)
    : 0;

  const hp = sp.baseHp + rk.hp;
  const enemy: Enemy = {
    name,
    kind: sp.wieldsGear ? parts.role ?? "soldier" : parts.species ?? "beast",
    hp,
    maxHp: hp,
    armor: Math.min(ARMOR_CAP, sp.natArmor + Math.floor(gearArmor / 2)),
    damage: weaponDmg + rk.damage + or.damage + ro.damage,
    defenseDc: sp.defenseBase + rk.defense + or.defense + ro.defense,
    initMod: sp.initBase + rk.init + ro.init,
    initiative: 0, // rolled at encounter start (the dice live on the server)
  };
  // Keep the gear so a slain foe can drop it (humans only; beasts have none).
  if (sp.wieldsGear) {
    if (parts.weapon) enemy.weapon = parts.weapon;
    if (parts.armor && parts.armor.length) enemy.armorItems = [...parts.armor];
  }
  return enemy;
}

// ---- Presets ---------------------------------------------------------------

const TEMPLATES: Record<string, EnemyParts> = {
  legionary: { species: "human", origin: "roman", rank: "regular", role: "soldier", weapon: "gladius", armor: ["lorica hamata", "scutum", "galea"] },
  centurion: { species: "human", origin: "roman", rank: "officer", role: "soldier", weapon: "gladius", armor: ["lorica segmentata", "scutum", "galea"] },
  praetorian: { species: "human", origin: "roman", rank: "elite", role: "soldier", weapon: "gladius", armor: ["lorica segmentata", "scutum", "galea"] },
  gladiator: { species: "human", origin: "none", rank: "elite", role: "soldier", weapon: "gladius", armor: ["galea", "parma"] },
  bandit: { species: "human", origin: "none", rank: "regular", role: "skirmisher", weapon: "pugio", armor: ["worn tunic"] },
  cutthroat: { species: "human", origin: "none", rank: "veteran", role: "skirmisher", weapon: "pugio", armor: ["worn tunic"] },
  thug: { species: "human", origin: "none", rank: "rabble", role: "brute", weapon: "club", armor: [] },
  barbarian: { species: "human", origin: "gaul", rank: "regular", role: "brute", weapon: "spatha", armor: ["worn tunic"] },
  wolf: { species: "wolf", rank: "wild", role: "beast" },
  lion: { species: "bigcat", rank: "wild", role: "beast" },
  boar: { species: "boar", rank: "wild", role: "beast" },
  bear: { species: "bear", rank: "wild", role: "beast" },
};

const DEFAULT_PARTS: EnemyParts = {
  species: "human", origin: "none", rank: "regular", role: "soldier", weapon: "gladius", armor: ["worn tunic"],
};

// ---- Keyword matchers (parse parts from a free-text name; stems handle plurals) --

const has = (key: string, ...subs: string[]) => subs.some((s) => key.includes(s));

function matchPreset(key: string): EnemyParts | undefined {
  if (has(key, "centurion", "optio", "decurion")) return TEMPLATES.centurion;
  if (has(key, "praetorian")) return TEMPLATES.praetorian;
  if (has(key, "legionar", "soldier", "guard", "sentr", "miles", "vigil", "watchm", "militia"))
    return TEMPLATES.legionary;
  if (has(key, "gladiator", "murmillo", "thraex", "retiarius", "secutor", "hoplomach", "champion"))
    return TEMPLATES.gladiator;
  if (has(key, "barbarian", "gaul", "german", "celt", "goth", "raider", "warrior", "tribesm"))
    return TEMPLATES.barbarian;
  if (has(key, "cutthroat", "cutpurse", "knifeman", "assassin", "sicari", "footpad"))
    return TEMPLATES.cutthroat;
  if (has(key, "bandit", "brigand", "robber", "highwayman", "pirate")) return TEMPLATES.bandit;
  if (has(key, "thug", "tough", "brute", "ruffian", "drunk", "brawler", "thief", "thie", "lout", "mob"))
    return TEMPLATES.thug;
  if (has(key, "wolf", "wolv", "dog", "hound", "jackal", "mastiff")) return TEMPLATES.wolf;
  if (has(key, "lion", "tiger", "leopard", "panther", "beast")) return TEMPLATES.lion;
  if (has(key, "bear")) return TEMPLATES.bear;
  if (has(key, "boar", "bull", "stag", "ox")) return TEMPLATES.boar;
  return undefined;
}

function matchSpecies(key: string): string | undefined {
  if (has(key, "wolf", "wolv", "dog", "hound", "jackal")) return "wolf";
  if (has(key, "lion", "tiger", "leopard", "panther")) return "bigcat";
  if (has(key, "bear")) return "bear";
  if (has(key, "boar", "bull", "stag", "ox")) return "boar";
  return undefined;
}
function matchOrigin(key: string): string | undefined {
  if (has(key, "roman", "latin")) return "roman";
  if (has(key, "gaul", "gallic", "celt")) return "gaul";
  if (has(key, "german", "goth", "frank")) return "german";
  if (has(key, "greek", "hellen")) return "greek";
  if (has(key, "thrac")) return "thracian";
  return undefined;
}
function matchRank(key: string): string | undefined {
  if (has(key, "centurion", "officer", "optio", "decurion")) return "officer";
  if (has(key, "elite", "champion", "decorated", "picked")) return "elite";
  if (has(key, "veteran", "scarred", "grizzled", "seasoned", "hardened")) return "veteran";
  if (has(key, "drunk", "beggar", "rabble", "untrained", "raw", "green", "ragged")) return "rabble";
  return undefined;
}
function matchWeapon(key: string): string | undefined {
  if (has(key, "spear", "hasta", "pike", "lance", "javelin")) return "hasta";
  if (has(key, "spatha", "longsword")) return "spatha";
  if (has(key, "gladius", "sword", "blade")) return "gladius";
  if (has(key, "axe", "securis", "hatchet")) return "axe";
  if (has(key, "dagger", "knife", "pugio", "dirk")) return "pugio";
  if (has(key, "club", "cudgel", "mace", "staff", "bludgeon")) return "club";
  return undefined;
}
function matchRole(key: string): string | undefined {
  if (has(key, "skirmisher", "scout", "archer", "slinger")) return "skirmisher";
  if (has(key, "brute", "brawler", "berserker")) return "brute";
  return undefined;
}

/** Resolve a free-text foe NAME to a composed Enemy: preset → adjective overlay →
 *  compose. Robust by design — empty/unknown names yield a sane foe, never NaN. */
export function resolveEnemy(name: string): Enemy {
  const display = (name || "").trim() || "an assailant";
  const key = display.toLowerCase();

  const base = TEMPLATES[key] ?? matchPreset(key) ?? DEFAULT_PARTS;
  const parts: EnemyParts = { ...base };

  const sp = matchSpecies(key);
  if (sp) parts.species = sp;
  const or = matchOrigin(key);
  if (or) parts.origin = or;
  const rk = matchRank(key);
  if (rk) parts.rank = rk;
  const wp = matchWeapon(key);
  if (wp) parts.weapon = wp;
  const ro = matchRole(key);
  if (ro) parts.role = ro;

  // A beast wields no gear and has no human training — normalize once.
  if (parts.species && parts.species !== "human") {
    parts.rank = "wild";
    parts.role = "beast";
    delete parts.weapon;
    parts.armor = undefined;
  }

  return composeEnemy(display, parts);
}

// ---- Spawn helpers used by the engine --------------------------------------

function clampCount(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(4, Math.floor(n)));
}
function lastWordIsPlural(t: string): boolean {
  const words = t.trim().split(/\s+/);
  const last = words[words.length - 1] ?? "";
  return last.length > 3 && last.endsWith("s") && !last.endsWith("ss");
}

/** How many foes the named target implies — engine-owned so the model can't spam a
 *  mob. "3 bandits"→3, "a pair of thugs"→2, "a few raiders"→3, "the bandits"→2,
 *  "a lone sentry"→1. Clamped 1..4 to bound difficulty, the UI, and context size. */
export function parseFoeCount(name: string): number {
  const t = (name || "").toLowerCase();
  const digit = t.match(/\b(\d+)\b/);
  if (digit) return clampCount(parseInt(digit[1], 10));
  if (/\b(two|pair|couple|both|brace|duo)\b/.test(t)) return 2;
  if (/\b(three|trio)\b/.test(t)) return 3;
  if (/\b(four|quartet)\b/.test(t)) return 4;
  if (/\b(few|several|some|many|band|gang|pack|mob|group|squad|handful|knot)\b/.test(t)) return 3;
  if (lastWordIsPlural(t)) return 2;
  return 1;
}

/** The gear a slain foe drops, as inventory items (for loot). Empty for beasts. */
export function enemyGear(enemy: Enemy): Item[] {
  const names = [enemy.weapon, ...(enemy.armorItems ?? [])].filter(
    (n): n is string => typeof n === "string" && n.trim().length > 0
  );
  return names.map((name) => ({ name, description: `Taken from ${enemy.name}.`, qty: 1 }));
}
