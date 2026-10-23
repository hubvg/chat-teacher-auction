// Checks for the bid form, shared by the page and the /api/bid function so both
// apply exactly the same rules. No imports: the API loads this file directly.

export const NAME_MAX = 40;
export const EMAIL_MAX = 120;

/** "$1,250.50" -> 1250.5. Anything that isn't a plain positive amount -> null. */
export function parseAmount(text: unknown): number | null {
  const cleaned = String(text ?? '')
    .trim()
    .replace(/^\$\s*/, '')
    .replace(/,(?=\d{3}(?:\D|$))/g, '');
  if (!/^\d+(?:\.\d{1,2})?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return n > 0 ? Math.round(n * 100) / 100 : null;
}

/** What's wrong with a bidder's name, or '' if it's fine. */
export function nameProblem(name: unknown): string {
  const trimmed = String(name ?? '').trim();
  if (!trimmed || !/\p{L}/u.test(trimmed)) return 'Enter your name.';
  if (trimmed.length > NAME_MAX) return `Use ${NAME_MAX} characters or fewer.`;
  // Several names would show on the board as one odd name ("Maya, Kai & Zoe" becomes "Maya Z.").
  if (/[,&+/;]|\s(?:and|plus)\s/i.test(trimmed)) return 'Enter one person’s name. For a group, use the person placing the bid.';
  return '';
}

/** What's wrong with a bidder's email, or '' if it's fine. */
export function emailProblem(email: unknown): string {
  const trimmed = String(email ?? '').trim();
  if (!trimmed) return 'Enter your email.';
  if (trimmed.length > EMAIL_MAX || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed)) {
    return 'Enter an email like name@example.com.';
  }
  return '';
}
