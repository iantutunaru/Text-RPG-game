# Roma — an AI-powered text RPG of Ancient Rome

A web-based text RPG where a local AI model acts as your Game Master. Create a
character — name, age, ancestry, looks, and backstory — pick one of five paths
(gladiator, senator, legionary, merchant, freedman) or forge a fully custom one,
distribute Rome-flavored SPECIAL attributes, and choose special abilities, then
play out a story in the late Roman Republic. Stats, dice rolls, inventory, and combat are
all tracked deterministically in code — the AI narrates and *proposes* mechanical
effects in forced-JSON stages while the engine owns every dice roll and stat
change, so the numbers stay honest. Open a full **character sheet** any time to review
your tale and manage **equipment** — arms and armor the engine folds into your
attributes, your defense, and how much you can carry.

**Runs entirely on your machine. $0 — no API keys, no cloud, no metering.**

## Quick start

Everything is already set up on this machine (Ollama, both models, and `npm install`),
so each time you want to play:

1. Make sure **Ollama** is running — look for its tray icon, or run `ollama list`.
2. Double-click **`start.bat`** (richer model) or **`start-fast.bat`** (faster model).
3. When the window shows `VITE ready`, open **<http://localhost:5173>** and play.

Stop by closing that window (or Ctrl+C). See **Run it** for the terminal equivalent and
**Faster first turn** to skip the one-time model warm-up delay.

## How it works

- **Game engine (TypeScript)** owns all numbers: HP, gold, reputation, inventory,
  and the dice. The AI cannot fudge outcomes — when an action is uncertain, the
  engine rolls the dice and hands the result back for the AI to narrate.
- **Character creation uses SPECIAL, reskinned for Rome.** Build a character with a
  name, age, ancestry, appearance, and a custom background; take one of five paths or
  a fully custom one; and distribute seven attributes — *Vires, Sensus, Vigor,
  Dignitas, Ingenium, Celeritas, Fortuna* (a Rome-flavored take on Fallout's SPECIAL)
  — from a baseline spread plus a point pool (each 1–10). Pick up to two special
  abilities (small, code-applied trait effects), with a **Dev mode** for setting stats
  by hand and writing a free-text ability. Attributes feed the d20 checks and
  Endurance (Vigor) sets your starting HP; the engine still owns every number. All of
  this is defined once in `shared/special.ts`.
- **AI Game Master** is a local model served by [Ollama](https://ollama.com),
  reached through a small `LLMClient` interface (`server/src/llm.ts`) so you can
  later swap in a free hosted tier or a paid API without touching game logic.
- **Each turn runs in three stages** (`server/src/gm.ts`): the model lists the
  dice checks an action needs (A → engine rolls) and classifies how far the action
  commits you, proposes the mechanical effects given those rolls (B → engine
  applies), then narrates the result (C, streamed).
- **You stay the author of your own choices.** Approaching a merchant, looking over
  goods, or asking a question never commits you to buying, taking, eating, or
  fighting. The engine treats such actions as *exploratory* and refuses to spend
  your gold or alter your inventory on them — instead it surfaces the real options
  as choices (e.g. *Buy the grapes · Haggle the price · Walk away*) and stops the
  narration at your next decision. Only when your words actually commit (buy, pay,
  attack…) does a transaction occur — and then anything you pay for is added to your
  inventory. This guard is enforced in code (`applyResolution` in `server/src/turn.ts`),
  so the AI can't railroad you even if it tries. And the *choices* it offers are held
  to the same standard: every proposed next action is checked against your real state —
  your equipped gear, your purse, what's in your pack, and facts the engine has recorded
  about the scene — and any that contradict it are quietly dropped. You'll never be asked
  to sheathe a sword you already stowed, buy what you can't afford, or use what you aren't
  carrying. To make this possible the model tags each choice with the state it depends on,
  and the engine — not the model — decides whether that condition holds (`coherentChoices`,
  also in `server/src/turn.ts`).
- **Inventory, equipment, and a character sheet.** A **📜 Character** button opens a
  full wax-tablet sheet — your identity and backstory, vitals and XP, attributes,
  traits, and gear. Items carry weight and equip slots, derived in code from a curated
  catalog (`shared/items.ts`) with a keyword fallback for anything the AI invents —
  so the model can *name* items but never sets their stats. Equipping a weapon or armor
  feeds your **effective attributes**, your **Armor** (which softens incoming wounds),
  and your **Weapon damage**, while a Vires-based **carry limit** caps what you can haul.
  Equipping is itself a narrated action that costs a turn, so you can't silently re-arm
  in the middle of a fight.
- **Maps are derived from the story, not authored by the AI.** Your free-form
  location is matched to a known landmark (`shared/mapData.ts`) to drop a
  *you-are-here* marker on the world / Rome images, and a deterministic, seeded
  **ASCII** local map (`server/src/mapGen.ts`) is themed by the kind of place
  you're in and grows in chunks as the story moves you around.

## Prerequisites

1. Install **Ollama**: <https://ollama.com> (already installed if you set this up
   via the build steps).
2. Pull the default model (richer narration):
   ```
   ollama pull qwen2.5:14b
   ```
   For a faster, fully-in-VRAM option, pull `ollama pull llama3.1:8b` and set
   `GM_MODEL=llama3.1:8b`.
3. Node.js 20+.

## Run it

**Easiest (Windows):** double-click **`start.bat`** (default model) or **`start-fast.bat`**
(faster `llama3.1:8b`). Leave the window open and go to <http://localhost:5173>.

**Or from a terminal in this folder:**

```
npm install          # first time only — installs server + client workspaces
npm run dev          # starts the server (:3001) and the client (:5173)
```

Then open <http://localhost:5173>. Stop with Ctrl+C (or by closing the window).

Make sure **Ollama is running** first (it usually auto-starts; look for its icon in the
system tray, or run `ollama list` to confirm).

## Faster first turn (skip the model warm-up)

The slow part of a session is the *first* turn, when Ollama loads the model into memory
(~30–45s for `qwen2.5:14b`; less for `llama3.1:8b`). Every turn after that is fast, because
Ollama keeps the model loaded — by default for 5 minutes after the last request. Two ways
to make the next session start fast:

- **Pre-warm it** right before you play: `ollama run qwen2.5:14b "warm up"` (it loads the
  model and replies; type `/bye` to exit). Your first in-game turn is then instant.
- **Keep it loaded longer:** set the Windows environment variable `OLLAMA_KEEP_ALIVE` to
  `30m` (or `-1` to keep it resident until Ollama restarts), then restart Ollama. The model
  stays in memory between sessions, so there's no warm-up next time.

For the lowest latency overall, launch with **`start-fast.bat`** (`llama3.1:8b`).

## Fast start for a new dev session

Shortcuts so the next session (human or AI) can get productive quickly:

- **Dev server is pre-configured.** `.claude/launch.json` defines a `roma` config
  that runs `npm run dev` on port 5173 (it boots both the API on `:3001` and the
  client). Start that instead of hand-rolling a command — e.g. the preview tool's
  `preview_start` with name `roma`.
- **Verify the UI without the model.** Starting a *new* game needs Ollama (the
  opening scene is three LLM calls, ~30–45s on `qwen2.5:14b`). To check UI/map
  changes fast, **resume an existing save** instead: `GET /api/game/:id` rebuilds
  map state with no LLM, so set `localStorage['roma-rpg-game-id']` to any id found
  in `server/saves/` and reload.
- **Type-check both workspaces** (no emit, no Ollama needed):
  ```
  npx tsc --noEmit -p server/tsconfig.json
  npx tsc --noEmit -p client/tsconfig.json
  ```
- **Models already pulled:** `qwen2.5:14b` (default, richer) and `llama3.1:8b`
  (faster). The server logs the active model on boot and serves `GET /api/health`.

## Configuration (env vars)

- `GM_MODEL` — Ollama model tag (default `qwen2.5:14b`; `llama3.1:8b` for speed).
- `GM_NUM_CTX` — model context window in tokens (default `8192`). Big enough to hold
  the system prompt, current state, recent turns, and the running summary without
  silently truncating (Ollama's own default is much smaller); lower it only if VRAM
  is tight.
- `OLLAMA_HOST` — Ollama base URL (default `http://127.0.0.1:11434`).
- `SERVER_PORT` — API server port (default `3001`).

## Project layout

```
shared/
  types.ts           Types shared by client and server
  special.ts         SPECIAL attributes (Roman names), abilities, balance + validation
  items.ts           Item catalog + keyword fallback → equip slots, weight, armor, damage, carry
  mapData.ts         Map landmark anchors (image coords) + location→anchor matcher
server/src/
  llm.ts             LLMClient interface + Ollama implementation
  systemPrompt.ts    GM system prompt + per-turn context builder
  turn.ts            Forced-JSON schemas, dice rolling, effect application
  gm.ts              The GM engine: three-stage turn (checks → effects → narration)
  gameState.ts       Archetype presets (kit/hook) + character/state factory
  history.ts         Narrative windowing + summarization
  mapGen.ts          Deterministic, seeded ASCII chunk generation (per-theme)
  mapEngine.ts       Derives world/local map state from the location each turn
  persistence.ts     JSON save files (+ migration of older saves on load)
  index.ts           Express server + SSE
client/src/          Vite + React + Tailwind UI
  components/
    CharacterCreation.tsx  Creation flow: identity, SPECIAL allocator, abilities
    CharacterSheet.tsx     In-game sheet (wax-tablet modal): identity, vitals/XP, combat, attributes, equip
    StatsPanel.tsx   In-game sidebar panel (HP, gold, armor, carry, the seven attributes, traits)
    LocalMap.tsx     Persistent ASCII minimap panel
    MapOverlay.tsx   World/Rome image map with you-are-here marker + zoom
```

Saved games live in `server/saves/` (gitignored). The browser remembers your
current game id in `localStorage`.
