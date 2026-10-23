// Values derived from config.ts, shared by the page, the build script and tests.
import { activities, config } from './config';
import type { Rules } from './lib/auction';
import { longDateTime } from './lib/format';

export { activities, config };

const parseTime = (value: string): number | null => (value.trim() ? Date.parse(value) : null);

/** Opening and closing times in ms, or null while they aren't set. */
export const schedule = {
  opensAt: parseTime(config.opensAt),
  closesAt: parseTime(config.closesAt),
};

/** True once both dates are set. Until then the board shows "Dates coming soon" and no bids count. */
export const scheduled = schedule.opensAt !== null && schedule.closesAt !== null;

/** The bidding rules. Without dates the window is empty (opens at +Infinity), so no bid can count. */
export const rules: Rules = {
  opensAt: schedule.opensAt ?? Number.POSITIVE_INFINITY,
  closesAt: schedule.closesAt ?? Number.NEGATIVE_INFINITY,
  minIncrement: config.minIncrement,
  startingBid: config.startingBid,
};

/** The starting bid when every activity has the same one (usually), otherwise null. */
export const uniformStartingBid: number | null = (() => {
  const starts = new Set(activities.map((a) => a.startingBid ?? config.startingBid));
  return starts.size === 1 ? [...starts][0]! : null;
})();

export const closeLabel = config.closesAt.trim() ? longDateTime(config.closesAt) : null;
export const openLabel = config.opensAt.trim() ? longDateTime(config.opensAt) : null;

/** "TanenbaumCHAT Teacher Auction", or just "Teacher Auction" without a school name. */
export const siteName = [config.schoolName.trim(), config.title.trim()].filter(Boolean).join(' ');

/** The charity that receives the money, if set. */
export const charity = {
  name: config.fundraiser.charity.trim(),
  url: config.fundraiser.charityUrl.trim(),
};

/** "a Think Pink fundraiser for Rethink Breast Cancer", or '' when nothing is set. Names the charity when there is one. */
export const fundraiserPhrase = (() => {
  const name = config.fundraiser.name.trim();
  const beneficiary = charity.name || config.fundraiser.cause.trim();
  if (!name && !beneficiary) return '';
  const forWhom = beneficiary ? ` for ${beneficiary}` : '';
  return name ? `a ${name} fundraiser${forWhom}` : `a fundraiser${forWhom}`;
})();

/** The school's short name (falls back to the full name). */
export const schoolShort = config.schoolNickname.trim() || config.schoolName.trim();

/** "CHAT Teacher Auction": the name people actually say, when there's a nickname. */
export const shortSiteName = config.schoolNickname.trim() ? `${config.schoolNickname.trim()} ${config.title.trim()}` : null;
