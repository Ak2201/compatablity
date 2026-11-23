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

const { SELF_QUESTIONS, SELF_DIMENSIONS, validateSelfQuestions } = await import('../public/js/self-questions.js');
const { selfProfile, compareSelf, selfCompletion, REVERSED } = await import('../public/js/self-profile.js');

const TRAITS = ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'emotional_steadiness'];

// Every scored item answered with the same value (choice items get their first option).
function allSame(value) {
  const out = {};
  for (const q of SELF_QUESTIONS) {
    if (q.type === 'choice') out[q.id] = q.options[0].value;
    else out[q.id] = value;
  }
  return out;
}

const byId = (id) => SELF_QUESTIONS.find((q) => q.id === id);

test('validateSelfQuestions passes with exactly 100 items and unique ids', () => {
  assert.equal(validateSelfQuestions(), 100);
  assert.equal(SELF_QUESTIONS.length, 100);
  assert.equal(new Set(SELF_QUESTIONS.map((q) => q.id)).size, 100);
  assert.ok(SELF_QUESTIONS.every((q) => q.id.startsWith('self.')));
  assert.ok(SELF_QUESTIONS.every((q) => q.type !== 'text' && q.type !== 'dealbreaker'));
  assert.equal(SELF_QUESTIONS.filter((q) => q.dimension === 'patterns').length, 10);
  assert.ok(Object.keys(SELF_DIMENSIONS).includes('patterns'));
});

test('validateSelfQuestions throws on a duplicate id', () => {
  const broken = [...SELF_QUESTIONS];
  broken[1] = { ...broken[1], id: broken[0].id };
  assert.throws(() => validateSelfQuestions(broken), /duplicate|id/);
});

test('all-5 answers give high trait scores and all-1 answers give low ones', () => {
  const high = selfProfile(allSame(5));
  for (const key of TRAITS) {
    const t = high.traits.find((x) => x.key === key);
    assert.ok(t.score >= 67, `${key} high score was ${t.score}`);
    assert.equal(t.band, 'high');
  }
  const low = selfProfile(allSame(1));
  for (const key of TRAITS) {
    const t = low.traits.find((x) => x.key === key);
    assert.ok(t.score <= 33, `${key} low score was ${t.score}`);
    assert.equal(t.band, 'low');
  }
  assert.equal(high.traits.length, 5);
  assert.ok(!high.traits.some((t) => t.key === 'patterns'));
});

test('reverse-scored items are flagged and lower the trait when agreed with', () => {
  assert.ok(REVERSED.has('self.emotional_steadiness.worry.3'));
  const worryAgree = selfProfile({ ...allSame(3), 'self.emotional_steadiness.worry.3': 5 });
  const worryDisagree = selfProfile({ ...allSame(3), 'self.emotional_steadiness.worry.3': 1 });
  const facet = (p) => p.facets.find((f) => f.trait === 'emotional_steadiness' && f.key === 'worry').score;
  assert.ok(facet(worryAgree) < facet(worryDisagree), `${facet(worryAgree)} vs ${facet(worryDisagree)}`);
  const trait = (p) => p.traits.find((t) => t.key === 'emotional_steadiness').score;
  assert.ok(trait(worryAgree) < trait(worryDisagree));
});

test('patterns answers name the most frequent habit', () => {
  const answers = {};
  const patterns = SELF_QUESTIONS.filter((q) => q.dimension === 'patterns');
  for (const q of patterns) answers[q.id] = 'withdraw';
  answers[patterns[0].id] = 'sharp';
  const p = selfProfile(answers);
  assert.equal(p.stress.habit, 'withdraw');
  assert.equal(typeof p.stress.text, 'string');
  assert.ok(p.growthAreas.length <= 4);
  assert.ok(p.strengths.length <= 5);
});

test('compareSelf is unavailable with the right reason when one side has not answered', () => {
  const mine = allSame(4);
  const theirs = allSame(2);
  const a = compareSelf(mine, {});
  assert.equal(a.available, false);
  assert.equal(a.reason, 'they_have_not_done_it');
  const b = compareSelf({}, theirs);
  assert.equal(b.available, false);
  assert.equal(b.reason, 'you_have_not_done_it');
  const c = compareSelf(undefined, null);
  assert.equal(c.available, false);
});

test('compareSelf gives close for identical answers', () => {
  const same = allSame(4);
  const r = compareSelf(same, same, { partnerName: 'Sam' });
  assert.equal(r.available, true);
  assert.equal(r.reason, null);
  assert.equal(r.partnerName, 'Sam');
  assert.equal(r.traits.length, 5);
  for (const t of r.traits) {
    assert.equal(t.gap, 0);
    assert.equal(t.closeness, 100);
    assert.equal(t.read, 'close');
  }
});

test('compareSelf reads far for opposite trait answers', () => {
  const r = compareSelf(allSame(5), allSame(1));
  assert.ok(r.traits.every((t) => t.read === 'far'));
});

test('compareSelf summary never ranks the couple', () => {
  const pairs = [
    [allSame(4), allSame(4)],
    [allSame(5), allSame(1)],
    [allSame(3), allSame(4)],
  ];
  for (const [m, t] of pairs) {
    const { summary } = compareSelf(m, t);
    assert.ok(!/more compatible/i.test(summary), summary);
    assert.ok(!/winner/i.test(summary), summary);
  }
});

test('selfProfile of empty answers returns the full shape with null scores', () => {
  const inputs = [{}, undefined, null, 'x', [], 42];
  for (const input of inputs) {
    const p = selfProfile(input);
    assert.equal(p.traits.length, 5);
    assert.ok(p.traits.every((t) => t.score === null && t.label === null && t.band === null));
    assert.equal(p.facets.length, 20);
    assert.ok(p.facets.every((f) => f.score === null));
    assert.deepEqual(p.strengths, []);
    assert.deepEqual(p.growthAreas, []);
    assert.equal(p.stress.habit, null);
    assert.equal(typeof p.stress.text, 'string');
    assert.equal(p.style.label, null);
    assert.equal(p.answeredCount, 0);
    assert.equal(p.totalCount, 100);
    assert.equal(p.complete, false);
  }
});

test('selfProfile marks complete only when every scored item is answered', () => {
  assert.equal(selfProfile(allSame(3)).complete, true);
  const partial = allSame(3);
  delete partial['self.openness.curiosity.1'];
  const p = selfProfile(partial);
  assert.equal(p.complete, false);
  assert.equal(p.answeredCount, 99);
});

test('invalid answers are ignored rather than scored', () => {
  const p = selfProfile({ 'self.openness.curiosity.1': 9, 'self.patterns.late_a': 'nonsense' });
  assert.equal(p.answeredCount, 0);
});

test('selfCompletion reports answered, total and percent', () => {
  assert.deepEqual(selfCompletion({}), { answered: 0, total: 100, percent: 0 });
  assert.deepEqual(selfCompletion(allSame(3)), { answered: 100, total: 100, percent: 100 });
});
