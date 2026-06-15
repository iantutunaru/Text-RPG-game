// Thin client for the game server: JSON calls + an SSE-over-fetch reader for
// the streaming action endpoint.

import type {
  GameState,
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

/** Stream a turn. Yields server events as they arrive. */
export async function* streamAction(
  id: string,
  action: string
): AsyncGenerator<ServerEvent> {
  const res = await fetch(`/api/game/${id}/action`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
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
