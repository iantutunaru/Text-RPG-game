import type { ScenePresence } from "@shared";

/** Sidebar tracker of the NPCs the GM reports as present in the scene right now.
 *  Best-effort (model-reported), refreshed every turn — a quick "who's here". */
export default function ScenePanel({ npcs }: { npcs: ScenePresence[] }) {
  return (
    <div className="rounded-lg border border-stone-700 bg-stone-900/60 p-4">
      <h3 className="font-display text-sm uppercase tracking-widest text-stone-400">
        In this scene
      </h3>
      {npcs.length === 0 ? (
        <p className="mt-2 text-sm italic text-stone-500">No one else is here.</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {npcs.map((n, i) => (
            <li key={i} className="text-sm">
              <span className="text-parchment">{n.name}</span>
              {n.note && (
                <span className="block text-xs text-stone-500">{n.note}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
