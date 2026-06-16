import { useState } from "react";
import type { EquipIntent, GameState, RollResult } from "@shared";
import NarrativeLog from "./NarrativeLog";
import StatsPanel from "./StatsPanel";
import InventoryPanel from "./InventoryPanel";
import ScenePanel from "./ScenePanel";
import LocalMap from "./LocalMap";
import MapOverlay from "./MapOverlay";
import CharacterSheet from "./CharacterSheet";
import Journal from "./Journal";
import ChoiceButtons from "./ChoiceButtons";
import ActionInput from "./ActionInput";

interface Props {
  state: GameState;
  choices: string[];
  streaming: string;
  pendingAction: string | null;
  liveRolls: RollResult[];
  busy: boolean;
  error: string | null;
  onAction: (action: string, intent?: EquipIntent) => void;
  onNewGame: () => void;
}

export default function GameScreen({
  state,
  choices,
  streaming,
  pendingAction,
  liveRolls,
  busy,
  error,
  onAction,
  onNewGame,
}: Props) {
  const ended = state.status === "ended";
  const [mapOpen, setMapOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [journalOpen, setJournalOpen] = useState(false);

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col px-4 py-4">
      <header className="mb-3 flex items-center justify-between">
        <h1 className="font-display text-2xl tracking-widest text-[var(--color-gold)]">
          ROMA
        </h1>
        <div className="flex flex-wrap justify-end gap-2">
          <button
            onClick={() => setSheetOpen(true)}
            className="rounded-md border border-stone-700 px-3 py-1.5 text-sm text-stone-300 transition hover:border-[var(--color-gold)]"
          >
            📜 Character
          </button>
          <button
            onClick={() => setJournalOpen(true)}
            className="rounded-md border border-stone-700 px-3 py-1.5 text-sm text-stone-300 transition hover:border-[var(--color-gold)]"
          >
            📖 Journal
          </button>
          <button
            onClick={() => setMapOpen(true)}
            className="rounded-md border border-stone-700 px-3 py-1.5 text-sm text-stone-300 transition hover:border-[var(--color-gold)]"
          >
            🗺 Map
          </button>
          <button
            onClick={onNewGame}
            className="rounded-md border border-stone-700 px-3 py-1.5 text-sm text-stone-300 transition hover:border-stone-500"
          >
            New tale
          </button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[1fr_300px]">
        {/* Main column */}
        <div className="flex min-h-0 flex-col gap-3">
          {state.world.travel && (
            <div className="flex items-center justify-between rounded-md border border-sky-800/60 bg-sky-950/40 px-4 py-2 text-sm text-sky-200">
              <span>
                🧭 Traveling to{" "}
                <span className="font-display text-sky-100">
                  {state.world.travel.destLabel}
                </span>
              </span>
              <span className="text-sky-300/80">
                {state.world.travel.legsDone} of {state.world.travel.legsTotal} legs
              </span>
            </div>
          )}

          <NarrativeLog
            transcript={state.transcript}
            streaming={streaming}
            pendingAction={pendingAction}
            liveRolls={liveRolls}
            busy={busy}
          />

          {error && (
            <p className="rounded-md border border-red-800 bg-red-950/50 px-4 py-2 text-sm text-red-200">
              {error}
            </p>
          )}

          {ended ? (
            <div className="rounded-lg border border-[var(--color-gold)]/50 bg-stone-900/70 p-5 text-center">
              <div className="font-display text-xl uppercase tracking-widest text-[var(--color-gold)]">
                {state.ending?.outcome ?? "The End"}
              </div>
              {state.ending?.epitaph && (
                <p className="mt-2 italic text-stone-300">
                  {state.ending.epitaph}
                </p>
              )}
              <button
                onClick={onNewGame}
                className="mt-4 rounded-md bg-[var(--color-terracotta)] px-6 py-3 font-display uppercase tracking-widest text-white transition hover:brightness-110"
              >
                Begin a new tale
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <ChoiceButtons
                choices={choices}
                disabled={busy}
                onChoose={onAction}
              />
              <ActionInput disabled={busy} onSubmit={onAction} />
            </div>
          )}
        </div>

        {/* Sidebar */}
        <aside className="flex flex-col gap-4 overflow-y-auto">
          <StatsPanel
            character={state.character}
            world={state.world}
            items={state.inventory}
          />
          <ScenePanel npcs={state.world.npcsPresent ?? []} />
          <LocalMap map={state.map} />
          <InventoryPanel items={state.inventory} />
        </aside>
      </div>

      <MapOverlay open={mapOpen} map={state.map} onClose={() => setMapOpen(false)} />
      <CharacterSheet
        open={sheetOpen}
        character={state.character}
        items={state.inventory}
        busy={busy}
        ended={ended}
        onAction={onAction}
        onClose={() => setSheetOpen(false)}
      />
      <Journal
        open={journalOpen}
        state={state}
        onClose={() => setJournalOpen(false)}
      />
    </div>
  );
}
