# Teacher Auction

A live board for your school's teacher auction. People bid right on the site: they tap **Bid** on an activity, enter an amount, their name and email, and the board updates. Every activity shows its top bid and who has it, the newest bid is shown in big numbers, and a countdown runs to closing. Bids are saved in a Google Sheet that you control.

**Nothing on the site is made up.** Every bid and number comes from the Bids sheet. Any text you leave blank in the config is left out of the page instead of being filled with a guess, and until the site is connected to the sheet it says so rather than showing zeros.

**How the pieces fit:**

```
Bid form  ->  /api/bid on Vercel    ->  Apps Script (google/Code.gs)  ->  Bids tab in a Google Sheet
              (checks the bid,          (final check, saves the row)      (one row per bid; you can
               rate limit)                                                  void or add rows)

The page  <-  /api/bids on Vercel   <-  Apps Script feed
(checks       (cache + rate limit)      (bids without emails)
 every 10 s)
```

You only ever edit one file: `src/config.ts`.

---

## Setup

You need a Google account, a free GitHub account and a free Vercel account (sign up for Vercel with GitHub).

### 1. Fill in `src/config.ts`

The 41 activities are already in, named exactly as given and numbered 1 to 41. Bids are saved by number, so once bidding starts, don't renumber them; add new activities at the end with the next number. To give an activity a minimum first bid, add `startingBid` with the amount.

The rest of the config starts with only what's been decided: the title, the school (TanenbaumCHAT, nicknamed CHAT) and its logos, the fundraiser (Think Pink, raising money for Rethink Breast Cancer) and a one-line description. Fill in the rest as you decide it:

| Field | What happens while it's blank |
| --- | --- |
| `opensAt`, `closesAt` | The site says "Dates coming soon" and **no bids are accepted**. Set both together. |
| `schoolName` | The site shows only the title. |
| `schoolNickname` | Phones show the full school name in the top bar (it may get cut off). The nickname also labels the home-screen icon ("CHAT Auction"). |
| `fundraiser` | Any blank part is left out. `charity` and `charityUrl` name and link the charity that receives the money. |
| `logos` | Without `mark`, the top bar shows a small paddle icon instead; without `full`, the footer has no logo. |
| `payment`, `organizer`, `contact` | That line is left off the page. |

Dates look like `2026-10-30T15:00:00-04:00`. The `-04:00` is Eastern daylight time; after November 1, 2026 use `-05:00`.

Three rules are already set; change them to whatever your organizers decide:

- `minIncrement`: how much each new bid must beat the top bid on an activity by. Set to $1.
- `maxBid`: bids above this are refused as typos. Set to $5,000.
- `nameStyle`: how names appear on the board. `'first-initial'` shows "Shawn A.", `'full'` shows the full name as typed, `'number'` shows "Bidder 7" and no names at all.

### 2. Put it on Vercel

1. Create a new repository on GitHub, then use **Add file > Upload files** and drag in everything from this folder (not `node_modules` or `dist`, if you have them).
2. On vercel.com: **Add New > Project**, pick the repository, and press **Deploy**. Vercel detects the settings from `vercel.json`.
3. Open your new `something.vercel.app` address. Until the next step is done, the board says it isn't connected yet.

From now on, every change you commit on GitHub redeploys the site automatically in about a minute.

### 3. Connect the Bids sheet

1. **Pick the Google account that will own the sheet.** The sheet holds every bidder's name and email, so use an account the organizers control. A personal Gmail works best: some school boards block step 4 for school accounts.
2. Signed in as that account, create a new Google Sheet (name it anything). Open **Extensions > Apps Script**, delete what's there, paste the contents of `google/Code.gs`, and press **Save**.
3. In the function menu at the top, pick **setup** and press **Run**. Google asks for permission to edit this one spreadsheet (the script can't open anything else in your account). If it says "Google hasn't verified this app", that's normal for a script you wrote yourself: choose **Advanced**, then **Go to (your project's name)**. Setup creates a **Bids** tab and prints a long **secret** in the log at the bottom. Copy it.
4. **Deploy > New deployment**. Click the gear and choose **Web app**. Set **Execute as: Me** and **Who has access: Anyone**. Deploy, then copy the **Web app URL** (it ends in `/exec`). Open it in a browser: you should see text starting with `{"ok":true`.
5. In Vercel: **Project > Settings > Environment Variables**, add two variables:
   - `BIDS_SOURCE_URL`: the Web app URL from step 4
   - `BIDS_SECRET`: the secret from step 3

   Then go to **Deployments**, open the latest one and choose **Redeploy**.

> **Why "Anyone"?** It lets your Vercel site reach the script. Someone who finds the script's link sees only the bids the board already shows (no emails), and can't add bids: the script accepts only bids that carry the secret, and only your Vercel site has it.

> **School accounts:** if step 4 offers only "Anyone within [school]", the site can't reach the script. Make the sheet in a personal Gmail account instead.

### 4. Test it before opening day

Bids are refused before `opensAt`, so test bids can't sneak into the real auction. To try it: temporarily set `opensAt` to a time in the past (and `closesAt` in the future), commit, wait for the redeploy, and place a bid on the site. It shows on your screen right away and as a new row in the Bids tab. Then set `opensAt` back. Test bids were placed before the real opening time, so they never count; you can also type `x` in their Void column to hide them.

---

## How bidding works

- **Placing a bid:** tap **Bid** on an activity. The smallest bid that counts is already filled in; bidders can raise it. They enter their name and email and press **Place bid**. The form checks everything as they go and says exactly what to fix.
- **If someone got there first:** the form says "Someone just bid $X" and fills in the new minimum, so they can try again in one tap.
- **After bidding:** their bid shows on their screen at once. Everyone else sees it within about 15 seconds. If someone outbids them, the other person's name replaces theirs.
- **The next bid is quicker:** the bidder's name and email are remembered on that phone or computer (and nowhere else).
- **Emails stay private:** the board shows names as set by `nameStyle`. Email addresses are saved only in your sheet so you can reach the winners.

---

## Running the auction

- **The Bids tab** has one row per accepted bid: when it arrived, name, email, activity number and name, and amount. Bids that were too low are never saved.
- **Removing a joke or fake bid:** type `x` in its Void column. It disappears from the board, and the next highest valid bid takes over automatically.
- **Adding a bid by hand** (one told to you in person): fill in a new row's Name, `#` and Amount. The time fills itself in. Like any bid, it counts only if it beats the top bid at that moment by `minIncrement`.
- **What counts:** bids are replayed in the order they arrived. A bid counts only if it beats the top bid on that activity by at least `minIncrement` (or meets the starting bid). If two bids are equal, the earlier one keeps the lead. Bids are refused after `closesAt`.
- **Contacting winners:** after closing, the board shows the winning bid and winner on every activity. Find the row in the sheet with that activity number and amount for their email.
- **"Pledged so far":** the sum of the current top bids. It's what the auction raises if every winner pays, which is why the site doesn't call it money raised.
- **Changing `nameStyle` mid-auction:** the board switches with the next bid after the site redeploys (the script learns the style from each bid).

---

## Fake bids, and what's protected

There are no accounts, so **anyone with the link can bid under any name and email**. Nothing checks that "Shawn A." is really Shawn. That's the trade-off for bidding with no sign-up, and it's why the site's rules say organizers remove joke and fake bids. Keep the Bids tab open during the auction and void anything suspicious, especially big bids near closing.

What is built in:

- **Every bid goes through the site's checks.** The script only accepts bids carrying the secret, so nobody can skip the checks by posting to the sheet directly: the activity must exist, the amount must be a dollar figure under `maxBid`, the name must include letters, the email must be formatted like an email address, and it must be during bidding hours.
- **Two bids at the same moment can't both win.** The script re-checks the top bid while holding a lock, one bid at a time, and tells the slower bidder the new minimum.
- **Simple bots are ignored.** A hidden form field that people never see catches them.
- **Email addresses never leave the sheet.**

If the secret ever leaks, make a new one: in the Apps Script editor open **Project Settings > Script properties**, delete `BIDS_SECRET`, run **setup** again, and put the new secret in Vercel (then redeploy).

---

## Rate limits and load

The real risk for a school auction is everyone opening the link at once, for example right after it's read on the announcements, and a rush of bids just before closing.

1. **CDN cache.** Vercel caches `/api/bids` for 5 seconds, so no matter how many people are watching, Google gets asked only a few times per 5 seconds.
2. **Shared requests.** The function reuses its last answer for 4 seconds and merges simultaneous requests into one call to Google.
3. **Per-IP limits.** 120 uncached board refreshes and 60 bids per minute per IP, then HTTP 429. Both are generous on purpose: everyone on school Wi-Fi shares one IP address.
4. **The sheet saves bids one at a time**, roughly one per second, and Google allows 30 script runs at once per account. In a last-second rush some bidders will see "Lots of bids are coming in at once. Wait a few seconds and press Place bid again." Bids that arrive after `closesAt` are refused, so it's worth telling people not to wait for the final seconds.

The page itself backs off politely: it pauses when the tab is hidden, slows down if the server is unreachable, and waits as long as a 429 tells it to.

**Optional firewall rule:** Vercel's free plan includes one WAF rate-limit rule (Project > Firewall > New Rule > Rate Limit). If you add one, keep it generous, for the same shared-Wi-Fi reason.

---

## The "vibe-coded site" checklist

| Tell | What this project does |
| --- | --- |
| vercel.app address | Only a custom domain removes it (a yearly fee from any domain registrar; add it under Project > Settings > Domains). Canonical links, the sitemap and og:image switch to it automatically. |
| View source is empty | Every page is prerendered at build time. View source shows all 41 activities, the rules and the text. |
| No 404 page | `404.html` returns a real 404 status, has its own title and ships no JavaScript. |
| "Vite + React" browser tab | Titles come from your config. |
| Same title on every page | Home and 404 have different titles. |
| No meta description | Generated from your config (or set `description` yourself). |
| No og:image | `og.png` (1200x630) is drawn from your config on every build, so the preview never goes stale. |
| No structured data | JSON-LD `WebSite`, plus an `Event` with your dates once you set them. |
| Multiple or zero h1s | Exactly one per page. The build fails if that changes. |
| No canonical tag | Set automatically from your Vercel production address. |
| No llms.txt | `/llms.txt` lists every activity, how to bid and the rules. |
| robots.txt blocks AI | Allows all crawlers, links the sitemap, and only excludes `/api/` so student names stay out of search results. |
| No favicon | `favicon.ico`, Apple touch icon and web-app icons, all made from the CHAT logo. |
| No sitemap.xml | Generated on every build. |
| No lang attribute | `<html lang="en-CA">`. |
| Missing alt text | The footer logo has alt text, the top-bar logo is marked decorative (the school name is right next to it), and the build fails on an `<img>` without an `alt`. |
| Source maps | Turned off; the build fails if a `.map` file appears. |
| Console errors | None in any state: not connected, before opening, open, closed. Placing a bid doesn't log one either: being outbid or just missing the deadline is a normal answer, not an HTTP error. Only real failures (Google not answering, a closing-time rush) show up as errors. (On the 404 page, Chrome logs the 404 status itself, which is the correct behaviour.) |
| Massive JS bundle | 77 KB gzipped, most of it React itself. |
| No rate limits | See "Rate limits and load" above. |

Lighthouse on this build: 100 for Performance, Accessibility, Best Practices and SEO on desktop; 92 for Performance and 100 for the rest on mobile. Measured locally without compression, which Vercel adds.

---

## Working on it locally (optional)

Needs Node.js 20.19 or newer.

```bash
npm install
npm run dev        # the site as it is now, with the same /api routes Vercel runs
npm test           # bid rules, the Apps Script (run against an in-memory sheet), the bid endpoint, caching and limits
npm run build      # production build into dist/
```

To use your real sheet locally, copy `.env.example` to `.env.local` and fill in `BIDS_SOURCE_URL` and `BIDS_SECRET`. Bids placed locally go into the real sheet, and only during bidding hours.

- Colours live at the top of `src/styles.css`: `--brand` is the Think Pink pink, `--school` is the CHAT blue from the logo, `--ink` is that blue deepened for text. The link-preview image uses the same values at the top of `src/og.tsx`.
- Logos live in `public/brand/`. If you replace `school-mark.png` (the square one), run `npm run icons` to rebuild the browser and home-screen icons from it.
- The site can't be shown inside an iframe (a security default). To embed it in a school website, remove the `X-Frame-Options` and `Content-Security-Policy` lines from `vercel.json`.
- The files in `tests/` contain made-up sample bids used only to check the logic. They never appear on the site.

## Troubleshooting

- **Board says "Not connected yet", or activities say "Bidding isn't set up yet":** `BIDS_SOURCE_URL` or `BIDS_SECRET` isn't set in Vercel, or you didn't redeploy after adding them.
- **Board says "Dates coming soon":** set both `opensAt` and `closesAt` in `src/config.ts`.
- **Status says "Reconnecting":** open `YOUR-SITE.vercel.app/api/bids`. The `hint` in the response says what's wrong (usually the Apps Script access isn't "Anyone").
- **A bid says "Bids can't be saved right now. Setup problem: ...":** the message says what to fix. Most often `BIDS_SECRET` in Vercel doesn't match the script: run **setup** again (it shows the same secret), paste it into Vercel and redeploy.
- **A bid says "the bid sheet didn't answer":** Google was slow. Trying again usually works. If it keeps happening, look at **Executions** in the Apps Script editor for errors.
- **A bid isn't on the board:** find it in the Bids tab. If it's there, it was voided, it's a hand-added row that doesn't beat the top bid by `minIncrement`, or it's outside bidding hours. If it isn't there, it was never saved, and the bidder saw an error saying so.
- **Changed the Apps Script but nothing happened:** the site uses the deployed version. Go to **Deploy > Manage deployments**, click the pencil, set **Version: New version** and **Deploy**. The URL stays the same.
- **The build failed on Vercel:** the log names the exact problem in `src/config.ts`, for example a repeated activity number or a date in the wrong format.

Fonts: Archivo, by Omnibus-Type, under the SIL Open Font License (`src/fonts/OFL.txt`).
