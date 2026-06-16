// Shared combat math. Like `items.ts`/`bestiary.ts` this is a RUNTIME module, so
// import the value via a relative path (`../../shared/combat.js` on the server) —
// the `@shared` alias is types-only.
//
// The single source of truth for how armor blunts a blow, used for BOTH the
// player's wounds and the foe's. A real hit always stings (>=1), so armor
// protects without granting invincibility. Inputs are rounded and floored so a
// stray fractional or negative value can never produce NaN or a healing "hit".

export function softenDamage(raw: number, armor: number): number {
  return Math.max(1, Math.round(raw) - Math.max(0, Math.round(armor)));
}
