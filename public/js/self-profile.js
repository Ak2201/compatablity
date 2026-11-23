// Self profile: plain-language scoring for the personal self-test, and a closeness comparison
// between two people's self answers. DRAFT for psychologist review.
//
// Pure functions only: no DOM, no network, no storage. Missing or malformed input never
// throws; it returns the same shape with null scores and empty lists.
//
// Scoring: each answer is 1-5. Reverse-scored items (REVERSED below) are flipped as 6 minus
// the answer before averaging, so agreeing with "I worry about things" lowers the worry
// facet. A trait or facet mean (1-5) maps to 0-100 as (mean - 1) / 4 * 100.
// Bands: 67 and above is 'high', 33 and below is 'low', anything between is 'mid'.
// The 'patterns' dimension is not a trait. Its most frequent habit becomes `stress`.

import { SELF_QUESTIONS, SELF_DIMENSIONS, SELF_FACETS } from './self-questions.js';

const TRAIT_KEYS = ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'emotional_steadiness'];
const HABITS = ['withdraw', 'pursue', 'control', 'accommodate', 'sharp'];
const HIGH = 67;
const LOW = 33;
const STRENGTH_FACET_MIN = 75;
const STRESS_GROWTH_MIN = 4;
const MAX_STRENGTHS = 5;
const MAX_GROWTH = 4;

// Reverse-scored items. Agreeing with these means LOWER on the facet or trait.
// Keep this list in step with the item ids in self-questions.js.
export const REVERSED = new Set([
  // openness
  'self.openness.imagination.4', // I rarely get lost in my own thoughts.
  'self.openness.new_things.2', // I would rather stick with what I know than try something new.
  'self.openness.reflection.3', // I rarely think about why I believe what I believe.
  // conscientiousness
  'self.conscientiousness.organisation.4', // I often lose track of papers, keys or messages.
  'self.conscientiousness.follow_through.3', // I often leave things until the last minute.
  'self.conscientiousness.self_discipline.4', // I give up on my goals as soon as they become tedious.
  'self.conscientiousness.detail.3', // Work that is roughly right is good enough for me.
  // extraversion
  'self.extraversion.sociability.4', // In group conversations I tend to stay quiet.
  'self.extraversion.energy.3', // I find socialising draining.
  'self.extraversion.assertiveness.3', // I let others take the lead, even when I have a view.
  'self.extraversion.expressiveness.3', // I keep my feelings to myself most of the time.
  // agreeableness
  'self.agreeableness.empathy.3', // It is hard for me to see things from another person's side.
  'self.agreeableness.cooperation.3', // I would rather win than find a way for everyone to benefit.
  'self.agreeableness.trust.4', // I suspect people have hidden motives.
  'self.agreeableness.disagreement.3', // I argue to win rather than to understand.
  // emotional steadiness
  'self.emotional_steadiness.calm.4', // Sudden bad news knocks me off balance for a long time.
  'self.emotional_steadiness.recovery.3', // Setbacks linger with me for days.
  'self.emotional_steadiness.self_criticism.3', // I am hard on myself when I make a mistake.
  'self.emotional_steadiness.self_criticism.4', // I replay my mistakes long after they happen.
  'self.emotional_steadiness.worry.3', // I often worry about things that have not happened yet.
]);

const WARM = {
  openness: { low: 'Prefers the familiar', mid: 'Balanced', high: 'Very curious' },
  conscientiousness: { low: 'Relaxed about structure', mid: 'Balanced', high: 'Very organised' },
  extraversion: { low: 'Quieter than most', mid: 'Balanced', high: 'Very outgoing' },
  agreeableness: { low: 'Direct and independent', mid: 'Balanced', high: 'Very warm' },
  emotional_steadiness: { low: 'Feels things deeply', mid: 'Balanced', high: 'Very steady under pressure' },
};

const STRENGTH_TRAIT = {
  openness: { title: 'Curious mind', text: 'You like to learn and explore ideas, which keeps conversations and plans interesting.' },
  conscientiousness: { title: 'Reliable follow-through', text: 'You tend to plan and finish things, so people can count on you to keep things moving.' },
  extraversion: { title: 'Easy social energy', text: 'You bring energy to groups and tend to make connection feel easy.' },
  agreeableness: { title: 'Warm and cooperative', text: 'You look for common ground and care how other people feel.' },
  emotional_steadiness: { title: 'Steady under pressure', text: 'You tend to stay composed when things get hard and recover fairly well after setbacks.' },
};

const STRENGTH_LOW_STRESS = {
  title: 'Keeping your temper in hard moments',
  text: 'In tense moments you rarely reach for sharp words, which keeps conversations workable.',
};

// Growth areas for facets scoring 33 or below. Keys are 'trait.facet'.
const GROWTH_FACET = {
  'openness.curiosity': {
    title: 'Exploring new questions',
    text: 'You may find it easier to stay with what you know than to chase new questions.',
    construct: 'Need for closure',
    tryThis: ['Pick one topic a month to learn about just for fun', 'Ask one question you would normally leave unasked'],
  },
  'openness.imagination': {
    title: 'Imagining possibilities',
    text: 'Ideas about what could be may come to you less often than practical facts.',
    construct: 'Planning versus spontaneity',
    tryThis: ['Spend five minutes on a "what if" with someone you trust', 'Try an open-ended plan for one weekend'],
  },
  'openness.new_things': {
    title: 'Trying something new',
    text: 'New situations may feel more tiring than exciting for you at the moment.',
    construct: 'Need for closure',
    tryThis: ['Try one small new thing each month', 'Name what makes the new thing feel uncertain, then take one small step'],
  },
  'openness.reflection': {
    title: 'Looking back on experience',
    text: 'You may move on quickly rather than stopping to think things through.',
    construct: 'Decision-making style',
    tryThis: ['Note one thing you learned at the end of the day', 'Before a big decision, write down what you are weighing'],
  },
  'conscientiousness.organisation': {
    title: 'Keeping things in order',
    text: 'Loose plans and shifting details may cost you more energy than they do others.',
    construct: 'Planning versus spontaneity',
    tryThis: ['Agree one shared calendar or list with the people you live with', 'Keep one place for the things you keep losing'],
  },
  'conscientiousness.follow_through': {
    title: 'Following through',
    text: 'Things you have promised may slip when life gets busy.',
    construct: 'Conscientiousness and follow-through',
    tryThis: ['Write promises down as soon as you make them', 'Break one open task into a first step you can finish today'],
  },
  'conscientiousness.self_discipline': {
    title: 'Steady routines',
    text: 'Keeping up a habit can be hard once the mood has gone.',
    construct: 'Conscientiousness and follow-through',
    tryThis: ['Pick one small routine and do it at the same time each day', 'Pair a task you dislike with something you enjoy'],
  },
  'conscientiousness.detail': {
    title: 'Checking the details',
    text: 'Small errors may pass you by, which can matter when others rely on accuracy.',
    construct: 'Conscientiousness and follow-through',
    tryThis: ['Do one quick check before you hand work over', 'Ask someone to check the one detail that matters most'],
  },
  'extraversion.sociability': {
    title: 'Making time for people',
    text: 'Keeping in touch may take more effort for you than it does for some people.',
    construct: "Gottman's bids for connection",
    tryThis: ['Send one short message to someone you like this week', 'Say yes to one small plan each fortnight'],
  },
  'extraversion.energy': {
    title: 'Pacing time with people',
    text: 'Time with people may tire you faster than you expect, so rest matters.',
    construct: 'Emotional flooding and cool-down time',
    tryThis: ['Plan a quiet block after a busy social day', 'Tell the people close to you when you need a break, before you run out'],
  },
  'extraversion.assertiveness': {
    title: 'Speaking up for yourself',
    text: 'Stating your view may feel harder than listening, so your needs can go unsaid.',
    construct: 'Decision-making style',
    tryThis: ['Say what you think in one sentence before the group moves on', 'Name one preference out loud each day'],
  },
  'extraversion.expressiveness': {
    title: 'Sharing how you feel',
    text: 'Feelings may stay private, so the people close to you may have to guess what you feel.',
    construct: "Gottman's bids for connection",
    tryThis: ['Name one feeling each day, even a small one', 'Tell someone one thing you appreciated today'],
  },
  'agreeableness.empathy': {
    title: 'Reading other people',
    text: 'Other people’s feelings may be harder to read in the moment.',
    construct: "Gottman's bids for connection",
    tryThis: ['Ask "how did that feel for you?" before you give your view', 'Reflect back what you heard in one sentence'],
  },
  'agreeableness.cooperation': {
    title: 'Working together',
    text: 'Shared plans may feel like a trade-off you do not want to make.',
    construct: 'Need for closure',
    tryThis: ['Look for one option that meets both people’s main need', 'Agree a fair way to decide small things'],
  },
  'agreeableness.trust': {
    title: 'Trusting others',
    text: 'You may need more proof before you feel at ease with someone.',
    construct: 'Anxious-avoidant pursue-withdraw cycle',
    tryThis: ['Share one small thing and see how it goes', 'When unsure, ask instead of assuming'],
  },
  'agreeableness.disagreement': {
    title: 'Handling disagreement kindly',
    text: 'Disagreements may come across as sharper than you intend.',
    construct: "Gottman's Four Horsemen",
    tryThis: ['Start with what you agree on before what you do not', 'Use "I feel" and "I need" instead of "you always"'],
  },
  'emotional_steadiness.calm': {
    title: 'Staying calm under pressure',
    text: 'Pressure may show up in your body or your tone before you notice it.',
    construct: 'Emotional flooding and cool-down time',
    tryThis: ['When you notice tension, take three slow breaths before you reply', 'Agree a short pause signal with someone close'],
  },
  'emotional_steadiness.recovery': {
    title: 'Recovering after setbacks',
    text: 'Setbacks may stay with you longer than you would like.',
    construct: 'Emotional flooding and cool-down time',
    tryThis: ['Write one line about what you can do next', 'Plan something small and nice for the evening after a hard day'],
  },
  'emotional_steadiness.self_criticism': {
    title: 'Being kind to yourself',
    text: 'Mistakes may set off a harsh inner voice.',
    construct: 'Repair attempts',
    tryThis: ['Say what you would tell a friend who made the same mistake', 'Name one thing you did well today'],
  },
  'emotional_steadiness.worry': {
    title: 'Quieting worry',
    text: 'Worries about what might happen may take up more room than you want.',
    construct: 'Attachment closeness and reassurance',
    tryThis: ['Write the worry down, then note what you can do about it', 'Ask for the reassurance you need once, instead of checking again and again'],
  },
};

// Stress and conflict habits. Keys match the patterns option values in self-questions.js.
const STRESS_HABIT = {
  withdraw: {
    text: 'When things pile up you tend to go quiet, which can leave people guessing what is going on.',
    title: 'Pulling back under strain',
    construct: 'Emotional flooding and cool-down time',
    tryThis: ['Say "I need an hour, then I will come back to this"', 'Tell one person you trust what is going on, even briefly'],
  },
  pursue: {
    text: 'When you feel unsettled you tend to reach for connection and reassurance quickly.',
    title: 'Reaching for reassurance',
    construct: 'Anxious-avoidant pursue-withdraw cycle',
    tryThis: ['Name the feeling in one sentence before you reach out', 'Ask for what you need in plain words'],
  },
  control: {
    text: 'Under pressure you tend to sort things out yourself and quickly, which can leave others out of the plan.',
    title: 'Taking charge when stressed',
    construct: 'Need for closure',
    tryThis: ['Ask one person what they think before you decide', 'Leave one question open on purpose and check it later'],
  },
  accommodate: {
    text: 'You often let things go to keep the peace, which can build up quietly over time.',
    title: 'Smoothing things over',
    construct: 'Repair attempts',
    tryThis: ['Choose one small thing a week to mention early', 'Once you are calm, say "that did not sit well with me"'],
  },
  sharp: {
    text: 'When you are stretched, your words can come out sharper than you mean them to.',
    title: 'Sharp tone under pressure',
    construct: "Gottman's Four Horsemen",
    tryThis: ['Take a short break when your tone starts to change', 'Come back later with one sentence that starts with "I"'],
  },
};

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// Returns the answer as stored (number 1-5 for likert and scale, option value for choice)
// or null when it is missing or not valid for that item.
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

// Map of item id to valid stored answer, for items that were answered validly.
function validMap(answers) {
  const src = isObj(answers) ? answers : {};
  const out = {};
  for (const q of SELF_QUESTIONS) {
    const v = validAnswer(q, src[q.id]);
    if (v !== null) out[q.id] = v;
  }
  return out;
}

// Score for one scored (1-5) item, after reversal. Choice items return null.
function scoredValue(q, valid) {
  const v = valid[q.id];
  if (typeof v !== 'number') return null;
  return REVERSED.has(q.id) ? 6 - v : v;
}

function meanScore(items, valid) {
  const vals = items.map((q) => scoredValue(q, valid)).filter((v) => v !== null);
  if (vals.length === 0) return null;
  const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
  return Math.max(0, Math.min(100, Math.round(((mean - 1) / 4) * 100)));
}

function bandOf(score) {
  if (score === null) return null;
  if (score >= HIGH) return 'high';
  if (score <= LOW) return 'low';
  return 'mid';
}

function answeredIds(items, valid) {
  return items.filter((q) => valid[q.id] !== undefined).map((q) => q.id);
}

/**
 * @param {object} answers answers keyed by 'self.' ids (missing or invalid = unanswered)
 * @returns {{
 *   traits: Array<{key:string,title:string,score:number|null,label:string|null,band:string|null,blurb:string}>,
 *   facets: Array<{trait:string,key:string,title:string,score:number|null}>,
 *   strengths: Array<{title:string,text:string,evidence:string[]}>,
 *   growthAreas: Array<{title:string,text:string,construct:string,evidence:string[],tryThis:string[]}>,
 *   stress: {habit:string|null,text:string},
 *   style: {label:string|null,text:string},
 *   answeredCount:number, totalCount:number, complete:boolean
 * }}
 */
export function selfProfile(answers) {
  const valid = validMap(answers);
  const answeredCount = Object.keys(valid).length;
  const totalCount = SELF_QUESTIONS.length;

  // Traits: one per trait dimension, from its scored items.
  const traits = TRAIT_KEYS.map((key) => {
    const score = meanScore(SELF_QUESTIONS.filter((q) => q.dimension === key), valid);
    const band = bandOf(score);
    return {
      key,
      title: SELF_DIMENSIONS[key].title,
      score,
      label: band ? WARM[key][band] : null,
      band,
      blurb: SELF_DIMENSIONS[key].blurb,
    };
  });

  // Facets: grouped by the `facet` field inside each trait.
  const facets = [];
  for (const trait of TRAIT_KEYS) {
    for (const [key, title] of Object.entries(SELF_FACETS[trait])) {
      const items = SELF_QUESTIONS.filter((q) => q.dimension === trait && q.facet === key);
      facets.push({ trait, key, title, score: meanScore(items, valid) });
    }
  }

  // Stress: the most frequent patterns choice. Ties go to the earlier habit in HABITS.
  const patternItems = SELF_QUESTIONS.filter((q) => q.dimension === 'patterns');
  const habitCounts = Object.fromEntries(HABITS.map((h) => [h, 0]));
  const habitEvidence = Object.fromEntries(HABITS.map((h) => [h, []]));
  for (const q of patternItems) {
    const habit = valid[q.id];
    if (habit && habitCounts[habit] !== undefined) {
      habitCounts[habit] += 1;
      habitEvidence[habit].push(q.id);
    }
  }
  let habit = null;
  let top = 0;
  for (const h of HABITS) {
    if (habitCounts[h] > top) {
      top = habitCounts[h];
      habit = h;
    }
  }
  const stress = habit
    ? { habit, text: STRESS_HABIT[habit].text }
    : { habit: null, text: 'Answer the stress and conflict statements to see the habit you lean on most.' };

  // Strengths: high traits, then high facets, then low stress indicators. At most 5.
  const strengths = [];
  traits
    .filter((t) => t.band === 'high')
    .sort((a, b) => b.score - a.score)
    .forEach((t) => {
      strengths.push({
        title: STRENGTH_TRAIT[t.key].title,
        text: STRENGTH_TRAIT[t.key].text,
        evidence: answeredIds(SELF_QUESTIONS.filter((q) => q.dimension === t.key), valid),
      });
    });
  facets
    .filter((f) => f.score !== null && f.score >= STRENGTH_FACET_MIN)
    .sort((a, b) => b.score - a.score)
    .forEach((f) => {
      strengths.push({
        title: f.title,
        text: `Your answers point to ${f.title.toLowerCase()} as something you can lean on.`,
        evidence: answeredIds(SELF_QUESTIONS.filter((q) => q.dimension === f.trait && q.facet === f.key), valid),
      });
    });
  const patternsAnswered = patternItems.filter((q) => valid[q.id] !== undefined).length;
  if (patternsAnswered >= 5 && habitCounts.sharp <= 1) {
    strengths.push({
      ...STRENGTH_LOW_STRESS,
      evidence: patternItems.filter((q) => valid[q.id] && valid[q.id] !== 'sharp').map((q) => q.id),
    });
  }

  // Growth areas: a stress habit seen often, then low facets. At most 4.
  const growthAreas = [];
  if (habit && habitCounts[habit] >= STRESS_GROWTH_MIN) {
    const s = STRESS_HABIT[habit];
    growthAreas.push({
      title: s.title,
      text: s.text,
      construct: s.construct,
      evidence: habitEvidence[habit],
      tryThis: [...s.tryThis],
    });
  }
  facets
    .filter((f) => f.score !== null && f.score <= LOW)
    .sort((a, b) => a.score - b.score)
    .forEach((f) => {
      const g = GROWTH_FACET[`${f.trait}.${f.key}`];
      if (!g) return;
      growthAreas.push({
        title: g.title,
        text: g.text,
        construct: g.construct,
        evidence: answeredIds(SELF_QUESTIONS.filter((q) => q.dimension === f.trait && q.facet === f.key), valid),
        tryThis: [...g.tryThis],
      });
    });

  // Style: a one-line summary built from openness, conscientiousness, extraversion and agreeableness.
  const byKey = Object.fromEntries(traits.map((t) => [t.key, t]));
  const styleKeys = ['openness', 'conscientiousness', 'extraversion', 'agreeableness'];
  let style;
  if (styleKeys.some((k) => byKey[k].band === null)) {
    style = { label: null, text: 'Answer a few more statements to see how you tend to think and communicate.' };
  } else {
    const thinkWord = { high: 'Curious', mid: 'Open-minded', low: 'Practical' }[byKey.openness.band];
    const orderWord = { high: 'organised', mid: 'flexible', low: 'spontaneous' }[byKey.conscientiousness.band];
    const talkText = {
      high: 'You like to think out loud and talk things through with people.',
      mid: 'You talk things through when it matters, and keep some quiet time too.',
      low: 'You think first and share when you feel ready.',
    }[byKey.extraversion.band];
    const warmText = {
      high: 'You lead with warmth and care about keeping the peace.',
      mid: 'You balance warmth with saying what you think.',
      low: 'You say what you mean plainly, and value directness.',
    }[byKey.agreeableness.band];
    style = { label: `${thinkWord} and ${orderWord}`, text: `${talkText} ${warmText}` };
  }

  return {
    traits: traits.map(({ key, title, score, label, band, blurb }) => ({ key, title, score, label, band, blurb })),
    facets: facets.map(({ trait, key, title, score }) => ({ trait, key, title, score })),
    strengths: strengths.slice(0, MAX_STRENGTHS),
    growthAreas: growthAreas.slice(0, MAX_GROWTH),
    stress,
    style,
    answeredCount,
    totalCount,
    complete: answeredCount === totalCount,
  };
}

/**
 * Answered and total counts for a progress bar.
 * @param {object} answers
 * @returns {{answered:number, total:number, percent:number}}
 */
export function selfCompletion(answers) {
  const p = selfProfile(answers);
  const percent = p.totalCount ? Math.round((p.answeredCount / p.totalCount) * 100) : 0;
  return { answered: p.answeredCount, total: p.totalCount, percent };
}

/**
 * Compares two people's trait scores. Never names a winner and never says who is more compatible.
 * @param {object} mine answers keyed by 'self.' ids
 * @param {object} theirs answers keyed by 'self.' ids
 * @param {{partnerName?: string}} [opts]
 */
export function compareSelf(mine, theirs, opts) {
  const partnerName = isObj(opts) && typeof opts.partnerName === 'string' && opts.partnerName.trim()
    ? opts.partnerName.trim()
    : null;
  const a = selfProfile(mine);
  const b = selfProfile(theirs);
  const mineDone = a.answeredCount > 0;
  const theirsDone = b.answeredCount > 0;

  if (!mineDone || !theirsDone) {
    return {
      available: false,
      reason: mineDone ? 'they_have_not_done_it' : 'you_have_not_done_it',
      traits: [],
      summary: '',
      partnerName,
    };
  }

  const traits = TRAIT_KEYS.map((key) => {
    const mineScore = a.traits.find((t) => t.key === key).score;
    const theirsScore = b.traits.find((t) => t.key === key).score;
    const title = SELF_DIMENSIONS[key].title;
    if (mineScore === null || theirsScore === null) {
      return { key, title, mine: mineScore, theirs: theirsScore, gap: null, closeness: null, read: null };
    }
    const gap = Math.abs(mineScore - theirsScore);
    const read = gap <= 10 ? 'close' : gap <= 25 ? 'different' : 'far';
    return { key, title, mine: mineScore, theirs: theirsScore, gap, closeness: 100 - gap, read };
  });

  const comparable = traits.filter((t) => t.gap !== null);
  let summary;
  if (comparable.length === 0) {
    summary = 'Your answers do not overlap enough yet to compare traits.';
  } else if (comparable.length === 1) {
    summary = `You can compare on ${comparable[0].title.toLowerCase()} so far.`;
  } else {
    const sorted = [...comparable].sort((x, y) => x.gap - y.gap);
    const alike = sorted[0];
    const diff = sorted[sorted.length - 1];
    summary = `You are most alike on ${alike.title.toLowerCase()}. You are most different on ${diff.title.toLowerCase()}.`;
  }

  return { available: true, reason: null, traits, summary, partnerName };
}
