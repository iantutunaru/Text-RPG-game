import { useEffect, useState } from "react";
import type { GameState } from "@shared";

interface Props {
  open: boolean;
  state: GameState;
  onClose: () => void;
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-[var(--color-ink)]/15 pt-4">
      <h3 className="mb-2 font-display text-sm uppercase tracking-[0.2em] text-[var(--color-ink)]/70">
        {title}
      </h3>
      {children}
    </section>
  );
}

const navBtn =
  "rounded border border-[var(--color-ink)]/40 px-2 py-0.5 text-base leading-none text-[var(--color-ink)] transition hover:bg-[var(--color-ink)]/10 disabled:cursor-not-allowed disabled:opacity-30";

// One pane of the day viewer: a finished day shows its stored recap; the day in
// progress shows a one-sentence status line built from live state (no model call).
interface DayPane {
  day: number;
  text: string;
  inProgress: boolean;
}

/** Deterministic "state of affairs" line for the day in progress. */
function statusLine(state: GameState): string {
  const w = state.world;
  const present = (w.npcsPresent ?? []).map((n) => n.name);
  let s = `Day ${w.day}, ${w.timeOfDay} — ${w.location}.`;
  if (present.length) s += ` Present: ${present.join(", ")}.`;
  return s;
}

export default function Journal({ open, state, onClose }: Props) {
  const journal = state.journal ?? {
    places: [],
    people: [],
    days: [],
    currentDay: state.world.day,
    dayLog: "",
  };

  // Finished days (stored recaps) + the current day (live status line), newest last.
  const panes: DayPane[] = [
    ...journal.days.map((d) => ({ day: d.day, text: d.recap, inProgress: false })),
    { day: state.world.day, text: statusLine(state), inProgress: true },
  ];

  // Default to the most recent pane; reset whenever the modal (re)opens.
  const [idx, setIdx] = useState(panes.length - 1);
  useEffect(() => {
    if (open) setIdx(panes.length - 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Close on Escape (mirrors CharacterSheet / MapOverlay).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const view = Math.max(0, Math.min(idx, panes.length - 1));
  const pane = panes[view];
  const places = journal.places;
  const people = journal.people;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Journal"
    >
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border-2 border-[var(--color-ink)]/40 bg-[var(--color-parchment)] text-[var(--color-ink)] shadow-2xl ring-1 ring-inset ring-[var(--color-ink)]/20"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-[var(--color-ink)]/20 px-6 py-4">
          <div>
            <h2 className="font-display text-2xl tracking-wide">Journal</h2>
            <div className="text-sm text-[var(--color-ink)]/70">
              {state.character.name}
            </div>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-md border border-[var(--color-ink)]/40 px-3 py-1.5 text-sm transition hover:bg-[var(--color-ink)]/10"
          >
            Close
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
          {/* Day recap viewer */}
          <section>
            <div className="mb-2 flex items-center justify-between gap-3">
              <h3 className="font-display text-sm uppercase tracking-[0.2em] text-[var(--color-ink)]/70">
                Day {pane.day}
                {pane.inProgress && (
                  <span className="ml-2 normal-case tracking-normal text-[var(--color-ink)]/45">
                    · in progress
                  </span>
                )}
              </h3>
              <div className="flex items-center gap-1.5">
                <button
                  className={navBtn}
                  aria-label="Previous day"
                  disabled={view <= 0}
                  onClick={() => setIdx(view - 1)}
                >
                  ◀
                </button>
                <span className="text-xs tabular-nums text-[var(--color-ink)]/50">
                  {view + 1}/{panes.length}
                </span>
                <button
                  className={navBtn}
                  aria-label="Next day"
                  disabled={view >= panes.length - 1}
                  onClick={() => setIdx(view + 1)}
                >
                  ▶
                </button>
              </div>
            </div>
            {pane.inProgress ? (
              <p className="text-sm italic leading-relaxed text-[var(--color-ink)]/70">
                {pane.text}
              </p>
            ) : (
              <div className="space-y-2 text-sm leading-relaxed">
                {pane.text.split(/\n\n+/).map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
            )}
          </section>

          {/* Places visited */}
          <Section title={`Places visited (${places.length})`}>
            {places.length === 0 ? (
              <p className="text-sm italic text-[var(--color-ink)]/50">
                You have not wandered far yet.
              </p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {places.map((pl, i) => (
                  <li key={i} className="flex items-baseline justify-between gap-3">
                    <span className="flex-1">{pl.name}</span>
                    <span className="shrink-0 text-xs capitalize text-[var(--color-ink)]/50">
                      Day {pl.day} · {pl.timeOfDay}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* People met */}
          <Section title={`People met (${people.length})`}>
            {people.length === 0 ? (
              <p className="text-sm italic text-[var(--color-ink)]/50">
                You have crossed no one's path yet.
              </p>
            ) : (
              <ul className="space-y-2 text-sm">
                {people.map((p, i) => (
                  <li key={i}>
                    <span className="font-display">{p.name}</span>
                    {p.note && (
                      <span className="text-[var(--color-ink)]/60"> — {p.note}</span>
                    )}
                    <div className="text-xs text-[var(--color-ink)]/50">
                      First met at {p.firstSeenLocation} · Day {p.day}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}
