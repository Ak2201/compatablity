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

const { computeReport } = await import('../public/js/psychology.js');
const { QUESTIONS, DIMENSIONS } = await import('../public/js/questions.js');

const SIMILARITY = (q) => DIMENSIONS[q.dimension].rule === 'similarity';
const COMPLEMENTARY = (q) => DIMENSIONS[q.dimension].rule === 'complementary';
const NUMERIC = (q) => q.type === 'likert' || q.type === 'scale';

function answers(fn) {
  const out = {};
  for (const q of QUESTIONS) {
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

test('identical answers give a near-100 score and a strong band', () => {
  const same = answers(middle);
  const r = computeReport(same, same);
  assert.ok(r.overall.score >= 95, `score was ${r.overall.score}`);
  assert.equal(r.overall.band.key, 'strong');
  assert.equal(r.overall.band.label, 'Strongly aligned');
});

test('opposite similarity answers give a low score and a far band', () => {
  const mine = answers((q) => {
    if (!SIMILARITY(q)) return undefined;
    if (q.type === 'choice') return q.options[0].value;
    if (NUMERIC(q)) return 1;
    return undefined;
  });
  const theirs = answers((q) => {
    if (!SIMILARITY(q)) return undefined;
    if (q.type === 'choice') return q.options[q.options.length - 1].value;
    if (NUMERIC(q)) return 5;
    return undefined;
  });
  const r = computeReport(mine, theirs);
  assert.ok(r.overall.score <= 10, `score was ${r.overall.score}`);
  assert.equal(r.overall.band.key, 'far');
});

test('complementary differences never reduce the overall score', () => {
  const base = answers(middle);
  const baseScore = computeReport(base, base).overall.score;

  const mine = answers((q) => (COMPLEMENTARY(q) && NUMERIC(q) ? 1 : middle(q)));
  const theirs = answers((q) => (COMPLEMENTARY(q) && NUMERIC(q) ? 5 : middle(q)));
  const r = computeReport(mine, theirs);

  assert.equal(r.overall.score, baseScore);
  const comm = r.areas.find((a) => a.dimension === 'communication');
  assert.ok(comm.items.some((i) => i.status === 'different'), 'expected a "different" item');
  assert.equal(comm.score, null);
});

test('a dealbreaker answered yes by one and no by the other gives talk', () => {
  const mine = { 'deal.children': 'yes', 'deal.faith': 'yes' };
  const theirs = { 'deal.children': 'no', 'deal.faith': 'yes' };
  const r = computeReport(mine, theirs);

  const children = r.dealbreakers.find((d) => d.id === 'deal.children');
  assert.equal(children.status, 'talk');
  assert.equal(children.mineLabel, 'Yes');
  assert.equal(children.theirsLabel, 'No');
  assert.equal(r.dealbreakers.find((d) => d.id === 'deal.faith').status, 'shared');
  assert.ok(r.topics.some((t) => t === `Talk about: ${children.text}`));
});

test('anxious plus avoidant gives the friction pairing', () => {
  const anxious = {
    'att.worry': 5, 'att.reassure': 5, 'att.jealous': 5,
    'att.depend': 1, 'att.distance': 1, 'att.indep': 1,
  };
  const avoidant = {
    'att.worry': 1, 'att.reassure': 1, 'att.jealous': 1,
    'att.depend': 5, 'att.distance': 5, 'att.indep': 5,
  };
  const r = computeReport(anxious, avoidant);
  assert.equal(r.attachment.mine.style, 'anxious');
  assert.equal(r.attachment.theirs.style, 'avoidant');
  assert.equal(r.attachment.pairing.level, 'talk');
  assert.equal(
    r.attachment.pairing.text,
    'A common friction pattern: one of you tends to want closeness and reassurance while the other tends to need space. Name it together, and agree how you will check in.',
  );
});

test('contempt of 4 or more adds a caution flag', () => {
  const r = computeReport({ 'con.contempt': 4 }, { 'con.contempt': 2 });
  assert.ok(
    r.conflict.flags.some((f) => f.level === 'caution' && /Contempt/.test(f.text)),
    JSON.stringify(r.conflict.flags),
  );
  assert.ok(r.topics.some((t) => /Contempt/.test(t)));
});

test('empty and non-object inputs return a valid shape without throwing', () => {
  const inputs = [[{}, {}], [undefined, null], [null, 'x'], [[], 42]];
  for (const [m, t] of inputs) {
    const r = computeReport(m, t);
    assert.equal(r.overall.score, null);
    assert.equal(r.overall.band.key, 'unknown');
    assert.equal(r.areas.length, Object.keys(DIMENSIONS).length - 1);
    assert.deepEqual(r.areas.map((a) => a.dimension), Object.keys(DIMENSIONS).filter((k) => k !== 'reflection'));
    assert.equal(r.attachment.mine.style, 'unknown');
    assert.equal(r.reflections.length, QUESTIONS.filter((q) => q.type === 'text').length);
    assert.equal(r.reflections[0].mine, '');
    assert.deepEqual(r.dealbreakers, []);
    assert.deepEqual(r.strengths, []);
    assert.ok(Array.isArray(r.topics));
  }
});
