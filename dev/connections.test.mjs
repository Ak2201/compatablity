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

// rankings.js is pure (no Supabase). connections.js is not imported here because it creates the Supabase client.
const { computePair, buildRankings, pendingList, isCoupleApplicable } = await import('../public/js/rankings.js');
const { QUESTIONS } = await import('../public/js/questions.js');
const { FRIEND_QUESTIONS } = await import('../public/js/friend-questions.js');

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

function answers(bank) {
  const out = {};
  for (const q of bank) {
    const v = middle(q);
    if (v !== undefined) out[q.id] = v;
  }
  return out;
}

const fullProfile = () => ({ couple: answers(QUESTIONS), friendship: answers(FRIEND_QUESTIONS) });
const emptyProfile = () => ({ couple: null, friendship: null });

// Pair result stubs for buildRankings. Only the fields buildRankings reads are set.
const coupleOk = (score, name = 'x') => ({ applicable: true, score, band: { key: 'good', label: 'Good', blurb: '' }, report: null, name });
const friendOk = (score) => ({ score, band: { key: 'good', label: 'Good', blurb: '' }, report: null });
const entry = (id, partnerName, couple, friendship, partnerGender = 'female') => ({
  id,
  partnerName,
  partnerGender,
  myGender: 'male',
  pair: { couple, friendship, labelCouple: null, labelFriendship: null },
});

test('couple applicability: different genders apply, same genders do not, unknown does not', () => {
  assert.equal(isCoupleApplicable('male', 'female'), true);
  assert.equal(isCoupleApplicable('Male', 'female'), true);
  assert.equal(isCoupleApplicable('female', 'female'), false);
  assert.equal(isCoupleApplicable('male', ''), false);
  assert.equal(isCoupleApplicable(null, 'female'), false);

  const full = fullProfile();
  const same = computePair(full, full, { myGender: 'female', partnerGender: 'female' });
  assert.equal(same.couple.applicable, false);
  assert.equal(same.couple.score, null);
  assert.equal(same.couple.report, null);

  const diff = computePair(full, full, { myGender: 'male', partnerGender: 'female' });
  assert.equal(diff.couple.applicable, true);
  assert.equal(typeof diff.couple.score, 'number');
  assert.equal(diff.labelCouple, diff.couple.band.label);
});

test('computePair: a missing bank on either side gives a null score for that bank', () => {
  const full = fullProfile();
  const noCouplePartner = computePair(full, { couple: null, friendship: full.friendship }, { myGender: 'male', partnerGender: 'female' });
  assert.equal(noCouplePartner.couple.applicable, true);
  assert.equal(noCouplePartner.couple.score, null);
  assert.equal(noCouplePartner.labelCouple, null);
  assert.equal(typeof noCouplePartner.friendship.score, 'number');

  const noFriendMine = computePair({ couple: full.couple, friendship: null }, full, { myGender: 'male', partnerGender: 'female' });
  assert.equal(noFriendMine.friendship.score, null);
  assert.equal(noFriendMine.labelFriendship, null);
  assert.equal(typeof noFriendMine.couple.score, 'number');
});

test('computePair never throws on missing or odd input', () => {
  for (const [m, p, o] of [
    [undefined, undefined, undefined],
    [null, null, null],
    [emptyProfile(), emptyProfile(), {}],
    ['x', 42, 'y'],
  ]) {
    const r = computePair(m, p, o);
    assert.equal(r.couple.score, null);
    assert.equal(r.friendship.score, null);
    assert.equal(r.labelCouple, null);
    assert.equal(r.labelFriendship, null);
  }
});

test('buildRankings orders by score desc, then partner name, with 1-based ranks', () => {
  const entries = [
    entry('c1', 'Zed', coupleOk(70), friendOk(60)),
    entry('c2', 'Amy', coupleOk(90), friendOk(60)),
    entry('c3', 'Bob', coupleOk(70), friendOk(80)),
    entry('c4', 'Cy', coupleOk(50), friendOk(90)),
  ];
  const { couple, friendship } = buildRankings(entries);

  assert.deepEqual(couple.map((r) => r.partnerName), ['Amy', 'Bob', 'Zed', 'Cy']);
  assert.deepEqual(couple.map((r) => r.rank), [1, 2, 3, 4]);
  assert.deepEqual(couple.map((r) => r.score), [90, 70, 70, 50]);
  assert.ok(couple.every((r) => r.kind === 'couple'));

  assert.deepEqual(friendship.map((r) => r.partnerName), ['Cy', 'Bob', 'Amy', 'Zed']);
  assert.deepEqual(friendship.map((r) => r.rank), [1, 2, 3, 4]);
  assert.ok(friendship.every((r) => r.kind === 'friendship'));
});

test('buildRankings ranked items have exactly the contract fields', () => {
  const { couple } = buildRankings([entry('c1', 'Amy', coupleOk(88), friendOk(10), 'female')]);
  assert.deepEqual(Object.keys(couple[0]).sort(), ['band', 'id', 'kind', 'partnerGender', 'partnerName', 'rank', 'score'].sort());
  assert.equal(couple[0].id, 'c1');
  assert.equal(couple[0].partnerGender, 'female');
  assert.equal(couple[0].band.key, 'good');
});

test('buildRankings: same score and same name keep a stable order by id', () => {
  const entries = [
    entry('b', 'Sam', coupleOk(75), friendOk(75)),
    entry('a', 'Sam', coupleOk(75), friendOk(75)),
  ];
  const { couple, friendship } = buildRankings(entries);
  assert.deepEqual(couple.map((r) => r.id), ['a', 'b']);
  assert.deepEqual(friendship.map((r) => r.id), ['a', 'b']);
  assert.deepEqual(couple.map((r) => r.rank), [1, 2]);
});

test('buildRankings: couple list skips non-applicable pairs and null scores, friendship skips null scores', () => {
  const entries = [
    entry('notApplicable', 'Ann', { applicable: false, score: 95, band: null, report: null }, friendOk(95)),
    entry('nullCouple', 'Ben', { applicable: true, score: null, band: null, report: null }, friendOk(null)),
    entry('noFriend', 'Cal', coupleOk(60), { score: null, band: null, report: null }),
    entry('both', 'Dee', coupleOk(65), friendOk(40)),
  ];
  const { couple, friendship } = buildRankings(entries);
  assert.deepEqual(couple.map((r) => r.id), ['both', 'noFriend']);
  assert.deepEqual(friendship.map((r) => r.id), ['notApplicable', 'both']);
});

test('buildRankings: empty, missing and odd input gives empty lists', () => {
  assert.deepEqual(buildRankings([]), { couple: [], friendship: [] });
  assert.deepEqual(buildRankings(undefined), { couple: [], friendship: [] });
  assert.deepEqual(buildRankings([null, 'x', { id: 'z' }]), { couple: [], friendship: [] });
});

test('pendingList keeps only connections missing a share or not accepted', () => {
  const rows = [
    { id: '1', myShare: true, partnerShare: true, accepted: true },
    { id: '2', myShare: false, partnerShare: true, accepted: true },
    { id: '3', myShare: true, partnerShare: false, accepted: true },
    { id: '4', myShare: true, partnerShare: true, accepted: false },
    { id: '5', myShare: false, partnerShare: false, accepted: false },
  ];
  assert.deepEqual(pendingList(rows).map((r) => r.id), ['2', '3', '4', '5']);
  assert.deepEqual(pendingList([]), []);
  assert.deepEqual(pendingList(null), []);
});

test('pendingList and buildRankings together: a not-shared pair never reaches the rankings', () => {
  const rows = [
    { id: 'ok', myShare: true, partnerShare: true, accepted: true },
    { id: 'hidden', myShare: true, partnerShare: false, accepted: true },
  ];
  const ranked = buildRankings(rows.filter((r) => !pendingList([r]).length).map((r) => entry(r.id, 'P', coupleOk(70), friendOk(70))));
  assert.deepEqual(ranked.couple.map((r) => r.id), ['ok']);
  assert.deepEqual(pendingList(rows).map((r) => r.id), ['hidden']);
});
