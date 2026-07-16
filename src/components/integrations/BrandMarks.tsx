/**
 * Inline brand marks for integration surfaces. Self-drawn simplified glyphs
 * (no external fetches, no trademark wordmarks) so cards read instantly.
 */

export function GoogleCalendarMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <rect x="2" y="2" width="20" height="20" rx="3" fill="#fff" stroke="#1A73E8" strokeWidth="1.6" />
      <rect x="2" y="2" width="20" height="6" rx="3" fill="#1A73E8" />
      <rect x="2" y="6" width="20" height="2" fill="#1A73E8" />
      <circle cx="7" cy="4.9" r="1" fill="#fff" />
      <circle cx="17" cy="4.9" r="1" fill="#fff" />
      <text
        x="12"
        y="17.5"
        textAnchor="middle"
        fontSize="9"
        fontWeight="700"
        fill="#1A73E8"
        fontFamily="system-ui, sans-serif"
      >
        31
      </text>
    </svg>
  );
}

export function GmailMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <rect x="2" y="4" width="20" height="16" rx="2" fill="#fff" stroke="#E8EAED" strokeWidth="0.5" />
      <path d="M2 6a2 2 0 0 1 2-2h1v16H4a2 2 0 0 1-2-2V6z" fill="#4285F4" />
      <path d="M22 6a2 2 0 0 0-2-2h-1v16h1a2 2 0 0 0 2-2V6z" fill="#34A853" />
      <path d="M5 4l7 5.6L19 4v3.2l-7 5.6-7-5.6V4z" fill="#EA4335" />
      <path d="M2 6c0-.9.6-1.7 1.4-1.9L5 7.2V4H4a2 2 0 0 0-2 2z" fill="#C5221F" />
      <path d="M22 6c0-.9-.6-1.7-1.4-1.9L19 7.2V4h1a2 2 0 0 1 2 2z" fill="#FBBC04" />
    </svg>
  );
}

export function JobBoardsMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <rect x="2" y="7" width="20" height="13" rx="2.5" fill="#087C78" />
      <path
        d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7"
        fill="none"
        stroke="#087C78"
        strokeWidth="1.8"
      />
      <rect x="2" y="11.2" width="20" height="1.6" fill="#0FA69F" />
      <rect x="10.6" y="10.2" width="2.8" height="3.6" rx="0.8" fill="#fff" />
    </svg>
  );
}
