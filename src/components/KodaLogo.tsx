/**
 * Koda logo mark: a teal circle with a monoline "K" whose upper arm is a
 * dot — the path leading to the goal. Reads cleanly from 16px (favicon)
 * to 32px (chat avatar). Same artwork as src/app/icon.svg.
 */
export function KodaLogo({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role="img"
      aria-label="Koda"
      className={className}
    >
      <circle cx="16" cy="16" r="16" fill="var(--primary, #087C78)" />
      <path
        d="M11.5 9.5v13M11.5 17.5l7.5 5.5"
        stroke="#ffffff"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="20.5" cy="11" r="2.75" fill="#ffffff" />
    </svg>
  );
}
