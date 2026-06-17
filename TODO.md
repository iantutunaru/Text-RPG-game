# TODO — Roma RPG

The realism & simulation backlog (2026-06-15 → 2026-06-16) shipped — see
**[Done (shipped)](#done-shipped)**. This file tracks the **first live-playtest
findings (2026-06-17)**, now annotated with **verified root causes** from a code +
save-file investigation (save `mhFI4p4MNS8G`).

Each item is tagged: **[bug]** (broken code), **[missing system]** (the feature
doesn't exist yet — real design work, not a patch), or **[by design]** (works as
built; needs a product decision).

## ✅ Shipped (2026-06-17): explicit verb-button input

The keystone is fixed — but by a **design change, not a keyword classifier**. Instead
of *guessing* the intent from free text, the player now DECLARES it: the input is a
**verb bar** (Attack · Go · Talk · Examine · Take · Pay · Rest · Other) and they type
the object ("Attack" → *whom?*, "Go" → *where?*). Each verb maps 1:1 to an engine
intent (`shared/types.ts:IntentVerb` → `server/src/turn.ts:VERB_INTENT`), consumed in
`runTurn` ([`gm.ts`](server/src/gm.ts)) **before** any model classification — so the
small model never has to classify combat/loot/service. The model-driven Stage-A
classification path remains only for the free-text **Other** verb. The engine's
**suggested-choice buttons were removed**; a *contextual* verb bar replaces them
(combat → Attack/Flee/Examine/Other; travel → Press on/Make camp/Turn back/…).

Verified live: **Attack "the guard"** opened a real fight (`world.combat`, composed foe
at 14 HP, rolled initiative, two-sided damage); **Flee** broke away and cleared combat;
the bar transitions normal → combat → normal. `tsc` clean on both workspaces. This
resolves **#8** (verified) and routes **#4** and **#11** to their resolvers via the
Pay/Take verbs (mechanism proven by the attack/flee test; loot/bribe not yet
individually played). **#15** is moot — no model-suggested choices remain to go stale.

## Playtest bugs (2026-06-17)

### Character creation
- [ ] **Ancestry dropdown broken & too loose** `[bug]` — can't pick from it, accepts
      free text. **Cause:** it's an `<input list>` + `<datalist>` (a free-text
      combobox), [`CharacterCreation.tsx:231`](client/src/components/CharacterCreation.tsx).
      **Fix:** replace with a real `<select>` populated from `ANCESTRIES`.
- [ ] **Slave background tagged "free"** `[bug]` — no status choice at creation.
      **Cause:** custom path is hardwired to `CUSTOM_DEFAULTS.status = "free"`
      ([`gameState.ts:114`](server/src/gameState.ts), applied at `:176`); the form
      never sends a status (`handleStart`, `CharacterCreation.tsx:134`). **Fix:** add
      a status toggle (enslaved/freedman/free) + optional bound location; wire through
      `NewGameRequest` → `CreateGameInput` → `createGame`.
- [ ] **Starting kit not equipped** `[bug]` — began with gear unequipped.
      **Cause:** `createGame` copies preset/`CUSTOM_DEFAULTS` inventory without ever
      setting `equipped` ([`gameState.ts:184`](server/src/gameState.ts)). **Fix:** run
      an auto-equip pass at creation — `applyEquip` already exists
      ([`turn.ts:619`](server/src/turn.ts)) and every kit item resolves to a slot via
      `resolveItem` (Coin purse/Mule are correctly non-equippable, so they're skipped).

### Inventory & economy
- [x] **Giving a coin purse duplicates it & mis-deducts gold** `[bug — addressed 2026-06-17]`
      — the **Pay** verb routes to `service`, priced deterministically in
      `resolveService` ([`actions.ts:254`](server/src/actions.ts)), so the model no
      longer applies a bogus `addItems:[Coin purse]` + arbitrary `goldDelta`. (Routed
      via the verb; not yet individually played.) **Residual:** treat a literal "Coin
      purse" item as currency, not generic gear.
- [x] **Loot never reaches you** `[bug — addressed 2026-06-17]` — root cause was #8 (no
      combat ⇒ empty `world.loot`). With real fights now starting, the **Take** verb
      routes to `resolveLoot` ([`actions.ts:460`](server/src/actions.ts)). (Routed via
      the verb; win-then-loot not yet individually played.)
- [ ] **Silent gold changes** `[bug]` — "lost 2 coins, never told how." **Cause:**
      `goldDelta` on generic turns applies silently
      ([`turn.ts:426`](server/src/turn.ts)). **Fix:** surface deltas every turn — a
      `summarizeEffects` step already exists at
      [`gm.ts:160`](server/src/gm.ts); render its output + highlight gold/NPC/item
      tokens in the narration.

### Combat, crime & guards
- [x] **Attacking an NPC didn't start combat** `[bug — FIXED 2026-06-17]` — the
      **Attack** verb routes straight to `resolveAttack`; verified live (combat opened,
      foe at 14 HP, two-sided damage, Flee broke away). Was: Stage A returned `generic`
      so `resolveAttack` never ran.
- [ ] **Guards stuck in an "approaching" loop** `[missing system]` — **Cause:** there
      is **no crime/guard mechanic**; guards exist only in narration, nothing makes
      them act. **Fix:** a wanted/"heat" system that, past a threshold, spawns
      guard foes via the existing combat resolver.
- [ ] **Crime has no teeth** `[missing system]` — walked away from guards after a
      crime. **Cause:** `resolveTravel` ([`actions.ts:103`](server/src/actions.ts))
      has no concept of being wanted/pursued. **Fix:** same wanted system gates
      travel / forces a confrontation.

### Map
- [ ] **At the Circus Maximus the map showed the Palatine** `[bug]` — **Cause:** the
      model freely sets `world.location` on every generic turn
      ([`turn.ts:478`](server/src/turn.ts)) and the map blindly follows the drift
      (the matcher itself ranks "circus maximus" correctly). **Fix:** stop letting the
      model free-set location, or snap it to the nearest anchor and keep the last good one.
- [ ] **Started in the Subura, map showed the Forum Romanum** `[bug]` — **Cause:**
      `matchAnchor` falls back to the Forum for any string containing "rome"/"roma"
      with no sharper keyword ([`mapData.ts:358`](shared/mapData.ts)); the custom start
      also defaults `location` to the Forum ([`gameState.ts:113`](server/src/gameState.ts)),
      so a Subura opening narrated as "a tenement in Rome" resolves to Forum. **Fix:**
      seed `world.location` from the chosen start/background; reconsider the Forum fallback.
- [ ] **No player movement on the local map** `[by design]` — **Cause:** the marker
      only steps to a new chunk when `world.location` changes and re-centers each time;
      there's no sub-location position ([`mapEngine.ts:79`](server/src/mapEngine.ts)).
      **Decision:** drop the player marker (treat it as a regional reveal map), or
      invent a coarse in-scene position. *Recommend dropping the marker.*

### Scene / NPC tracking
- [ ] **NPC departure not signalled** `[bug]` — **Cause:** `recordScene` *replaces*
      `npcsPresent` wholesale each turn with no diff
      ([`turn.ts:566`](server/src/turn.ts)), so an NPC dropping off the list vanishes
      silently. **Fix:** diff prev vs next and announce who left in `ScenePanel`.
- [ ] **Carried NPC not shown while moving** `[missing feature]` — **Cause:** there is
      no "carrying" state; it lived only in narration. **Fix:** a structured
      carried-NPC flag surfaced in the scene panel and during travel.

### Choices
- [x] **Stale suggestions** `[moot 2026-06-17]` — the engine's suggested-choice buttons
      were removed in favor of the verb bar, so there are no model-proposed choices left
      to repeat. (`coherentChoices` still runs server-side but is no longer rendered.)

## Feature backlog (2026-06-17)

Each is **shallow-by-current-design, not missing** — pointers verified.

### Main menu & options
- [ ] **Proper main menu** with the logo and new-game / continue options.
- [ ] **Options screen** — switch the Ollama model from the UI (currently `GM_MODEL`
      env var only, read in `server/src/llm.ts`).

### Time
- [ ] **Show the exact in-game time**, not an approximation.
- [ ] **Every action advances time.** Today time only moves when the model emits
      `timeOfDay` ([`turn.ts:483`](server/src/turn.ts)) or via travel/rest
      (`stepTimeOfDay`, [`actions.ts:53`](server/src/actions.ts)). **Fix:** have the
      engine advance time a sensible amount per action.

### Dice, checks & progression (move off D&D, onto SPECIAL)
- [ ] **Re-base dice on SPECIAL**, not a d20. Currently `d20() + attribute`
      ([`turn.ts:228`](server/src/turn.ts), `rollCheck:235`).
- [ ] **Graded outcomes + guaranteed max.** Today success is a flat `total >=
      difficulty` with no natural-max auto-success ([`turn.ts:253`](server/src/turn.ts)).
- [ ] **Leveling progression with a powerful cap.** Today `grantXp` only adds +5
      maxHP/level, uncapped, no attribute growth
      ([`turn.ts:606`](server/src/turn.ts)).

### Travel & stamina
- [ ] **Short-travel UI** when a trip spans more than one location (`world.travel`
      state already exists, [`actions.ts:161`](server/src/actions.ts)).
- [ ] **Variable stamina costs** — e.g. swimming the Tiber should cost more. Today
      every strenuous check is a flat 1 energy
      ([`turn.ts:281`](server/src/turn.ts), `STRENUOUS_CHECK_ENERGY`).

### Feedback transparency
- [ ] **Show deltas after every reply** (energy, gold, items, time). Build on the
      existing `summarizeEffects` seam ([`gm.ts:160`](server/src/gm.ts)) — see bug
      "Silent gold changes" above.

---

## Done (shipped)

Resolved on 2026-06-16 by an **engine-owned action layer**: Stage A classifies an
`intent` (generic/travel/rest/service/attack/loot) and the engine
(`server/src/actions.ts`) owns the consequences — day, location, gold, energy — so the
small local model can no longer break them by under-filling Stage-B fields.
Travel/rest/service/combat turns skip Stage B entirely (Stage A → engine → Stage C
narration). *Note: the playtest shows the remaining weak link is the model's Stage-A
**classification** itself — see the Keystone above.*

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
