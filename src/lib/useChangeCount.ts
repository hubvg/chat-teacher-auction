import { useEffect, useRef, useState } from 'react';

/**
 * Counts how many times `key` changed after the first load. Components use the
 * count as a React key to replay an arrival animation each time a bid lands,
 * without animating everything on the first load.
 */
export function useChangeCount(key: string | null, loaded: boolean): number {
  const previous = useRef<string | null | undefined>(undefined);
  const [changes, setChanges] = useState(0);
  useEffect(() => {
    if (!loaded) return;
    if (previous.current !== undefined && key !== null && key !== previous.current) setChanges((n) => n + 1);
    previous.current = key;
  }, [key, loaded]);
  return changes;
}
