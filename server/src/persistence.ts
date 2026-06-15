// Simple JSON-file persistence for saved games (server/saves/<id>.json).

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { GameState } from "../../shared/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAVES_DIR = path.join(__dirname, "..", "saves");

async function ensureDir(): Promise<void> {
  await fs.mkdir(SAVES_DIR, { recursive: true });
}

function saveFile(id: string): string {
  // Guard against path traversal — ids come from nanoid, but be safe.
  const safe = id.replace(/[^A-Za-z0-9_-]/g, "");
  return path.join(SAVES_DIR, `${safe}.json`);
}

export async function saveGame(state: GameState): Promise<void> {
  await ensureDir();
  state.updatedAt = new Date().toISOString();
  await fs.writeFile(saveFile(state.id), JSON.stringify(state, null, 2), "utf8");
}

export async function loadGame(id: string): Promise<GameState | null> {
  try {
    const raw = await fs.readFile(saveFile(id), "utf8");
    return JSON.parse(raw) as GameState;
  } catch {
    return null;
  }
}
