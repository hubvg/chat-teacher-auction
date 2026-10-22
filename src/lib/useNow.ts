import { useEffect, useState } from 'react';

/**
 * The current time, ticking on whole seconds. Returns null during the first
 * render so the browser's first paint matches the prerendered HTML exactly.
 */
export function useNow(intervalMs = 1000): number | null {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    let interval: number | undefined;
    setNow(Date.now());
    const align = window.setTimeout(() => {
      setNow(Date.now());
      interval = window.setInterval(() => setNow(Date.now()), intervalMs);
    }, intervalMs - (Date.now() % intervalMs));
    return () => {
      window.clearTimeout(align);
      window.clearInterval(interval);
    };
  }, [intervalMs]);

  return now;
}
