import type { NameStyle } from '../types';

/** Letters, apostrophes, hyphens and single spaces only. Same rule as the Apps Script. */
export function cleanName(raw: string): string {
  return raw
    .replace(/[^\p{L}\p{M}'’\- ]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "shawn adler" -> "Shawn A." Same rule as the Apps Script. */
export function shortName(raw: string): string {
  const parts = cleanName(raw).split(' ').filter(Boolean);
  if (!parts.length) return '';
  let first = parts[0]!.slice(0, 18);
  first = first.charAt(0).toUpperCase() + first.slice(1);
  if (parts.length === 1) return first;
  const last = parts[parts.length - 1]!.replace(/^['’-]+/, '');
  return last ? `${first} ${last.charAt(0).toUpperCase()}.` : first;
}

/** How a name will show on the board, for the hint under the name field. */
export function boardName(raw: string, style: NameStyle): string {
  if (style === 'number') return 'a number, like “Bidder 7”, instead of your name';
  const name = style === 'full' ? cleanName(raw).slice(0, 40) : shortName(raw);
  return name ? `“${name}”` : '';
}
