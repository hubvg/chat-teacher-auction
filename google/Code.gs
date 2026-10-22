/** @OnlyCurrentDoc  (the script can open only this spreadsheet, nothing else in your Google account) */

/**
 * Teacher Auction: saves bids placed on the website and serves the live feed.
 *
 * Where this goes: create a Google Sheet, then Extensions > Apps Script.
 * Replace everything in Code.gs with this file, save, and run setup() once
 * (README step 3). It creates the "Bids" tab and shows a secret to paste into
 * Vercel. Then deploy it as a web app:
 *   Deploy > New deployment > Web app
 *   Execute as: Me
 *   Who has access: Anyone
 * "Anyone" lets the website reach the script. Someone who finds the link sees
 * only the feed the site already shows (no emails), and can't add bids
 * without the secret.
 *
 * How bids arrive: the website checks each bid (activity, amount, name, email,
 * bidding hours), then sends it here with the secret. This script makes the
 * final check, that it beats the current top bid on that activity, while
 * holding a lock so two bids at the same moment can't both win, and adds a row.
 *
 * What the website sees: only the activity number, amount, time and the name
 * as the site's nameStyle setting shows it ("Shawn A." by default). Emails stay
 * in the sheet so you can reach the winners.
 *
 * To remove a joke or fake bid: type x in its Void column. To add a bid by hand
 * (one told to you in person, say), fill in a new row's Name, # and Amount; the
 * time fills itself in.
 */

var SETTINGS = {
  sheetName: 'Bids',
  // How long Google may reuse the last answer to the website, in seconds.
  cacheSeconds: 3,
};

var HEADER = ['Received', 'Name', 'Email', '#', 'Activity', 'Amount', 'Void', 'Note'];
var COL = { received: 0, name: 1, email: 2, lot: 3, activity: 4, amount: 5, void: 6, note: 7 };
var FEED_CACHE_KEY = 'bids:v4';

/** Run once from the editor: creates the Bids tab and the secret the website uses. */
function setup() {
  bidsSheet_();
  var props = PropertiesService.getScriptProperties();
  var secret = props.getProperty('BIDS_SECRET');
  if (!secret) {
    secret = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
    props.setProperty('BIDS_SECRET', secret);
  }
  Logger.log('The Bids tab is ready.');
  Logger.log('In Vercel, add an environment variable named BIDS_SECRET with this value:');
  Logger.log(secret);
}

/* ------------------------------------------------------------------ */
/* Placing a bid (called by the website's /api/bid)                     */
/* ------------------------------------------------------------------ */

function doPost(e) {
  var req;
  try {
    req = JSON.parse(e && e.postData ? e.postData.contents : '');
  } catch (error) {
    return json_({ ok: false, error: 'bad_request' });
  }
  var props = PropertiesService.getScriptProperties();
  var secret = props.getProperty('BIDS_SECRET');
  if (!secret || !req || req.secret !== secret) return json_({ ok: false, error: 'unauthorized' });

  var lot = toLot_(req.lot);
  var amount = toAmount_(req.amount);
  var name = cleanName_(req.name).slice(0, 60);
  var email = String(req.email || '').trim().toLowerCase().slice(0, 120);
  if (!lot || !amount || !name) return json_({ ok: false, error: 'bad_request' });

  // The site's nameStyle setting, kept here so the feed can use it too.
  if (['first-initial', 'full', 'number'].indexOf(req.nameStyle) >= 0 && props.getProperty('NAME_STYLE') !== req.nameStyle) {
    props.setProperty('NAME_STYLE', req.nameStyle);
  }

  var rules = {
    opensAt: Number(req.opensAt),
    closesAt: Number(req.closesAt),
    minIncrement: Number(req.minIncrement) > 0 ? Number(req.minIncrement) : 1,
    startingBid: Number(req.startingBid) > 0 ? Number(req.startingBid) : 0,
  };

  var lock = LockService.getScriptLock();
  try {
    // Shorter than the website's 15-second wait, so a crowd gets "busy, try again" rather than a timeout.
    lock.waitLock(10000);
  } catch (error) {
    return json_({ ok: false, error: 'busy' });
  }
  try {
    var now = Date.now();
    if (!(now >= rules.opensAt)) return json_({ ok: false, error: 'not_open' });
    if (now > rules.closesAt) return json_({ ok: false, error: 'closed' });

    var sheet = bidsSheet_();
    var top = topBid_(sheet.getDataRange().getValues(), lot, rules);
    var nextMin = top.amount ? roundCents_(top.amount + rules.minIncrement) : rules.startingBid || rules.minIncrement;
    if (amount + 1e-9 < nextMin) {
      // "yours": this bidder already holds the top bid (a retry after a slow answer, say).
      return json_({ ok: false, error: 'too_low', nextMin: nextMin, top: top.amount, yours: top.email !== '' && top.email === email });
    }

    var received = new Date(now);
    sheet.appendRow([received, name, email, lot, String(req.activity || '').slice(0, 200), amount, '', '']);
    CacheService.getScriptCache().remove(FEED_CACHE_KEY);

    // Send back the bid exactly as the feed will show it, so the bidder sees it at once.
    var key = bidderKey_(email, name, getSalt_());
    var mine = null;
    buildFeed_().bids.forEach(function (bid) {
      if (bid.k === key && bid.lot === lot && bid.amount === amount) mine = bid;
    });
    return json_({ ok: true, bid: mine || { lot: lot, amount: amount, name: shortName_(name), k: key, t: now } });
  } finally {
    lock.releaseLock();
  }
}

/**
 * The current top bid on one activity ({ amount, email }, amount 0 if none),
 * replaying every bid in time order with the same rules as the website: a bid
 * counts only if it beats the top bid by the minimum step (or meets the
 * starting bid). Voided rows are skipped.
 */
function topBid_(values, lot, rules) {
  var bids = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    if (String(row[COL.void]).trim() !== '') continue;
    if (toLot_(row[COL.lot]) !== lot) continue;
    var t = toTime_(row[COL.received]);
    var amount = toAmount_(row[COL.amount]);
    if (!t || !amount || t < rules.opensAt || t > rules.closesAt) continue;
    bids.push({ t: t, amount: amount, i: r, email: String(row[COL.email] || '').trim().toLowerCase() });
  }
  bids.sort(function (a, b) {
    return a.t - b.t || a.i - b.i;
  });
  var top = { amount: 0, email: '' };
  bids.forEach(function (bid) {
    var min = top.amount ? roundCents_(top.amount + rules.minIncrement) : rules.startingBid || rules.minIncrement;
    if (bid.amount + 1e-9 >= min) top = bid;
  });
  return top;
}

/* ------------------------------------------------------------------ */
/* The feed the website reads                                           */
/* ------------------------------------------------------------------ */

function doGet() {
  try {
    var cache = CacheService.getScriptCache();
    var cached = cache.get(FEED_CACHE_KEY);
    if (cached) return jsonText_(cached);

    var body = JSON.stringify(buildFeed_());
    // Script cache values are capped at 100 KB.
    if (body.length < 95000) cache.put(FEED_CACHE_KEY, body, SETTINGS.cacheSeconds);
    return jsonText_(body);
  } catch (error) {
    return json_({ ok: false, error: String(error && error.message ? error.message : error) });
  }
}

function buildFeed_() {
  var values = bidsSheet_().getDataRange().getValues();
  var style = PropertiesService.getScriptProperties().getProperty('NAME_STYLE') || 'first-initial';
  var salt = getSalt_();
  var numbers = {};
  var nextNumber = 1;
  var bids = [];

  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    if (String(row[COL.void]).trim() !== '') continue;
    var t = toTime_(row[COL.received]);
    var lot = toLot_(row[COL.lot]);
    var amount = toAmount_(row[COL.amount]);
    if (!t || !lot || !amount) continue;

    var rawName = String(row[COL.name] || '');
    var key = bidderKey_(String(row[COL.email] || ''), rawName, salt, r);
    var name;
    if (style === 'number') {
      if (!numbers[key]) numbers[key] = nextNumber++;
      name = 'Bidder ' + numbers[key];
    } else if (style === 'full') {
      name = cleanName_(rawName).slice(0, 40) || 'Anonymous';
    } else {
      name = shortName_(rawName);
    }
    bids.push({ lot: lot, amount: amount, name: name, k: key, t: t });
  }

  bids.sort(function (a, b) {
    return a.t - b.t;
  });
  return { ok: true, generatedAt: Date.now(), bids: bids };
}

/** For a bid typed into the sheet by hand, fills in the time. */
function onEdit(e) {
  if (!e || !e.range) return;
  var sheet = e.range.getSheet();
  if (sheet.getName() !== SETTINGS.sheetName) return;
  var first = Math.max(2, e.range.getRow());
  var last = e.range.getRow() + e.range.getNumRows() - 1;
  for (var r = first; r <= last; r++) {
    var row = sheet.getRange(r, 1, 1, HEADER.length).getValues()[0];
    var hasBid = toLot_(row[COL.lot]) || toAmount_(row[COL.amount]);
    if (hasBid && row[COL.received] === '') sheet.getRange(r, COL.received + 1).setValue(new Date());
  }
}

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

function bidsSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SETTINGS.sheetName);
  if (sheet) return sheet;
  sheet = ss.insertSheet(SETTINGS.sheetName);
  sheet.getRange(1, 1, 1, HEADER.length).setValues([HEADER]).setFontWeight('bold');
  sheet.setFrozenRows(1);
  sheet.getRange('A:A').setNumberFormat('yyyy-mm-dd hh:mm:ss');
  sheet.getRange('F:F').setNumberFormat('$#,##0.00');
  return sheet;
}

/** The same person gets the same anonymous key: by email, otherwise by name. */
function bidderKey_(email, name, salt, row) {
  var identity = String(email).trim().toLowerCase() || String(name).trim().toLowerCase().replace(/\s+/g, ' ') || 'row-' + row;
  return hash_(salt + '|' + identity);
}

function toTime_(value) {
  if (value instanceof Date) return value.getTime();
  if (value === '' || value === null || value === undefined) return 0;
  var parsed = Date.parse(String(value));
  return isNaN(parsed) ? 0 : parsed;
}

function toLot_(value) {
  var m = /\d+/.exec(String(value));
  var n = m ? Number(m[0]) : 0;
  return n >= 1 && n <= 9999 ? n : 0;
}

function toAmount_(value) {
  var n = typeof value === 'number' ? value : parseFloat(String(value).replace(/[^0-9.]/g, ''));
  if (!isFinite(n) || n <= 0) return 0;
  return roundCents_(n);
}

function roundCents_(n) {
  return Math.round(n * 100) / 100;
}

/** Keeps letters, apostrophes, hyphens and spaces. */
function cleanName_(raw) {
  return String(raw || '')
    .replace(/[^\p{L}\p{M}'’\- ]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "shawn adler" -> "Shawn A." */
function shortName_(raw) {
  var parts = cleanName_(raw)
    .split(' ')
    .filter(function (p) {
      return p.length > 0;
    });
  if (!parts.length) return 'Anonymous';
  var first = parts[0].slice(0, 18);
  first = first.charAt(0).toUpperCase() + first.slice(1);
  if (parts.length === 1) return first;
  var last = parts[parts.length - 1].replace(/^['’\-]+/, '');
  return last ? first + ' ' + last.charAt(0).toUpperCase() + '.' : first;
}

function getSalt_() {
  var props = PropertiesService.getScriptProperties();
  var salt = props.getProperty('BIDDER_SALT');
  if (!salt) {
    salt = Utilities.getUuid();
    props.setProperty('BIDDER_SALT', salt);
  }
  return salt;
}

function hash_(text) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8);
  var hex = '';
  for (var i = 0; i < 6; i++) {
    var b = (bytes[i] + 256) % 256;
    hex += (b < 16 ? '0' : '') + b.toString(16);
  }
  return hex;
}

function json_(value) {
  return jsonText_(JSON.stringify(value));
}

function jsonText_(body) {
  return ContentService.createTextOutput(body).setMimeType(ContentService.MimeType.JSON);
}

/** Run from the editor to see what the website will receive, in the log. */
function testFeed() {
  var feed = buildFeed_();
  Logger.log('The website will see ' + feed.bids.length + ' bids.');
  Logger.log(JSON.stringify(feed.bids.slice(-3), null, 2));
}
