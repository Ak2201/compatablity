// Wellbeing check-in question bank: DRAFT for psychologist review. Not final.
//
// A private check-in about you, covering the last two weeks. Not a diagnostic tool and not
// shared with anyone. 19 scored items plus one safety item. Item fields match self-questions.js:
//   id         'wb.' + dimension + '.' + number (stable, never reused)
//   dimension  key into WELLBEING_DIMENSIONS
//   type       'likert'  1-5 agree scale
//              'scale'   1-5 with low/high endpoint labels
//              'choice'  pick one of `options` (safety item only)
//   options    for 'choice': [{ value, label }]
//   flags      optional. { safety: true } marks the safety item.
//   source     'draft' (for the reviewer)
//
// Reverse-scored items (anxiety and stress_load) are listed in REVERSED in wellbeing-profile.js,
// not marked here. For those, a higher answer means more worry or more load.

export const WELLBEING_DIMENSIONS = {
  mood: {
    title: 'Mood',
    area: 'How you have felt',
    rule: 'scored',
    blurb: 'How your days have felt over the last two weeks.',
  },
  anxiety: {
    title: 'Worry and tension',
    area: 'Worry and tension',
    rule: 'scored',
    blurb: 'How often worry or tension has been part of your days.',
  },
  sleep: {
    title: 'Sleep and rest',
    area: 'Sleep quality and rest',
    rule: 'scored',
    blurb: 'How well you have been sleeping and whether you wake up rested.',
  },
  energy: {
    title: 'Energy',
    area: 'Energy and motivation',
    rule: 'scored',
    blurb: 'How much energy and motivation you have had for your days.',
  },
  stress_load: {
    title: 'Load',
    area: 'How much is on your plate',
    rule: 'scored',
    blurb: 'How much you have been carrying, and how heavy it has felt.',
  },
  support: {
    title: 'Support',
    area: 'Who you can lean on',
    rule: 'scored',
    blurb: 'Whether you have had people to turn to and feel understood by.',
  },
  coping: {
    title: 'Coping',
    area: 'How you handle hard days',
    rule: 'scored',
    blurb: 'The ways you get through difficult moments and take breaks when you need them.',
  },
  safety: {
    title: 'Safety check',
    area: 'Thoughts about your safety',
    rule: 'safety',
    blurb: 'One question about how you have been feeling about your own safety.',
  },
};

// The safety note shown whenever the safety answer calls for it. Keep wording stable.
export const SUPPORT_NOTE =
  'If you are thinking about harming yourself or ending your life, please contact your local emergency number now, or a crisis helpline where you live. You do not have to handle this alone, and talking to someone you trust can help.';

const SCALE_FREQ = { low: 'Rarely', high: 'Most days' };
const SCALE_DEGREE = { low: 'Not at all', high: 'Very much' };

const L = (dimension, n, text) => ({
  id: `wb.${dimension}.${n}`,
  dimension,
  type: 'likert',
  text,
  source: 'draft',
});

const S = (dimension, n, text, labels) => ({
  id: `wb.${dimension}.${n}`,
  dimension,
  type: 'scale',
  text,
  low: labels.low,
  high: labels.high,
  source: 'draft',
});

const MOOD = [
  L('mood', 1, 'I have felt hopeful about the next few weeks.'),
  S('mood', 2, 'I have enjoyed the small things in my day.', SCALE_DEGREE),
  S('mood', 3, 'I have felt like myself for most of the day.', SCALE_DEGREE),
];

const ANXIETY = [
  S('anxiety', 1, 'I have found myself worrying about many things.', SCALE_FREQ),
  S('anxiety', 2, 'I have felt tense or on edge.', SCALE_FREQ),
  S('anxiety', 3, 'My thoughts have been racing or hard to switch off.', SCALE_FREQ),
];

const SLEEP = [
  L('sleep', 1, 'I have slept well on most nights.'),
  L('sleep', 2, 'I have woken up feeling rested.'),
];

const ENERGY = [
  S('energy', 1, 'I have had enough energy for the things I need to do.', SCALE_DEGREE),
  L('energy', 2, 'I have felt motivated to start things.'),
  S('energy', 3, 'I have still had some energy left by the evening.', SCALE_DEGREE),
];

const STRESS_LOAD = [
  S('stress_load', 1, 'I have felt there is more on my plate than I can manage.', SCALE_FREQ),
  S('stress_load', 2, 'I have felt pressure from deadlines or other people’s demands.', SCALE_FREQ),
  S('stress_load', 3, 'Everyday tasks have felt overwhelming.', SCALE_FREQ),
];

const SUPPORT = [
  L('support', 1, 'I have had someone I could lean on.'),
  L('support', 2, 'I have felt able to reach out to people when I needed to.'),
  L('support', 3, 'I have felt understood by the people close to me.'),
];

const COPING = [
  L('coping', 1, 'On hard days, I have had ways to get through them.'),
  S('coping', 2, 'I have been able to take a break or pause when I needed one.', SCALE_DEGREE),
];

const SAFETY = [
  {
    id: 'wb.safety.thoughts',
    dimension: 'safety',
    type: 'choice',
    text: 'Over the last two weeks, have you had thoughts about harming yourself or not wanting to be alive?',
    options: [
      { value: 'no', label: 'No, not at all' },
      { value: 'passing', label: 'Sometimes I wish I were not here, but not with a plan' },
      { value: 'frequent', label: 'I have had thoughts of harming myself or ending my life' },
    ],
    flags: { safety: true },
    source: 'draft',
  },
];

export const WELLBEING_QUESTIONS = [
  ...MOOD,
  ...ANXIETY,
  ...SLEEP,
  ...ENERGY,
  ...STRESS_LOAD,
  ...SUPPORT,
  ...COPING,
  ...SAFETY,
];

// Sanity checks: unique 'wb.' ids, known dimensions, valid shapes, at least 2 scored items in
// each scored dimension, and exactly one safety item. Throws on the first problem.
export function validateWellbeingQuestions(list = WELLBEING_QUESTIONS) {
  if (!Array.isArray(list)) throw new Error('wellbeing questions must be an array');
  if (list.length < 15 || list.length > 25) throw new Error(`expected about 20 items, found ${list.length}`);
  const seen = new Set();
  const types = new Set(['likert', 'scale', 'choice']);
  const perDim = {};
  let safetyCount = 0;
  for (const q of list) {
    if (!q || typeof q.id !== 'string' || !q.id.startsWith('wb.')) throw new Error(`bad id: ${q && q.id}`);
    if (seen.has(q.id)) throw new Error(`duplicate question id: ${q.id}`);
    seen.add(q.id);
    if (!WELLBEING_DIMENSIONS[q.dimension]) throw new Error(`unknown dimension for ${q.id}`);
    if (!types.has(q.type)) throw new Error(`unknown type for ${q.id}`);
    if (typeof q.text !== 'string' || !q.text.trim()) throw new Error(`missing text: ${q.id}`);
    if (q.source !== 'draft') throw new Error(`source must be draft: ${q.id}`);
    if (q.type === 'scale' && (!q.low || !q.high)) throw new Error(`scale needs low/high: ${q.id}`);
    if (q.type === 'choice') {
      if (!Array.isArray(q.options) || q.options.length < 2) throw new Error(`choice needs options: ${q.id}`);
    } else if (q.type !== 'likert' && q.type !== 'scale') {
      throw new Error(`choice only allowed for safety: ${q.id}`);
    }
    const isSafety = q.dimension === 'safety';
    if (q.flags && q.flags.safety && !isSafety) throw new Error(`safety flag outside safety dimension: ${q.id}`);
    if (isSafety) {
      if (q.type !== 'choice' || !(q.flags && q.flags.safety)) throw new Error(`safety item must be a flagged choice: ${q.id}`);
      safetyCount += 1;
    } else {
      perDim[q.dimension] = (perDim[q.dimension] || 0) + 1;
    }
  }
  if (safetyCount !== 1) throw new Error(`expected exactly one safety item, found ${safetyCount}`);
  for (const dim of Object.keys(WELLBEING_DIMENSIONS)) {
    if (dim === 'safety') continue;
    const n = perDim[dim] || 0;
    if (n < 2) throw new Error(`dimension ${dim} has ${n} items, needs at least 2`);
  }
  return list.length;
}
