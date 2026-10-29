/** A small rising line crossing a level — the product in one mark. */
export function Logo({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 26 26" aria-hidden="true">
      <rect x="0.75" y="0.75" width="24.5" height="24.5" rx="5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <line x1="4" y1="15" x2="22" y2="15" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2" opacity="0.6" />
      <polyline
        points="4,19 9,16 13,17.5 17,10 22,7"
        fill="none"
        stroke="var(--up)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
