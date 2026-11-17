// Decorative illustration for the login page: an abstract congregation seen through a camera viewfinder.
// Purely illustrative; it is not a real detection result.
const rows = [6, 8, 10, 12, 14];
export function LoginArt() {
  const heads: { x: number; y: number; hl: boolean }[] = [];
  rows.forEach((n, r) => { for (let i = 0; i < n; i++) heads.push({ x: 50 + ((i + 0.5) / n) * 300 + (r % 2 ? 6 : -6), y: 150 + r * 30, hl: (r * 7 + i * 3) % 5 === 0 }); });
  return (
    <svg viewBox="0 0 400 330" className="h-full w-full" aria-hidden>
      <defs>
        <radialGradient id="la-glow" cx="50%" cy="30%" r="70%"><stop offset="0" stopColor="#4ADE80" stopOpacity=".35" /><stop offset="1" stopColor="#4ADE80" stopOpacity="0" /></radialGradient>
      </defs>
      <rect width="400" height="330" fill="url(#la-glow)" />
      {[40, 110, 180].map((r) => <circle key={r} cx="200" cy="330" r={r * 1.6} fill="none" stroke="#fff" strokeOpacity=".07" />)}
      {heads.map((h, i) => (
        <g key={i}>
          <circle cx={h.x} cy={h.y} r="7" fill={h.hl ? "#86EFAC" : "#fff"} fillOpacity={h.hl ? 0.95 : 0.35} />
          <path d={`M${h.x - 11},${h.y + 22} q11,-16 22,0`} fill={h.hl ? "#86EFAC" : "#fff"} fillOpacity={h.hl ? 0.8 : 0.22} />
          {h.hl && <rect x={h.x - 14} y={h.y - 14} width="28" height="38" rx="6" fill="none" stroke="#86EFAC" strokeWidth="1.4" strokeDasharray="4 3" />}
        </g>))}
      {[[24, 24, 1, 1], [376, 24, -1, 1], [24, 306, 1, -1], [376, 306, -1, -1]].map(([x, y, a, b], i) => <path key={i} d={`M${x},${(y as number) + 28 * (b as number)} V${y} H${(x as number) + 28 * (a as number)}`} fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeOpacity=".8" />)}
    </svg>
  );
}
