// Deterministic prices for paid services, shared by the server (which charges
// them) and available to the client if ever needed. The ENGINE owns the price —
// the model never sets one — which is what makes "rent a room" actually cost coin
// instead of being free because the model forgot to emit a goldDelta.
//
// Runtime module like mapData.ts / special.ts: import the VALUES via a relative
// path (`../../shared/economy.js` on the server); the `@shared` alias is types-only.

import type { ServiceKind } from "./types.js";

// Plausible late-Republic costs in sestertii. A night's cheap lodging runs a few
// sestertii; a hot meal less; the baths a copper coin. `bribe` and `passage` are
// FLOORS the engine may scale up by stakes or distance.
export const SERVICE_PRICES: Record<ServiceKind, number> = {
  lodging: 4, // a night in a cheap caupona or rented insula room
  food: 2, // a hot meal from a popina
  drink: 1, // a cup of rough wine
  bath: 1, // entry to the baths (a quadrans — nominal)
  bribe: 20, // greasing a palm — a floor; raise for higher stakes
  passage: 8, // sea/river passage, per leg — a floor; scales with distance
};

const SERVICE_PATTERNS: [ServiceKind, RegExp][] = [
  ["lodging", /\b(lodging|inn|room|bed|stay the night|sleep at|caupona|hospitium|tavern room)\b/],
  ["passage", /\b(passage|fare|berth|book (a )?(ship|ship's)|set sail|sail to|board (a|the) ship|ferry|voyage)\b/],
  ["bath", /\b(bath|baths|thermae|balnea)\b/],
  ["bribe", /\b(bribe|grease|payoff|pay off|hush money|buy (his|her|their) silence|slip .* coin)\b/],
  ["drink", /\b(wine|drink|cup|ale|popina|cup of)\b/],
  ["food", /\b(meal|food|eat|dine|supper|bread|bite to eat|something to eat)\b/],
];

/**
 * Map a free-form service target (Stage-A `target`, or the player's own words) to
 * a known ServiceKind. Ordered so the more specific kinds win (a "tavern room" is
 * lodging, not drink). Returns null when nothing matches — the caller should then
 * fall back to a normal turn rather than charge for a service it can't price.
 */
export function matchService(text: string): ServiceKind | null {
  const t = (text || "").toLowerCase();
  if (!t.trim()) return null;
  // An exact enum word from the model takes precedence.
  if (t in SERVICE_PRICES) return t as ServiceKind;
  for (const [kind, re] of SERVICE_PATTERNS) {
    if (re.test(t)) return kind;
  }
  return null;
}
