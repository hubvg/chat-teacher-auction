export type NameStyle = 'first-initial' | 'full' | 'number';

export interface Activity {
  /** The number shown next to the activity. Must be unique; bids are saved by number. */
  lot: number;
  /** The activity's name, shown exactly as written. */
  name: string;
  /** Optional: lowest first bid, in dollars. Without it, the first bid must be at least minIncrement. */
  startingBid?: number;
}

/** Leave any optional text as '' and the site simply leaves that part out. */
export interface AuctionConfig {
  /** Event name. This is the page's main heading. Required. */
  title: string;
  /** Your school's name. */
  schoolName: string;
  /** What everyone calls the school, e.g. "CHAT". Used where space is tight. */
  schoolNickname: string;
  /** One sentence under the heading. */
  tagline: string;
  /** The fundraiser the auction is part of and where the money goes. Leave any of these blank to leave it out. */
  fundraiser: {
    name: string;
    cause: string;
    /** The charity that receives the money. */
    charity: string;
    /** The charity's website (https://...). */
    charityUrl: string;
  };
  /** School logo files in /public. */
  logos: {
    /** Square logo: top bar, browser icon and link preview. Run `npm run icons` after replacing it. */
    mark: string;
    /** Wide logo with the full name: footer. */
    full: string;
    /** What the wide logo says, for screen readers. */
    fullAlt: string;
  };
  /** Optional search/preview description (about 150 characters). Generated if left blank. */
  description?: string;
  /** When bidding opens. The bid form only accepts bids between opensAt and closesAt. */
  opensAt: string;
  /** When bidding closes. */
  closesAt: string;
  /** Each new bid must beat the top bid on that activity by at least this many dollars. */
  minIncrement: number;
  /** Bids above this many dollars are refused as typos. */
  maxBid: number;
  /** How bidders' names appear on the board. */
  nameStyle: NameStyle;
  /** How winners pay. */
  payment: string;
  /** Who is running the auction, as it reads after "Organized by", e.g. "the Student Council". */
  organizer: string;
  /** Where to send questions. */
  contact: string;
  /** Optional. Full site address like https://auction.myschool.ca. Detected automatically on Vercel. */
  siteUrl?: string;
}

/** One bid as served by /api/bids. Names are already shortened by the Apps Script. */
export interface RawBid {
  /** The activity's number. */
  lot: number;
  /** Bid in dollars. */
  amount: number;
  /** Display name, e.g. "Shawn A." */
  name: string;
  /** Anonymous bidder key (salted hash of their email), used only to count unique bidders. */
  k: string;
  /** When the bid was placed, in milliseconds. */
  t: number;
}

export interface BidsPayload {
  configured: boolean;
  updatedAt: number | null;
  bids: RawBid[];
  stale?: boolean;
}
