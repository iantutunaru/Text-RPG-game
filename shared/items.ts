// Single source of truth for ITEM MECHANICS — equip slots, weight, combat stats,
// and attribute modifiers — shared by the server (engine + validation) and the
// client (character sheet display). Like `special.ts`/`mapData.ts` this is a
// RUNTIME module, so import the VALUES via a relative path
// (`../../shared/items.js` on the server; `../../../shared/items` on the client) —
// the `@shared` alias is types-only.
//
// Design: stored items stay minimal (`{ name, description, qty, equipped? }`).
// Every mechanical number is DERIVED from the item's NAME via `resolveItem`, so
// saves never carry stale stats and the engine — never the model — owns the math.

import type { AttributeKey, Attributes, Item } from "./types.js";
import { ATTRIBUTE_KEYS, clampStat } from "./special.js";

// ---- Equip slots (one item per slot), Roman-flavored ----

export type EquipSlot = "weapon" | "offhand" | "body" | "head" | "accessory";

export const EQUIP_SLOTS: EquipSlot[] = [
  "weapon",
  "offhand",
  "body",
  "head",
  "accessory",
];

export const SLOT_LABEL: Record<EquipSlot, string> = {
  weapon: "Weapon",
  offhand: "Shield / Off-hand",
  body: "Body",
  head: "Head",
  accessory: "Accessory",
};

// ---- Balance constants (tune here) ----

/** Damage you deal with no weapon equipped (placeholder for the enemy-HP model). */
export const UNARMED_DAMAGE = 2;
/** Carry capacity = CARRY_BASE + Vires(strength) * CARRY_PER. Mirrors deriveMaxHp. */
export const CARRY_BASE = 25;
export const CARRY_PER = 7;

// ---- Item definitions ----

export interface ItemDef {
  slot?: EquipSlot; // omitted ⇒ carried-only, not equippable
  weight: number; // encumbrance units
  armor?: number; // damage soaked when equipped
  damage?: number; // attack potency when equipped (weapons)
  attrMods?: Partial<Record<AttributeKey, number>>; // applied to effective attributes when equipped
}

/** Fully-resolved, defaulted view of an item's mechanics. */
export interface ResolvedItem {
  slot: EquipSlot | null;
  weight: number;
  armor: number;
  damage: number;
  attrMods: Partial<Record<AttributeKey, number>>;
}

// Curated catalog (keys are lowercased names). Includes every starting-kit item
// (see server/gameState.ts) plus common Rome gear. Anything not listed falls back
// to keyword inference, then to a safe carried-only default.
export const ITEM_CATALOG: Record<string, ItemDef> = {
  // Weapons (arma)
  gladius: { slot: "weapon", weight: 3, damage: 6, attrMods: { strength: 1 } },
  pugio: { slot: "weapon", weight: 1, damage: 3 },
  hasta: { slot: "weapon", weight: 5, damage: 7 },
  spatha: { slot: "weapon", weight: 4, damage: 7, attrMods: { strength: 1 } },
  // Off-hand (scutum)
  scutum: { slot: "offhand", weight: 8, armor: 3 },
  parma: { slot: "offhand", weight: 4, armor: 2 },
  // Body (lorica / toga / tunic)
  "lorica segmentata": { slot: "body", weight: 12, armor: 5, attrMods: { agility: -1 } },
  "lorica hamata": { slot: "body", weight: 10, armor: 4 },
  "senatorial toga": { slot: "body", weight: 2, attrMods: { charisma: 1 } },
  "worn tunic": { slot: "body", weight: 1 },
  "rough tunic": { slot: "body", weight: 1 },
  "traveler's tunic": { slot: "body", weight: 1 },
  cloak: { slot: "body", weight: 2 },
  // Head (galea)
  galea: { slot: "head", weight: 3, armor: 2 },
  pileus: { slot: "head", weight: 0 },
  // Accessories (ring / amulet)
  "signet ring": { slot: "accessory", weight: 0, attrMods: { charisma: 1 } },
  amulet: { slot: "accessory", weight: 0, attrMods: { luck: 1 } },
  // Carried-only gear
  "wax tablet": { weight: 1 },
  ledger: { weight: 1 },
  "coin purse": { weight: 0 },
  mule: { weight: 0 },
};

/** Infer an item's mechanics from keywords in its name (for items the GM invents). */
function keywordFallback(key: string): ItemDef | undefined {
  const has = (...subs: string[]) => subs.some((s) => key.includes(s));
  if (has("gladius", "spatha", "hasta", "sword", "blade", "pugio", "dagger", "knife", "spear"))
    return { slot: "weapon", weight: 3, damage: 4 };
  if (has("lorica", "mail", "armor", "armour", "cuirass", "breastplate"))
    return { slot: "body", weight: 10, armor: 4 };
  if (has("scutum", "shield", "parma", "buckler"))
    return { slot: "offhand", weight: 7, armor: 2 };
  if (has("galea", "helm", "helmet", "cassis"))
    return { slot: "head", weight: 3, armor: 2 };
  if (has("ring", "amulet", "torc", "pendant", "necklace"))
    return { slot: "accessory", weight: 0 };
  if (has("toga", "tunic", "cloak", "robe", "stola", "palla", "garment"))
    return { slot: "body", weight: 2 };
  return undefined;
}

/** Resolve an item NAME to its mechanics: exact catalog → keyword → safe default. */
export function resolveItem(name: string): ResolvedItem {
  const key = name.trim().toLowerCase();
  const def = ITEM_CATALOG[key] ?? keywordFallback(key);
  return {
    slot: def?.slot ?? null,
    weight: def?.weight ?? 1,
    armor: def?.armor ?? 0,
    damage: def?.damage ?? 0,
    attrMods: def?.attrMods ?? {},
  };
}

/** Can this item be worn/wielded (i.e. does it map to an equip slot)? */
export function isEquippable(name: string): boolean {
  return resolveItem(name).slot !== null;
}

// ---- Derived character/inventory mechanics (used by engine AND UI) ----

export function equippedItems(inventory: Item[]): Item[] {
  return inventory.filter((i) => i.equipped);
}

/** The equipped item occupying a given slot, if any. */
export function equippedInSlot(inventory: Item[], slot: EquipSlot): Item | undefined {
  return inventory.find((i) => i.equipped && resolveItem(i.name).slot === slot);
}

/** Base attributes + every equipped item's modifiers, each clamped to 1–10. */
export function effectiveAttributes(base: Attributes, inventory: Item[]): Attributes {
  const out = { ...base };
  for (const item of equippedItems(inventory)) {
    const mods = resolveItem(item.name).attrMods;
    for (const k of ATTRIBUTE_KEYS) {
      const delta = mods[k];
      if (delta) out[k] = out[k] + delta;
    }
  }
  for (const k of ATTRIBUTE_KEYS) out[k] = clampStat(out[k]);
  return out;
}

/** Total armor from all equipped items (damage soak). */
export function armorOf(inventory: Item[]): number {
  return equippedItems(inventory).reduce(
    (sum, i) => sum + resolveItem(i.name).armor,
    0
  );
}

/** Attack damage from the equipped weapon, or the unarmed default. */
export function weaponDamageOf(inventory: Item[]): number {
  const weapon = equippedInSlot(inventory, "weapon");
  if (!weapon) return UNARMED_DAMAGE;
  return resolveItem(weapon.name).damage || UNARMED_DAMAGE;
}

/** Total carried weight (equipped gear counts — you still bear it). */
export function carryWeight(inventory: Item[]): number {
  return inventory.reduce(
    (sum, i) => sum + resolveItem(i.name).weight * Math.max(1, i.qty),
    0
  );
}

/** Carry capacity, derived from Vires (Strength) — faithful to deriveMaxHp's shape. */
export function maxCarry(strength: number): number {
  return CARRY_BASE + clampStat(strength) * CARRY_PER;
}
