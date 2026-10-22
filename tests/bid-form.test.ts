// Test inputs only. Nothing in this file is shown on the site.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { activities } from '../src/config';
import { emailProblem, nameProblem, parseAmount } from '../src/lib/bidForm';
import { boardName, shortName } from '../src/lib/names';
import { mergeBids, pruneLocal } from '../src/lib/sanitize';
import type { RawBid } from '../src/types';

test('amounts: dollars, cents and commas are fine; anything else is not', () => {
  assert.equal(parseAmount('45'), 45);
  assert.equal(parseAmount('$45'), 45);
  assert.equal(parseAmount(' $1,250.50 '), 1250.5);
  assert.equal(parseAmount(46), 46);
  for (const bad of ['', 'abc', '-5', '0', '12.345', '1,25', '4 5', null, undefined]) {
    assert.equal(parseAmount(bad), null, String(bad));
  }
});

test('names and emails', () => {
  assert.equal(nameProblem('Maya Test'), '');
  assert.equal(nameProblem('Zoë'), '');
  assert.notEqual(nameProblem(''), '');
  assert.notEqual(nameProblem('12345'), '');
  assert.notEqual(nameProblem('x'.repeat(41)), '');
  assert.equal(emailProblem('maya@school.test'), '');
  assert.notEqual(emailProblem('maya@school'), '');
  assert.notEqual(emailProblem(''), '');
});

test('the board name preview matches the Apps Script', () => {
  assert.equal(shortName('shawn adler'), 'Shawn A.');
  assert.equal(shortName("o'test bidder"), "O'test B.");
  assert.equal(shortName('Zoë Test-Name'), 'Zoë T.');
  assert.equal(boardName('maya test', 'first-initial'), '“Maya T.”');
  assert.equal(boardName('maya test', 'full'), '“maya test”');
  assert.match(boardName('maya test', 'number'), /Bidder 7/);
  assert.equal(boardName('', 'first-initial'), '');
});

test('a just-placed bid shows until the server sends it back', () => {
  const server: RawBid[] = [{ lot: 1, amount: 10, name: 'A', k: 'a', t: 1000 }];
  const mine: RawBid = { lot: 1, amount: 11, name: 'B', k: 'b', t: 2000 };
  assert.deepEqual(mergeBids(server, [mine]), [...server, mine]);
  assert.deepEqual(pruneLocal([mine], server, 3000), [mine], 'still waiting for the server');
  assert.deepEqual(pruneLocal([mine], [...server, { ...mine, t: 2001 }], 3000), [], 'the server has it now');
  assert.deepEqual(pruneLocal([mine], server, 2000 + 120_001), [], 'given up after two minutes');
  assert.equal(mergeBids(server, []), server);
});

test('the activity list is numbered 1 to 41 with no gaps or repeats', () => {
  assert.equal(activities.length, 41);
  assert.deepEqual(
    activities.map((a) => a.lot),
    Array.from({ length: 41 }, (_, i) => i + 1),
  );
  assert.ok(!activities.some((a) => a.name.includes('Sousa')), 'Tutor and scooter is gone');
});
