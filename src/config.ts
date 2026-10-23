/**
 * Everything you need to change lives in this file.
 *
 * Nothing here is filled in for you except what you've decided. Leave a text
 * field as '' and the site leaves that part out instead of showing a guess.
 *
 * Edit it (on GitHub you can click the pencil icon), commit, and Vercel rebuilds
 * the site in about a minute. If something is wrong (two activities with the
 * same number, a date in the wrong format), the build stops and the Vercel
 * build log tells you exactly what to fix.
 */
import type { Activity, AuctionConfig } from './types';

export const config: AuctionConfig = {
  title: 'Teacher Auction',
  schoolName: 'TanenbaumCHAT',
  schoolNickname: 'CHAT', // Shown where space is tight, like the top bar on phones.
  tagline: 'Bid on an activity with a CHAT teacher, as an individual or as a group. The money raised goes to Rethink Breast Cancer through our Think Pink fundraiser.',
  fundraiser: {
    name: 'Think Pink',
    cause: 'breast cancer awareness',
    charity: 'Rethink Breast Cancer',
    charityUrl: 'https://rethinkbreastcancer.com',
  },
  logos: {
    mark: '/brand/school-mark.png',
    full: '/brand/school-logo.png',
    fullAlt: 'The Anne & Max Tanenbaum Community Hebrew Academy of Toronto',
  },

  // Until both dates are set, the site says "Dates coming soon" and no bids count.
  // Format: 2026-10-30T15:00:00-04:00 (that's Oct 30 at 3 p.m. Eastern daylight time).
  // Eastern time is -04:00 until Nov 1, 2026, and -05:00 after that.
  opensAt: '2026-10-23T08:00:00-04:00',
  closesAt: '2026-10-29T16:30:00-04:00',

  // The lowest first bid on every activity, in dollars.
  startingBid: 25,
  // Your rule: how much each new bid must beat the top bid on an activity by, in dollars.
  minIncrement: 1,
  // Bids above this many dollars are refused as typos.
  maxBid: 5000,
  // How bidders' names appear on the board: 'first-initial' shows "Shawn A.",
  // 'full' shows "Shawn Adler", 'number' shows "Bidder 7" (no names at all).
  nameStyle: 'first-initial',

  payment: '', // How winners pay, e.g. where, by when, and which methods.
  organizer: '', // e.g. 'the Student Council'
  contact: '', // Where to send questions.
};

/**
 * The activities up for auction, named exactly as written.
 *
 * Each number must be unique. Bids are saved by number, so once bidding starts,
 * don't renumber; add new activities at the end. Every activity starts at
 * config.startingBid. To give one activity a different starting bid, add
 * startingBid with the amount in dollars, like:
 *   { lot: 1, name: '...', startingBid: <amount> },
 */
export const activities: Activity[] = [
  { lot: 1, name: 'Braiding with Berkel (challah!)' },
  { lot: 2, name: 'Cookie decorating with Mrs. Hutchinson' },
  { lot: 3, name: 'Be on the bench for a school sports game' },
  { lot: 4, name: 'Mahj and shmooze with Ms. Sugar and Ms. Hyde' },
  { lot: 5, name: 'Tour of the roof with Emilo' },
  { lot: 6, name: 'Pull the Fire alarm with Rabbi Mandel' },
  { lot: 7, name: 'Get out of detention free card' },
  { lot: 8, name: 'Ramen w/ Romm - Ramen eating & shmooze' },
  { lot: 9, name: 'Reserved cubicle in the library for a week' },
  { lot: 10, name: 'Reserve upstairs couches for you and your friends for a week' },
  { lot: 11, name: 'Knitting, Crochet or Curling  w/ Ms. Chapman' },
  { lot: 12, name: 'Pizza-making with Mr. Fabrizi' },
  { lot: 13, name: 'Pickle-making with Mr. Steinfeld' },
  { lot: 14, name: 'Fitness and Apples with Appelrouth' },
  { lot: 15, name: 'Personal Song about you written and performed by Mr. Peters and Mr. Sable' },
  { lot: 16, name: 'Ukulele lesson with Mr. Kitchen' },
  { lot: 17, name: 'Private Gemarah lesson with Rabbi Gemara' },
  { lot: 18, name: 'Park in Principal Cohen’s spot for a week' },
  { lot: 19, name: 'Park in Dr. Platt’s spot for a week' },
  { lot: 20, name: 'Photoshoot with you and your friends w/ Daniel Malen' },
  { lot: 21, name: 'Be the Principal for a day' },
  { lot: 22, name: 'High tea with Rabbi Sack' },
  { lot: 23, name: 'Fashion tips with Mrs. Nathanson' },
  { lot: 24, name: 'Do the announcements for the day w/ your friends' },
  { lot: 25, name: 'Starbucks  with Ms. Hyde & Ms. Ben-ishai' },
  { lot: 26, name: 'Discuss latest Gen Z slang with Ms. Abramsky ' },
  { lot: 27, name: 'Marathon training with Mr. Brown ' },
  { lot: 28, name: 'Private jam sesh with Rav. Shaanan Scherer' },
  { lot: 29, name: 'Halacha Shmooze with Rabbi Kelman' },
  { lot: 30, name: 'Life Advice with Moe Herskovits' },
  { lot: 31, name: 'Shabbat dinner w/ Rabbi Rothman' },
  { lot: 32, name: 'Tour of the boiler room' },
  { lot: 33, name: 'Ride the Custodian’s Zamboni after lunch!' },
  { lot: 34, name: 'Affogatos and Philosophy with Dr. Milevsky' },
  { lot: 35, name: 'Review your grammar  with Ms. Grammer' },
  { lot: 36, name: 'Tap dancing lessons with Ms. Fahidi' },
  { lot: 37, name: 'Ms. Marcu and Ms. Black lunchtime movie and snack party' },
  { lot: 38, name: 'You and your friends play a basketball game against Mr Chaim and Mr. Pollak' },
  { lot: 39, name: 'Meditation/yoga w Idan Barzilay' },
  { lot: 40, name: 'Workout session with Aime' },
  { lot: 41, name: 'Fill the Vending machines with Ms Packman' },
];
