/**
 * Pensieve mark: a shallow basin on a pedestal with thoughts swirling on its
 * surface. Line art in currentColor so it follows the theme.
 */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 32 32" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden className="logo-mark"
    >
      <path d="M3.5 13.5c0 5.5 5.6 9 12.5 9s12.5-3.5 12.5-9" />
      <ellipse cx="16" cy="13.5" rx="12.5" ry="4" />
      <path d="M16 13.6c.9 0 1.4-.6 1-1.2-.5-.8-2.6-.7-3.4.4-.9 1.4 1 2.7 3.6 2.4 3-.3 4.4-2.3 2.6-3.8" />
      <path d="M16 22.5v3M11 27.5h10" />
    </svg>
  );
}
