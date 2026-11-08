"use client";
import type { Plant } from "@/lib/types";
import { PlantArt } from "./PlantArt";

const COLS = 8;
const ROWS = 5;

/** Map a plot cell to a point in the bed. Back rows sit higher and smaller. */
function place(p: Plant) {
  const row = Math.max(0, Math.min(ROWS - 1, p.plot_y));
  const col = Math.max(0, Math.min(COLS - 1, p.plot_x));
  const depth = row / (ROWS - 1); // 0 = back, 1 = front
  const scale = 1.0 + depth * 0.6;
  const width = 560 + depth * 140;
  const x = 400 - width / 2 + (col + 0.5 + (row % 2 ? 0.25 : -0.25)) * (width / COLS);
  const y = 196 + depth * 118;
  return { x, y, scale };
}

export function Garden({
  plants,
  growingId,
  dazzle,
}: {
  plants: Plant[];
  growingId: string | null;
  dazzle: boolean;
}) {
  const sorted = [...plants].sort((a, b) => a.plot_y - b.plot_y || a.plot_x - b.plot_x);
  const bloomed = plants.filter((p) => p.stage === 4).length;

  return (
    <svg className="garden" viewBox="0 0 800 360" role="img"
      aria-label={`Your garden: ${plants.length} plants, ${bloomed} in bloom`}>
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--sky-a)" />
          <stop offset="1" stopColor="var(--sky-b)" />
        </linearGradient>
        <radialGradient id="bed" cx="50%" cy="35%" r="70%">
          <stop offset="0" stopColor="var(--soil)" />
          <stop offset="1" stopColor="var(--soil-dark)" />
        </radialGradient>
        <clipPath id="frame"><rect width="800" height="360" rx="28" /></clipPath>
      </defs>
      <g clipPath="url(#frame)">
      <rect width="800" height="360" fill="url(#sky)" />

      {/* rolling hills behind the bed */}
      <path d="M0 190 C 140 140 260 175 400 150 C 540 126 660 170 800 140 L800 360 L0 360Z"
        fill="var(--moss)" opacity="0.18" />
      {/* the bed */}
      <path d="M118 182 C 260 166 540 166 682 182 C 760 230 770 300 740 334 C 560 350 240 350 60 334 C 30 300 40 230 118 182Z"
        fill="url(#bed)" />
      {/* furrows */}
      {[0.25, 0.5, 0.75].map((d) => (
        <path key={d} d={`M${110 - d * 50} ${196 + d * 118 + 6} Q 400 ${190 + d * 118 + 16} ${690 + d * 50} ${196 + d * 118 + 6}`}
          stroke="var(--soil-dark)" strokeWidth="2" fill="none" opacity="0.5" />
      ))}

      {/* fireflies show in dusk mode */}
      {[[120, 90], [300, 60], [520, 100], [690, 70], [430, 40]].map(([x, y], i) => (
        <circle key={i} className="firefly" cx={x} cy={y} r="2.6" style={{ animationDelay: `${i * 0.8}s` }} />
      ))}

      {sorted.map((p) => {
        const { x, y, scale } = place(p);
        const growing = p.id === growingId;
        return (
          <g key={p.id} transform={`translate(${x} ${y}) scale(${scale})`}>
            <g className={`plant${growing ? " growing" : ""}`}>
              <PlantArt species={p.species} stage={p.stage} />
            </g>
            {growing && dazzle && <Sparkles />}
          </g>
        );
      })}
      </g>
    </svg>
  );
}

function Sparkles() {
  const bits = Array.from({ length: 10 }).map((_, i) => {
    const a = (i / 10) * Math.PI * 2;
    return { dx: Math.cos(a) * 46, dy: Math.sin(a) * 40 - 40 };
  });
  return (
    <g transform="translate(0 -50)">
      {bits.map((b, i) => (
        <path key={i} className="sparkle burst" d="M0 -5 L1.4 -1.4 L5 0 L1.4 1.4 L0 5 L-1.4 1.4 L-5 0 L-1.4 -1.4Z"
          style={{ ["--dx" as string]: `${b.dx}px`, ["--dy" as string]: `${b.dy}px`, animationDelay: `${i * 30}ms` }} />
      ))}
    </g>
  );
}
