// Wellbeing summary: plain-language reading of the last two weeks, a few gentle suggestions and
// a safety flag. DRAFT for psychologist review. Not a diagnosis.
//
// Pure functions only: no DOM, no network, no storage. Missing or malformed input never
// throws; it returns the same shape with null levels and empty lists.
//
// Scoring: each scored answer is 1-5, where higher means more of what the item describes.
// Anxiety and stress_load items are reversed (6 minus the answer) so that lower worry and lower
// load count towards wellbeing. A mean of 3.8 or more reads as 'steady', 2.8 or more as
// 'stretched', and anything lower as 'strained'. Overall level is null when fewer than half of
// all items are answered.
//
// The safety item is read separately and never changes the level. A 'frequent' answer puts
// SUPPORT_NOTE at the start of the text.

import { WELLBEING_QUESTIONS, WELLBEING_DIMENSIONS, SUPPORT_NOTE } from './wellbeing-questions.js';

const SAFETY_ID = 'wb.safety.thoughts';
const STEADY_MIN = 3.8;
const STRETCHED_MIN = 2.8;
const MAX_SUPPORT = 3;

export const wellbeingPrivacyNote =
  'Only you can see this. It is never shared with connections or included in any comparison.';

// Reverse-scored items. Agreeing with these means LESS wellbeing. Keep in step with
// wellbeing-questions.js.
export const REVERSED = new Set(
  WELLBEING_QUESTIONS.filter((q) => q.dimension === 'anxiety' || q.dimension === 'stress_load').map((q) => q.id),
);

const AREA_KEYS = Object.keys(WELLBEING_DIMENSIONS).filter((k) => WELLBEING_DIMENSIONS[k].rule === 'scored');

const HEADLINES = {
  steady: {
    headline: 'You seem steady right now',
    text: 'Across the last two weeks, your answers suggest things have mostly felt manageable. Keep doing what is working for you.',
  },
  stretched: {
    headline: 'You are carrying a fair amount',
    text: 'Some parts of the last two weeks seem heavier than others. Noticing that is useful, and small changes can make a difference.',
  },
  strained: {
    headline: 'It sounds like a heavy time',
    text: 'Your answers suggest the last two weeks have been hard going. You do not have to fix everything at once, and leaning on people you trust can help.',
  },
};

const NOT_ENOUGH = {
  headline: 'Not enough answers yet',
  text: 'Answer a few more questions to see a picture of the last two weeks.',
};

// One gentle, concrete suggestion per scored area. Never clinical advice.
const SUGGESTIONS = {
  mood: 'Plan one small thing each day that you usually enjoy, even for ten minutes.',
  anxiety: 'Write a worry down, then note the one small step you could take about it.',
  sleep: 'Try a simple wind-down routine: a regular bedtime, and screens put away 20 minutes before sleep.',
  energy: 'Protect one block of time for rest, and keep the next day’s plan light.',
  stress_load: 'Pick one thing on your list to drop, delay or hand to someone this week.',
  support: 'Reach out to one trusted person this week, even with a short message.',
  coping: 'Think of one thing that has helped on a hard day before, and plan to use it again.',
};

const KEEP_GOING = 'Keep up the routines that are working for you.';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// Returns the stored answer (integer 1-5 for scored items, option value for choice) or null.
function validAnswer(q, raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw !== 'number' && typeof raw !== 'string') return null;
  if (q.type === 'likert' || q.type === 'scale') {
    const n = Number(raw);
    return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
  }
  if (q.type === 'choice') {
    const hit = (q.options || []).find((o) => String(o.value) === String(raw));
    return hit ? hit.value : null;
  }
  return null;
}

function validMap(answers) {
  const src = isObj(answers) ? answers : {};
  const out = {};
  for (const q of WELLBEING_QUESTIONS) {
    const v = validAnswer(q, src[q.id]);
    if (v !== null) out[q.id] = v;
  }
  return out;
}

// Score for one 1-5 item after reversal. Returns null for choice items or unanswered items.
function scoredValue(q, valid) {
  const v = valid[q.id];
  if (typeof v !== 'number') return null;
  return REVERSED.has(q.id) ? 6 - v : v;
}

function meanOf(values) {
  if (values.length === 0) return null;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function levelOf(mean) {
  if (mean === null) return null;
  if (mean >= STEADY_MIN) return 'steady';
  if (mean >= STRETCHED_MIN) return 'stretched';
  return 'strained';
}

function safetyFlag(valid) {
  const v = valid[SAFETY_ID];
  if (v === 'frequent') return 'frequent';
  if (v === 'passing') return 'passing';
  if (v === 'no') return 'none';
  return null;
}

/**
 * @param {object} answers answers keyed by 'wb.' ids (missing or invalid = unanswered)
 * @returns {{
 *   level: 'steady'|'stretched'|'strained'|null,
 *   headline: string,
 *   text: string,
 *   areas: Array<{title: string, level: string}>,
 *   support: string[],
 *   flags: {safety: 'none'|'passing'|'frequent'|null},
 *   completion: {answered: number, total: number, complete: boolean}
 * }}
 */
export function wellbeingSummary(answers) {
  const valid = validMap(answers);
  const total = WELLBEING_QUESTIONS.length;
  const answered = Object.keys(valid).length;
  const complete = answered === total;
  const enough = answered * 2 >= total;

  // Per-area means on the 1-5 scale, after reversal. Only answered areas are listed.
  const areaStats = [];
  const allScored = [];
  for (const key of AREA_KEYS) {
    const vals = WELLBEING_QUESTIONS.filter((q) => q.dimension === key)
      .map((q) => scoredValue(q, valid))
      .filter((v) => v !== null);
    allScored.push(...vals);
    const mean = meanOf(vals);
    if (mean !== null) {
      areaStats.push({ key, title: WELLBEING_DIMENSIONS[key].title, mean, level: levelOf(mean) });
    }
  }

  const overallMean = meanOf(allScored);
  const level = enough && overallMean !== null ? levelOf(overallMean) : null;

  const copy = level ? HEADLINES[level] : NOT_ENOUGH;
  const flag = safetyFlag(valid);
  let text = copy.text;
  // The support note is shown once, as its own card on the view, so it is not added to the text here.
  if (flag === 'frequent') text = copy.text;
  if (flag === 'passing') {
    text = `${copy.text} If those thoughts grow stronger, please reach out to someone you trust or a crisis helpline where you live.`;
  }

  let support = [];
  if (level) {
    const weakest = [...areaStats].sort((a, b) => a.mean - b.mean);
    const weak = weakest.filter((a) => a.level !== 'steady');
    support = weak.slice(0, MAX_SUPPORT).map((a) => SUGGESTIONS[a.key]);
    if (support.length === 0) support = [KEEP_GOING];
  }

  return {
    level,
    headline: copy.headline,
    text,
    areas: areaStats.map((a) => ({ title: a.title, level: a.level })),
    support,
    flags: { safety: flag },
    completion: { answered, total, complete },
  };
}
