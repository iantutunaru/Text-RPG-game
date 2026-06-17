// Express server: game creation, the streaming action endpoint (SSE), and
// loading saved games. In production it also serves the built client.

import express from "express";
import path from "node:path";
import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";
import type {
  EquipIntent,
  IntentVerb,
  NewGameRequest,
  ServerEvent,
} from "../../shared/types.js";
import {
  MAX_ABILITIES,
  isCuratedAbility,
  validateStats,
} from "../../shared/special.js";
import { OllamaClient, MODEL } from "./llm.js";
import { ARCHETYPES, createGame } from "./gameState.js";
import { runTurn } from "./gm.js";
import { updateMap } from "./mapEngine.js";
import { loadGame } from "./persistence.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Use a dedicated var (not PORT) so dev tooling that injects PORT for the client
// can't accidentally move the API server onto the client's port.
const PORT = Number(process.env.SERVER_PORT) || 3001;

const llm = new OllamaClient();
const app = express();
app.use(express.json({ limit: "1mb" }));

// The explicit action verbs the client's verb bar can send (mapped to engine
// intents in server/src/turn.ts). Anything else is ignored → model classification.
const ACTION_VERBS: IntentVerb[] = [
  "attack",
  "flee",
  "go",
  "take",
  "pay",
  "rest",
  "talk",
  "examine",
  "other",
];

// --- Health check ---
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, model: MODEL });
});

// --- Create a new game ---
app.post("/api/game/new", async (req, res) => {
  const body = (req.body ?? {}) as Partial<NewGameRequest>;

  const name = (body.name ?? "").toString().trim().slice(0, 40);
  if (!name) {
    return res.status(400).json({ error: "A character name is required." });
  }

  const archetype = body.archetype;
  if (!archetype || !ARCHETYPES.includes(archetype)) {
    return res
      .status(400)
      .json({ error: `archetype must be one of: ${ARCHETYPES.join(", ")}` });
  }

  const devMode = body.devMode === true;

  const clampInt = (v: unknown, min: number, max: number, fallback: number) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
  };

  // Narrative fields (length-capped so they can't bloat the per-turn context).
  const age = clampInt(body.age, 12, 90, 25);
  const ancestry =
    (body.ancestry ?? "Roman").toString().trim().slice(0, 40) || "Roman";
  const appearance = (body.appearance ?? "").toString().trim().slice(0, 280);
  const background = (body.background ?? "").toString().trim().slice(0, 600);
  const startingLocation = (body.startingLocation ?? "")
    .toString()
    .trim()
    .slice(0, 80);

  if (archetype === "custom" && !background) {
    return res.status(400).json({
      error: "A custom character needs a background to set the opening scene.",
    });
  }

  // Stats — the server is the authority (clamp + budget; dev bypasses budget).
  const { stats, error: statError } = validateStats(body.stats, archetype, devMode);
  if (statError) {
    return res.status(400).json({ error: statError });
  }

  // Curated abilities: keep only known names, dedupe, cap the count.
  const abilityNames = Array.isArray(body.abilityNames)
    ? Array.from(new Set(body.abilityNames.map((n) => String(n))))
        .filter(isCuratedAbility)
        .slice(0, MAX_ABILITIES)
    : [];

  // Dev-only free-text ability — narrative flavor only, no mechanical effects.
  let customAbility: { name: string; description: string } | undefined;
  if (devMode && body.customAbility && typeof body.customAbility === "object") {
    const caName = String(body.customAbility.name ?? "").trim().slice(0, 40);
    if (caName) {
      customAbility = {
        name: caName,
        description: String(body.customAbility.description ?? "")
          .trim()
          .slice(0, 200),
      };
    }
  }

  try {
    const state = createGame({
      name,
      archetype,
      age,
      ancestry,
      appearance,
      background,
      stats,
      abilityNames,
      customAbility,
      startingLocation: startingLocation || undefined,
    });
    const result = await runTurn(state, "", llm); // generate the opening scene
    res.json({
      id: state.id,
      state: result.state,
      narrative: result.narrative,
      choices: result.choices,
      rolls: result.rolls,
    });
  } catch (err) {
    console.error("Failed to create game:", err);
    res.status(500).json({ error: describeError(err) });
  }
});

// --- Load a saved game ---
app.get("/api/game/:id", async (req, res) => {
  const state = await loadGame(req.params.id);
  if (!state) return res.status(404).json({ error: "Game not found." });
  updateMap(state); // backfill map state for pre-feature saves on resume
  res.json(state);
});

// --- Take an action (Server-Sent Events stream) ---
app.post("/api/game/:id/action", async (req, res) => {
  const state = await loadGame(req.params.id);
  if (!state) return res.status(404).json({ error: "Game not found." });

  const action = (req.body?.action ?? "").toString().trim();
  if (!action) return res.status(400).json({ error: "An action is required." });
  if (state.status === "ended") {
    return res.status(409).json({ error: "This game has already ended." });
  }

  // Optional equip/unequip intent — applied deterministically inside runTurn,
  // then narrated as a normal turn (so it costs a turn; see gm.ts / turn.ts).
  let intent: EquipIntent | undefined;
  const rawIntent = req.body?.intent;
  if (rawIntent && typeof rawIntent === "object") {
    const type = (rawIntent as { type?: unknown }).type;
    const item = String((rawIntent as { item?: unknown }).item ?? "")
      .trim()
      .slice(0, 80);
    if ((type === "equip" || type === "unequip") && item) {
      intent = { type, item };
    }
  }

  // Optional explicit action verb from the verb bar; an unknown value is ignored
  // (the turn then falls back to the model's Stage-A classification).
  const rawVerb = req.body?.verb;
  const verb = ACTION_VERBS.includes(rawVerb as IntentVerb)
    ? (rawVerb as IntentVerb)
    : undefined;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const send = (event: ServerEvent) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  try {
    const result = await runTurn(
      state,
      action,
      llm,
      {
        onToken: (text) => send({ type: "token", text }),
        onRoll: (roll) => send({ type: "roll", roll }),
      },
      intent,
      verb
    );
    send({ type: "done", result });
  } catch (err) {
    console.error("Turn failed:", err);
    send({ type: "error", message: describeError(err) });
  } finally {
    res.end();
  }
});

// --- Serve the built client in production (if present) ---
const clientDist = path.join(__dirname, "..", "..", "client", "dist");
fs.access(clientDist)
  .then(() => {
    app.use(express.static(clientDist));
    app.get("*", (_req, res) => res.sendFile(path.join(clientDist, "index.html")));
    console.log("Serving built client from", clientDist);
  })
  .catch(() => {
    // No build yet — that's fine in dev (Vite serves the client).
  });

function describeError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/ECONNREFUSED|fetch failed|connect/i.test(msg)) {
    return `Could not reach Ollama at the configured host. Is it running? (model: ${MODEL})`;
  }
  return msg;
}

app.listen(PORT, () => {
  console.log(`Roma RPG server listening on http://localhost:${PORT}`);
  console.log(`Using local model: ${MODEL}`);
});
