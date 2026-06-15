import { useEffect, useState } from "react";
import type { MapState, MapView } from "@shared";
import { getAnchor, ROME_ON_WORLD } from "../../../shared/mapData";
// vite/client provides the *.png module declarations; fs.allow:['..'] lets these
// resolve from the repo-level art folder, and the build emits hashed copies.
import worldMapImg from "../../../art/Map/World_Map.png";
import romeMapImg from "../../../art/Map/Map_Of_Rome.png";

interface Props {
  open: boolean;
  map?: MapState;
  onClose: () => void;
}

export default function MapOverlay({ open, map, onClose }: Props) {
  const anchor = getAnchor(map?.anchorId);
  const inRome = !!anchor?.inRome;
  const [view, setView] = useState<MapView>(map?.view ?? "world");

  // Reset the zoom to wherever the player currently is each time we open.
  useEffect(() => {
    if (open) setView(map?.view ?? "world");
  }, [open, map?.view]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  // Where to pin the marker for the image currently shown.
  let marker: { x: number; y: number } | null = null;
  if (anchor) {
    if (view === "rome") {
      marker = anchor.view === "rome" ? { x: anchor.x, y: anchor.y } : null;
    } else {
      // Empire view: a world anchor pins at its own coords; an in-Rome anchor
      // pins at the city of Rome's position on the world map.
      marker = anchor.view === "world" ? { x: anchor.x, y: anchor.y } : ROME_ON_WORLD;
    }
  }

  const img = view === "rome" ? romeMapImg : worldMapImg;
  const title = view === "rome" ? "VRBS ROMA" : "ORBIS ROMANVS";

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/85 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Map"
    >
      <div
        className="flex max-h-full flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center justify-between gap-4">
          <span className="font-display text-lg tracking-[0.3em] text-[var(--color-gold)]">
            {title}
          </span>
          <div className="flex gap-2">
            {inRome && (
              <button
                onClick={() => setView((v) => (v === "rome" ? "world" : "rome"))}
                className="rounded-md border border-stone-600 px-3 py-1.5 text-sm text-stone-200 transition hover:border-[var(--color-gold)]"
              >
                {view === "rome" ? "↤ Empire" : "Rome ↦"}
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded-md border border-stone-600 px-3 py-1.5 text-sm text-stone-200 transition hover:border-stone-400"
            >
              Close
            </button>
          </div>
        </div>

        <div className="relative w-fit self-center">
          <img
            src={img}
            alt={title}
            className="max-h-[78vh] w-auto rounded-md border border-stone-700 shadow-2xl"
          />
          {marker && (
            <div
              className="pointer-events-none absolute flex flex-col items-center"
              style={{
                left: `${marker.x * 100}%`,
                top: `${marker.y * 100}%`,
                transform: "translate(-50%, -50%)",
              }}
            >
              <span className="relative flex h-3.5 w-3.5 items-center justify-center">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-terracotta)] opacity-75" />
                <span className="relative inline-flex h-3 w-3 rounded-full border border-amber-200 bg-[var(--color-terracotta)]" />
              </span>
            </div>
          )}
        </div>

        <div className="mt-2 text-center text-sm text-stone-300">
          {anchor ? (
            <>
              You are at <span className="text-[var(--color-gold)]">{anchor.label}</span>
            </>
          ) : (
            <span className="text-stone-500">Your exact position is uncharted.</span>
          )}
        </div>
      </div>
    </div>
  );
}
