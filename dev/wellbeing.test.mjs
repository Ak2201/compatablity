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

const { WELLBEING_QUESTIONS, SUPPORT_NOTE, validateWellbeingQuestions } = await import('../public/js/wellbeing-questions.js');
const { wellbeingSummary, wellbeingPrivacyNote } = await import('../public/js/wellbeing-profile.js');

const REVERSED_DIMS = new Set(['anxiety', 'stress_load']);
const SCORED = WELLBEING_QUESTIONS.filter((q) => q.type !== 'choice');

// Builds answers for every scored item. `valueFor(q)` returns the 1-5 answer.
function scoredAnswers(valueFor, safety = 'no') {
  const out = {};
  for (const q of SCORED) out[q.id] = valueFor(q);
  out['wb.safety.thoughts'] = safety;
  return out;
}

// A well-being-high set: positive items at 5, worry and load items at 1 (low).
const HIGH = (q) => (REVERSED_DIMS.has(q.dimension) ? 1 : 5);
// A well-being-low set: positive items at 1, worry and load items at 5 (high).
const LOW = (q) => (REVERSED_DIMS.has(q.dimension) ? 5 : 1);

test('validateWellbeingQuestions passes on the shipped bank', () => {
  assert.equal(validateWellbeingQuestions(), WELLBEING_QUESTIONS.length);
  assert.equal(WELLBEING_QUESTIONS.length, 20);
  const safety = WELLBEING_QUESTIONS.filter((q) => q.dimension === 'safety');
  assert.equal(safety.length, 1);
  assert.equal(safety[0].id, 'wb.safety.thoughts');
  assert.equal(safety[0].flags.safety, true);
});

test('a high wellbeing set gives steady', () => {
  const r = wellbeingSummary(scoredAnswers(HIGH));
  assert.equal(r.level, 'steady');
  assert.equal(r.headline, 'You seem steady right now');
  assert.equal(r.completion.complete, true);
  assert.equal(r.flags.safety, 'none');
  assert.ok(r.areas.every((a) => a.level === 'steady'));
});

test('a low wellbeing set gives strained, with anxiety and load reversed', () => {
  const r = wellbeingSummary(scoredAnswers(LOW));
  assert.equal(r.level, 'strained');
  assert.equal(r.headline, 'It sounds like a heavy time');
  assert.ok(r.support.length >= 1 && r.support.length <= 3);
});

test('high anxiety lowers the score compared with low anxiety', () => {
  const base = (q) => (q.dimension === 'anxiety' || q.dimension === 'stress_load' ? 1 : 4);
  const calm = wellbeingSummary(scoredAnswers((q) => (q.dimension === 'anxiety' ? 1 : base(q))));
  const worried = wellbeingSummary(scoredAnswers((q) => (q.dimension === 'anxiety' ? 5 : base(q))));
  const areaLevel = (r, title) => r.areas.find((a) => a.title === title).level;
  assert.equal(areaLevel(calm, 'Worry and tension'), 'steady');
  assert.equal(areaLevel(worried, 'Worry and tension'), 'strained');
});

test('wb.safety frequent sets the safety flag and the text starts with SUPPORT_NOTE', () => {
  const r = wellbeingSummary(scoredAnswers(HIGH, 'frequent'));
  assert.equal(r.flags.safety, 'frequent');
  assert.ok(r.text.startsWith(SUPPORT_NOTE), r.text);
  assert.equal(r.level, 'steady', 'the safety answer does not change the level');

  const sparse = wellbeingSummary({ 'wb.safety.thoughts': 'frequent' });
  assert.equal(sparse.flags.safety, 'frequent');
  assert.ok(sparse.text.startsWith(SUPPORT_NOTE));
});

test('wb.safety passing sets the passing flag, and no sets none', () => {
  assert.equal(wellbeingSummary(scoredAnswers(HIGH, 'passing')).flags.safety, 'passing');
  assert.equal(wellbeingSummary(scoredAnswers(HIGH, 'no')).flags.safety, 'none');
});

test('empty answers return the full shape with level null', () => {
  const inputs = [{}, undefined, null, 'x', []];
  for (const input of inputs) {
    const r = wellbeingSummary(input);
    assert.equal(r.level, null);
    assert.equal(typeof r.headline, 'string');
    assert.equal(typeof r.text, 'string');
    assert.deepEqual(r.areas, []);
    assert.deepEqual(r.support, []);
    assert.deepEqual(r.flags, { safety: null });
    assert.deepEqual(r.completion, { answered: 0, total: WELLBEING_QUESTIONS.length, complete: false });
  }
});

test('fewer than half answered gives level null', () => {
  const half = Math.floor(WELLBEING_QUESTIONS.length / 2) - 1;
  const partial = {};
  for (const q of SCORED.slice(0, half)) partial[q.id] = 5;
  const r = wellbeingSummary(partial);
  assert.equal(r.level, null);
  assert.equal(r.completion.answered, half);
});

test('text never uses diagnostic words', () => {
  const sets = [
    wellbeingSummary(scoredAnswers(HIGH)),
    wellbeingSummary(scoredAnswers(LOW)),
    wellbeingSummary(scoredAnswers(LOW, 'frequent')),
    wellbeingSummary({}),
  ];
  const banned = /diagnos|disorder|depression/i;
  for (const r of sets) {
    assert.ok(!banned.test(r.headline), r.headline);
    assert.ok(!banned.test(r.text), r.text);
    for (const s of r.support) assert.ok(!banned.test(s), s);
  }
  assert.equal(wellbeingPrivacyNote, 'Only you can see this. It is never shared with connections or included in any comparison.');
});
