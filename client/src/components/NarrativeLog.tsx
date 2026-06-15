import { useEffect, useRef } from "react";
import type { RollResult, Turn } from "@shared";

interface Props {
  transcript: Turn[];
  streaming: string;
  pendingAction: string | null;
  liveRolls: RollResult[];
  busy: boolean;
}

function Paragraphs({ text }: { text: string }) {
  return (
    <>
      {text
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p, i) => (
          <p key={i} className="mb-3 leading-relaxed text-parchment">
            {p}
          </p>
        ))}
    </>
  );
}

function ActionLine({ text }: { text: string }) {
  return (
    <p className="mb-2 font-display text-sm uppercase tracking-wide text-[var(--color-gold)]">
      › {text}
    </p>
  );
}

function RollLine({ roll }: { roll: RollResult }) {
  return (
    <p className="mb-2 text-sm text-stone-400">
      🎲 <span className="capitalize">{roll.attribute}</span> check vs{" "}
      {roll.difficulty} — rolled {roll.roll} + {roll.modifier} = {roll.total}{" "}
      <span className={roll.success ? "text-emerald-400" : "text-red-400"}>
        {roll.success ? "✓ success" : "✗ failure"}
      </span>
    </p>
  );
}

export default function NarrativeLog({
  transcript,
  streaming,
  pendingAction,
  liveRolls,
  busy,
}: Props) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [transcript, streaming, liveRolls, busy]);

  return (
    <div className="flex-1 overflow-y-auto rounded-lg border border-stone-700 bg-[#221c16]/80 p-5 text-lg">
      {transcript.map((t, i) => (
        <div key={i} className="mb-5">
          {t.action && <ActionLine text={t.action} />}
          <Paragraphs text={t.narrative} />
        </div>
      ))}

      {(pendingAction || busy) && (
        <div className="mb-5 border-t border-stone-700/60 pt-4">
          {pendingAction && <ActionLine text={pendingAction} />}
          {liveRolls.map((r, i) => (
            <RollLine key={i} roll={r} />
          ))}
          {streaming ? (
            <Paragraphs text={streaming} />
          ) : (
            <p className="animate-pulse italic text-stone-500">
              The Game Master considers your fate…
            </p>
          )}
        </div>
      )}

      <div ref={endRef} />
    </div>
  );
}
