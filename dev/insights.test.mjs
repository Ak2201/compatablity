import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

// public/ has no package.json with "type": "module", and Node 20 would load its
// .js files as CommonJS. This hook marks them as ES modules for the test run only,
// so the shipped code stays a plain ES module with no build step.
register('data:text/javascript,' + encodeURIComponent(`
export async function load(url, context, next) {
  if (url.includes('/public/js/') && url.endsWith('.js')) {
    const r = await next(url, { ...context, format: 'module' });
    return { ...r, format: 'module' };
  }
  return next(url, context);
}`));

const { buildInsights } = await import('../public/js/insights.js');
const { QUESTIONS } = await import('../public/js/questions.js');
const { FRIEND_QUESTIONS } = await import('../public/js/friend-questions.js');

// Every question answered with a middle-of-the-road value.
function middle(q) {
  switch (q.type) {
    case 'likert':
    case 'scale':
      return 3;
    case 'choice':
      return q.options[0].value;
    case 'dealbreaker':
      return 'no';
    case 'text':
      return 'An answer.';
    default:
      return undefined;
  }
}

function answers(list, fn) {
  const out = {};
  for (const q of list) {
    const v = fn(q);
    if (v !== undefined) out[q.id] = v;
  }
  return out;
}

const COUPLE = { kind: 'couple', myName: 'Asha', partnerName: 'Ben' };
const FRIEND = { kind: 'friendship', myName: 'Asha', partnerName: 'Ben' };

function assertShape(r) {
  assert.equal(typeof r.summary, 'string');
  assert.ok(Array.isArray(r.profile.axes));
  assert.ok(Array.isArray(r.fightForecast));
  assert.ok(Array.isArray(r.strengths));
  assert.equal(typeof r.bids.match, 'string');
  assert.equal(typeof r.bids.text, 'string');
  assert.equal(r.conversationDeck.length, 8);
  assert.equal(typeof r.cautionNote, 'string');
}

test('identical answers produce no severity-80+ fights', () => {
  const same = answers(QUESTIONS, middle);
  const r = buildInsights(same, same, null, COUPLE);
  const high = r.fightForecast.filter((f) => f.severity >= 80);
  assert.deepEqual(high.map((f) => f.title), []);

  const sameFriend = answers(FRIEND_QUESTIONS, middle);
  const rf = buildInsights(sameFriend, sameFriend, null, FRIEND);
  assert.deepEqual(rf.fightForecast.filter((f) => f.severity >= 80).map((f) => f.title), []);
});

test('anxious plus avoidant answers give the pursue-withdraw cycle at severity 85', () => {
  const anxious = {
    'att.worry': 5, 'att.reassure': 5, 'att.jealous': 5,
    'att.depend': 1, 'att.distance': 1, 'att.indep': 1,
  };
  const avoidant = {
    'att.worry': 1, 'att.reassure': 1, 'att.jealous': 1,
    'att.depend': 5, 'att.distance': 5, 'att.indep': 5,
  };
  const r = buildInsights(anxious, avoidant, null, COUPLE);
  const fight = r.fightForecast.find((f) => f.title === 'Pursue-withdraw cycle');
  assert.ok(fight, JSON.stringify(r.fightForecast.map((f) => f.title)));
  assert.equal(fight.severity, 85);
  assert.equal(fight.likelihood, 'likely');
  assert.ok(fight.sourceIds.includes('att.worry'));
});

test('a children timeline mismatch produces a likely fight', () => {
  const mine = { 'goals.children': 5, 'goals.children_when': 'soon' };
  const theirs = { 'goals.children': 1, 'goals.children_when': 'no' };
  const r = buildInsights(mine, theirs, null, COUPLE);
  const fight = r.fightForecast.find((f) => f.title === 'Children timeline');
  assert.ok(fight);
  assert.equal(fight.severity, 90);
  assert.equal(fight.likelihood, 'likely');
  assert.ok(fight.sourceIds.includes('goals.children'));
});

test('bids are same when primary languages match and different otherwise', () => {
  const same = buildInsights({ 'aff.feel_cared': 'time' }, { 'aff.feel_cared': 'time' }, null, COUPLE);
  assert.equal(same.bids.match, 'same');
  assert.equal(same.bids.mine.primary, 'time');
  assert.equal(same.bids.mine.label, 'Quality time');

  const diff = buildInsights({ 'aff.feel_cared': 'time' }, { 'aff.feel_cared': 'words' }, null, COUPLE);
  assert.equal(diff.bids.match, 'different');
  assert.equal(diff.bids.theirs.primary, 'words');
  assert.ok(diff.fightForecast.some((f) => f.title === 'Bids missed' && f.severity === 60));

  const unknown = buildInsights({}, { 'aff.feel_cared': 'time' }, null, COUPLE);
  assert.equal(unknown.bids.match, 'unknown');
});

test('profile has exactly six axes with values 0-100 or null', () => {
  const same = answers(QUESTIONS, middle);
  const r = buildInsights(same, same, null, COUPLE);
  assert.equal(r.profile.axes.length, 6);
  assert.deepEqual(
    r.profile.axes.map((a) => a.key),
    ['closeness', 'independence', 'structure', 'expressiveness', 'conflict_tolerance', 'pace'],
  );
  for (const a of r.profile.axes) {
    assert.ok(a.mine === null || (a.mine >= 0 && a.mine <= 100), `${a.key} mine ${a.mine}`);
    assert.ok(a.theirs === null || (a.theirs >= 0 && a.theirs <= 100), `${a.key} theirs ${a.theirs}`);
  }

  const empty = buildInsights({}, {}, null, COUPLE);
  assert.equal(empty.profile.axes.length, 6);
  assert.ok(empty.profile.axes.every((a) => a.mine === null && a.theirs === null));
});

test('fightForecast is sorted by severity and capped at 8', () => {
  const mine = answers(QUESTIONS, (q) => {
    if (q.type === 'likert' || q.type === 'scale') return 1;
    if (q.type === 'choice') return q.options[0].value;
    if (q.type === 'dealbreaker') return 'yes';
    return undefined;
  });
  const theirs = answers(QUESTIONS, (q) => {
    if (q.type === 'likert' || q.type === 'scale') return 5;
    if (q.type === 'choice') return q.options[q.options.length - 1].value;
    if (q.type === 'dealbreaker') return 'no';
    return undefined;
  });
  const r = buildInsights(mine, theirs, null, COUPLE);
  assert.ok(r.fightForecast.length > 0);
  assert.ok(r.fightForecast.length <= 8, `got ${r.fightForecast.length}`);
  for (let i = 1; i < r.fightForecast.length; i++) {
    assert.ok(r.fightForecast[i - 1].severity >= r.fightForecast[i].severity, 'not sorted');
  }
});

test('missing or non-object input does not throw and returns the full shape', () => {
  const inputs = [
    [undefined, undefined, undefined, undefined],
    [null, 'x', 42, null],
    [[], {}, [], 'couple'],
  ];
  for (const [m, t, rep, o] of inputs) {
    const r = buildInsights(m, t, rep, o);
    assertShape(r);
    assert.equal(r.profile.axes.length, 6);
    assert.deepEqual(r.fightForecast, []);
    assert.equal(r.bids.match, 'unknown');
  }

  const f = buildInsights(undefined, null, null, { kind: 'friendship' });
  assertShape(f);
  assert.equal(f.profile.axes.length, 6);
});

test('conversationDeck always has exactly 8 cards', () => {
  const same = answers(QUESTIONS, middle);
  assertShape(buildInsights(same, same, null, COUPLE));

  const mine = { 'con.contempt': 5, 'con.criticism': 5, 'con.defensive': 5, 'con.stonewall': 5, 'con.repair': 1 };
  const theirs = { 'con.contempt': 1, 'con.criticism': 5, 'con.defensive': 5, 'con.stonewall': 5, 'con.repair': 5 };
  const r = buildInsights(mine, theirs, null, COUPLE);
  assert.equal(r.conversationDeck.length, 8);
  for (const card of r.conversationDeck) {
    assert.equal(typeof card.question, 'string');
    assert.equal(typeof card.why, 'string');
  }
});

test('friendship identical answers give a full shape with no severity-80 fights', () => {
  const same = answers(FRIEND_QUESTIONS, middle);
  const r = buildInsights(same, same, null, FRIEND);
  assertShape(r);
  assert.equal(r.profile.axes.length, 6);
  assert.ok(r.fightForecast.every((f) => f.severity < 80));
});

test('a friendship dealbreaker mismatch names the non-negotiable', () => {
  const r = buildInsights(
    { 'fr.values.dealbreaker.cruelty': 'yes' },
    { 'fr.values.dealbreaker.cruelty': 'no' },
    null,
    FRIEND,
  );
  const fight = r.fightForecast.find((f) => f.title === 'Non-negotiable mismatch');
  assert.ok(fight);
  assert.equal(fight.severity, 80);
  assert.ok(fight.sourceIds.includes('fr.values.dealbreaker.cruelty'));
});
