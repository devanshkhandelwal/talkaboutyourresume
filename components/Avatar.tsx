type Look = {
  label: string;
  bg: string;
  skin: string;
  hair: string;
  shirt: string;
  hairD: string;
  browD: string;
  mouthD: string;
  glasses: boolean;
};

// Placeholder faces. Swap for illustrated art later; keep the same props.
const LOOKS: Record<string, Look> = {
  friendly: {
    label: "The Friendly One", bg: "#F2B84B", skin: "#F1C7A3", hair: "#6B3E26", shirt: "#FFFFFF",
    hairD: "M28 50 C25 28 38 18 51 19 C66 20 76 30 72 52 C70 40 65 32 57 30 C49 35 38 36 31 41 Z",
    browD: "M37 40 Q41.5 36.5 46 40 M54 40 Q58.5 36.5 63 40", mouthD: "M42 57 Q50 64 58 57", glasses: false,
  },
  manager: {
    label: "The Hiring Manager", bg: "#2B4BF2", skin: "#8D5A3B", hair: "#1E1E24", shirt: "#1E2A5A",
    hairD: "M30 42 C30 26 42 21 52 21 C63 21 71 28 70 42 C66 33 58 30 50 30 C42 30 34 34 30 42 Z",
    browD: "M37 40 L46 39.4 M54 39.4 L63 40", mouthD: "M43 58 Q50 62 57 58", glasses: false,
  },
  silent: {
    label: "The Silent Type", bg: "#4A4A52", skin: "#E8B996", hair: "#2E2A26", shirt: "#1E1E24",
    hairD: "M28 52 C26 28 38 20 50 20 C64 20 74 28 72 52 L72 68 C70 56 70 40 64 34 C56 30 44 30 36 34 C30 40 30 56 28 68 Z",
    browD: "M37 41 L46 41 M54 41 L63 41", mouthD: "M44 59 L56 59", glasses: false,
  },
  rusher: {
    label: "The Rusher", bg: "#0B6B5E", skin: "#C68B5E", hair: "#1E1E24", shirt: "#FFFFFF",
    hairD: "M30 40 L33 25 L39 33 L44 19 L50 31 L56 18 L61 32 L67 24 L70 40 C64 33 36 33 30 40 Z",
    browD: "M37 39.5 L46 37 M54 37 L63 39.5", mouthD: "M43 58 Q50 61 57 58", glasses: false,
  },
  skeptic: {
    label: "The Skeptic", bg: "#6A2FD0", skin: "#F5D0B5", hair: "#B5702E", shirt: "#F3F3F5",
    hairD: "M29 44 C28 27 41 20 53 21 C65 22 72 30 71 44 C64 30 52 27 40 34 C35 37 31 40 29 44 Z",
    browD: "M37 41 L46 41 M54 38.5 Q58.5 34.5 63 38", mouthD: "M44 59 Q52 61 57 56.5", glasses: false,
  },
  griller: {
    label: "The Griller", bg: "#C4421E", skin: "#A86F4C", hair: "#7A7A80", shirt: "#1E1E24",
    hairD: "M29 46 C29 38 31 33 34 31 L34 46 Z M71 46 C71 38 69 33 66 31 L66 46 Z",
    browD: "M36 38 L46 41.5 M54 41.5 L64 38", mouthD: "M44 60 Q50 57.5 56 60", glasses: true,
  },
};

export function Avatar({
  character,
  size = 64,
  talking = false,
  open = 0,
  decorative = false,
}: {
  character: string;
  size?: number;
  talking?: boolean;
  /** How open the mouth is while talking, 0 to 1 (driven by the voice's loudness). */
  open?: number;
  decorative?: boolean;
}) {
  const l = LOOKS[character] ?? LOOKS.manager;
  const rx = 4.6 + 2.4 * open;
  const ry = 1.2 + 4.2 * open;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role={decorative ? undefined : "img"}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : l.label}
      style={{ display: "block", flex: "0 0 auto" }}
    >
      <circle cx="50" cy="50" r="50" fill={l.bg} />
      <path d="M18 100 C22 80 38 74 50 74 C62 74 78 80 82 100 Z" fill={l.shirt} />
      <rect x="44" y="64" width="12" height="12" rx="4" fill={l.skin} />
      <ellipse cx="50" cy="46" rx="20" ry="23" fill={l.skin} />
      <path d={l.hairD} fill={l.hair} />
      <circle cx="42" cy="47" r="2.4" fill="#1E1E24" />
      <circle cx="58" cy="47" r="2.4" fill="#1E1E24" />
      <path d={l.browD} fill="none" stroke="#1E1E24" strokeWidth="2" strokeLinecap="round" />
      {l.glasses && (
        <g fill="none" stroke="#1E1E24" strokeWidth="1.6">
          <circle cx="42" cy="47" r="6" />
          <circle cx="58" cy="47" r="6" />
          <path d="M48 47 L52 47" />
        </g>
      )}
      {talking ? (
        <ellipse cx="50" cy="59" rx={rx} ry={ry} fill="#3A1F1F" />
      ) : (
        <path d={l.mouthD} fill="none" stroke="#3A1F1F" strokeWidth="2" strokeLinecap="round" />
      )}
    </svg>
  );
}
