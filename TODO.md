# TODO — realism & simulation backlog

Issues noticed in play (2026-06-15, after the Journal build). Not yet implemented.

A recurring root cause ties most of these together: the small local model
**under-fills Stage-B structured fields** (`dayDelta`, `location`, gold spend), so the
day, map, charging, and "said = done" complaints are largely the same failure. The
durable fixes lean on **deterministic engine mechanics** (a travel/rest system that
*owns* day advancement, location changes, and energy) rather than trusting the model.

## GM challenge / player agency (highest priority)

The GM currently lets the player do anything they state — no obstacles, refusals, or
consequences.

- [ ] **Status-based gating.** An unfree character (gladiator slave) must not be able to
      simply walk out of the ludus or leave the city. Gate on a status flag (enslaved vs
      freedman) using the existing `requires` / `world.flags` seam (`server/src/turn.ts`).
- [ ] **One action per sentence/turn.** The GM accepts several actions in one input and
      resolves them all at once. Enforce a single action per turn (Stage A/B prompt
      wording in `server/src/gm.ts`, plus possibly an engine guard).
- [ ] **Real challenges / failure.** Stage A/B should produce refusals, failed checks, and
      costs rather than auto-success.

## Economy

- [ ] **Charge for services.** Renting a room deducted no gold — the player merely said it
      and it happened. Committal services (lodging, food, bribes, passage) must spend gold,
      the same gap as the exploratory→committal commitment classification in
      `server/src/turn.ts`.

## Roman realism / world knowledge

- [ ] **Ancient Rome data library.** The model invents implausible things (an *inn on the
      Forum Romanum*). Provide a curated knowledge base of real Roman geography, landmarks,
      trades, distances, and social rules, fed into context — in the spirit of
      `shared/mapData.ts`.
- [ ] **Rome city map only when in the city.** The Rome city-map view should display only
      while the player is actually in Rome, not elsewhere.

## Travel

- [ ] **Stepwise travel on the map.** No travel simulation — the gladiator "left the city"
      and reached Ostia instantly. Implement travel as multiple map steps with a check per
      step, so distance and danger matter and teleporting is impossible. This would also
      drive day advancement and map updates below.

## Day tracker (known root cause)

- [ ] **Day not advancing.** The model rarely emits `dayDelta` in Stage B, so `world.day`
      never advances and per-day journal recaps seldom fire (observed: "sleep until morning"
      and "two days of walking" both left day = 1). Fix: nudge Stage B to set `dayDelta` on
      sleep/travel, or advance the day deterministically (tie it to travel/rest).

## Map not updating

- [ ] **Map didn't update for Ostia.** Likely the same family as the day bug: the model
      narrated arriving at Ostia but never emitted the structured `location` change in
      Stage B, so `updateMap` (`server/src/mapEngine.ts`) had nothing to react to and the
      engine stayed at "Forum Romanum". Confirm whether it's the model omitting `location`
      or a real `updateMap` gap; a deterministic travel mechanic would also fix this.

## Pacing

- [ ] **Energy / stamina bar.** Add an energy resource that depletes with action and forces
      the player to rest — a new engine-owned vital like HP, surfaced in `StatsPanel` and
      `CharacterSheet`.

## Existing code TODOs (seams already in the codebase)

- [ ] **Enemy-HP combat model.** Combat is one-sided today: the player takes damage, but
      there is no enemy entity to hit back. The seam is already in place — a `TODO(enemy-hp)`
      marker in `applyResolution` (`server/src/turn.ts`) and a placeholder
      `resolveAttackDamage(state)` (same file) that returns the player's weapon damage but
      has nothing to apply it to (also noted on `weaponDamageOf` in `shared/items.ts`). Add
      an enemy combatant model and subtract `resolveAttackDamage` from its HP at the marker.
      Wiring is meant to be additive, not a refactor.
