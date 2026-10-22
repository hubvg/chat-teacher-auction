/** The auction paddle mark. Decorative: always paired with visible text. */
export function Paddle({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <circle cx="16" cy="12.5" r="8.5" fill="currentColor" />
      <rect x="14" y="19" width="4" height="10" rx="2" fill="currentColor" />
    </svg>
  );
}
