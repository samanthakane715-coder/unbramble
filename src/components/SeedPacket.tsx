"use client";
import type { Tip } from "@/lib/tipsData";

/** A small seed-packet card with a life hack or fun fact. */
export function SeedPacket({ tip, onClose }: { tip: Tip; onClose: () => void }) {
  return (
    <aside className="packet" aria-live="polite">
      <svg className="packet-seed" viewBox="0 0 24 24" aria-hidden="true">
        <ellipse cx="12" cy="13" rx="6" ry="8" fill="var(--soil)" />
        <path d="M12 6 Q 15 2 19 3 Q 16 7 12 6Z" fill="var(--sprout)" />
      </svg>
      <div>
        <p className="packet-label">{tip.type === "fact" ? "Fun fact" : "Try this"}</p>
        <p className="packet-text">{tip.text}</p>
      </div>
      <button className="packet-close" onClick={onClose} aria-label="Dismiss">
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
      </button>
    </aside>
  );
}
