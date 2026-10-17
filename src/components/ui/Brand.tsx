export function StarMark({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 40" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" aria-hidden="true">
      <line x1="20" y1="4" x2="20" y2="36" />
      <line x1="4" y1="20" x2="36" y2="20" />
      <line x1="10.5" y1="10.5" x2="29.5" y2="29.5" />
      <line x1="29.5" y1="10.5" x2="10.5" y2="29.5" />
      <circle cx="20" cy="20" r="2.6" fill="currentColor" stroke="none" />
      <circle cx="20" cy="4" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="36" cy="20" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function Wordmark({ size = 18 }: { size?: number }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 9, fontWeight: 600, fontSize: size, letterSpacing: "-0.02em" }}>
      <StarMark size={size + 2} />
      Asteric
    </span>
  );
}
