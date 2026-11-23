// Psychology depth helpers: plain-language guides, pattern exercises, reflection prompts,
// repeated-pattern detection, a copy safety net and a small glossary.
//
// Pure functions only: no DOM, no network, no storage. Every export tolerates missing or
// malformed input and returns a usable shape instead of throwing.

const CAUTION_LINE =
  'This is a general tendency based on your answers, not a clinical diagnosis. A qualified professional is the right person for anything about mental health.';

// ---------- 1. Attachment guides ----------

const ATTACHMENT_GUIDES = {
  secure: {
    title: 'Steady and secure',
    plain:
      'You tend to feel fairly at ease with closeness and with some independence. This is a tendency, not a fixed label, and it can shift under stress or in a new relationship.',
    feelsLike: [
      'Comfortable saying what you need',
      'Able to trust a partner without checking all the time',
      'Fine with a short gap without reading it as rejection',
    ],
    tryThis: [
      'Share one small need in plain words each week',
      'When your partner seems distant, ask what is going on before deciding what it means',
      'Notice when you offer steadiness and say so out loud',
    ],
    watchFor: [
      'Assuming a partner who is different from you is struggling',
      'Going quiet when things feel too calm to trust',
    ],
  },
  anxious: {
    title: 'Closeness-seeking',
    plain:
      'You tend to want reassurance and closeness, and you may notice worry when a partner pulls back. This is a tendency, not a diagnosis, and it often eases once needs are named early.',
    feelsLike: [
      'Checking whether things are still okay after a quiet day',
      'Wanting to hear reassurance more than once',
      'Reading a short reply as a sign something is wrong',
    ],
    tryThis: [
      'Name the worry in one sentence before acting on it',
      'Ask directly for the reassurance you want, rather than testing for it',
      'Plan one calm check-in with your partner each week',
    ],
    watchFor: [
      'Turning a worry into a conclusion before you have asked',
      'Pressing for closeness at the moment your partner needs space',
    ],
  },
  avoidant: {
    title: 'Independence-leaning',
    plain:
      'You tend to value space and self-reliance, and closeness can feel heavy at times. This is a tendency, not a fixed trait, and many people with this pattern feel more at ease once they know what closeness will look like.',
    feelsLike: [
      'Wanting time alone after a busy day',
      'Feeling crowded when plans pile up',
      'Working a problem through alone before talking about it',
    ],
    tryThis: [
      'Tell your partner when you need space and roughly how long',
      'Share one feeling each day, even a small one',
      'When you pull back, say when you will return to the topic',
    ],
    watchFor: [
      'Going quiet in a way your partner reads as a verdict',
      'Treating a request for closeness as pressure',
    ],
  },
  mixed: {
    title: 'Mixed closeness style',
    plain:
      'Your answers point in more than one direction, so you may feel close and cautious at different times. This is a tendency, not a label, and it often depends on the situation and how safe things feel.',
    feelsLike: [
      'Wanting closeness and space, sometimes in the same week',
      'Feeling clear about some relationships and unsure about others',
      'Shifting between warmth and withdrawal under stress',
    ],
    tryThis: [
      'Notice which situations make you want closeness and which make you want space',
      'Describe your current need in one sentence to your partner',
      'Agree a simple signal with your partner for needing a pause',
    ],
    watchFor: [
      'Reading mixed feelings as a sign the relationship is wrong',
      'Letting one hard mood decide how you act for a whole week',
    ],
  },
  unknown: {
    title: 'Not enough answers yet',
    plain:
      'We do not have enough answers yet to describe your closeness style. Answering the attachment questions gives a clearer picture, and this is not a judgment either way.',
    feelsLike: [],
    tryThis: [],
    watchFor: [],
  },
};

/**
 * @param {string} style one of secure | anxious | avoidant | mixed | unknown
 * @returns {{style: string, title: string, plain: string, feelsLike: string[], tryThis: string[], watchFor: string[]}}
 */
export function attachmentGuide(style) {
  const key = Object.prototype.hasOwnProperty.call(ATTACHMENT_GUIDES, style) ? style : 'unknown';
  const g = ATTACHMENT_GUIDES[key];
  return {
    style: key,
    title: g.title,
    plain: g.plain,
    feelsLike: [...g.feelsLike],
    tryThis: [...g.tryThis],
    watchFor: [...g.watchFor],
  };
}

// ---------- 2. Pattern exercises ----------

const GENERIC_EXERCISE = {
  title: 'Talk it through',
  why: 'Naming a difference out loud, while you are both calm, makes it easier to look at together.',
  steps: [
    'Pick a calm moment, not the middle of a disagreement',
    'Each person describes the situation in one or two sentences, starting with what they saw',
    'Each person says what they felt and what they hoped for',
    'Agree one small thing you will try this week, and check in on it next time',
  ],
  timeNeeded: '20 minutes',
};

// Keys are the construct titles used in insights.js (couple and friendship variants are aliased below).
const EXERCISES = {
  'Pursue-withdraw cycle': {
    title: 'Name the loop',
    why: 'When one person reaches and the other pulls back, each move makes the other feel more urgent.',
    steps: [
      'Draw the loop on paper: a worry, a check-in, a pull back, and a bigger check-in',
      'Each of you marks where you usually step in',
      'Agree a cheap reassurance that is easy to give on a busy day',
      'Agree a set time for a fuller talk, so space feels planned',
    ],
    timeNeeded: '20 minutes',
  },
  'Sarcasm spiral': {
    title: 'Say the feeling plainly',
    why: 'Jokes with an edge can hide hurt, and they make the other person feel small.',
    steps: [
      'Each of you names a recent remark that stung, without arguing about it',
      'Rephrase the feeling behind it in one plain sentence',
      'Agree a shared signal for when a joke has gone too far',
    ],
    timeNeeded: '10 minutes',
  },
  'Criticism and defensiveness loop': {
    title: 'Ask for the need, not the verdict',
    why: 'Criticism sounds like an attack on who someone is, and defensiveness answers with reasons. Naming the need breaks the loop.',
    steps: [
      'Each person writes one complaint as a request: "I would like..." instead of "You always..."',
      'Take turns reading them aloud, and the listener repeats back the need',
      'Notice one defensive reply you made, and say what you wanted to say instead',
    ],
    timeNeeded: '20 minutes',
  },
  'Freeze-out': {
    title: 'Agree a pause that comes back',
    why: 'Silence can feel like a verdict to one person and protection to the other. A shared pause makes it safe.',
    steps: [
      'Agree a phrase that means "I need a break, I will come back"',
      'Agree how long the break lasts, and who restarts the conversation',
      'Practise the phrase once on a low-stakes topic',
    ],
    timeNeeded: '10 minutes',
  },
  'Unrepaired hurt': {
    title: 'Reopen the last hurt, gently',
    why: 'Hurt that is never repaired returns in new arguments. A short, kind check-in can close it.',
    steps: [
      'Each person names one thing from the last argument that still feels unfinished',
      'Listen without fixing, and repeat back what you heard',
      'Agree what a repair looks like for each of you, such as an apology, a hug or a walk',
    ],
    timeNeeded: '20 minutes',
  },
  'Different cool-down clocks': {
    title: 'Agree a cool-down time',
    why: 'If one person needs an hour and the other needs a day, each can feel ignored. A shared clock makes both needs count.',
    steps: [
      'Each of you says roughly how long you need to feel like yourself again',
      'Agree a maximum pause and a time to return to the topic',
      'Decide how you will let the other know you are not ready yet',
    ],
    timeNeeded: '10 minutes',
  },
  'Who decides': {
    title: 'Map the decisions',
    why: 'Hidden decision rules cause more friction than the decisions themselves.',
    steps: [
      'List three recent decisions you made together',
      'Mark who led each one and how it felt',
      'Agree which kinds of decision each of you leads, and which you decide together',
    ],
    timeNeeded: '20 minutes',
  },
  'Final say': {
    title: 'Set a tie-break rule',
    why: 'When neither person can give way, a deadlock feels personal. A rule set in advance keeps it about the choice.',
    steps: [
      'List the areas where you each want the final say',
      'For each area, agree a tie-break: a deadline, a coin, a trial period or a rotation',
      'Agree when you will review the rule',
    ],
    timeNeeded: '20 minutes',
  },
  'Saver and spender': {
    title: 'Name what money means',
    why: 'Saving and spending are often learned habits tied to safety or freedom. Naming the meaning makes the gap easier to talk about.',
    steps: [
      'Each of you finishes: "Money makes me feel..."',
      'Share what money meant in your family growing up',
      'Agree one shared goal, and one personal spending area with no questions asked',
    ],
    timeNeeded: '20 minutes',
  },
  'Whose money is whose': {
    title: 'Design the money structure',
    why: 'The structure matters less than what each person needs it to protect, such as security or independence.',
    steps: [
      'Each of you says what you need your money setup to protect',
      'Sketch three options: fully shared, partly shared, or separate with a shared pot',
      'Pick one to try for a month, then review it together',
    ],
    timeNeeded: '20 minutes',
  },
  'Debt comfort gap': {
    title: 'Name the feeling behind the number',
    why: 'Comfort with debt is often about feeling safe, not about the amount. Naming the feeling lets you judge a plan on the same terms.',
    steps: [
      'Each of you rates your comfort with debt from 1 to 10, and says why',
      'Name the one thing that would make a debt plan feel safe to you',
      'Agree what you would need to see before deciding on any debt',
    ],
    timeNeeded: '20 minutes',
  },
  'Different body clocks': {
    title: 'Plan around the timing',
    why: 'A morning person and a night person can both be right. Timing is easier to plan around than to argue about.',
    steps: [
      'Each of you marks your best hours on a simple week chart',
      'Find one overlap for a real conversation each week',
      'Agree how to handle the early or late routines without resentment',
    ],
    timeNeeded: '10 minutes',
  },
  'Mess tolerance': {
    title: 'Mark the spaces that matter',
    why: 'Different levels of order can turn into a running score. Naming the few spaces that matter most keeps the rest relaxed.',
    steps: [
      'Each of you names the two spaces that need to feel in order to relax',
      'Agree what "clean enough" means for each of them',
      'Let the rest be shared without comment for a week',
    ],
    timeNeeded: '10 minutes',
  },
  'Planning versus spontaneity': {
    title: 'Keep one plan and one open block',
    why: 'One person may want a plan while the other wants room to drift. Both can have a place.',
    steps: [
      'Each of you describes your ideal free weekend in one sentence',
      'Agree one planned activity and one open block each weekend',
      'Review after two weekends and adjust the balance',
    ],
    timeNeeded: '10 minutes',
  },
  'Alone time needs': {
    title: 'Plan alone time on purpose',
    why: 'Time alone is easier to accept when it is planned, rather than read as a message about the relationship.',
    steps: [
      'Each of you says how much time alone you need in a normal week',
      'Put those blocks in the shared calendar',
      'Agree how to say "I need some time" without it sounding like a door closing',
    ],
    timeNeeded: '10 minutes',
  },
  'Social calendar': {
    title: 'Agree a rhythm for friends',
    why: 'Different ideas of how often to see friends can quietly strain both social lives.',
    steps: [
      'Each of you names how often you want to see friends as a couple, and alone',
      'Agree one number, and a way to flex it when plans change',
      'Choose which plans matter most to each of you',
    ],
    timeNeeded: '10 minutes',
  },
  'Bids missed': {
    title: 'Name the small bids',
    why: 'A bid is a small moment of reaching out, such as a comment or a touch. They are easy to miss when you are each speaking a different language of care.',
    steps: [
      'Each of you names one small thing that makes you feel cared for',
      'Each of you names one small gesture that has not landed the way you hoped',
      'Agree to try the other person\'s gesture for a week and notice the result',
    ],
    timeNeeded: '10 minutes',
  },
  'Touch gap': {
    title: 'Make touch a clear choice',
    why: 'Different amounts of physical closeness can feel like rejection if they are never discussed. Naming it keeps it from becoming a score.',
    steps: [
      'Each of you describes how much touch helps you feel connected on an ordinary day',
      'Name one kind of touch that feels good, and one that feels like too much',
      'Agree a simple way to ask for or decline touch without explanation',
    ],
    timeNeeded: '10 minutes',
  },
  'Big-topic disagreement': {
    title: 'Separate the topics you share from the ones you respect as different',
    why: 'Disagreeing on big values does not have to break a relationship, as long as it is named and kept respectful.',
    steps: [
      'Each of you lists three big topics that matter most to you',
      'Mark which ones you want to explore together and which you will respect as different',
      'Agree how you will talk about a disagreement without trying to win it',
    ],
    timeNeeded: '20 minutes',
  },
  'Different priorities for five years': {
    title: 'Put the priorities side by side',
    why: 'A difference in priorities becomes a problem when one keeps losing without a conversation. Seeing them together helps find a step that serves both.',
    steps: [
      'Each of you lists your top three priorities for the next five years',
      'Look for any shared item, and any item that clearly needs the other to give something up',
      'Agree one small step this year that moves both priorities forward',
    ],
    timeNeeded: '20 minutes',
  },
  'Family closeness': {
    title: 'Agree what enough looks like',
    why: 'Different levels of family involvement are easier to handle when both people know what counts as enough.',
    steps: [
      'Each of you describes how often you would like to see each other\'s families',
      'Agree what would feel comfortable for each of you',
      'Agree who handles which family moment, and how to say no kindly',
    ],
    timeNeeded: '20 minutes',
  },
  'Children timeline': {
    title: 'Give the question its own conversation',
    why: 'Children are a large, emotional decision. Talking about it directly, early and without a deadline on the feeling, is the kindest start.',
    steps: [
      'Each of you describes what you picture in the next five years, in one sentence',
      'Name the feeling behind your answer, such as excitement, worry or uncertainty',
      'Agree when you will come back to the question, and what you will need to know first',
    ],
    timeNeeded: '20 minutes',
  },
  'Where to live': {
    title: 'List the needs before the places',
    why: 'Moving for each other can feel like a sacrifice. A shared list of needs makes the decision easier to make together.',
    steps: [
      'Each of you lists three things you need from a place to live',
      'Mark which needs are shared and which are personal',
      'Agree a rough date for a decision, and what information you need by then',
    ],
    timeNeeded: '20 minutes',
  },
  'When to raise it': {
    title: 'Agree a good moment for hard topics',
    why: 'A hard topic raised at the wrong moment feels like an attack. A shared rule for timing protects both people.',
    steps: [
      'Each of you names a time of day or situation when you are most open to hard talks',
      'Agree a simple phrase that means "not now, but let us talk later"',
      'Agree a time when the topic will be picked up again',
    ],
    timeNeeded: '10 minutes',
  },
  'Non-negotiable mismatch': {
    title: 'Name the line and the reason behind it',
    why: 'A non-negotiable is a firm need. Understanding why it matters to each person turns a dead end into a conversation.',
    steps: [
      'Each of you names your non-negotiable in one sentence',
      'Each of you says what it protects for you',
      'Look together for any option that protects the same thing for both of you',
    ],
    timeNeeded: '20 minutes',
  },
  'Secrets and loyalty': {
    title: 'Agree what stays between you',
    why: 'Loyalty means different things to different people. Agreeing what is private and what is shared avoids quiet hurt.',
    steps: [
      'Each of you names one kind of thing you would want kept private',
      'Each of you names one kind of thing you would want to be told about',
      'Agree how you will handle a secret that feels hard to keep',
    ],
    timeNeeded: '20 minutes',
  },
  'Cancelled plans': {
    title: 'Agree how to cancel kindly',
    why: 'A cancelled plan can feel like a message about the relationship. Agreeing how to handle it keeps the meaning clear.',
    steps: [
      'Each of you says how you would like to hear about a cancellation',
      'Agree how much notice counts as enough',
      'Agree one way to reschedule so the plan does not disappear',
    ],
    timeNeeded: '10 minutes',
  },
  'Different ideas of support': {
    title: 'Ask before you fix or listen',
    why: 'Support that looks like practical help to one person can feel like distance to another.',
    steps: [
      'Each of you describes what you need first when you are struggling: company, practical help or space',
      'Share one example of support that landed well, and one that missed',
      'Agree a quick question to ask in a hard moment, such as "Do you want advice or a listener?"',
    ],
    timeNeeded: '10 minutes',
  },
  'Different ideas of fun': {
    title: 'Trade one favourite plan each',
    why: 'Fun that only one person enjoys can feel like an obligation. Trading favourites gives both people a turn.',
    steps: [
      'Each of you names your favourite kind of fun in one sentence',
      'Plan one activity from each list for the next month',
      'Afterwards, each of you says one thing you enjoyed about the other\'s choice',
    ],
    timeNeeded: '10 minutes',
  },
};

// Friendship titles that share an exercise with a couple construct.
const EXERCISE_ALIASES = {
  'reassurance and space': 'Pursue-withdraw cycle',
  'sharp remarks': 'Sarcasm spiral',
  'going quiet together': 'Freeze-out',
  'unrepaired falling-out': 'Unrepaired hurt',
};

const EXERCISE_LOOKUP = (() => {
  const map = new Map();
  for (const key of Object.keys(EXERCISES)) map.set(key.toLowerCase(), key);
  for (const [alias, target] of Object.entries(EXERCISE_ALIASES)) map.set(alias, target);
  return map;
})();

function resolveExerciseKey(constructKey) {
  if (typeof constructKey !== 'string') return null;
  const text = constructKey.trim().toLowerCase();
  if (!text) return null;
  if (EXERCISE_LOOKUP.has(text)) return EXERCISE_LOOKUP.get(text);
  // Long construct strings from insights.js (e.g. "Anxious-avoidant pursue-withdraw cycle (...)")
  // contain the short title. Prefer the longest title found inside the string.
  let best = null;
  for (const [alias, target] of EXERCISE_LOOKUP) {
    if (text.includes(alias) && (!best || alias.length > best.alias.length)) best = { alias, target };
  }
  return best ? best.target : null;
}

/**
 * @param {string} constructKey a construct title (e.g. 'Sarcasm spiral') or a longer construct string
 * @returns {{title: string, why: string, steps: string[], timeNeeded: string}}
 */
export function patternExercise(constructKey) {
  const key = resolveExerciseKey(constructKey);
  const e = key ? EXERCISES[key] : GENERIC_EXERCISE;
  return {
    title: e.title,
    why: e.why,
    steps: [...e.steps],
    timeNeeded: e.timeNeeded,
  };
}

// ---------- 3. Reflection prompt ----------

/**
 * @param {{kind?: 'couple'|'friendship', topFight?: string|null, strongestArea?: string|null}} [context]
 * @returns {{question: string, why: string}}
 */
export function reflectionPrompt(context) {
  const ctx = context && typeof context === 'object' ? context : {};
  const friendship = ctx.kind === 'friendship';
  const fight = typeof ctx.topFight === 'string' && ctx.topFight.trim() ? ctx.topFight.trim() : null;
  const area = typeof ctx.strongestArea === 'string' && ctx.strongestArea.trim() ? ctx.strongestArea.trim() : null;

  if (fight) {
    return {
      question: friendship
        ? `When "${fight}" comes up with a friend, what helps you feel heard?`
        : `When "${fight}" comes up, what is one thing you wish the other person understood about you?`,
      why: 'Starting from a real tension keeps the reflection specific, and it stays kind to both of you.',
    };
  }
  if (area) {
    return {
      question: friendship
        ? `What about ${area.toLowerCase()} feels most natural with the people you are closest to?`
        : `What about ${area.toLowerCase()} feels most natural to you, and how could you keep it going?`,
      why: 'Naming what already works gives you something solid to build on.',
    };
  }
  return {
    question: friendship
      ? 'What is one thing you value most about how you and your friend look after each other?'
      : 'What is one thing you value most about how you two look after each other?',
    why: 'A warm, open question invites a real answer rather than a score.',
  };
}

// ---------- 4. Personal patterns across connections ----------

function normalizeLabel(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * @param {Array<{partnerName?: string, kind?: string, fights?: string[], strongestAreas?: string[]}>} history
 * @returns {Array<{title: string, text: string, evidence: number}>}
 */
export function personalPatterns(history) {
  if (!Array.isArray(history)) return [];

  // label -> { label, connections: Set, order }
  const seen = new Map();
  let order = 0;

  history.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') return;
    const name = normalizeLabel(entry.partnerName).toLowerCase();
    const kind = normalizeLabel(entry.kind).toLowerCase();
    // The same person and kind counts as one connection, even if summarised twice.
    const connectionId = name ? `${kind}:${name}` : `index:${index}`;

    const items = [
      ...(Array.isArray(entry.fights) ? entry.fights : []),
      ...(Array.isArray(entry.strongestAreas) ? entry.strongestAreas : []),
    ];
    for (const raw of items) {
      const label = normalizeLabel(raw);
      if (!label) continue;
      const k = label.toLowerCase();
      if (!seen.has(k)) seen.set(k, { label, connections: new Set(), order: order++ });
      seen.get(k).connections.add(connectionId);
    }
  });

  return [...seen.values()]
    .filter((p) => p.connections.size >= 2)
    .sort((a, b) => b.connections.size - a.connections.size || a.order - b.order)
    .slice(0, 4)
    .map((p) => ({
      title: `Recurring: ${p.label}`,
      text: `In more than one connection, ${p.label.toLowerCase()} came up. That may be worth looking at in yourself.`,
      evidence: p.connections.size,
    }));
}

// ---------- 5. Copy safety net ----------

const FLAGGED = /\b(diagnosis|disorder|narcissis\w*|toxic|abus\w*|borderline|personality disorder)\b/i;

/**
 * Appends a caution line when the text uses a clinical or loaded word. Otherwise returns the text unchanged.
 * @param {string} text
 * @returns {string}
 */
export function diagnosisGuard(text) {
  if (typeof text !== 'string') return text === null || text === undefined ? '' : text;
  if (!FLAGGED.test(text)) return text;
  if (text.includes(CAUTION_LINE)) return text;
  return `${text}\n\n${CAUTION_LINE}`;
}

// ---------- 6. Glossary ----------

export const GLOSSARY = {
  'attachment style':
    'The way you tend to look for closeness and handle space in relationships, learned early and open to change.',
  'pursue-withdraw':
    'A common loop where one person reaches for closeness while the other steps back, and each move makes the other push harder.',
  'bids':
    'Small everyday moments of reaching out, such as a comment, a question or a touch, and the response they get.',
  'repair':
    'Any small move that says "we are still on the same side" during or after a disagreement, such as an apology or a joke that lands.',
  'flooding':
    'A state where the body is so stirred up by conflict that it becomes hard to listen or think clearly, and a break helps.',
  'chronotype':
    'Your natural daily rhythm, such as being a morning person or a night person.',
  'moral foundations':
    'The broad values people tend to weigh, such as care, fairness, loyalty and respect for tradition, which can differ between people.',
  'need for closure':
    'How much you want a clear answer now rather than staying open, which affects how you feel about decisions that drag on.',
  'money scripts':
    'Beliefs about money learned early in life, such as that money means security or that it is bad to talk about it.',
};
