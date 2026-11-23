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
  attachmentGuide,
  patternExercise,
  reflectionPrompt,
  personalPatterns,
  diagnosisGuard,
  GLOSSARY,
} = await import('../public/js/psych-depth.js');

const GUIDE_KEYS = ['style', 'title', 'plain', 'feelsLike', 'tryThis', 'watchFor'];

test('each attachment style returns the guide keys', () => {
  for (const style of ['secure', 'anxious', 'avoidant', 'mixed']) {
    const g = attachmentGuide(style);
    assert.deepEqual(Object.keys(g).sort(), [...GUIDE_KEYS].sort(), style);
    assert.equal(g.style, style);
    assert.equal(typeof g.title, 'string');
    assert.equal(typeof g.plain, 'string');
    assert.equal(g.feelsLike.length, 3, `${style} feelsLike`);
    assert.equal(g.tryThis.length, 3, `${style} tryThis`);
    assert.equal(g.watchFor.length, 2, `${style} watchFor`);
  }
});

test('attachment guides return copies, not shared arrays', () => {
  const g = attachmentGuide('secure');
  g.tryThis.push('changed');
  assert.equal(attachmentGuide('secure').tryThis.length, 3);
});

test('unknown attachment style returns a gentle guide and does not throw', () => {
  for (const input of ['unknown', 'nonsense', undefined, null, 42]) {
    const g = attachmentGuide(input);
    assert.deepEqual(Object.keys(g).sort(), [...GUIDE_KEYS].sort());
    assert.equal(g.style, 'unknown');
    assert.match(g.plain, /not have enough answers/);
    assert.deepEqual(g.feelsLike, []);
  }
});

test('patternExercise returns a known construct and falls back for an unknown one', () => {
  const known = patternExercise('Sarcasm spiral');
  assert.equal(known.title, 'Say the feeling plainly');
  assert.ok(known.steps.length >= 3 && known.steps.length <= 4);
  assert.equal(known.timeNeeded, '10 minutes');
  assert.equal(typeof known.why, 'string');

  // A long construct string from insights.js resolves through the short title.
  const long = patternExercise('Anxious-avoidant pursue-withdraw cycle (attachment theory, Levine and Heller framing)');
  assert.equal(long.title, 'Name the loop');

  const unknown = patternExercise('Something we never listed');
  assert.deepEqual(Object.keys(unknown).sort(), ['steps', 'timeNeeded', 'title', 'why']);
  assert.equal(unknown.title, 'Talk it through');
  assert.ok(unknown.steps.length >= 3 && unknown.steps.length <= 4);

  assert.doesNotThrow(() => patternExercise(undefined));
});

test('every listed construct has a 3 to 4 step exercise', () => {
  const constructs = [
    'Pursue-withdraw cycle', 'Sarcasm spiral', 'Criticism and defensiveness loop', 'Freeze-out',
    'Unrepaired hurt', 'Different cool-down clocks', 'Who decides', 'Final say', 'Saver and spender',
    'Whose money is whose', 'Debt comfort gap', 'Different body clocks', 'Mess tolerance',
    'Planning versus spontaneity', 'Alone time needs', 'Social calendar', 'Bids missed', 'Touch gap',
    'Big-topic disagreement', 'Different priorities for five years', 'Family closeness',
    'Children timeline', 'Where to live', 'When to raise it', 'Non-negotiable mismatch',
    'Secrets and loyalty', 'Cancelled plans', 'Different ideas of support', 'Different ideas of fun',
  ];
  for (const c of constructs) {
    const e = patternExercise(c);
    assert.ok(e.steps.length >= 3 && e.steps.length <= 4, `${c} has ${e.steps.length} steps`);
    assert.match(e.timeNeeded, /^\d+ minutes$/, c);
  }
});

test('reflectionPrompt includes the topFight when given', () => {
  const r = reflectionPrompt({ kind: 'couple', topFight: 'Who decides', strongestArea: 'Humour' });
  assert.match(r.question, /Who decides/);
  assert.equal(typeof r.why, 'string');

  const f = reflectionPrompt({ kind: 'friendship', topFight: 'Cancelled plans', strongestArea: null });
  assert.match(f.question, /Cancelled plans/);
});

test('reflectionPrompt uses strongestArea and still works with no context', () => {
  assert.match(reflectionPrompt({ kind: 'couple', topFight: null, strongestArea: 'Honesty' }).question, /honesty/);
  const bare = reflectionPrompt(undefined);
  assert.ok(bare.question.endsWith('?'));
  assert.doesNotThrow(() => reflectionPrompt({ kind: 'friendship' }));
});

test('personalPatterns returns [] for one connection', () => {
  const one = [{ partnerName: 'A', kind: 'couple', fights: ['Sarcasm spiral'], strongestAreas: ['Humour'] }];
  assert.deepEqual(personalPatterns(one), []);
  assert.deepEqual(personalPatterns([]), []);
  assert.deepEqual(personalPatterns(null), []);
});

test('personalPatterns returns a pattern when a construct repeats across two connections', () => {
  const history = [
    { partnerName: 'Sam', kind: 'couple', fights: ['Sarcasm spiral', 'Who decides'], strongestAreas: [] },
    { partnerName: 'Jo', kind: 'couple', fights: ['Sarcasm spiral'], strongestAreas: ['Humour'] },
  ];
  const out = personalPatterns(history);
  assert.equal(out.length, 1);
  assert.equal(out[0].evidence, 2);
  assert.equal(
    out[0].text,
    'In more than one connection, sarcasm spiral came up. That may be worth looking at in yourself.',
  );
  assert.equal(typeof out[0].title, 'string');
});

test('personalPatterns counts a repeated person once and caps results at four', () => {
  const same = [
    { partnerName: 'Sam', kind: 'couple', fights: ['Final say'] },
    { partnerName: 'Sam', kind: 'couple', fights: ['Final say'] },
  ];
  assert.deepEqual(personalPatterns(same), []);

  const many = ['a', 'b', 'c', 'd', 'e'].map((x) => ({ partnerName: x, kind: 'friendship', fights: ['1', '2', '3', '4', '5'].map((n) => `item ${n}`) }));
  const out = personalPatterns(many);
  assert.equal(out.length, 4);
  assert.ok(out.every((p) => p.evidence === 5));
});

test('diagnosisGuard appends the caution for a flagged word and leaves other text unchanged', () => {
  const flagged = diagnosisGuard('This sounds like a personality disorder.');
  assert.ok(flagged.startsWith('This sounds like a personality disorder.'));
  assert.ok(flagged.length > 'This sounds like a personality disorder.'.length);
  assert.match(flagged, /not a clinical diagnosis/);

  assert.equal(diagnosisGuard('Try a short check-in each week.'), 'Try a short check-in each week.');
  assert.equal(diagnosisGuard(''), '');
  assert.equal(diagnosisGuard(null), '');

  // Applying the guard twice does not stack the caution.
  const twice = diagnosisGuard(flagged);
  assert.equal(twice, flagged);
});

test('GLOSSARY has a one-sentence explanation for each term', () => {
  const terms = [
    'attachment style', 'pursue-withdraw', 'bids', 'repair', 'flooding', 'chronotype',
    'moral foundations', 'need for closure', 'money scripts',
  ];
  assert.deepEqual(Object.keys(GLOSSARY).sort(), [...terms].sort());
  for (const t of terms) {
    assert.equal(typeof GLOSSARY[t], 'string');
    assert.equal(GLOSSARY[t].split(/[.!?](\s|$)/).filter((s) => s.trim()).length, 1, t);
  }
});
