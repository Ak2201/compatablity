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

const {
  strongestAndWeakest,
  trendFromSnapshots,
  filterRankItems,
  compareTwo,
  talkFirst,
  shareCard,
} = await import('../public/js/results.js');

const area = (dimension, title, score, items = []) => ({ dimension, title, score, items });

test('strongest and weakest with fewer than 2n areas do not overlap', () => {
  const report = {
    areas: [area('a', 'Values', 90), area('b', 'Money', 40), area('c', 'Lifestyle', 70), area('d', 'Goals', 60)],
  };
  const r = strongestAndWeakest(report, 3);
  assert.deepEqual(r.strongest.map((x) => x.title), ['Values', 'Lifestyle', 'Goals']);
  assert.deepEqual(r.weakest, [{ title: 'Money', score: 40 }]);

  const three = strongestAndWeakest({ areas: [area('a', 'Values', 90), area('b', 'Money', 40), area('c', 'Lifestyle', 70)] }, 3);
  assert.deepEqual(three.strongest.map((x) => x.title), ['Values', 'Lifestyle', 'Money']);
  assert.deepEqual(three.weakest, []);

  const two = strongestAndWeakest({ areas: [area('a', 'Values', 90), area('b', 'Money', 40)] }, 2);
  assert.deepEqual(two.strongest.map((x) => x.title), ['Values', 'Money']);
  assert.deepEqual(two.weakest, []);

  const none = strongestAndWeakest({ areas: [area('a', 'Values', null)] }, 3);
  assert.deepEqual(none, { strongest: [], weakest: [] });
});

test('strongest and weakest with 2n or more areas split cleanly', () => {
  const report = {
    areas: [
      area('a', 'A', 10), area('b', 'B', 20), area('c', 'C', 30),
      area('d', 'D', 40), area('e', 'E', 50), area('f', 'F', 60),
    ],
  };
  const r = strongestAndWeakest(report, 2);
  assert.deepEqual(r.strongest.map((x) => x.title), ['F', 'E']);
  assert.deepEqual(r.weakest.map((x) => x.title), ['A', 'B']);
});

test('trend delta and direction for up, down and steady', () => {
  const snap = (createdAt, overallScore, label) => ({ createdAt, overallScore, label });

  const up = trendFromSnapshots([snap('2026-01-01', 50, 'first'), snap('2026-02-01', null, 'x'), snap('2026-03-01', 70, 'last')]);
  assert.equal(up.delta, 20);
  assert.equal(up.direction, 'up');
  assert.equal(up.points.length, 3);
  assert.equal(up.points[0].label, 'first');
  assert.match(up.text, /went up/);

  const down = trendFromSnapshots([snap('2026-03-01', 40), snap('2026-01-01', 80)]);
  assert.equal(down.delta, -40);
  assert.equal(down.direction, 'down');
  assert.match(down.text, /went down/);

  const steady = trendFromSnapshots([snap('2026-01-01', 60), snap('2026-02-01', 62)]);
  assert.equal(steady.delta, 2);
  assert.equal(steady.direction, 'steady');

  const one = trendFromSnapshots([snap('2026-01-01', 60)]);
  assert.equal(one.delta, null);
  assert.equal(one.direction, null);

  const none = trendFromSnapshots(undefined);
  assert.deepEqual(none.points, []);
  assert.equal(none.direction, null);
});

test('filterRankItems filters by band and keeps rank order', () => {
  const items = [
    { id: 1, rank: 1, band: { key: 'strong' } },
    { id: 2, rank: 2, band: { key: 'far' } },
    { id: 3, rank: 3, band: { key: 'strong' } },
  ];
  const out = filterRankItems(items, { band: 'strong' });
  assert.deepEqual(out.map((i) => i.id), [1, 3]);
  assert.notEqual(out, items);
  assert.equal(items.length, 3);
});

test('filterRankItems recentOnly keeps the recent window in rank order', () => {
  const now = Date.parse('2026-06-01T00:00:00Z');
  const day = 24 * 60 * 60 * 1000;
  const items = [
    { id: 'old', rank: 1, updatedAt: now - 60 * day },
    { id: 'new1', rank: 2, updatedAt: now - 2 * day },
    { id: 'iso', rank: 3, updatedAt: new Date(now - 5 * day).toISOString() },
    { id: 'edge', rank: 4, updatedAt: now - 30 * day },
    { id: 'none', rank: 5 },
  ];
  const out = filterRankItems(items, { recentOnly: true, now });
  assert.deepEqual(out.map((i) => i.id), ['new1', 'iso', 'edge']);

  const shortWindow = filterRankItems(items, { recentOnly: true, sinceMs: 3 * day, now });
  assert.deepEqual(shortWindow.map((i) => i.id), ['new1']);

  assert.deepEqual(filterRankItems(null, { band: 'strong' }), []);
});

test('compareTwo summary names where they differ most and never picks a winner', () => {
  const a = {
    partnerName: 'Sam',
    overall: { score: 82 },
    areas: [area('values', 'Values', 90), area('money', 'Money', 80), area('goals', 'Goals', 70)],
  };
  const b = {
    partnerName: 'Alex',
    overall: { score: 60 },
    areas: [area('values', 'Values', 85), area('money', 'Money', 40), area('goals', 'Goals', 65)],
  };
  const r = compareTwo(a, b);
  assert.deepEqual(r.names, ['Sam', 'Alex']);
  assert.deepEqual(r.scores, [82, 60]);
  assert.deepEqual(r.areas.map((x) => x.title), ['Money', 'Goals', 'Values']);
  assert.equal(r.areas[0].gap, 40);
  assert.match(r.summary, /differ most on money/);
  assert.doesNotMatch(r.summary, /more compatible/i);
  assert.doesNotMatch(r.summary, /winner/i);
});

test('compareTwo with no shared areas gives a plain summary', () => {
  const r = compareTwo({ partnerName: 'A', areas: [] }, { partnerName: 'B', areas: [area('x', 'X', 50)] });
  assert.deepEqual(r.areas, []);
  assert.equal(typeof r.summary, 'string');
  assert.doesNotMatch(r.summary, /winner|more compatible/i);
});

test('talkFirst works with null insights and dedupes', () => {
  const report = {
    topics: ['Money', 'Talk about: Children', 'Money'],
    areas: [area('a', 'Values', 30), area('b', 'Lifestyle', 20), area('c', 'Money', 90)],
  };
  const list = talkFirst(report, null, 10);
  const titles = list.map((x) => x.title);
  assert.equal(new Set(titles.map((t) => t.toLowerCase())).size, titles.length, 'titles must be unique');
  assert.equal(titles.filter((t) => t === 'Money').length, 1);
  assert.deepEqual(list.map((x) => x.title), ['Money', 'Talk about: Children', 'Lifestyle', 'Values']);
  assert.deepEqual(list.map((x) => x.source), ['topic', 'topic', 'area', 'area']);
  assert.ok(list.every((x) => ['fight', 'topic', 'area'].includes(x.source)));
  assert.ok(list.every((x) => typeof x.severity === 'number'));
});

test('talkFirst puts fights first by severity, caps at n, and dedupes against topics', () => {
  const insights = {
    fightForecast: [
      { title: 'Sarcasm spiral', severity: 80, psychology: { why: 'why 1' }, trigger: 't1' },
      { title: 'Children timeline', severity: 90, psychology: { why: 'why 2' }, trigger: 't2' },
      { title: 'Money', severity: 60, trigger: 't3' },
    ],
  };
  const report = { topics: ['Money', 'Other topic'], areas: [area('a', 'Values', 10)] };
  const list = talkFirst(report, insights, 4);
  assert.equal(list.length, 4);
  assert.deepEqual(list.map((x) => x.title), ['Children timeline', 'Sarcasm spiral', 'Money', 'Other topic']);
  assert.equal(list[0].source, 'fight');
  assert.equal(list[0].why, 'why 2');
  assert.equal(list[2].source, 'fight', 'the fight wins the dedupe against the topic');
});

test('shareCard contains no answer text, item text or ids', () => {
  const ANSWER = 'ZEBRA-ANSWER-7731 my private reply';
  const item = {
    id: 'raw-id-9f3e',
    partnerName: 'Sam',
    score: 84.4,
    band: { key: 'strong', label: 'Strongly aligned', blurb: 'blurb' },
    report: {
      areas: [
        {
          dimension: 'values',
          title: 'Values',
          score: 91,
          items: [{ id: 'val.secret', text: ANSWER, mineLabel: ANSWER, theirsLabel: ANSWER, mine: 4, theirs: 4 }],
          flags: [{ level: 'strength', text: ANSWER }],
          prompts: [ANSWER],
        },
        { dimension: 'money', title: 'Money', score: 50, items: [{ text: ANSWER, mineLabel: ANSWER }] },
      ],
      reflections: [{ id: 'refl.1', mine: ANSWER, theirs: ANSWER }],
    },
  };
  const card = shareCard(item);
  assert.equal(card.score, 84);
  assert.equal(card.band, 'Strongly aligned');
  assert.ok(card.lines.some((l) => l.includes('Values')), 'top strength title is used');
  assert.equal(card.safeText.includes('ZEBRA'), false);
  assert.equal(card.safeText.includes('raw-id'), false);
  assert.equal(card.safeText.includes('val.secret'), false);
  assert.ok(card.safeText.includes('Sam'));
  assert.ok(card.safeText.endsWith('A conversation tool, not a verdict.'));
  assert.equal(card.safeText, [...card.lines, 'A conversation tool, not a verdict.'].join('\n'));
});

test('shareCard handles missing score and missing report without throwing', () => {
  const card = shareCard({ partnerName: 'Pat', score: null, band: null });
  assert.equal(card.score, null);
  assert.ok(card.safeText.includes('Pat'));
  assert.ok(card.safeText.endsWith('A conversation tool, not a verdict.'));
  assert.doesNotThrow(() => shareCard(undefined));
});
