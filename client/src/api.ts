// Thin client for the game server: JSON calls + an SSE-over-fetch reader for
// the streaming action endpoint.

import type {
  EquipIntent,
  GameState,
  IntentVerb,
  NewGameRequest,
  RollResult,
  ServerEvent,
} from "@shared";

export interface NewGameResponse {
  id: string;
  state: GameState;
  narrative: string;
  choices: string[];
  rolls: RollResult[];
}

async function asError(res: Response): Promise<never> {
  let message = `Request failed (${res.status})`;
  try {
    const body = await res.json();
    if (body?.error) message = body.error;
  } catch {
    /* ignore */
  }
  throw new Error(message);
}

export async function createGame(
  req: NewGameRequest
): Promise<NewGameResponse> {
  const res = await fetch("/api/game/new", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) return asError(res);
  return res.json();
}

export async function loadGame(id: string): Promise<GameState> {
  const res = await fetch(`/api/game/${id}`);
  if (!res.ok) return asError(res);
  return res.json();
}

/** Options for a turn: the explicit `verb` the player chose (maps to an engine
 *  intent server-side) and/or an equip/unequip intent applied before the turn. */
export interface ActionOptions {
  verb?: IntentVerb;
  intent?: EquipIntent;
}

/** Stream a turn. Yields server events as they arrive. The optional `verb` declares
 *  the player's intent; the optional equip intent is applied and narrated as part of
 *  the turn. */
export async function* streamAction(
  id: string,
  action: string,
  opts: ActionOptions = {}
): AsyncGenerator<ServerEvent> {
  const body: Record<string, unknown> = { action };
  if (opts.verb) body.verb = opts.verb;
  if (opts.intent) body.intent = opts.intent;
  const res = await fetch(`/api/game/${id}/action`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) return asError(res);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) >= 0) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const dataLine = frame
        .split("\n")
        .find((l) => l.startsWith("data:"));
      if (!dataLine) continue;
      const json = dataLine.slice("data:".length).trim();
      if (!json) continue;
      try {
        yield JSON.parse(json) as ServerEvent;
      } catch {
        /* skip malformed frame */
      }
    }
  }
}
