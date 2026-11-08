import type { Species } from "@/lib/types";

const COLOR: Record<Species, string> = {
  fern: "var(--fern)",
  wildflower: "var(--wild)",
  sunflower: "var(--sun)",
  sprout: "var(--sprout)",
  moonflower: "var(--moon)",
};

/** One plant drawn at the origin, growing upward. Stage 0 (seed) to 4 (bloom). */
export function PlantArt({ species, stage }: { species: Species; stage: number }) {
  const c = COLOR[species];
  const stem = "var(--moss)";
  const h = [6, 22, 40, 56, 66][stage] ?? 6;

  if (stage === 0) {
    return (
      <g>
        <ellipse cx="0" cy="0" rx="12" ry="4" fill="var(--soil-dark)" />
        <ellipse cx="0" cy="-3" rx="4" ry="3" fill={c} />
      </g>
    );
  }

  if (species === "fern") {
    const fronds = stage + 1;
    return (
      <g>
        {Array.from({ length: fronds }).map((_, i) => {
          const angle = -50 + (100 / Math.max(1, fronds - 1)) * i;
          return (
            <g key={i} transform={`rotate(${fronds === 1 ? 0 : angle})`}>
              <path d={`M0 0 Q 4 ${-h / 2} 0 ${-h}`} stroke={c} strokeWidth="3" fill="none" strokeLinecap="round" />
              {Array.from({ length: Math.round(h / 9) }).map((__, j) => (
                <g key={j} transform={`translate(${j % 2 ? 1 : 0} ${-8 - j * 8})`}>
                  <ellipse cx="-6" cy="0" rx="6" ry="2.4" fill={c} transform="rotate(-20)" />
                  <ellipse cx="6" cy="0" rx="6" ry="2.4" fill={c} transform="rotate(20)" />
                </g>
              ))}
            </g>
          );
        })}
      </g>
    );
  }

  const leaves = stage >= 2 && (
    <>
      <ellipse cx="-9" cy={-h * 0.38} rx="9" ry="4" fill={stem} transform={`rotate(-30 -9 ${-h * 0.38})`} />
      <ellipse cx="9" cy={-h * 0.55} rx="9" ry="4" fill={stem} transform={`rotate(30 9 ${-h * 0.55})`} />
    </>
  );

  return (
    <g>
      <path d={`M0 0 C 3 ${-h * 0.4} -3 ${-h * 0.7} 0 ${-h}`} stroke={stem} strokeWidth="3" fill="none" strokeLinecap="round" />
      {stage === 1 && (
        <>
          <ellipse cx="-6" cy={-h} rx="6" ry="3.5" fill={stem} transform={`rotate(-25 -6 ${-h})`} />
          <ellipse cx="6" cy={-h} rx="6" ry="3.5" fill={stem} transform={`rotate(25 6 ${-h})`} />
        </>
      )}
      {leaves}
      {stage === 3 && <ellipse cx="0" cy={-h - 5} rx="6" ry="8" fill={c} />}
      {stage === 4 && <Bloom species={species} y={-h} color={c} />}
    </g>
  );
}

function Bloom({ species, y, color }: { species: Species; y: number; color: string }) {
  if (species === "sunflower") {
    return (
      <g transform={`translate(0 ${y - 4})`}>
        {Array.from({ length: 12 }).map((_, i) => (
          <ellipse key={i} cx="0" cy="-12" rx="4" ry="9" fill={color} transform={`rotate(${i * 30})`} />
        ))}
        <circle r="8" fill="var(--soil-dark)" />
      </g>
    );
  }
  if (species === "moonflower") {
    return (
      <g transform={`translate(0 ${y - 6})`}>
        {Array.from({ length: 5 }).map((_, i) => (
          <path key={i} d="M0 0 Q -9 -10 0 -16 Q 9 -10 0 0" fill={color} transform={`rotate(${i * 72})`} />
        ))}
        <circle r="3.5" fill="var(--surface)" />
      </g>
    );
  }
  // wildflower + sprout bloom: loose cluster of small flowers
  const spots: [number, number][] = [[0, -6], [-10, 2], [10, 1], [-4, 8], [6, 9]];
  return (
    <g transform={`translate(0 ${y})`}>
      {spots.map(([x, yy], i) => (
        <g key={i} transform={`translate(${x} ${yy - 6})`}>
          {Array.from({ length: 5 }).map((_, j) => (
            <circle key={j} cx="0" cy="-3.5" r="3" fill={color} transform={`rotate(${j * 72})`} />
          ))}
          <circle r="2" fill="var(--pollen)" />
        </g>
      ))}
    </g>
  );
}
