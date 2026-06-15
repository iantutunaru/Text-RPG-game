import { useEffect, useState } from "react";
import type { GameState, NewGameRequest, RollResult } from "@shared";
import * as api from "./api";
import CharacterCreation from "./components/CharacterCreation";
import GameScreen from "./components/GameScreen";

const STORAGE_KEY = "roma-rpg-game-id";

export default function App() {
  const [state, setState] = useState<GameState | null>(null);
  const [choices, setChoices] = useState<string[]>([]);
  const [streaming, setStreaming] = useState("");
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [liveRolls, setLiveRolls] = useState<RollResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);

  // Resume a saved game on first load.
  useEffect(() => {
    const id = localStorage.getItem(STORAGE_KEY);
    if (!id) {
      setBooting(false);
      return;
    }
    api
      .loadGame(id)
      .then((s) => {
        setState(s);
        setChoices(s.lastChoices ?? []);
      })
      .catch(() => localStorage.removeItem(STORAGE_KEY))
      .finally(() => setBooting(false));
  }, []);

  async function startGame(req: NewGameRequest) {
    setCreating(true);
    setError(null);
    try {
      const res = await api.createGame(req);
      localStorage.setItem(STORAGE_KEY, res.id);
      setState(res.state);
      setChoices(res.choices);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }

  async function takeAction(action: string) {
    if (!state || busy) return;
    setBusy(true);
    setError(null);
    setStreaming("");
    setLiveRolls([]);
    setPendingAction(action);
    setChoices([]);

    let live = "";
    const rolls: RollResult[] = [];
    try {
      for await (const ev of api.streamAction(state.id, action)) {
        if (ev.type === "token") {
          live += ev.text;
          setStreaming(live);
        } else if (ev.type === "roll") {
          rolls.push(ev.roll);
          setLiveRolls([...rolls]);
        } else if (ev.type === "done") {
          setState(ev.result.state);
          setChoices(ev.result.choices);
        } else if (ev.type === "error") {
          setError(ev.message);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setStreaming("");
      setPendingAction(null);
      setLiveRolls([]);
    }
  }

  function newGame() {
    localStorage.removeItem(STORAGE_KEY);
    setState(null);
    setChoices([]);
    setError(null);
  }

  if (booting) {
    return (
      <div className="flex h-full items-center justify-center text-stone-400">
        <span className="font-display tracking-widest">LOADING…</span>
      </div>
    );
  }

  if (!state) {
    return (
      <CharacterCreation
        onCreate={startGame}
        creating={creating}
        error={error}
      />
    );
  }

  return (
    <GameScreen
      state={state}
      choices={choices}
      streaming={streaming}
      pendingAction={pendingAction}
      liveRolls={liveRolls}
      busy={busy}
      error={error}
      onAction={takeAction}
      onNewGame={newGame}
    />
  );
}
