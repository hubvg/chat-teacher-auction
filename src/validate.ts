import { activities, config } from './site';
import { wallClock } from './lib/format';

export interface ConfigReport {
  errors: string[];
  warnings: string[];
}

/**
 * Checks src/config.ts. Errors stop the build with a clear message instead of
 * shipping a broken page. Warnings point out parts the site is leaving out
 * because they haven't been filled in yet.
 */
export function validateConfig(): ConfigReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!config.title.trim()) errors.push('config.title is empty. It is the page heading.');

  const opens = config.opensAt.trim();
  const closes = config.closesAt.trim();
  if (Boolean(opens) !== Boolean(closes)) {
    errors.push('Set both config.opensAt and config.closesAt, or leave both blank.');
  }
  const dates: Array<[string, string]> = [
    ['opensAt', opens],
    ['closesAt', closes],
  ];
  for (const [key, value] of dates) {
    if (!value) continue;
    try {
      wallClock(value);
      if (!/[+-]\d{2}:\d{2}$|Z$/.test(value)) {
        errors.push(`config.${key} needs a time zone at the end, like 2026-10-30T15:00:00-04:00.`);
      } else if (Number.isNaN(Date.parse(value))) {
        errors.push(`config.${key} ("${value}") is not a real date.`);
      }
    } catch (error) {
      errors.push(`config.${key}: ${(error as Error).message}.`);
    }
  }
  if (opens && closes && Date.parse(closes) <= Date.parse(opens)) {
    errors.push('config.closesAt must be after config.opensAt.');
  }

  if (!(config.minIncrement > 0)) errors.push('config.minIncrement must be more than 0.');
  if (!(config.maxBid >= config.minIncrement)) errors.push('config.maxBid must be at least config.minIncrement.');
  if (!['first-initial', 'full', 'number'].includes(config.nameStyle)) {
    errors.push("config.nameStyle must be 'first-initial', 'full' or 'number'.");
  }

  const charityUrl = config.fundraiser.charityUrl.trim();
  if (charityUrl && !/^https:\/\/\S+$/.test(charityUrl)) {
    errors.push('config.fundraiser.charityUrl must be a full web address starting with https://');
  }
  if (config.logos.full.trim() && !config.logos.fullAlt.trim()) {
    errors.push('config.logos.fullAlt is empty. Write what the logo says, for screen readers.');
  }

  if (!activities.length) errors.push('Add at least one activity.');
  const seen = new Set<number>();
  activities.forEach((a, index) => {
    const where = `Activity ${index + 1} in the list${a.name?.trim() ? ` ("${a.name.trim()}")` : ''}`;
    if (!Number.isInteger(a.lot) || a.lot < 1) errors.push(`${where}: lot must be a whole number, 1 or higher.`);
    if (seen.has(a.lot)) errors.push(`${where}: number ${a.lot} is used twice. Each activity needs its own number.`);
    seen.add(a.lot);
    if (!a.name?.trim()) errors.push(`${where}: the name is empty.`);
    if (a.startingBid !== undefined && !(a.startingBid > 0)) errors.push(`${where}: startingBid must be more than 0.`);
  });

  if (!opens && !closes) {
    warnings.push('Bidding dates are not set, so the site shows "Dates coming soon" and no bids count yet.');
  }
  if (!config.schoolName.trim()) warnings.push('config.schoolName is empty, so the site shows only the title.');
  if (!config.payment.trim()) warnings.push('config.payment is empty, so the site does not say how winners pay.');
  if (!config.contact.trim()) warnings.push('config.contact is empty, so the site does not say where to send questions.');
  return { errors, warnings };
}
