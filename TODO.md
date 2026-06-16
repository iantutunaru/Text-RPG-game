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
- [x] **Enemy-HP combat (composed foes, initiative, loot).** Combat is now an engine-owned
      `attack` intent (`resolveAttack` in `server/src/actions.ts`) that skips Stage B, plus a
      `loot` intent. Foes live in `world.combat.enemies`, each *composed* from parts
      (species/origin/rank/role + gear from `shared/items.ts`) via `shared/enemies.ts` — no flat
      bestiary. Rounds resolve in initiative order (player initiative from Celeritas); `softenDamage`
      (`shared/combat.ts`) mitigates both ways; slain foes drop their gear to `world.loot`. The old
      `TODO(enemy-hp)` marker now hosts the residual generic-turn foe swing.

## Partial

- [~] **One action per turn.** Handled at the prompt (Stage A classifies only the first/primary
      action) and by single-intent resolution; a generic multi-verb input still leans on the model.

## Remaining

- _(nothing outstanding — the realism & simulation backlog is complete)_
