import assert from 'node:assert/strict';
import { centreMonthlySubscription } from '../dist/subscription-summary.js';

const summary = centreMonthlySubscription([
  { status: 'active', accountMode: 'centre_created', billedBy: 'centre' },
  { status: 'active', accountMode: 'personal', billedBy: 'practitioner' },
  { status: 'invited', accountMode: 'centre_created', billedBy: 'centre' },
], new Date('2026-11-07T12:00:00+01:00'));

assert.equal(summary.monthLabel, 'Novembre 2026');
assert.equal(summary.baseAmount, 33);
assert.equal(summary.sponsoredPractitioners, 1);
assert.equal(summary.practitionerAmount, 12);
assert.equal(summary.personalYulyfPractitioners, 1);
assert.equal(summary.personalYulyfAmount, 0);
assert.equal(summary.totalAmount, 45);

const empty = centreMonthlySubscription([], new Date('2026-11-07T12:00:00+01:00'));
assert.equal(empty.totalAmount, 33);
assert.equal(empty.sponsoredPractitioners, 0);
assert.equal(empty.personalYulyfPractitioners, 0);

console.log('YulyfCentre monthly subscription summary: OK');
