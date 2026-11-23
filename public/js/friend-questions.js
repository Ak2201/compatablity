// Friendship question bank: DRAFT for psychologist review. Not final.
//
// Same item schema as questions.js:
//   id         stable key stored in answers, prefixed 'fr.' (never reuse or renumber)
//   dimension  key into FRIEND_DIMENSIONS
//   text       what the person sees
//   type       'likert'      1-5 agree scale
//              'scale'       1-5 scale with low/high endpoint labels
//              'choice'      pick one of `options`
//              'dealbreaker' Yes / No only (flagged for conversation, never auto-rejected)
//              'text'        open reflection, saved but not scored
//   options    for 'choice' and 'dealbreaker': [{ value, label }]
//   low/high   for 'scale': endpoint labels
//   source     'draft' for now
//
// Thinking items carry their facet in the id: fr.think.<facet>.<n>, where facet is one of
// closure | evidence | openness | flexibility. friend-psychology.js reads it from there.
//
// `rule` on each dimension is documentation for the reviewer; scoring is in friend-psychology.js.

import { YES_NO } from './questions.js';

export const FRIEND_DIMENSIONS = {
  thinking:      { title: 'Thinking style',         area: 'Thinking',       rule: 'similarity',    blurb: 'How you reason, decide and handle uncertainty.' },
  values:        { title: 'Values',                 area: 'Values',         rule: 'similarity',    blurb: 'What you consider right, fair and good.' },
  trust:         { title: 'Trust & loyalty',        area: 'Trust',          rule: 'similarity',    blurb: 'Loyalty, confidences, reliability and how close you like to feel.' },
  boundaries:    { title: 'Boundaries',             area: 'Boundaries',     rule: 'complementary', blurb: 'Time alone, money, opinions on partners and family, and how often you meet.' },
  conflict:      { title: 'Disagreements',          area: 'Conflict',       rule: 'conflict',      blurb: 'What happens when you disagree, and how you come back together.' },
  support:       { title: 'Support',                area: 'Support',        rule: 'complementary', blurb: 'How you show up when a friend is struggling.' },
  fun:           { title: 'Fun & play',             area: 'Fun',            rule: 'similarity',    blurb: 'Humour, shared activities and how adventurous you like to be.' },
  communication: { title: 'Communication',          area: 'Communication',  rule: 'complementary', blurb: 'How deep you like to talk, how often you like to be in touch, and how directly you speak.' },
  ambition:      { title: 'Ambition & direction',   area: 'Ambition',       rule: 'similarity',    blurb: 'Career, what success means, and how much risk you are comfortable with.' },
  reflection:    { title: 'Reflection',             area: 'Answer these too', rule: 'none',        blurb: 'Open questions. Shared only after the reveal.' },
};

// Shorthand builders keep the bank readable.
const likert = (id, dimension, text) => ({ id, dimension, type: 'likert', text, source: 'draft' });
const scale = (id, dimension, text, low, high) => ({ id, dimension, type: 'scale', text, low, high, source: 'draft' });
const choice = (id, dimension, text, options) => ({ id, dimension, type: 'choice', text, options, source: 'draft' });
const dealbreaker = (id, dimension, text) => ({ id, dimension, type: 'dealbreaker', text, options: YES_NO, source: 'draft' });
const text = (id, prompt) => ({ id, dimension: 'reflection', type: 'text', text: prompt, source: 'draft' });

export const FRIEND_QUESTIONS = [
  // ---- Thinking style (9) — similarity. Facet is in the id. ----
  likert('fr.think.closure.1', 'thinking', 'I like to reach a clear answer quickly, even before I have every detail.'),
  scale('fr.think.closure.2', 'thinking', 'When a question is still open, how much does it bother you?', 'Hardly at all', 'It keeps nagging at me'),
  likert('fr.think.closure.3', 'thinking', 'Not knowing how something will turn out makes me restless.'),
  scale('fr.think.evidence.1', 'thinking', 'When you decide something important, what do you lean on most?', 'My gut feeling', 'Facts and evidence'),
  likert('fr.think.evidence.2', 'thinking', 'I want to see the reasons behind a claim before I accept it.'),
  likert('fr.think.openness.1', 'thinking', 'I enjoy hearing ideas that challenge how I already see things.'),
  scale('fr.think.openness.2', 'thinking', 'How easily do you change your mind after a good conversation?', 'Rarely, I stick to my view', 'Often, if the argument is good'),
  scale('fr.think.flexibility.1', 'thinking', 'When you make plans with friends, how do you like them?', 'Set well in advance', 'Decided on the day'),
  likert('fr.think.flexibility.2', 'thinking', 'I am happy to change a plan once it is made, if something better comes up.'),

  // ---- Values (9) — similarity. Moral foundations, honesty, what a good person does. ----
  likert('fr.values.care', 'values', 'Being kind to people who are struggling matters a lot to me.'),
  likert('fr.values.fairness', 'values', 'Fairness matters to me, even when it costs me something.'),
  likert('fr.values.loyalty', 'values', 'Standing by my people matters more to me than staying neutral in a dispute.'),
  likert('fr.values.authority', 'values', 'Respect for rules, traditions and people in authority matters to me.'),
  likert('fr.values.purity', 'values', 'Doing things the right way matters to me, even when no one would notice.'),
  likert('fr.values.honesty.1', 'values', 'I would rather a friend told me a hard truth than a comfortable lie.'),
  scale('fr.values.honesty.2', 'values', 'When a friend asks what I really think, I usually:', 'Soften it or dodge it', 'Tell them straight'),
  choice('fr.values.good', 'values', 'A good person, most of all, is someone who:', [
    { value: 'keeps_word', label: 'Keeps their word' },
    { value: 'kind', label: 'Is kind to people in need' },
    { value: 'stands_up', label: 'Stands up for what is right' },
    { value: 'humble', label: 'Admits when they are wrong' },
  ]),
  dealbreaker('fr.values.dealbreaker.cruelty', 'values', 'Would a friend who is routinely unkind to other people be a dealbreaker for you?'),

  // ---- Trust & loyalty (11) — similarity. Four closeness/reassurance items feed the attachment block. ----
  likert('fr.trust.loyal', 'trust', 'I stay loyal to a friend even when others criticise them.'),
  likert('fr.trust.secrets', 'trust', 'A friend can count on me to keep their private news to myself.'),
  scale('fr.trust.reliable', 'trust', 'When a friend cancels plans at the last minute, you feel:', 'Fine, things happen', 'Let down, even if they apologise'),
  likert('fr.trust.absent', 'trust', 'I speak well of my friends when they are not in the room.'),
  choice('fr.trust.breaks', 'trust', 'Which would damage your trust in a friend most?', [
    { value: 'secret', label: 'Sharing something private I told them' },
    { value: 'lie', label: 'Lying to me' },
    { value: 'flaky', label: 'Repeatedly letting me down' },
    { value: 'gossip', label: 'Talking badly about me behind my back' },
    { value: 'silent', label: 'Going silent without explanation' },
  ]),
  likert('fr.trust.att_reassure', 'trust', 'I need regular reassurance that a close friend still values me.'),
  likert('fr.trust.att_worry', 'trust', 'I sometimes worry that a close friend is pulling away from me.'),
  likert('fr.trust.att_space', 'trust', 'I need a good amount of space, even from my closest friends.'),
  likert('fr.trust.att_depend', 'trust', 'Leaning on a close friend for emotional support feels uncomfortable to me.'),
  dealbreaker('fr.trust.dealbreaker.confidence', 'trust', 'Would a friend repeating something you told them in confidence be a dealbreaker?'),
  dealbreaker('fr.trust.dealbreaker.lying', 'trust', 'Would a friend lying to your face about something important be a dealbreaker?'),

  // ---- Boundaries (8) — complementary. ----
  scale('fr.boundaries.alone', 'boundaries', 'How much time on your own do you need between seeing friends?', 'Very little', 'A good amount'),
  choice('fr.boundaries.lend', 'boundaries', 'If a friend asks to borrow a larger sum of money, you would usually:', [
    { value: 'lend', label: 'Lend it if I can comfortably afford it' },
    { value: 'gift', label: 'Only give it if I am happy never to see it back' },
    { value: 'no', label: 'Say no politely' },
    { value: 'depends', label: 'Depends on the friend and the reason' },
  ]),
  scale('fr.boundaries.partners', 'boundaries', 'How much do you share honest opinions about a friend’s partner?', 'I keep them to myself', 'I say what I think'),
  choice('fr.boundaries.family', 'boundaries', 'How much do you want to hear about each other’s families?', [
    { value: 'lots', label: 'Lots, I like the detail' },
    { value: 'some', label: 'Some, the main points' },
    { value: 'little', label: 'Very little' },
    { value: 'depends', label: 'It depends on the family' },
  ]),
  scale('fr.boundaries.frequency', 'boundaries', 'How often would you like to see each other in person?', 'A few times a year', 'Most weeks'),
  scale('fr.boundaries.digital', 'boundaries', 'How quickly do you expect replies to messages?', 'Whenever suits', 'Within a few hours'),
  likert('fr.boundaries.no', 'boundaries', 'I can turn down a friend’s invitation without explaining why.'),
  dealbreaker('fr.boundaries.dealbreaker.money', 'boundaries', 'Would a friend who borrows money and never pays it back be a dealbreaker for you?'),

  // ---- Disagreements (8) — conflict. Sharp moments and repair. ----
  choice('fr.conflict.disagree', 'conflict', 'When you disagree with a friend, you usually:', [
    { value: 'talk', label: 'Talk it through until it is sorted' },
    { value: 'break', label: 'Need a break before we can talk' },
    { value: 'quiet', label: 'Go quiet and wait' },
    { value: 'joke', label: 'Lighten it with humour' },
  ]),
  likert('fr.conflict.repair', 'conflict', 'After a falling-out, I usually reach out within a few days.'),
  likert('fr.conflict.apology', 'conflict', 'I can say sorry without needing the other person to go first.'),
  likert('fr.conflict.gentle', 'conflict', 'I can raise a concern with a friend kindly, without making it about who they are.'),
  likert('fr.conflict.criticism', 'conflict', 'When I am upset, I criticise the person rather than the problem.'),
  likert('fr.conflict.sarcasm', 'conflict', 'When I am annoyed, I use sarcasm or a mocking tone.'),
  likert('fr.conflict.defensive', 'conflict', 'When I am criticised, my first instinct is to explain why I am not at fault.'),
  likert('fr.conflict.withdraw', 'conflict', 'When a disagreement gets heated, I go quiet and pull away.'),

  // ---- Support (6) — complementary, plus perceived responsiveness. ----
  choice('fr.support.crisis', 'support', 'When a friend is going through something hard, you usually:', [
    { value: 'practical', label: 'Offer practical help' },
    { value: 'listen', label: 'Listen and let them talk' },
    { value: 'distract', label: 'Take them out for a distraction' },
    { value: 'advice', label: 'Offer advice on what to do' },
    { value: 'wait', label: 'Wait until they ask' },
  ]),
  scale('fr.support.style', 'support', 'What helps you most when you are struggling?', 'A practical plan', 'Someone just listening'),
  scale('fr.support.stay', 'support', 'When a friend struggles for months, how do you stay close?', 'I give space and check in now and then', 'I stay close for as long as it takes'),
  likert('fr.support.notice', 'support', 'I notice quickly when a friend is struggling, even when they say they are fine.'),
  likert('fr.support.respond', 'support', 'I reply to a friend in a hard moment within a day.'),
  likert('fr.support.ask', 'support', 'I am comfortable asking a friend for help when I need it.'),

  // ---- Fun & play (6) — similarity. ----
  choice('fr.fun.humour', 'fun', 'Which kind of humour do you enjoy most?', [
    { value: 'silly', label: 'Silly and playful' },
    { value: 'dry', label: 'Dry and understated' },
    { value: 'witty', label: 'Quick and witty' },
    { value: 'dark', label: 'Dark and cynical' },
    { value: 'warm', label: 'Warm and gentle' },
  ]),
  choice('fr.fun.activities', 'fun', 'What do you most like doing with a friend?', [
    { value: 'food', label: 'Eating or cooking together' },
    { value: 'outdoors', label: 'Walks, hikes or being outside' },
    { value: 'culture', label: 'Shows, music or exhibitions' },
    { value: 'home', label: 'Staying in, talking and games' },
  ]),
  scale('fr.fun.adventure', 'fun', 'How do you feel about trying something new together?', 'Let’s stick to what we know', 'Let’s try something new every time'),
  scale('fr.fun.teasing', 'fun', 'How much teasing between friends do you enjoy?', 'Very little', 'Plenty, I dish it out too'),
  likert('fr.fun.laugh', 'fun', 'I want a friend I can laugh with a lot.'),
  likert('fr.fun.spontaneous', 'fun', 'A spontaneous plan is usually more fun than a planned one.'),

  // ---- Communication (6) — complementary. ----
  scale('fr.comm.depth', 'communication', 'How deep do you like your conversations with friends to go?', 'Light and everyday', 'Deep and personal'),
  scale('fr.comm.contact', 'communication', 'How often would you like to be in touch between visits?', 'Now and then', 'Most days'),
  choice('fr.comm.feelings', 'communication', 'When you feel something strongly about a friend, you usually:', [
    { value: 'say', label: 'Say it directly' },
    { value: 'hint', label: 'Hint at it and hope they notice' },
    { value: 'write', label: 'Write it down first' },
    { value: 'show', label: 'Show it through actions' },
  ]),
  scale('fr.comm.direct', 'communication', 'How direct do you like feedback to be?', 'Gentle and indirect', 'Blunt and straight'),
  likert('fr.comm.open', 'communication', 'I am comfortable sharing how I am really feeling with a close friend.'),
  likert('fr.comm.listen', 'communication', 'I listen to understand a friend before I respond.'),

  // ---- Ambition & direction (6) — similarity. ----
  choice('fr.ambition.success', 'ambition', 'What does success mean to you most?', [
    { value: 'money', label: 'Financial security' },
    { value: 'impact', label: 'Making a difference' },
    { value: 'craft', label: 'Mastery in what I do' },
    { value: 'freedom', label: 'Time and freedom' },
    { value: 'family', label: 'A good home and family' },
  ]),
  scale('fr.ambition.risk', 'ambition', 'When it comes to career or money risks, you are:', 'Cautious', 'Bold'),
  likert('fr.ambition.drive', 'ambition', 'I want to keep growing in my work and in my life.'),
  likert('fr.ambition.settle', 'ambition', 'A steady, settled life matters more to me than constant progress.'),
  likert('fr.ambition.career', 'ambition', 'My work is a big part of how I see myself.'),
  scale('fr.ambition.direction', 'ambition', 'How much do you want the next few years to change your life?', 'Keep things much as they are', 'Make big changes'),

  // ---- Reflection (6) — open text, shared only after the reveal. ----
  text('fr.ref.need', 'What do you need most from a friend right now?'),
  text('fr.ref.safe', 'What makes you feel safe with someone?'),
  text('fr.ref.forgive', 'What do you find hard to forgive in a friend?'),
  text('fr.ref.good', 'What does a good friendship look like to you?'),
  text('fr.ref.hope', 'What do you hope this friendship gives you?'),
  text('fr.ref.know', 'What would you like your friend to know about you?'),
];

const RULES = new Set(['similarity', 'complementary', 'conflict', 'attachment', 'dealbreaker', 'none']);
const TYPES = new Set(['likert', 'scale', 'choice', 'dealbreaker', 'text']);

// Sanity checks (run in dev/ tests): unique ids, known dimensions, valid shapes.
// Throws on the first problem, like validateQuestions in questions.js. Returns the item count.
export function validateFriendQuestions(list = FRIEND_QUESTIONS) {
  for (const key of Object.keys(FRIEND_DIMENSIONS)) {
    const d = FRIEND_DIMENSIONS[key];
    if (!d.title || !d.area || !d.blurb) throw new Error(`dimension missing title, area or blurb: ${key}`);
    if (!RULES.has(d.rule)) throw new Error(`unknown rule for dimension ${key}: ${d.rule}`);
  }
  const seen = new Set();
  for (const q of list) {
    if (!q || typeof q.id !== 'string' || !q.id.startsWith('fr.')) throw new Error(`id must start with fr.: ${q && q.id}`);
    if (seen.has(q.id)) throw new Error(`duplicate question id: ${q.id}`);
    seen.add(q.id);
    if (!FRIEND_DIMENSIONS[q.dimension]) throw new Error(`unknown dimension for ${q.id}`);
    if (!TYPES.has(q.type)) throw new Error(`unknown type for ${q.id}`);
    if (typeof q.text !== 'string' || !q.text.trim()) throw new Error(`missing text: ${q.id}`);
    if (q.type === 'choice') {
      if (!Array.isArray(q.options) || q.options.length < 2) throw new Error(`choice needs options: ${q.id}`);
      const values = new Set(q.options.map((o) => o.value));
      if (values.size !== q.options.length) throw new Error(`duplicate choice values: ${q.id}`);
    }
    if (q.type === 'dealbreaker' && (!Array.isArray(q.options) || q.options.length !== 2)) {
      throw new Error(`dealbreaker needs Yes/No options: ${q.id}`);
    }
    if (q.type === 'scale' && (!q.low || !q.high)) throw new Error(`scale needs low and high labels: ${q.id}`);
    if (q.type === 'text' && q.dimension !== 'reflection') throw new Error(`text items belong in reflection: ${q.id}`);
    if (q.type !== 'text' && q.dimension === 'reflection') throw new Error(`only text items belong in reflection: ${q.id}`);
  }
  return list.length;
}
