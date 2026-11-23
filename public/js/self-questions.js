// Self-profile question bank: DRAFT for psychologist review. Not final.
//
// A personal self-test about you, not about a partner. 100 scored items, no text and no
// yes/no items. Item fields match questions.js:
//   id         'self.' + dimension + facet + number (stable, never reused)
//   dimension  key into SELF_DIMENSIONS
//   facet      key into SELF_FACETS[dimension] (trait items only)
//   type       'likert'  1-5 agree scale
//              'scale'   1-5 with low/high endpoint labels
//              'choice'  pick one of `options` (patterns dimension only)
//   options    for 'choice': [{ value, label }]; values are habit keys used by self-profile.js
//   low/high   for 'scale': endpoint labels
//   source     'draft' (for the reviewer)
//
// Reverse-scored items are listed in REVERSED in self-profile.js, not marked here.

export const SELF_DIMENSIONS = {
  openness: {
    title: 'Openness',
    area: 'Curiosity and new experiences',
    rule: 'trait',
    blurb: 'How much you enjoy ideas, novelty and thinking back over your experience.',
  },
  conscientiousness: {
    title: 'Conscientiousness',
    area: 'Organisation and follow-through',
    rule: 'trait',
    blurb: 'How you plan, finish what you start and look after the details.',
  },
  extraversion: {
    title: 'Extraversion',
    area: 'Energy around people',
    rule: 'trait',
    blurb: 'How drawn you are to other people, and how you recharge afterwards.',
  },
  agreeableness: {
    title: 'Agreeableness',
    area: 'Warmth and working together',
    rule: 'trait',
    blurb: 'How you read other people, cooperate and handle disagreement.',
  },
  emotional_steadiness: {
    title: 'Emotional steadiness',
    area: 'Calm, recovery and self-kindness',
    rule: 'trait',
    blurb: 'How you stay steady under pressure and come back after setbacks.',
  },
  patterns: {
    title: 'Stress and conflict habits',
    area: 'What you tend to do when things get hard',
    rule: 'patterns',
    blurb: 'Common habits when you are overloaded, criticised, kept waiting or feel ignored. Pick the closest one each time.',
  },
};

// Facets per trait. Keys are used in item ids and in the `facet` field.
export const SELF_FACETS = {
  openness: {
    curiosity: 'Curiosity',
    imagination: 'Imagination',
    new_things: 'Trying new things',
    reflection: 'Reflectiveness',
  },
  conscientiousness: {
    organisation: 'Organisation',
    follow_through: 'Follow-through',
    self_discipline: 'Self-discipline',
    detail: 'Care about detail',
  },
  extraversion: {
    sociability: 'Sociability',
    energy: 'Energy around people',
    assertiveness: 'Assertiveness',
    expressiveness: 'Expressiveness',
  },
  agreeableness: {
    empathy: 'Empathy',
    cooperation: 'Cooperation',
    trust: 'Trust',
    disagreement: 'Handling disagreement kindly',
  },
  emotional_steadiness: {
    calm: 'Calm under pressure',
    recovery: 'Recovery after setbacks',
    self_criticism: 'Self-kindness',
    worry: 'Worry',
  },
};

const L = (dimension, facet, n, text) => ({
  id: `self.${dimension}.${facet}.${n}`,
  dimension,
  facet,
  type: 'likert',
  text,
  source: 'draft',
});

const S = (dimension, facet, n, text, low, high) => ({
  id: `self.${dimension}.${facet}.${n}`,
  dimension,
  facet,
  type: 'scale',
  text,
  low,
  high,
  source: 'draft',
});

const HABIT_OPTIONS = {
  withdraw: 'Go quiet and pull back to recharge',
  pursue: 'Reach out and look for reassurance',
  control: 'Take charge and sort it out myself',
  accommodate: 'Smooth things over and let it go',
  sharp: 'Get short, sarcastic or sharp',
};

const P = (name, text, habits) => ({
  id: `self.patterns.${name}`,
  dimension: 'patterns',
  type: 'choice',
  text,
  options: habits.map((h) => ({ value: h, label: HABIT_OPTIONS[h] })),
  source: 'draft',
});

const OPENNESS = [
  // curiosity
  L('openness', 'curiosity', 1, 'I enjoy learning about things I know nothing about.'),
  L('openness', 'curiosity', 2, 'I like asking questions until I really understand something.'),
  S('openness', 'curiosity', 3, 'When I hear a surprising idea, I want to know more about it.', 'Not really', 'Right away'),
  L('openness', 'curiosity', 4, 'Reading about an unfamiliar subject is a pleasure for me.'),
  L('openness', 'curiosity', 5, 'I often wonder how things work behind the scenes.'),
  // imagination
  L('openness', 'imagination', 1, 'I often picture how things could be different.'),
  L('openness', 'imagination', 2, 'I enjoy making up stories, songs or designs of my own.'),
  L('openness', 'imagination', 3, 'My mind goes to creative ideas more than most people I know.'),
  L('openness', 'imagination', 4, 'I rarely get lost in my own thoughts.'),
  // trying new things
  L('openness', 'new_things', 1, 'I like trying new foods, places and hobbies.'),
  L('openness', 'new_things', 2, 'I would rather stick with what I know than try something new.'),
  L('openness', 'new_things', 3, 'Starting something unfamiliar excites me more than it worries me.'),
  S('openness', 'new_things', 4, 'When plans change at short notice, I can adapt without much fuss.', 'Not easily', 'Very easily'),
  L('openness', 'new_things', 5, 'I am happy to take a different route, even when the usual one works.'),
  // reflectiveness
  L('openness', 'reflection', 1, 'I think about my choices and what I could learn from them.'),
  L('openness', 'reflection', 2, 'I often look back on a day and think about what it meant.'),
  L('openness', 'reflection', 3, 'I rarely think about why I believe what I believe.'),
  S('openness', 'reflection', 4, 'I like quiet time to think things over.', 'Not really', 'Very much'),
];

const CONSCIENTIOUSNESS = [
  // organisation
  L('conscientiousness', 'organisation', 1, 'I keep my things where I can find them.'),
  L('conscientiousness', 'organisation', 2, 'I like a clear plan for the week ahead.'),
  L('conscientiousness', 'organisation', 3, 'My home or workspace is usually in reasonable order.'),
  L('conscientiousness', 'organisation', 4, 'I often lose track of papers, keys or messages.'),
  S('conscientiousness', 'organisation', 5, 'I like to know in advance what my day will look like.', 'Not really', 'Yes, very much'),
  // follow-through
  L('conscientiousness', 'follow_through', 1, 'When I say I will do something, I do it.'),
  L('conscientiousness', 'follow_through', 2, 'I finish tasks I start, even when they get dull.'),
  L('conscientiousness', 'follow_through', 3, 'I often leave things until the last minute.'),
  S('conscientiousness', 'follow_through', 4, 'Once I make a promise, I keep track of it until it is done.', 'Often slip', 'Almost always'),
  // self-discipline
  L('conscientiousness', 'self_discipline', 1, 'I can resist a distraction when I have important work to do.'),
  L('conscientiousness', 'self_discipline', 2, 'I keep to a routine even when I do not feel like it.'),
  L('conscientiousness', 'self_discipline', 3, 'I start the day with my most important task.'),
  L('conscientiousness', 'self_discipline', 4, 'I give up on my goals as soon as they become tedious.'),
  L('conscientiousness', 'self_discipline', 5, 'I can keep going when a task gets hard.'),
  // care about detail
  L('conscientiousness', 'detail', 1, 'I check my work carefully before I hand it in.'),
  L('conscientiousness', 'detail', 2, 'I notice small errors in documents, numbers or plans.'),
  L('conscientiousness', 'detail', 3, 'Work that is roughly right is good enough for me.'),
  S('conscientiousness', 'detail', 4, 'I like getting the small details right, even when no one else will notice.', 'Not especially', 'Very much'),
];

const EXTRAVERSION = [
  // sociability
  L('extraversion', 'sociability', 1, 'I enjoy being around a group of people.'),
  L('extraversion', 'sociability', 2, 'I start conversations easily with people I have just met.'),
  L('extraversion', 'sociability', 3, 'I often make plans to see people.'),
  L('extraversion', 'sociability', 4, 'In group conversations I tend to stay quiet.'),
  L('extraversion', 'sociability', 5, 'I like having people around me most of the time.'),
  // energy around people
  L('extraversion', 'energy', 1, 'I come away from social time feeling more energised.'),
  L('extraversion', 'energy', 2, 'Parties and busy events give me a lift.'),
  L('extraversion', 'energy', 3, 'I find socialising draining.'),
  S('extraversion', 'energy', 4, 'Time with a group of friends leaves me buzzing.', 'Wiped out', 'Buzzing'),
  // assertiveness
  L('extraversion', 'assertiveness', 1, 'I say what I want clearly when a decision is being made.'),
  L('extraversion', 'assertiveness', 2, 'I am comfortable speaking up in a meeting or a group chat.'),
  L('extraversion', 'assertiveness', 3, 'I let others take the lead, even when I have a view.'),
  L('extraversion', 'assertiveness', 4, 'I ask for what I want without much hesitation.'),
  L('extraversion', 'assertiveness', 5, 'I like being the one who gets things moving.'),
  // expressiveness
  L('extraversion', 'expressiveness', 1, 'I share my excitement with the people around me.'),
  L('extraversion', 'expressiveness', 2, 'I tell stories with plenty of energy.'),
  L('extraversion', 'expressiveness', 3, 'I keep my feelings to myself most of the time.'),
  S('extraversion', 'expressiveness', 4, 'People usually know how I am feeling just by looking at me.', 'Rarely', 'Almost always'),
];

const AGREEABLENESS = [
  // empathy
  L('agreeableness', 'empathy', 1, 'I can tell when someone is upset, even if they do not say so.'),
  L('agreeableness', 'empathy', 2, 'I try to see things from someone else’s side before I judge them.'),
  L('agreeableness', 'empathy', 3, 'It is hard for me to see things from another person’s side.'),
  L('agreeableness', 'empathy', 4, 'I notice when a friend needs a little extra care.'),
  L('agreeableness', 'empathy', 5, 'How other people feel about my decisions matters to me.'),
  // cooperation
  L('agreeableness', 'cooperation', 1, 'I am happy to meet in the middle when we disagree.'),
  L('agreeableness', 'cooperation', 2, 'I enjoy working as a team more than working alone.'),
  L('agreeableness', 'cooperation', 3, 'I would rather win than find a way for everyone to benefit.'),
  L('agreeableness', 'cooperation', 4, 'I will give up part of my plan to help a group.'),
  // trust
  L('agreeableness', 'trust', 1, 'I usually give people the benefit of the doubt.'),
  L('agreeableness', 'trust', 2, 'I assume most people are being honest with me.'),
  L('agreeableness', 'trust', 3, 'I believe people will keep their word.'),
  L('agreeableness', 'trust', 4, 'I suspect people have hidden motives.'),
  S('agreeableness', 'trust', 5, 'I trust new people fairly quickly.', 'Only after a long time', 'Quite quickly'),
  // handling disagreement kindly
  L('agreeableness', 'disagreement', 1, 'When I disagree, I can do it without making the other person feel small.'),
  L('agreeableness', 'disagreement', 2, 'I can say I was wrong without much fuss.'),
  L('agreeableness', 'disagreement', 3, 'I argue to win rather than to understand.'),
  L('agreeableness', 'disagreement', 4, 'I look for the middle ground when people see things differently.'),
];

const EMOTIONAL_STEADINESS = [
  // calm under pressure
  L('emotional_steadiness', 'calm', 1, 'I stay composed when things go wrong.'),
  L('emotional_steadiness', 'calm', 2, 'Pressure tends to help me focus rather than rattle me.'),
  L('emotional_steadiness', 'calm', 3, 'Under pressure, my thinking stays clear.'),
  L('emotional_steadiness', 'calm', 4, 'Sudden bad news knocks me off balance for a long time.'),
  S('emotional_steadiness', 'calm', 5, 'When things get busy, I stay steady.', 'Rattled', 'Steady'),
  // recovery after setbacks
  L('emotional_steadiness', 'recovery', 1, 'After a setback, I bounce back fairly quickly.'),
  L('emotional_steadiness', 'recovery', 2, 'I can let a bad day go once it is over.'),
  L('emotional_steadiness', 'recovery', 3, 'Setbacks linger with me for days.'),
  S('emotional_steadiness', 'recovery', 4, 'After an upset, I feel like myself again within a short time.', 'Not so much', 'Usually, yes'),
  // self-kindness
  L('emotional_steadiness', 'self_criticism', 1, 'I am kind to myself when I make a mistake.'),
  L('emotional_steadiness', 'self_criticism', 2, 'I can forgive my own slip-ups.'),
  L('emotional_steadiness', 'self_criticism', 3, 'I am hard on myself when I make a mistake.'),
  L('emotional_steadiness', 'self_criticism', 4, 'I replay my mistakes long after they happen.'),
  L('emotional_steadiness', 'self_criticism', 5, 'I can admit I was wrong without feeling worthless.'),
  // worry
  L('emotional_steadiness', 'worry', 1, 'I can switch off my worries at the end of the day.'),
  L('emotional_steadiness', 'worry', 2, 'I expect things to turn out fine more often than not.'),
  L('emotional_steadiness', 'worry', 3, 'I often worry about things that have not happened yet.'),
  S('emotional_steadiness', 'worry', 4, 'My mind rarely runs away with worst-case stories.', 'Not like me', 'Very much like me'),
];

// Stress and conflict habits. Each option value is a habit key used by self-profile.js.
const PATTERNS = [
  P('overloaded_a', 'When I feel overloaded, I usually...', ['withdraw', 'control', 'accommodate', 'sharp']),
  P('overloaded_b', 'When work piles up, my first move is to...', ['pursue', 'control', 'withdraw', 'accommodate']),
  P('criticised_a', 'When someone criticises my work, I tend to...', ['sharp', 'withdraw', 'control', 'pursue']),
  P('criticised_b', 'When a partner points out a mistake of mine, I...', ['pursue', 'accommodate', 'withdraw', 'sharp']),
  P('late_a', 'When someone I am meeting is late without a message, I usually...', ['sharp', 'accommodate', 'control', 'withdraw']),
  P('late_b', 'When plans run late, I tend to...', ['control', 'accommodate', 'pursue', 'sharp']),
  P('ignored_a', 'When I feel ignored by someone close, I...', ['pursue', 'withdraw', 'accommodate', 'sharp']),
  P('ignored_b', 'When I think someone has stopped paying attention to me, I usually...', ['pursue', 'control', 'withdraw', 'sharp']),
  P('conflict_a', 'In a disagreement that is getting heated, I...', ['sharp', 'withdraw', 'control', 'accommodate']),
  P('conflict_b', 'Once a disagreement is over, I most often...', ['pursue', 'accommodate', 'withdraw', 'control']),
];

export const SELF_QUESTIONS = [
  ...OPENNESS,
  ...CONSCIENTIOUSNESS,
  ...EXTRAVERSION,
  ...AGREEABLENESS,
  ...EMOTIONAL_STEADINESS,
  ...PATTERNS,
];

// Sanity checks: 100 scored items, unique 'self.' ids, known dimensions and facets,
// valid shapes, and at least 4 items in every facet. Throws on the first problem.
export function validateSelfQuestions(list = SELF_QUESTIONS) {
  if (!Array.isArray(list)) throw new Error('self questions must be an array');
  if (list.length !== 100) throw new Error(`expected 100 scored items, found ${list.length}`);
  const seen = new Set();
  const types = new Set(['likert', 'scale', 'choice']);
  const facetCounts = {};
  for (const q of list) {
    if (!q || typeof q.id !== 'string' || !q.id.startsWith('self.')) throw new Error(`bad id: ${q && q.id}`);
    if (seen.has(q.id)) throw new Error(`duplicate question id: ${q.id}`);
    seen.add(q.id);
    if (!SELF_DIMENSIONS[q.dimension]) throw new Error(`unknown dimension for ${q.id}`);
    if (!types.has(q.type)) throw new Error(`unknown type for ${q.id}`);
    if (typeof q.text !== 'string' || !q.text.trim()) throw new Error(`missing text: ${q.id}`);
    if (q.dimension === 'patterns') {
      if (q.type !== 'choice' || !Array.isArray(q.options) || q.options.length !== 4) {
        throw new Error(`patterns item needs 4 choice options: ${q.id}`);
      }
    } else {
      if (q.type === 'choice') throw new Error(`choice only allowed in patterns: ${q.id}`);
      if (!SELF_FACETS[q.dimension] || !SELF_FACETS[q.dimension][q.facet]) throw new Error(`unknown facet for ${q.id}`);
      const key = `${q.dimension}.${q.facet}`;
      facetCounts[key] = (facetCounts[key] || 0) + 1;
    }
    if (q.type === 'scale' && (!q.low || !q.high)) throw new Error(`scale needs low/high: ${q.id}`);
  }
  for (const dim of Object.keys(SELF_FACETS)) {
    for (const facet of Object.keys(SELF_FACETS[dim])) {
      const n = facetCounts[`${dim}.${facet}`] || 0;
      if (n < 4) throw new Error(`facet ${dim}.${facet} has ${n} items, needs at least 4`);
    }
  }
  return list.length;
}
