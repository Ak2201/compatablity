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

const { FRIEND_QUESTIONS, FRIEND_DIMENSIONS, validateFriendQuestions } = await import('../public/js/friend-questions.js');
const { computeFriendshipReport } = await import('../public/js/friend-psychology.js');

const NUMERIC = (q) => q.type === 'likert' || q.type === 'scale';

function answers(fn) {
  const out = {};
  for (const q of FRIEND_QUESTIONS) {
    const v = fn(q);
    if (v !== undefined) out[q.id] = v;
  }
  return out;
}

// Every question answered with a middle-of-the-road value.
const middle = (q) => {
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
};

const isThinking = (q) => q.dimension === 'thinking';
const isTrustOrSupport = (q) => q.dimension === 'trust' || q.dimension === 'support';
const isSharpMoment = (q) => ['fr.conflict.criticism', 'fr.conflict.sarcasm', 'fr.conflict.defensive', 'fr.conflict.withdraw'].includes(q.id);

test('friend question bank validates and has the expected shape', () => {
  const count = validateFriendQuestions();
  assert.equal(count, FRIEND_QUESTIONS.length);
  assert.ok(count >= 70 && count <= 80, `count was ${count}`);
  const texts = FRIEND_QUESTIONS.filter((q) => q.type === 'text');
  assert.equal(texts.length, 6);
  assert.ok(texts.every((q) => q.dimension === 'reflection'));
  assert.equal(Object.keys(FRIEND_DIMENSIONS).length, 10);
  assert.ok(FRIEND_QUESTIONS.every((q) => q.source === 'draft' && q.id.startsWith('fr.')));
});

test('identical answers give a high thinking alignment', () => {
  const same = answers(middle);
  const r = computeFriendshipReport(same, same);
  assert.ok(r.deep.thinking.alignment.score >= 95, `score was ${r.deep.thinking.alignment.score}`);
  assert.equal(r.overall.band.key, 'strong');
});

test('opposite thinking gives a lower alignment with tendency-level text', () => {
  const mine = answers((q) => (isThinking(q) && NUMERIC(q) ? 1 : undefined));
  const theirs = answers((q) => (isThinking(q) && NUMERIC(q) ? 5 : undefined));
  const r = computeFriendshipReport(mine, theirs, { myName: 'Sam', partnerName: 'Priya' });
  const th = r.deep.thinking;
  assert.ok(th.alignment.score < 50, `score was ${th.alignment.score}`);
  assert.ok(th.alignment.score >= 0 && th.alignment.score <= 100);
  assert.match(th.alignment.text, /tends?/);
  assert.match(th.alignment.text, /tendencies, not fixed traits/);
  assert.equal(th.mine.closure, 1);
  assert.equal(th.theirs.closure, 5);
});

test('sharp moments both high produce a caution signal', () => {
  const sharp = answers((q) => (isSharpMoment(q) ? 5 : undefined));
  const r = computeFriendshipReport(sharp, sharp);
  assert.ok(
    r.deep.comfort.signals.some((s) => s.level === 'caution'),
    JSON.stringify(r.deep.comfort.signals),
  );
  assert.ok(r.conflict.flags.some((f) => f.level === 'caution'));
});

test('comfort score is present when trust and support are answered', () => {
  const ans = answers((q) => (isTrustOrSupport(q) ? middle(q) : undefined));
  const r = computeFriendshipReport(ans, ans);
  assert.equal(typeof r.deep.comfort.score, 'number');
  assert.ok(r.deep.comfort.score >= 0 && r.deep.comfort.score <= 100);
  assert.equal(typeof r.deep.comfort.label, 'string');
  assert.ok(Array.isArray(r.deep.comfort.signals));
});

test('comfort score is null without trust and support answers', () => {
  const r = computeFriendshipReport({}, {});
  assert.equal(r.deep.comfort.score, null);
});

test('empty and non-object inputs return a valid shape without throwing', () => {
  const inputs = [[{}, {}], [undefined, null], [null, 'x'], [[], 42]];
  for (const [m, t] of inputs) {
    const r = computeFriendshipReport(m, t);
    assert.equal(r.overall.score, null);
    assert.equal(r.overall.band.key, 'unknown');
    assert.deepEqual(r.areas.map((a) => a.dimension), Object.keys(FRIEND_DIMENSIONS).filter((k) => k !== 'reflection'));
    assert.ok(r.areas.every((a) => a.score === null));
    assert.equal(r.attachment.mine.style, 'unknown');
    assert.equal(r.reflections.length, 6);
    assert.equal(r.reflections[0].mine, '');
    assert.deepEqual(r.dealbreakers, []);
    assert.deepEqual(r.strengths, []);
    assert.ok(Array.isArray(r.topics));
    assert.equal(r.deep.thinking.alignment.score, null);
    assert.equal(r.deep.comfort.score, null);
    assert.equal(r.deep.values.alignment.score, null);
    assert.ok(Array.isArray(r.deep.values.sharedCore));
    assert.ok(Array.isArray(r.deep.values.differences));
  }
});

test('narrative has 4 to 7 non-empty strings', () => {
  const cases = [
    [answers(middle), answers(middle)],
    [{}, {}],
    [answers((q) => (isThinking(q) && NUMERIC(q) ? 1 : undefined)), answers((q) => (isThinking(q) && NUMERIC(q) ? 5 : undefined))],
  ];
  for (const [m, t] of cases) {
    const { narrative } = computeFriendshipReport(m, t).deep;
    assert.ok(narrative.length >= 4 && narrative.length <= 7, `length was ${narrative.length}`);
    for (const p of narrative) {
      assert.equal(typeof p, 'string');
      assert.ok(p.trim().length > 0, 'empty paragraph');
    }
  }
});

test('narrative uses the supplied names and avoids diagnostic labels', () => {
  const mine = answers((q) => (isThinking(q) && NUMERIC(q) ? 1 : undefined));
  const theirs = answers((q) => (isThinking(q) && NUMERIC(q) ? 5 : undefined));
  const { narrative } = computeFriendshipReport(mine, theirs, { myName: 'Sam', partnerName: 'Priya' }).deep;
  const joined = narrative.join(' ');
  assert.match(joined, /Sam/);
  assert.match(joined, /Priya/);
  assert.doesNotMatch(joined, /anxious|avoidant|disorder|narciss|bad fit/i);
});
