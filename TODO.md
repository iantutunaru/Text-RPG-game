# TODO — realism & simulation backlog

Most of the 2026-06-15 backlog was resolved on 2026-06-16 by an **engine-owned action
layer**: Stage A now classifies an `intent` (generic/travel/rest/service) and the engine
(`server/src/actions.ts`) owns the consequences — day, location, gold, energy — so the
small local model can no longer break them by under-filling Stage-B fields. Travel/rest/
service turns skip Stage B entirely (Stage A → engine → Stage C narration).

## Done

- [x] **Status-based gating.** `character.status` (enslaved/freedman/free) + `boundLocation`;
      `resolveTravel` refuses an enslaved character leaving the ludus, offering legal choices.
- [x] **Charge for services.** `shared/economy.ts` price table; `resolveService` deducts gold
      (lodging/food/drink/bath/bribe/passage) and refuses if broke or the service isn't offered here.
- [x] **Stepwise travel.** `world.travel` state machine — legs from `journeyPlan` (distance from
      anchor coords), per-leg day/energy/hazard checks, press-on / make-camp / turn-back.
- [x] **Day not advancing.** Travel and rest now own `world.day`; sleep advances to the next morning.
- [x] **Map not updating / Rome map only in the city.** The engine sets `world.location`, so
      `updateMap` reacts and the Rome view (already gated by `inRome`) shows only while in Rome.
- [x] **Ancient Rome data library.** Anchors carry `blurb`/`services`/`region`, injected into the
      GM context as HERE/TRAVEL slices (no more "inn on the Forum").
- [x] **Energy / stamina bar.** `character.energy` from Vigor; drained by travel/strenuous checks,
      restored by rest/food; exhaustion penalty on rolls; shown in StatsPanel + CharacterSheet.
- [x] **Real challenges / failure.** Refusals (status, affordability, availability), per-leg road
      hazard checks, and exhaustion now make actions cost something instead of auto-succeeding.

## Partial

- [~] **One action per turn.** Handled at the prompt (Stage A classifies only the first/primary
      action) and by single-intent resolution; a generic multi-verb input still leans on the model.

## Remaining

- [ ] **Enemy-HP combat model.** Combat is still one-sided. The seam is intact:
      `resolveAttackDamage(state)` and the `TODO(enemy-hp)` marker in `applyResolution`
      (`server/src/turn.ts`). Add a `world.enemy` combatant and subtract `resolveAttackDamage`
      from its HP at the marker — additive, not a refactor.
