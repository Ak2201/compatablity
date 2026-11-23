// Insight engine for the couple and friendship reports. DRAFT for psychologist review.
//
// buildInsights(mine, theirs, report, opts) takes two answer objects keyed by question id
// (missing keys = unanswered), the report from computeReport or computeFriendshipReport,
// and opts { kind: 'couple' | 'friendship', myName, partnerName }. It returns:
//   summary, profile, fightForecast, strengths, bids, conversationDeck, cautionNote.
//
// Pure functions. No DOM, no fetch, no side effects. Bad or missing input never throws.
//
// Psychological constructs used (only these):
//   Gottman's Four Horsemen (criticism, contempt, defensiveness, stonewalling)
//   Anxious-avoidant pursue-withdraw cycle (attachment theory, Levine and Heller framing)
//   Gottman's bids for connection
//   Chapman's five languages (expressions of care, not proven types)
//   Money scripts (Klontz)
//   Decision-making style
//   Need for closure
//   Emotional flooding and cool-down time (Gottman)
//   Planning versus spontaneity
//   Chronotype (morning versus night)
//   Conflict over differing values and beliefs (moral foundations)
//   Repair attempts
//
// Likelihood scale (all fights): severity >= 75 likely, 50-74 possible, below 50 low.

import { QUESTIONS } from './questions.js';
import { FRIEND_QUESTIONS } from './friend-questions.js';

// ---------------------------------------------------------------------------
// Ids and banks
// ---------------------------------------------------------------------------

// Shared rules read ids through this map, so the same psychology applies to both kinds.
const COUPLE_IDS = {
  anxious: ['att.worry', 'att.reassure', 'att.jealous'],
  avoidant: ['att.depend', 'att.distance', 'att.indep'],
  criticism: 'con.criticism',
  contempt: 'con.contempt',
  defensive: 'con.defensive',
  stonewall: 'con.stonewall',
  repair: 'con.repair',
};

const FRIEND_IDS = {
  anxious: ['fr.trust.att_worry', 'fr.trust.att_reassure'],
  avoidant: ['fr.trust.att_depend', 'fr.trust.att_space'],
  criticism: 'fr.conflict.criticism',
  contempt: 'fr.conflict.sarcasm',
  defensive: 'fr.conflict.defensive',
  stonewall: 'fr.conflict.withdraw',
  repair: 'fr.conflict.repair',
};

// Dealbreaker ids come from the banks, so a new dealbreaker item is picked up automatically.
const DEALBREAKERS = {
  couple: QUESTIONS.filter((q) => q.type === 'dealbreaker'),
  friendship: FRIEND_QUESTIONS.filter((q) => q.type === 'dealbreaker'),
};

const CARE_LABELS = {
  words: 'Words of affirmation',
  acts: 'Acts of service',
  time: 'Quality time',
  touch: 'Physical touch',
  gifts: 'Gifts',
};

const SUPPORT_LABELS = {
  practical: 'Practical help',
  listen: 'Listening',
};

// Choice items scored onto the 1-5 scale for the pace axis (quick = fast).
const PACE_MAP = { quick: 5, gut: 4, research: 2, talk: 1 };

// Profile axes. Each item is 1-5 (or a mapped choice). rev flips it (6 - v) so that a higher
// axis value always means more of the named quality. Scores are mean of answered items,
// mapped to 0-100 with 1 -> 0 and 5 -> 100.
const COUPLE_AXES = [
  // Closeness: comfort with closeness, need for touch, appetite for check-ins.
  { key: 'closeness', label: 'Closeness', items: [{ id: 'att.comfort' }, { id: 'aff.touch_need' }, { id: 'comm.checkin' }] },
  // Independence: need for time alone, self-reliance, urge to pull back when close.
  { key: 'independence', label: 'Independence', items: [{ id: 'soc.alone_time' }, { id: 'att.indep' }, { id: 'att.distance' }] },
  // Structure: routine, planning ahead, a tidy home to relax in.
  { key: 'structure', label: 'Structure (planning)', items: [{ id: 'life.routine' }, { id: 'dec.plan' }, { id: 'life.tidy' }] },
  // Expressiveness: saying how you feel and wanting to share the day.
  { key: 'expressiveness', label: 'Expressiveness (sharing feelings)', items: [{ id: 'comm.open' }, { id: 'aff.expressive' }, { id: 'comm.evening_talk' }] },
  // Conflict tolerance: staying gentle, taking a timeout, repairing; low stonewalling and contempt.
  { key: 'conflict_tolerance', label: 'Conflict tolerance', items: [
    { id: 'con.gentle' }, { id: 'con.timeout' }, { id: 'con.repair' },
    { id: 'con.stonewall', rev: true }, { id: 'con.contempt', rev: true },
  ] },
  // Pace: how quickly you decide, commit and take risks.
  { key: 'pace', label: 'Pace', items: [
    { id: 'dec.style', map: PACE_MAP }, { id: 'dec.risk' }, { id: 'dec.plan', rev: true },
  ] },
];

const FRIEND_AXES = [
  // Closeness: how often you want to meet and be in touch, and how much reassurance you need.
  { key: 'closeness', label: 'Closeness', items: [{ id: 'fr.boundaries.frequency' }, { id: 'fr.comm.contact' }, { id: 'fr.trust.att_reassure' }] },
  // Independence: time alone between visits, need for personal space, ease of saying no.
  { key: 'independence', label: 'Independence', items: [{ id: 'fr.boundaries.alone' }, { id: 'fr.trust.att_space' }, { id: 'fr.boundaries.no' }] },
  // Structure: plans set in advance and sticking to them (reversed: deciding on the day and spontaneity score low).
  { key: 'structure', label: 'Structure (planning)', items: [
    { id: 'fr.think.flexibility.1', rev: true }, { id: 'fr.think.flexibility.2', rev: true }, { id: 'fr.fun.spontaneous', rev: true },
  ] },
  // Expressiveness: comfort sharing feelings, depth of talk, asking for help.
  { key: 'expressiveness', label: 'Expressiveness (sharing feelings)', items: [{ id: 'fr.comm.open' }, { id: 'fr.comm.depth' }, { id: 'fr.support.ask' }] },
  // Conflict tolerance: gentle start, quick apology, repair; low sarcasm and withdrawal (reversed).
  { key: 'conflict_tolerance', label: 'Conflict tolerance', items: [
    { id: 'fr.conflict.gentle' }, { id: 'fr.conflict.apology' }, { id: 'fr.conflict.repair' },
    { id: 'fr.conflict.sarcasm', rev: true }, { id: 'fr.conflict.withdraw', rev: true },
  ] },
  // Pace: quick answers, appetite for risk, appetite for big change.
  { key: 'pace', label: 'Pace', items: [{ id: 'fr.think.closure.1' }, { id: 'fr.ambition.risk' }, { id: 'fr.ambition.direction' }] },
];

// Fill-in cards used only after the fights and area prompts run out.
const TEMPLATE_CARDS = [
  { question: 'What is one thing I could do this week that would make you feel more looked after?', why: 'A small, specific request is easier to act on than a general wish.' },
  { question: 'When you are stressed, what do you need from me first: company, practical help or space?', why: 'Knowing the first move under stress makes support land more often.' },
  { question: 'What did you learn about disagreement growing up, and how does that show up for you now?', why: 'Naming where a habit started makes it easier to talk about without blame.' },
  { question: 'Which of our differences do you find interesting, and which do you find hard?', why: 'Separating curiosity from strain keeps a difference from turning into a verdict.' },
  { question: 'What does a good repair look like to you after a falling-out?', why: 'A repair attempt only works when both people recognise it as one.' },
  { question: 'What is one thing you wish I understood about how you recharge?', why: 'Recharge needs are a common, quiet source of friction.' },
  { question: 'How would you like us to check in about how things are going, and how often?', why: 'Agreeing a rhythm turns a vague worry into a plan.' },
  { question: 'What would you like more of from me in the next month?', why: 'An open, forward-looking question invites a concrete answer rather than a complaint.' },
];

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function obj(x) {
  return x && typeof x === 'object' && !Array.isArray(x) ? x : {};
}

// 1-5 answers, numbers or numeric strings. Anything else is unanswered.
function num(x) {
  const n = typeof x === 'string' && x.trim() !== '' ? Number(x) : x;
  return typeof n === 'number' && Number.isFinite(n) && n >= 1 && n <= 5 ? n : null;
}

function str(x) {
  return typeof x === 'string' && x !== '' ? x : null;
}

function mean(xs) {
  const v = xs.filter((x) => typeof x === 'number');
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
}

function to100(m) {
  return m === null ? null : Math.round(((m - 1) / 4) * 100);
}

const atLeast = (v, n) => v !== null && v >= n;
const atMost = (v, n) => v !== null && v <= n;

function hasKey(map, key) {
  return key !== null && Object.prototype.hasOwnProperty.call(map, key);
}

function label(map, key, fallback) {
  return hasKey(map, key) ? map[key] : fallback;
}

// Replace {me} and {them} with names, then capitalise the first letter.
// Copy uses "{me} may ..." so it reads the same for "you" and for a name.
function fill(s, names) {
  const out = String(s)
    .replace(/\{me\}/g, () => names.me)
    .replace(/\{them\}/g, () => names.them);
  return out.charAt(0).toUpperCase() + out.slice(1);
}

function likelihoodFor(severity) {
  if (severity >= 75) return 'likely';
  if (severity >= 50) return 'possible';
  return 'low';
}

function makeCtx(mine, theirs, opts) {
  const o = obj(opts);
  const friendship = o.kind === 'friendship';
  const me = str(o.myName) || 'you';
  const them = str(o.partnerName) || (friendship ? 'your friend' : 'your partner');
  return {
    friendship,
    A: obj(mine),
    B: obj(theirs),
    names: { me, them },
    ids: friendship ? FRIEND_IDS : COUPLE_IDS,
  };
}

// Reads for one id on each side.
const nA = (c, id) => num(c.A[id]);
const nB = (c, id) => num(c.B[id]);
const sA = (c, id) => str(c.A[id]);
const sB = (c, id) => str(c.B[id]);

function gapN(c, id) {
  const a = nA(c, id);
  const b = nB(c, id);
  return a === null || b === null ? null : Math.abs(a - b);
}

// Both sides answered a choice or dealbreaker and the answers differ.
function differs(c, id) {
  const a = sA(c, id);
  const b = sB(c, id);
  return a !== null && b !== null && a !== b;
}

// Ids that at least one side answered, so sourceIds only names real answers.
function answeredIds(c, ids) {
  return ids.filter((id) => c.A[id] !== undefined || c.B[id] !== undefined);
}

// ---------------------------------------------------------------------------
// Fight spec helpers
// ---------------------------------------------------------------------------

// Every rule returns either null (did not fire) or a spec. finalize() fills names and sets likelihood.
function finalize(spec, c) {
  const f = (s) => fill(s, c.names);
  return {
    id: spec.id,
    title: spec.title,
    severity: spec.severity,
    likelihood: likelihoodFor(spec.severity),
    trigger: f(spec.trigger),
    pattern: f(spec.pattern),
    psychology: { construct: spec.construct, why: f(spec.why) },
    earlySigns: spec.earlySigns.map(f),
    badDay: { mine: f(spec.badDay.mine), theirs: f(spec.badDay.theirs) },
    repair: spec.repair.map(f),
    conversation: f(spec.conversation),
    sourceIds: spec.sourceIds,
  };
}

// ---------------------------------------------------------------------------
// Shared rules (couple and friendship read different ids through c.ids)
// ---------------------------------------------------------------------------

// Anxious-avoidant pursue-withdraw cycle (attachment theory, Levine and Heller framing).
// One person's anxious items (worry, reassurance, jealousy in the couple version; worry,
// reassurance in the friendship version) average at least 3.25, and the other's avoidant
// items (depend, distance, independence; depend, space) average at least 3.25.
// Anxious people tend to reach for reassurance; avoidant people tend to pull back to steady
// themselves. Each move makes the other's need louder, so the cycle feeds itself.
// Attachment is a tendency, not a fixed type, and neither style is a flaw.
function styleOf(c, side, ids) {
  const src = side === 'A' ? c.A : c.B;
  const anx = mean(ids.anxious.map((id) => num(src[id])));
  const avo = mean(ids.avoidant.map((id) => num(src[id])));
  return { anxious: atLeast(anx, 3.25), avoidant: atLeast(avo, 3.25) };
}

function pursueWithdrawRule(c) {
  const a = styleOf(c, 'A', c.ids);
  const b = styleOf(c, 'B', c.ids);
  const fires = (a.anxious && b.avoidant) || (b.anxious && a.avoidant);
  if (!fires) return null;

  const anxText = (who) => `${who} may reach for reassurance more often, and feel a sharp sting when a reply or a plan is slow.`;
  const avoText = (who) => `${who} may pull back to steady down, which can look like distance from the outside.`;
  const genText = (who) => `${who} may want to talk things through when a close moment feels uncertain.`;
  const textFor = (st, who) => (st.anxious ? anxText(who) : st.avoidant ? avoText(who) : genText(who));

  return {
    id: 'pursue-withdraw',
    title: c.friendship ? 'Reassurance and space' : 'Pursue-withdraw cycle',
    severity: 85,
    trigger: 'A small worry comes up, such as a late reply or a quiet evening, and one of you wants to check in while the other wants room.',
    pattern: 'The anxious one reaches for reassurance, the avoidant one pulls back to feel steady, and the pulling back looks like not caring. So the first person reaches harder and the cycle tightens.',
    construct: 'Anxious-avoidant pursue-withdraw cycle (attachment theory, Levine and Heller framing)',
    why: 'Your answers suggest one of you leans toward needing reassurance and the other toward needing space. In this framing neither style is a flaw; each one simply makes the other person\'s need feel more urgent.',
    earlySigns: [
      'One of you asks "are we okay?" more than once in a day',
      'The other suddenly needs a quiet evening or a longer gap before replying',
      'Small comments start to carry a bigger meaning than they did an hour ago',
    ],
    badDay: { mine: textFor(a, '{me}'), theirs: textFor(b, '{them}') },
    repair: [
      'Name the cycle out loud when you are both calm: "When one of us pulls in, the other pulls closer, and we both end up alone."',
      'Agree one small, cheap reassurance, such as a short message on a busy day',
      'Agree a set time for a proper talk, so space feels planned rather than like a door closing',
    ],
    conversation: 'Can we talk about what closeness looks like on an ordinary day, so that when one of us needs space or reassurance, we both know it is not a verdict on us?',
    sourceIds: answeredIds(c, [...c.ids.anxious, ...c.ids.avoidant]),
  };
}

// Gottman's Four Horsemen: contempt. Sarcasm, eye-rolling and mockery say the other person is
// beneath you. Gottman's research linked contempt most strongly with breakdown among the four.
// A score of 4 or more from either person flags it.
function contemptRule(c) {
  const id = c.ids.contempt;
  if (!(atLeast(nA(c, id), 4) || atLeast(nB(c, id), 4))) return null;
  return {
    id: 'contempt',
    title: c.friendship ? 'Sharp remarks' : 'Sarcasm spiral',
    severity: 80,
    trigger: 'A small annoyance, like a forgotten task or a late arrival, comes back as a remark with an edge.',
    pattern: 'Sarcasm and eye-rolling signal that one person has stopped feeling respected. The other hears the tone before the content, so the argument moves from the problem to the person.',
    construct: "Gottman's Four Horsemen: contempt",
    why: 'Contempt is the Horseman Gottman\'s research linked most closely with breakdown, so it is worth catching early, before it becomes a habit in both directions.',
    earlySigns: [
      'A joke lands with an edge and nobody laughs',
      'Eye-rolling or a mocking voice shows up in the middle of a sentence',
      'Someone says "fine" in a tone that means it is not fine',
    ],
    badDay: {
      mine: '{me} may use sarcasm to sound light when hurt, without meaning it to land so hard.',
      theirs: '{them} may take the edge personally and stop listening to the point.',
    },
    repair: [
      'Swap the sarcasm for one plain sentence: "I feel dismissed when that happens."',
      'Agree a signal, such as a raised hand, that means "that came out sharp, let me try again"',
      'Before a joke with an edge, ask whether you would say it to someone you respect.',
    ],
    conversation: 'When something stings, can we agree to say the feeling plainly rather than use a joke with an edge?',
    sourceIds: answeredIds(c, [id]),
  };
}

// Gottman's Four Horsemen: criticism and defensiveness. Criticism attacks the person ("you
// always..."); defensiveness answers with reasons why it is not your fault. Each reply
// confirms the other's sense of being attacked. Fires when criticism is 4 or more from either
// person and defensiveness is 4 or more from either person (the loop can be cross-partner).
function criticismLoopRule(c) {
  const crit = c.ids.criticism;
  const def = c.ids.defensive;
  const critHigh = atLeast(nA(c, crit), 4) || atLeast(nB(c, crit), 4);
  const defHigh = atLeast(nA(c, def), 4) || atLeast(nB(c, def), 4);
  if (!(critHigh && defHigh)) return null;
  return {
    id: 'criticism-defensiveness',
    title: 'Criticism and defensiveness loop',
    severity: 75,
    trigger: 'A complaint about a habit comes out as a sentence about character, and the reply is a list of reasons.',
    pattern: 'Criticism invites defence, and defence confirms the criticism. Gottman described defensiveness as a response to feeling blamed, so it usually grows out of the criticism rather than starting the fight.',
    construct: "Gottman's Four Horsemen: criticism and defensiveness",
    why: 'Both Horsemen show up in your answers, and each one tends to feed the other. Naming the loop is easier than trying to win the argument inside it.',
    earlySigns: [
      'A sentence starts with "you always" or "you never"',
      'The first reply is a list of reasons it was not my fault',
      'Both of you raise your voice on the same point again',
    ],
    badDay: {
      mine: '{me} may open with a sharp complaint when stressed, using the big words rather than the specific thing.',
      theirs: '{them} may explain and defend first, feeling blamed before the point has been heard.',
    },
    repair: [
      'Start with one specific, recent example and one feeling: "When the bill was late, I felt anxious."',
      'When criticised, try a softer first reply: "Tell me more about what bothered you."',
      'Agree that each of you names one thing you contributed before explaining your side.',
    ],
    conversation: 'Can we try starting with what happened and how it felt, rather than what kind of person the other one is?',
    sourceIds: answeredIds(c, [crit, def]),
  };
}

// Gottman's Four Horsemen: stonewalling, with emotional flooding. Both people score 4 or more on
// withdrawing or going silent during a heated moment. Gottman linked stonewalling with a body
// that is flooded, so the silence is often protection rather than indifference.
function stonewallRule(c) {
  const id = c.ids.stonewall;
  if (!(atLeast(nA(c, id), 4) && atLeast(nB(c, id), 4))) return null;
  return {
    id: 'stonewall',
    title: c.friendship ? 'Going quiet together' : 'Freeze-out',
    severity: 70,
    trigger: 'A heated talk reaches a point where both of you feel overwhelmed and stop responding.',
    pattern: 'When both people go silent, nothing gets repaired, and each silence reads as a verdict. Because a flooded body finds listening hard, the silence is often protection, not indifference.',
    construct: "Gottman's Four Horsemen: stonewalling, with emotional flooding",
    why: 'You both score high on going quiet, so a pause in a fight can easily become a long freeze that neither of you meant to start.',
    earlySigns: [
      'Replies get shorter and then stop',
      'Someone leaves the room without saying where they are going',
      'A "fine" that ends the conversation instead of settling it',
    ],
    badDay: {
      mine: '{me} may go silent when things heat up, to stop saying something sharp.',
      theirs: '{them} may go silent too, and wait for the other one to come back first.',
    },
    repair: [
      'Agree a pause rule: "I need twenty minutes, and I will come back to this."',
      'Name the silence as it happens: "I am flooded, and I am not leaving you."',
      'Return to the topic within a set time, even if the first answer is short.',
    ],
    conversation: 'When we get too heated, can we agree on a pause we both come back from, so silence never means we have given up?',
    sourceIds: answeredIds(c, [id]),
  };
}

// Repair attempts (Gottman). Either person scores 2 or less on quick repair after a fight, so
// the hurt tends to stay in the background. Repair attempts, even clumsy ones, are a large part
// of what keeps conflict from hardening.
function unrepairedRule(c) {
  const id = c.ids.repair;
  if (!(atMost(nA(c, id), 2) || atMost(nB(c, id), 2))) return null;
  const quietText = (who) => `${who} may wait for the other to make the first move, and keep score quietly.`;
  const quickText = (who) => `${who} may move on quickly and miss that the other is still hurt.`;
  return {
    id: 'unrepaired',
    title: c.friendship ? 'Unrepaired falling-out' : 'Unrepaired hurt',
    severity: 65,
    trigger: 'After an argument ends, neither person makes the small move back, so the hurt sits in the background.',
    pattern: 'Without a repair attempt, the last sharp moment becomes the story. Old hurt then returns in new arguments.',
    construct: 'Repair attempts (Gottman)',
    why: 'Repair attempts are the small moves that say "we are still on the same side" in the middle of a fight. Fewer of them means more unfinished hurt.',
    earlySigns: [
      'Politeness the next morning that feels like distance',
      'Old arguments come back during new ones',
      'One person waits for an apology the other thinks has already been given',
    ],
    badDay: {
      mine: atMost(nA(c, id), 2) ? quietText('{me}') : quickText('{me}'),
      theirs: atMost(nB(c, id), 2) ? quietText('{them}') : quickText('{them}'),
    },
    repair: [
      'Agree a short phrase that means "I want to fix this", and use it within a day of a fight',
      'Use one small gesture after a fight, such as a cup of tea, a text or a hug, before the big talk',
      'Ask once: "Is there anything still sitting with you from our last argument?"',
    ],
    conversation: 'Is there anything from our last argument that still feels unfinished for you?',
    sourceIds: answeredIds(c, [id]),
  };
}

// ---------------------------------------------------------------------------
// Couple-only rules
// ---------------------------------------------------------------------------

// Emotional flooding and cool-down time (Gottman). The two people differ by 3 or more on how long
// it takes to feel normal after an argument (1 = minutes, 5 = a day or more). Gottman described
// flooding as a physical state that makes listening hard, so timing matters as much as words.
function coupleCoolDownRule(c) {
  const d = gapN(c, 'con.recover');
  if (!atLeast(d, 3)) return null;
  const quick = (who) => `${who} may push to talk again soon, and read the quiet as unfinished business.`;
  const slow = (who) => `${who} may need a long time before talking, and feel rushed when asked too early.`;
  const mineQuick = atMost(nA(c, 'con.recover'), 2);
  return {
    id: 'cool-down-clocks',
    title: 'Different cool-down clocks',
    severity: 60,
    trigger: 'One of you is ready to talk again within the hour, while the other still needs most of a day.',
    pattern: 'When one person is ready and the other is still flooded, the ready one pushes for a talk and the other shuts down. Each reads the other\'s pace as a judgement.',
    construct: 'Emotional flooding and cool-down time (Gottman)',
    why: 'Your recovery times are far apart. Gottman found flooded people struggle to hear, so a cool-down agreed in advance protects the conversation.',
    earlySigns: [
      'One of you asks to talk again while the other is still short with replies',
      'Someone says "I am fine" in a clipped tone',
      'The talk restarts before either of you has cooled off',
    ],
    badDay: {
      mine: mineQuick ? quick('{me}') : slow('{me}'),
      theirs: mineQuick ? slow('{them}') : quick('{them}'),
    },
    repair: [
      'Agree a cool-down length, such as thirty minutes or until the next morning, and a time to come back',
      'Say how much time you need in plain words: "I need two hours, and then I want to talk."',
      'Use a time-out signal that is not a door closing.',
    ],
    conversation: 'How long does it usually take you to feel like yourself after a fight, and what helps you come back?',
    sourceIds: answeredIds(c, ['con.recover']),
  };
}

// Decision-making style. The two people pick different styles for big decisions (quick, research,
// talk it through, gut). Each can read the other as rushing or stalling, so the style itself
// needs agreeing.
function decisionStyleRule(c) {
  if (!differs(c, 'dec.style')) return null;
  return {
    id: 'decision-style',
    title: 'Who decides',
    severity: 55,
    trigger: 'A shared choice, such as a booking, a purchase or a move, lands on the table with no agreed way to make it.',
    pattern: 'One of you wants to move quickly and adjust later, the other wants to research or talk it through first. Each can read the other as rushing or as stalling.',
    construct: 'Decision-making style',
    why: 'Your answers on how you decide differ. Making the style explicit turns a hidden disagreement into a plan.',
    earlySigns: [
      'One of you has already booked or ordered while the other is still reading',
      'A decision gets made by default and the other hears about it afterwards',
      'The talk about a choice goes round without an end',
    ],
    badDay: {
      mine: '{me} may decide quickly to end the uncertainty, and then feel the other was left out.',
      theirs: '{them} may want more time, and feel pushed when a choice is made without them.',
    },
    repair: [
      'Agree a decision style for each kind of choice: small, big, and money',
      'Set a date for deciding, so the talk has an end',
      'Ask: "What would make this feel decided well for you?"',
    ],
    conversation: 'For the next big choice, can we agree how we want to decide together, and by when?',
    sourceIds: answeredIds(c, ['dec.style']),
  };
}

// Need for closure, applied to decision-making. Fires when one person strongly wants a final say
// (4 or more) and the other strongly rejects it (2 or less). A need for closure makes a stalemate
// uncomfortable; a tiebreak that feels unfair makes it worse.
function finalSayRule(c) {
  const a = nA(c, 'dec.final');
  const b = nB(c, 'dec.final');
  const fires = (atLeast(a, 4) && atMost(b, 2)) || (atMost(a, 2) && atLeast(b, 4));
  if (!fires) return null;
  const wantsSay = (who) => `${who} may want a clear answer, and feel stuck when a decision keeps being put off.`;
  const dislikesSay = (who) => `${who} may feel outvoted by a tiebreak, and dig in harder.`;
  return {
    id: 'final-say',
    title: 'Final say',
    severity: 55,
    trigger: 'You reach a deadlock on something that matters, and there is no agreed way to break the tie.',
    pattern: 'A need for closure pushes one of you toward a deciding voice, while the other sees a tiebreak as unfair. Without a rule, every deadlock becomes a test of who gives way.',
    construct: 'Need for closure, applied to decision-making',
    why: 'Your answers on who has the final say pull in opposite directions, so a deadlock is likely to feel personal unless you set a rule.',
    earlySigns: [
      'A stalemate where one of you says "just decide"',
      'Someone starts to make the choice alone to end the talk',
      'Quiet resentment after a decision one of you did not want',
    ],
    badDay: {
      mine: atLeast(a, 4) ? wantsSay('{me}') : dislikesSay('{me}'),
      theirs: atLeast(b, 4) ? wantsSay('{them}') : dislikesSay('{them}'),
    },
    repair: [
      'Agree a tiebreak rule for certain areas, and keep the rest as shared decisions',
      'Let the person most affected by a decision have the first say on it',
      'Revisit the rule once a year, so it does not become a power test',
    ],
    conversation: 'When we cannot agree, how would we like to break the tie, and which areas should that apply to?',
    sourceIds: answeredIds(c, ['dec.final']),
  };
}

// Money scripts (Klontz). Saving is a money script: some people feel safe when they save and
// some feel alive when they spend. A gap of 3 or more on the saving scale is a common source of
// friction over small everyday treats.
function saverSpenderRule(c) {
  const d = gapN(c, 'money.saving');
  if (!atLeast(d, 3)) return null;
  const saverText = (who) => `${who} may feel uneasy when money goes out, and turn a treat into a reason to worry.`;
  const spenderText = (who) => `${who} may see saving as joyless, and push for a treat to keep the weekend feeling good.`;
  const saver = (side) => (side >= 3 ? saverText : spenderText);
  const a = nA(c, 'money.saving');
  const b = nB(c, 'money.saving');
  return {
    id: 'saver-spender',
    title: 'Saver and spender',
    severity: 60,
    trigger: 'A small spend, such as a takeaway or a weekend away, comes up, and the two of you read it differently.',
    pattern: 'Money scripts shape how much future security and present enjoyment each feel is worth. A saver may see a spend as a risk, and a spender may see saving as a cost to the present. Each can feel judged for being the way they are.',
    construct: 'Money scripts (Klontz)',
    why: 'Your answers on saving sit far apart. Klontz\'s money scripts suggest these are learned habits, so the friction is about meaning, not about the amount.',
    earlySigns: [
      'One of you checks the balance before a small treat and the other does not',
      'A purchase gets described as "just this once" by both of you',
      'Money talk goes quiet and then returns as a sharp comment',
    ],
    badDay: { mine: saver(a)('{me}'), theirs: saver(b)('{them}') },
    repair: [
      'Agree a "fun money" amount for each of you, so small treats need no permission',
      'Name what the saving is for, such as a deposit or a trip, so the saving has a face',
      'Share the story each of you learned about money growing up',
    ],
    conversation: 'What did money mean in your family growing up, and how does that show up in how we spend and save now?',
    sourceIds: answeredIds(c, ['money.saving']),
  };
}

// Money scripts (Klontz), on shared and separate finances. Different preferences for one account,
// shared plus personal, or separate accounts with shared bills. The difference is often about
// control and security more than the numbers.
function sharedMoneyRule(c) {
  if (!differs(c, 'money.shared')) return null;
  return {
    id: 'shared-money',
    title: 'Whose money is whose',
    severity: 50,
    trigger: 'The first shared bill or big purchase makes you ask who pays what, and whose money it really is.',
    pattern: 'Choosing one account, two, or separate accounts with shared bills changes how each person feels about control and fairness.',
    construct: 'Money scripts (Klontz), on shared and separate finances',
    why: 'You picked different structures for shared money. The structure matters less than agreeing what each of you needs it to protect.',
    earlySigns: [
      'Someone asks "should I check with you?" before a normal purchase',
      'Bills get paid by one person without a clear agreement',
      'The phrases "my money" or "your money" appear in a tense moment',
    ],
    badDay: {
      mine: '{me} may want more control over personal money, and feel exposed in a shared account.',
      theirs: '{them} may want everything seen together, and feel shut out when money is kept apart.',
    },
    repair: [
      'Agree how shared bills are split and how much personal money each keeps, then review it in three months',
      'Name what each of you wants money to protect, such as security, freedom or generosity',
      'Start with small decisions to build trust before the large ones',
    ],
    conversation: 'How would you like shared money to work for us, and what would make you feel both secure and free?',
    sourceIds: answeredIds(c, ['money.shared']),
  };
}

// Money scripts (Klontz), money avoidance. One person is uneasy about debt even when it is
// manageable (3 or more on the discomfort scale), and the other is relaxed. The gap shows up when
// a plan involves borrowing.
function debtGapRule(c) {
  const d = gapN(c, 'money.debt');
  if (!atLeast(d, 3)) return null;
  const uneasy = (who) => `${who} may see any debt as a threat, and push to clear it fast.`;
  const calm = (who) => `${who} may treat manageable debt as normal, and feel criticised when it is questioned.`;
  const a = nA(c, 'money.debt');
  return {
    id: 'debt-gap',
    title: 'Debt comfort gap',
    severity: 50,
    trigger: 'You talk about a loan, a card balance or student debt, and one of you is calm while the other is uneasy.',
    pattern: 'The person uneasy about debt may see every balance as a threat, while the other sees a tool. Both views are reasonable. The gap shows up when a plan involves borrowing and one person feels it was not discussed.',
    construct: 'Money scripts (Klontz), money avoidance',
    why: 'Your comfort with debt sits far apart. Naming the feeling behind the number helps both of you judge a plan on the same terms.',
    earlySigns: [
      'A loan or repayment plan is raised late and one person reacts strongly',
      'Concern about a balance gets described as nagging',
      'Plans that involve debt stall without anyone saying why',
    ],
    badDay: {
      mine: atLeast(a, 3) ? uneasy('{me}') : calm('{me}'),
      theirs: atLeast(nB(c, 'money.debt'), 3) ? uneasy('{them}') : calm('{them}'),
    },
    repair: [
      'Write the debt figures and repayment plan down, so both of you see the same numbers',
      'Agree one rule for taking on debt together, such as a joint decision above an agreed amount',
      'Talk about what being in debt would feel like to each of you, not only the sums',
    ],
    conversation: 'How do you feel about debt, really, and what would make a plan with debt feel safe to you?',
    sourceIds: answeredIds(c, ['money.debt']),
  };
}

// Chronotype (morning versus night). One of you is a morning person and the other a night person.
// Both can be fine alone and still feel out of step together, with the best time for a talk
// landing in the other's low point.
function bodyClockRule(c) {
  const a = sA(c, 'life.rhythm');
  const b = sB(c, 'life.rhythm');
  const fires = (a === 'morning' && b === 'night') || (a === 'night' && b === 'morning');
  if (!fires) return null;
  const early = (who) => `${who} may want an early night, and feel the evening was cut short.`;
  const late = (who) => `${who} may feel slow and short in the morning, and want to talk later.`;
  return {
    id: 'body-clocks',
    title: 'Different body clocks',
    severity: 45,
    trigger: 'One of you wants a long evening together while the other is fading, or one wants to start the day early while the other is only waking up.',
    pattern: 'Chronotype shapes when each person has energy and patience. A morning person and a night person can both be fine alone and still feel out of step, with the best time for a talk falling in the other\'s low point.',
    construct: 'Chronotype (morning versus night)',
    why: 'You are a morning person and a night person. That is a difference of timing, and timing is easier to plan around than to argue about.',
    earlySigns: [
      'An evening plan gets cut short by one person yawning',
      'Important talks happen at the wrong time of day for one of you',
      'Sleep schedules drift apart at weekends',
    ],
    badDay: {
      mine: a === 'morning' ? early('{me}') : late('{me}'),
      theirs: b === 'morning' ? early('{them}') : late('{them}'),
    },
    repair: [
      'Protect one overlap each day, such as a shared breakfast or a short walk',
      'Schedule the big talks for a time of day when you both have some energy',
      'Agree a weekend rhythm that suits both body clocks',
    ],
    conversation: 'When is each of us at our best for a real conversation, and how can we build that into the week?',
    sourceIds: answeredIds(c, ['life.rhythm']),
  };
}

// Planning versus spontaneity (structure and order). A gap of 3 or more on how tidy a home needs
// to be. Tidiness is less about the mess than about how much order someone needs to switch off.
function tidyRule(c) {
  const d = gapN(c, 'life.tidy');
  if (!atLeast(d, 3)) return null;
  const tidy = (who) => `${who} may not feel able to relax until things are back in place.`;
  const relaxed = (who) => `${who} may feel calm in a lived-in room, and not see why the other is bothered.`;
  const a = nA(c, 'life.tidy');
  return {
    id: 'mess-tolerance',
    title: 'Mess tolerance',
    severity: 40,
    trigger: 'A shared space, like the kitchen after dinner, is ready to relax in for one of you and not for the other.',
    pattern: 'Order matters differently to each of you. One person can feel the other is creating stress, and the other can feel the first one is being controlling.',
    construct: 'Planning versus spontaneity (structure and comfort with order)',
    why: 'You need different levels of order to relax. Naming the spaces that matter most lets the rest be shared without a running score.',
    earlySigns: [
      'A small pile becomes the subject of a sigh',
      'One of you tidies without being asked and the other notices',
      'Relaxing time gets interrupted by tidying',
    ],
    badDay: {
      mine: atLeast(a, 3) ? tidy('{me}') : relaxed('{me}'),
      theirs: atLeast(nB(c, 'life.tidy'), 3) ? tidy('{them}') : relaxed('{them}'),
    },
    repair: [
      'Name the spaces that matter most to each of you, and let the rest be shared',
      'Agree a simple reset, such as ten minutes before bed, rather than an open-ended clean',
      'Split the tidying by what each of you notices most',
    ],
    conversation: 'Which parts of the home need to feel in order for you to relax, and which can be fine as they are?',
    sourceIds: answeredIds(c, ['life.tidy']),
  };
}

// Planning versus spontaneity. A free weekend is spent differently: with plans, with one plan and
// the rest open, with no plans, or on chores. A planner feels secure with a schedule; a
// spontaneous person can feel boxed in by one.
function weekendRule(c) {
  if (!differs(c, 'life.weekend')) return null;
  const planner = (who) => `${who} may feel uneasy when a weekend has no shape, and push to fill it.`;
  const spont = (who) => `${who} may feel boxed in by a schedule, and resist it even when they wanted the plan.`;
  const style = (side) => (side === 'full_plan' || side === 'one_plan' ? planner : side === 'no_plan' ? spont : null);
  const generic = (who) => `${who} may want the weekend to feel like their kind of rest, and be surprised when it does not.`;
  const fnA = style(sA(c, 'life.weekend')) || generic;
  const fnB = style(sB(c, 'life.weekend')) || generic;
  return {
    id: 'weekend-planning',
    title: 'Planning versus spontaneity',
    severity: 45,
    trigger: 'Friday evening arrives and one of you has a plan while the other has none.',
    pattern: 'A planner feels secure with a schedule, while a spontaneous person can feel trapped by one. Neither style is wrong, but the difference often shows up as one person feeling managed and the other feeling bored.',
    construct: 'Planning versus spontaneity',
    why: 'You like free time to run differently. Keeping one plan and one open block each weekend lets both styles have a place.',
    earlySigns: [
      'One of you asks "what are we doing?" on the morning of a day off',
      'Plans get changed at the last minute and the other person sighs',
      'Downtime ends with a feeling that it was not used well',
    ],
    badDay: { mine: fnA('{me}'), theirs: fnB('{them}') },
    repair: [
      'Keep one plan and one open block each weekend, so both needs get met',
      'Agree a deadline for locking in plans, such as Thursday evening',
      'Let the more spontaneous one suggest one open thing each week',
    ],
    conversation: 'What does a free weekend look like when it feels good to you, and how much structure do you want?',
    sourceIds: answeredIds(c, ['life.weekend']),
  };
}

// Attachment theory: closeness versus autonomy. A gap of 3 or more on how much time alone each
// person needs each week. Solitude is a need, and treating it as a message about the relationship
// is what turns it into friction.
function aloneTimeRule(c) {
  const d = gapN(c, 'soc.alone_time');
  if (!atLeast(d, 3)) return null;
  const alone = (who) => `${who} may need a long stretch alone to feel like themselves, and go quiet when they have not had it.`;
  const company = (who) => `${who} may feel lonely with time alone, and fill the space with contact.`;
  const a = nA(c, 'soc.alone_time');
  return {
    id: 'alone-time',
    title: 'Alone time needs',
    severity: 50,
    trigger: 'A free evening arrives and one of you wants to be by yourself while the other wants company.',
    pattern: 'The person who needs more time alone can feel crowded, and the person who needs less can feel pushed out. Treating solitude as a need, rather than a message about the relationship, keeps it from turning into distance.',
    construct: 'Attachment theory: closeness versus autonomy',
    why: 'You need different amounts of time alone to feel like yourselves. Planning that time on purpose makes it less likely to be read as rejection.',
    earlySigns: [
      'One of you says "I need a bit of quiet" more often than before',
      'Time alone is taken personally',
      'The other starts asking why, rather than just saying okay',
    ],
    badDay: {
      mine: atLeast(a, 3) ? alone('{me}') : company('{me}'),
      theirs: atLeast(nB(c, 'soc.alone_time'), 3) ? alone('{them}') : company('{them}'),
    },
    repair: [
      'Set a standing block of alone time each week, written into the calendar',
      'Say what you will do with the time apart, so it does not feel like distance',
      'Check after a few weeks whether the amount still fits',
    ],
    conversation: 'How much time alone do we each need in a normal week, and how can we protect it without it feeling like a message?',
    sourceIds: answeredIds(c, ['soc.alone_time']),
  };
}

// Attachment theory: closeness versus autonomy, in shared social life. The couple differs on how
// often they want to see friends as a couple.
function socialCalendarRule(c) {
  if (!differs(c, 'soc.friends_couple')) return null;
  return {
    id: 'social-calendar',
    title: 'Social calendar',
    severity: 40,
    trigger: 'You plan a weekend, and one of you wants friends most weekends while the other would rather stay in.',
    pattern: 'How often a couple sees friends is a small but steady source of closeness. A mismatch can feel like one person pulling the other away from their people, or the other pulling the couple inward.',
    construct: 'Attachment theory: closeness versus autonomy',
    why: 'Your ideal rhythm for seeing friends differs. Agreeing a number and a way to flex it protects both of your social lives.',
    earlySigns: [
      'Invitations get turned down with a short reason and a sigh',
      'One of you makes plans without asking',
      'Friends start to notice the difference too',
    ],
    badDay: {
      mine: '{me} may feel that the couple is closing in, and push for more plans with friends.',
      theirs: '{them} may feel that time together is being used up, and quietly say no to plans.',
    },
    repair: [
      'Agree how many joint social plans a month suit you both, and keep the rest flexible',
      'Say which friends matter most to you as a couple',
      'Take turns choosing who the couple plans are with',
    ],
    conversation: 'How often do we each want to see friends as a couple, and which plans matter most to you?',
    sourceIds: answeredIds(c, ['soc.friends_couple']),
  };
}

// Gottman's bids for connection, read with Chapman's five languages as expressions of care (not
// fixed types). Fires when your "most cared for" answer differs. A small bid can be missed when
// it arrives in the other person's currency: a gift when they want time, for example.
function coupleBidsMissedRule(c) {
  if (!differs(c, 'aff.feel_cared')) return null;
  const a = label(CARE_LABELS, sA(c, 'aff.feel_cared'), 'a different way');
  const b = label(CARE_LABELS, sB(c, 'aff.feel_cared'), 'a different way');
  return {
    id: 'bids-missed',
    title: 'Bids missed',
    severity: 60,
    trigger: 'One of you offers a small sign of closeness, like a text, a question or a hand on the arm, and it passes unnoticed.',
    pattern: 'Gottman described bids as everyday attempts to connect. When care arrives in a different currency, such as a gift when the other wants time, the bid is real but lands as a miss. Neither person is wrong about what helps; they read the signal differently.',
    construct: "Gottman's bids for connection (Chapman's five languages, read as expressions of care)",
    why: `For {me} care lands most through ${a.toLowerCase()}, and for {them} through ${b.toLowerCase()}. That gap is the kind of thing bids can miss.`,
    earlySigns: [
      'A kind gesture gets a flat "thanks" and nothing more',
      'One of you says "you never notice" or "you never do that"',
      'A small bid is repeated louder before it lands',
    ],
    badDay: {
      mine: '{me} may keep offering care the way they like best, and feel unseen when it is not returned.',
      theirs: '{them} may miss the bid while busy, and not realise it was one.',
    },
    repair: [
      'Each name your top way to feel cared for, in plain words: time, touch, words, acts or gifts',
      'Practise noticing the other\'s bids, and reply with a short "I see you" even when you cannot do more',
      'Try one act of care a week in the other person\'s currency',
    ],
    conversation: 'What is one small thing I do that makes you feel cared for, and one that does not land the way I hoped?',
    sourceIds: answeredIds(c, ['aff.feel_cared']),
  };
}

// Chapman's five languages, read as expressions of care. A gap of 3 or more on how much physical
// affection each needs to feel close. Touch can be a main route to closeness for one person and a
// small extra for the other.
function touchGapRule(c) {
  const d = gapN(c, 'aff.touch_need');
  if (!atLeast(d, 3)) return null;
  const needs = (who) => `${who} may feel lonely without regular touch, and read a quiet evening as distance.`;
  const less = (who) => `${who} may feel pressed by affection, and pull back to keep things calm.`;
  const a = nA(c, 'aff.touch_need');
  return {
    id: 'touch-gap',
    title: 'Touch gap',
    severity: 45,
    trigger: 'The day ends and one of you wants a hug or a hand on the arm, while the other feels fine without.',
    pattern: 'Physical closeness can be a main way of feeling connected for one person and a small extra for the other. The gap can feel like rejection to the person who needs more, and like pressure to the person who needs less.',
    construct: "Chapman's five languages, read as expressions of care",
    why: 'You need different amounts of physical closeness to feel connected. Making touch a choice you both understand keeps it from turning into a score.',
    earlySigns: [
      'A hug or touch gets turned into a question',
      'The person who needs more feels rejected after a quiet evening',
      'Touch gets used to make up after a fight rather than as everyday closeness',
    ],
    badDay: {
      mine: atLeast(a, 3) ? needs('{me}') : less('{me}'),
      theirs: atLeast(nB(c, 'aff.touch_need'), 3) ? needs('{them}') : less('{them}'),
    },
    repair: [
      'Agree a simple daily touch that works for both, such as a hug at the door',
      'Ask before touching when you are unsure, and take a no without a sulk',
      'Keep touch separate from sex and from making up, so it reads as everyday closeness',
    ],
    conversation: 'How much physical closeness helps you feel connected on an ordinary day, and what would feel like too much?',
    sourceIds: answeredIds(c, ['aff.touch_need']),
  };
}

// Conflict over differing values and beliefs (moral foundations). A gap of 3 or more on how
// important it is to share views on big topics. Moral foundations research suggests people weigh
// care, fairness, loyalty, authority and purity differently, so one issue can feel obvious to one
// person and wrong to the other.
function bigTopicRule(c) {
  const d = gapN(c, 'val.shared_views');
  if (!atLeast(d, 3)) return null;
  return {
    id: 'big-topics',
    title: 'Big-topic disagreement',
    severity: 50,
    trigger: 'A news story, a family event or a question about faith brings up a big topic that you see differently.',
    pattern: 'Differences on big topics can strain a couple most when they feel like a judgement about character, not just a different view. The subject then gets avoided, and the avoidance feels heavy.',
    construct: 'Conflict over differing values and beliefs (moral foundations)',
    why: 'You differ on how much shared views matter. Agreeing which topics you explore together and which you respect as different keeps the bigger picture intact.',
    earlySigns: [
      'A debate starts at dinner and does not end',
      'One of you says "you cannot be serious" or something like it',
      'A subject gets avoided, and the avoidance feels heavy',
    ],
    badDay: {
      mine: '{me} may read a different view as a sign that values are not shared, and argue harder.',
      theirs: '{them} may feel big topics are not safe to bring up, and go quiet.',
    },
    repair: [
      'Agree which topics you want to explore together and which you will respect as different',
      'Ask what the other person cares about underneath their view',
      'Agree that a difference of view is not a verdict on character',
    ],
    conversation: 'Which big topics matter most to you, and which ones are we fine to see differently?',
    sourceIds: answeredIds(c, ['val.shared_views']),
  };
}

// Conflict over differing values (moral foundations), applied to priorities. The two people put
// different things first for the next five years.
function fiveYearsRule(c) {
  if (!differs(c, 'val.five_years')) return null;
  return {
    id: 'five-year-priorities',
    title: 'Different priorities for five years',
    severity: 40,
    trigger: 'You plan the next few years, and one of you puts security first while the other puts freedom or career first.',
    pattern: 'What you prioritise for the next five years shapes where money, time and attention go. A difference is normal; it becomes a problem when one priority keeps losing to the other without a conversation.',
    construct: 'Conflict over differing values and beliefs (moral foundations), applied to priorities',
    why: 'Your top priorities for the next five years differ. Naming them side by side makes it easier to find a step that serves both.',
    earlySigns: [
      'Plans keep being postponed for one person\'s goal',
      'Money and time choices start to feel like a contest',
      'A "someday" that only one of you talks about',
    ],
    badDay: {
      mine: '{me} may feel the plan is drifting from what matters most, and push harder for their priority.',
      theirs: '{them} may feel their priority is being left out, and go quiet about it.',
    },
    repair: [
      'Name each of your top priorities, and what it would look like in one year',
      'Find one step that serves both, such as saving for a trip and a home',
      'Agree a yearly check-in on how the priorities are feeling',
    ],
    conversation: 'If we had five good years together, what would you most want them to have given you?',
    sourceIds: answeredIds(c, ['val.five_years']),
  };
}

// Conflict over differing values (moral foundations: loyalty, authority). How involved families
// should be differs between you.
function familyRule(c) {
  if (!differs(c, 'val.families')) return null;
  return {
    id: 'family-closeness',
    title: 'Family closeness',
    severity: 45,
    trigger: 'A visit, a holiday or a phone call with family shows different expectations about how close and how often.',
    pattern: 'Family closeness touches loyalty and belonging. A partner who wants frequent family contact and one who wants space can each feel the other is choosing the wrong side. Expectations often need agreeing before the first big family event.',
    construct: 'Conflict over differing values and beliefs (moral foundations: loyalty and authority)',
    why: 'You want different levels of family involvement. Agreeing what counts as enough gives both of you a clear reference point.',
    earlySigns: [
      'Family plans are made without checking with the other',
      'One of you feels caught between loyalties',
      'Visits get shorter or more tense each time',
    ],
    badDay: {
      mine: '{me} may feel family ties should come first, and feel the other is pulling away.',
      theirs: '{them} may feel family has too much say, and resist plans made on their behalf.',
    },
    repair: [
      'Agree how often you want family contact, and what counts as enough',
      'Plan family events as a team, so neither of you feels managed',
      'Name a boundary you both respect, such as no surprise visits',
    ],
    conversation: 'How close do you each want us to be with each other\'s families, and what would feel comfortable for you?',
    sourceIds: answeredIds(c, ['val.families']),
  };
}

// Conflict over differing values, applied to life goals. Children is a life goal with a timeline.
// The fight fires when the want-children answers are 3 or more apart, or when the timing answers
// differ and one person has said "no". This is a flag for an honest talk, not a prediction.
function childrenRule(c) {
  const wantGap = gapN(c, 'goals.children');
  const whenA = sA(c, 'goals.children_when');
  const whenB = sB(c, 'goals.children_when');
  const whenClash = whenA !== null && whenB !== null && whenA !== whenB && (whenA === 'no' || whenB === 'no');
  if (!(atLeast(wantGap, 3) || whenClash)) return null;
  const wants = (who) => `${who} may feel the future is slipping away when the timeline keeps moving.`;
  const unsure = (who) => `${who} may feel pressure to decide, and feel the other is not listening.`;
  const a = nA(c, 'goals.children');
  return {
    id: 'children-timeline',
    title: 'Children timeline',
    severity: 90,
    trigger: 'Talk turns to the future, and one of you pictures children soon while the other pictures none, or later.',
    pattern: 'Children are a life goal with a timeline. When one partner wants them and the other does not, or the timing does not match, the difference is about the shape of the whole future rather than a detail. Compromise alone often does not settle it, so it needs an honest look.',
    construct: 'Conflict over differing values and beliefs (moral foundations), applied to life goals',
    why: 'Your answers on children are far enough apart that it is worth talking about directly, early and without a deadline on the feeling.',
    earlySigns: [
      'Talk about the future goes quiet when children come up',
      'One of you asks about the plan for "when" and the other changes the subject',
      'The timeline keeps being pushed out without a decision',
    ],
    badDay: {
      mine: atLeast(a, 4) ? wants('{me}') : unsure('{me}'),
      theirs: atLeast(nB(c, 'goals.children'), 4) ? wants('{them}') : unsure('{them}'),
    },
    repair: [
      'Each write your honest answer on paper, including "not sure", before the talk',
      'Talk about what would need to be true for a yes, and what a no would mean for the relationship',
      'Give this question its own conversation, and agree when you will come back to it',
    ],
    conversation: 'When we picture the next five years, do we both see children in them, and if so, when?',
    sourceIds: answeredIds(c, ['goals.children', 'goals.children_when']),
  };
}

// Need for closure, applied to a long unresolved decision. Willingness to move differs by 3 or
// more. A move can stay open for years, which is itself a source of tension for someone who needs
// closure.
function locationRule(c) {
  const d = gapN(c, 'goals.location');
  if (!atLeast(d, 3)) return null;
  const willing = (who) => `${who} may feel stuck when a move is not on the table, and see the other as holding them back.`;
  const unwilling = (who) => `${who} may feel a move is being pushed on them, and go quiet about it.`;
  const a = nA(c, 'goals.location');
  return {
    id: 'where-to-live',
    title: 'Where to live',
    severity: 55,
    trigger: 'A job offer, a family need or a city you both love brings up whether to move.',
    pattern: 'Willingness to move is tied to career, family and a sense of home. When one person is ready to go and the other is not, the decision can stay open for years, and an open question can be uncomfortable for someone who needs closure.',
    construct: 'Need for closure, applied to a long unresolved decision',
    why: 'You differ on how willing you are to move for each other. Giving the question a rough date and a shared list of needs makes it easier to decide.',
    earlySigns: [
      'Job or city news is shared without the other being asked first',
      'A move is "maybe one day" to one of you and "not a chance" to the other',
      'The decision keeps getting delayed',
    ],
    badDay: {
      mine: atLeast(a, 3) ? willing('{me}') : unwilling('{me}'),
      theirs: atLeast(nB(c, 'goals.location'), 3) ? willing('{them}') : unwilling('{them}'),
    },
    repair: [
      'Put a rough date on the question, so it does not stay open forever',
      'List what each of you would need to feel at home in a new place',
      'Look at the middle options, such as a trial period or remote work',
    ],
    conversation: 'If an opportunity came up in another city, what would you need to know before even considering it?',
    sourceIds: answeredIds(c, ['goals.location']),
  };
}

// Gottman's emotional flooding and cool-down time, applied to timing a complaint. One person
// raises a small irritation straight away; the other lets it go or waits until it has built up.
// Timing decides whether a complaint lands as information or as an attack.
function annoyanceTimingRule(c) {
  const a = sA(c, 'comm.annoyance');
  const b = sB(c, 'comm.annoyance');
  const fires = (a === 'straight' && b === 'let_go') || (a === 'let_go' && b === 'straight');
  if (!fires) return null;
  const straight = (who) => `${who} may raise a small complaint right away, and be surprised when it lands as an attack.`;
  const letGo = (who) => `${who} may hold things in until they feel large, and then bring them up all at once.`;
  return {
    id: 'raising-annoyance',
    title: 'When to raise it',
    severity: 45,
    trigger: 'Something small annoys one of you, and the other hears about it later, or not at all.',
    pattern: 'One person raises concerns the moment they arise, and the other waits until the feeling passes or the pattern repeats. The first can feel ambushed; the second can feel the build-up is unfair.',
    construct: "Gottman's emotional flooding and cool-down time (timing of a raised complaint)",
    why: 'You differ on when to raise an irritation. Agreeing a timing rule keeps small things small.',
    earlySigns: [
      'A small thing comes up as a big one, with "and another thing"',
      'The one who lets things go suddenly raises something from weeks ago',
      'Irritation shows up as silence rather than words',
    ],
    badDay: {
      mine: a === 'straight' ? straight('{me}') : letGo('{me}'),
      theirs: b === 'straight' ? straight('{them}') : letGo('{them}'),
    },
    repair: [
      'Agree that a small irritation can be raised within a day, in one sentence',
      'Use a soft start, such as "Can I mention something small that bothered me?"',
      'Agree when a pattern has repeated enough to deserve a proper talk',
    ],
    conversation: 'How do you each like small irritations raised, and how soon after they happen?',
    sourceIds: answeredIds(c, ['comm.annoyance']),
  };
}

// ---------------------------------------------------------------------------
// Friendship-only rules
// ---------------------------------------------------------------------------

// Emotional flooding and cool-down time, for friends. One person wants to talk through a
// disagreement and the other needs a break first.
function friendCoolDownRule(c) {
  const a = sA(c, 'fr.conflict.disagree');
  const b = sB(c, 'fr.conflict.disagree');
  const fires = (a === 'break' && b === 'talk') || (a === 'talk' && b === 'break');
  if (!fires) return null;
  const talker = (who) => `${who} may want to sort it out now, and read the need for a break as the friendship being left.`;
  const breaker = (who) => `${who} may need a break to think straight, and feel rushed when asked too early.`;
  return {
    id: 'friend-cool-down',
    title: 'Different cool-down clocks',
    severity: 60,
    trigger: 'A disagreement starts, and one of you wants to sort it out there and then while the other needs a break first.',
    pattern: 'When one friend is ready and the other is still flooded, the ready one presses on and the other shuts down. Each can read the other\'s pace as a judgement on the friendship.',
    construct: 'Emotional flooding and cool-down time (Gottman)',
    why: 'You differ on whether to talk straight away or take a break. Agreeing a cool-down in advance protects the talk when it comes.',
    earlySigns: [
      'One of you asks to talk again while the other is still short with replies',
      'A "fine, let us drop it" that is not really dropped',
      'The talk restarts before either of you has cooled off',
    ],
    badDay: {
      mine: a === 'talk' ? talker('{me}') : breaker('{me}'),
      theirs: b === 'talk' ? talker('{them}') : breaker('{them}'),
    },
    repair: [
      'Agree a break length, such as an hour or until the next day, and a time to come back',
      'Say the time you need in plain words: "I need a bit of space, then I want to talk."',
      'Pick a time-out signal that is not a slammed door',
    ],
    conversation: 'When we disagree, how long do you need before you can talk it through, and what helps you come back?',
    sourceIds: answeredIds(c, ['fr.conflict.disagree']),
  };
}

// Conflict over differing values, applied to loyalty and secrets. Loyalty or the "keep my private
// news private" items differ by 3 or more.
function secretsRule(c) {
  if (!(atLeast(gapN(c, 'fr.trust.loyal'), 3) || atLeast(gapN(c, 'fr.trust.secrets'), 3))) return null;
  return {
    id: 'secrets-loyalty',
    title: 'Secrets and loyalty',
    severity: 70,
    trigger: 'A friend shares something private, or talks about a third person, and you find you mean different things by keeping it safe.',
    pattern: 'Loyalty and confidences carry moral weight. Moral foundations research suggests people weigh loyalty differently, so one friend can read a shared story as a trust, and the other as something to pass on.',
    construct: 'Conflict over differing values and beliefs (moral foundations: loyalty)',
    why: 'Your answers on loyalty and keeping news private sit far apart, so the same moment can feel safe to one of you and careless to the other.',
    earlySigns: [
      'A story gets retold to a third person without a clear "this is private" first',
      'One of you says "I did not know that was a secret" after the fact',
      'Trust gets tested in small jokes about who said what',
    ],
    badDay: {
      mine: '{me} may keep private news very close, and feel exposed if a story travels.',
      theirs: '{them} may see sharing as a way of being close, and not notice what was meant to stay private.',
    },
    repair: [
      'Say out loud what counts as private for you, and what is fine to share',
      'When something personal is shared, ask "Can I talk about this, or should it stay between us?"',
      'Repair a slip with a direct conversation rather than a silent withdrawal',
    ],
    conversation: 'What does keeping a confidence mean to you, and what would make you feel someone had broken one?',
    sourceIds: answeredIds(c, ['fr.trust.loyal', 'fr.trust.secrets']),
  };
}

// Reliability. A friend cancels last minute, and the two of you feel very differently about it.
function cancelledPlansRule(c) {
  if (!atLeast(gapN(c, 'fr.trust.reliable'), 3)) return null;
  const fine = (who) => `${who} may shrug off a cancellation, and not see why the other is upset.`;
  const hurt = (who) => `${who} may feel let down by a cancellation even after an apology, and keep count.`;
  const a = nA(c, 'fr.trust.reliable');
  return {
    id: 'cancelled-plans',
    title: 'Cancelled plans',
    severity: 65,
    trigger: 'A plan falls through at the last minute, and one of you shrugs while the other feels let down.',
    pattern: 'Reliability is a signal of how much a friend matters. Attachment theory suggests people differ in how they read a missed plan, so the same cancellation can feel like "things happen" or like a sign of distance.',
    construct: 'Attachment theory: reassurance and reliability, in the anxious-avoidant framing',
    why: 'You feel very differently about last-minute changes. Agreeing what a cancellation should look like helps both of you feel respected.',
    earlySigns: [
      'Plans get cancelled and the reason sounds thinner each time',
      'One of you asks "are we still on?" more than once',
      'A cancelled plan becomes a joke that is not quite a joke',
    ],
    badDay: {
      mine: atLeast(a, 3) ? fine('{me}') : hurt('{me}'),
      theirs: atLeast(nB(c, 'fr.trust.reliable'), 3) ? fine('{them}') : hurt('{them}'),
    },
    repair: [
      'Agree how to cancel: a message as early as possible, and a new date named at the time',
      'Say what a cancellation means to you, in one sentence, without a verdict',
      'Keep a rough count of plans kept, so the feeling does not rely on memory alone',
    ],
    conversation: 'When plans fall through, what makes you feel respected, and what would make it feel like we have drifted?',
    sourceIds: answeredIds(c, ['fr.trust.reliable']),
  };
}

// Loyalty and trust, where a breach would hurt. The two of you name different things as the
// biggest break in trust.
function breaksTrustRule(c) {
  if (!differs(c, 'fr.trust.breaks')) return null;
  return {
    id: 'what-breaks-trust',
    title: 'What breaks trust',
    severity: 50,
    trigger: 'A hypothetical, or a real moment, shows that the two of you would be hurt by different things.',
    pattern: 'Each person has a short list of breaches that would end trust. Knowing the other person\'s list makes it easier to avoid the thing that would hurt most, and to repair if it happens.',
    construct: 'Conflict over differing values and beliefs (moral foundations: fairness and loyalty)',
    why: 'You each named a different thing as the most damaging break in trust. Knowing the other person\'s list is a practical way to protect each other.',
    earlySigns: [
      'A small slip gets treated as a big one by one of you',
      'Trust gets tested in a way that feels like a test rather than a conversation',
      'An apology feels like it is missing the point',
    ],
    badDay: {
      mine: '{me} may treat one kind of slip as the end of trust, and be slow to come back from it.',
      theirs: '{them} may not see that same slip as serious, and be caught out by how hard it lands.',
    },
    repair: [
      'Share your own top break in trust, in one sentence',
      'Ask the other person what would make them feel trust was restored',
      'Agree that a first slip gets named and talked about, not treated as final',
    ],
    conversation: 'Which of these would damage trust between us the most, and what would repair look like if it happened?',
    sourceIds: answeredIds(c, ['fr.trust.breaks']),
  };
}

// Money scripts (Klontz), applied to lending between friends. The two of you differ on whether you
// would lend a larger sum.
function lendingRule(c) {
  if (!differs(c, 'fr.boundaries.lend')) return null;
  return {
    id: 'money-between-friends',
    title: 'Money between friends',
    severity: 60,
    trigger: 'A friend asks to borrow a larger sum, and one of you would say yes while the other would say no or only as a gift.',
    pattern: 'Money scripts shape how generosity and security feel. Lending can change a friendship: a loan that is not repaid can turn into resentment, and a refusal can feel like a judgement.',
    construct: 'Money scripts (Klontz)',
    why: 'You differ on how you would lend money to a friend. Agreeing your limits in advance means a request does not put either of you on the spot.',
    earlySigns: [
      'A loan is mentioned in passing and then not raised again',
      'One of you sighs about a debt that was never discussed',
      'A refusal gets an overly long explanation',
    ],
    badDay: {
      mine: '{me} may lend more readily than they can afford, to keep a friend close.',
      theirs: '{them} may refuse quickly to protect their own money, and feel guilty about it afterwards.',
    },
    repair: [
      'Agree a personal rule for lending, such as only money you can afford to lose',
      'Say no with a short, kind line, rather than an explanation that invites a debate',
      'If you lend, say whether it is a loan or a gift before handing it over',
    ],
    conversation: 'If a friend asked to borrow a larger sum, what would you need to know before saying yes or no?',
    sourceIds: answeredIds(c, ['fr.boundaries.lend']),
  };
}

// Attachment theory: closeness versus autonomy, for time between visits. A gap of 3 or more on
// how much time on their own each person needs between seeing friends.
function aloneBetweenRule(c) {
  if (!atLeast(gapN(c, 'fr.boundaries.alone'), 3)) return null;
  const much = (who) => `${who} may need a good amount of time alone between seeing friends, and go quiet when it is squeezed.`;
  const little = (who) => `${who} may feel a long gap means the friendship is fading, and reach out more.`;
  const a = nA(c, 'fr.boundaries.alone');
  return {
    id: 'alone-between',
    title: 'Alone time between visits',
    severity: 50,
    trigger: 'Plans start to fill a week, and one of you wants a quiet stretch while the other sees each gap as a chance to meet.',
    pattern: 'The friend who needs more time alone can feel crowded, and the one who needs less can read solitude as distance. Neither is a verdict on the friendship.',
    construct: 'Attachment theory: closeness versus autonomy',
    why: 'You need different amounts of time between seeing each other. Saying so early makes gaps feel like rhythm, not drift.',
    earlySigns: [
      'Plans are turned down with a short reason and then a gap',
      'One of you asks "are we okay?" after a quiet stretch',
      'Gaps get counted rather than enjoyed',
    ],
    badDay: {
      mine: atLeast(a, 3) ? much('{me}') : little('{me}'),
      theirs: atLeast(nB(c, 'fr.boundaries.alone'), 3) ? much('{them}') : little('{them}'),
    },
    repair: [
      'Say how much time between plans feels right for you, in a sentence',
      'Tell each other what you are doing in the gap, so it does not feel like silence',
      'Check after a couple of months whether the rhythm still fits',
    ],
    conversation: 'How much time on your own do you need between seeing each other, and how can we make the gaps feel normal?',
    sourceIds: answeredIds(c, ['fr.boundaries.alone']),
  };
}

// Attachment theory: closeness versus autonomy, for how often to meet in person.
function meetFrequencyRule(c) {
  if (!atLeast(gapN(c, 'fr.boundaries.frequency'), 3)) return null;
  const often = (who) => `${who} may want to see the friend most weeks, and feel hurt when plans are months apart.`;
  const seldom = (who) => `${who} may feel pressed by frequent plans, and keep them rare to protect their week.`;
  const a = nA(c, 'fr.boundaries.frequency');
  return {
    id: 'how-often-meet',
    title: 'How often to meet',
    severity: 55,
    trigger: 'You try to plan a catch-up, and one of you wants to see each other most weeks while the other thinks every few months is enough.',
    pattern: 'How often friends meet is a steady signal of closeness. A mismatch can feel like the friendship is being kept at arm\'s length, or like it is being pushed.',
    construct: 'Attachment theory: closeness versus autonomy',
    why: 'You want very different rhythms for seeing each other in person. Agreeing a middle range, with room to flex, keeps both of you happy.',
    earlySigns: [
      'A catch-up keeps getting pushed to "soon"',
      'One of you makes the plan and the other responds with a late, short message',
      'The gap between meetings gets noticed out loud',
    ],
    badDay: {
      mine: atLeast(a, 3) ? often('{me}') : seldom('{me}'),
      theirs: atLeast(nB(c, 'fr.boundaries.frequency'), 3) ? often('{them}') : seldom('{them}'),
    },
    repair: [
      'Agree a rough rhythm, such as one catch-up a month with room for more',
      'Say what a good gap looks like in one sentence',
      'Book the next time before you leave the last one',
    ],
    conversation: 'How often would you like to see each other in person, and what would feel like enough?',
    sourceIds: answeredIds(c, ['fr.boundaries.frequency']),
  };
}

// Reply speed. The two of you expect messages to be answered at very different speeds.
function replySpeedRule(c) {
  if (!atLeast(gapN(c, 'fr.boundaries.digital'), 3)) return null;
  const relaxed = (who) => `${who} may leave a message for a day, and not see why the other is worried.`;
  const quick = (who) => `${who} may expect a reply within a few hours, and read a slow one as a signal.`;
  const a = nA(c, 'fr.boundaries.digital');
  return {
    id: 'reply-speed',
    title: 'Reply speed',
    severity: 45,
    trigger: 'A message goes unanswered for a day, and one of you is relaxed about it while the other reads the silence as a signal.',
    pattern: 'Expected reply speed is a small, daily signal of attention. Mismatched expectations can make an ordinary gap feel like a withdrawal.',
    construct: 'Attachment theory: reassurance and reliability, in the anxious-avoidant framing',
    why: 'You expect replies at different speeds. Naming a rough expectation takes the guesswork out of the silence.',
    earlySigns: [
      'A follow-up message that starts with "just checking"',
      'Replies are timed in a way that becomes a point',
      'A long gap makes one person quieter in the next conversation',
    ],
    badDay: {
      mine: atLeast(a, 3) ? quick('{me}') : relaxed('{me}'),
      theirs: atLeast(nB(c, 'fr.boundaries.digital'), 3) ? quick('{them}') : relaxed('{them}'),
    },
    repair: [
      'Agree a rough reply window, such as a day for a non-urgent message',
      'Say when a message needs a quick answer, and when it does not',
      'Let a gap be a gap, rather than a message about the friendship',
    ],
    conversation: 'How quickly would you like replies, and what would you rather I did when I am busy?',
    sourceIds: answeredIds(c, ['fr.boundaries.digital']),
  };
}

// Conflict over differing values and beliefs, about how much of an opinion on a friend's partner to
// share.
function partnerOpinionsRule(c) {
  if (!atLeast(gapN(c, 'fr.boundaries.partners'), 3)) return null;
  return {
    id: 'opinions-on-partners',
    title: 'Opinions on partners',
    severity: 45,
    trigger: 'A friend starts a new relationship, or is unhappy in one, and one of you wants to say what you think while the other keeps it to themselves.',
    pattern: 'Honest opinions about a friend\'s partner can be a form of care or an intrusion, depending on the moment. Loyalty and autonomy pull in different directions here.',
    construct: 'Conflict over differing values and beliefs (moral foundations: loyalty)',
    why: 'You differ on how much of your view on a friend\'s partner you share. Agreeing a rule for it prevents a comment in one moment from becoming a grudge later.',
    earlySigns: [
      'An opinion about a partner comes out in front of others',
      'One of you says "I should not say this, but"',
      'The friend stops mentioning their partner around one of you',
    ],
    badDay: {
      mine: '{me} may share a view on a partner to protect a friend, and be surprised how it lands.',
      theirs: '{them} may keep a view to themselves, and feel uneasy when the friend asks what they really think.',
    },
    repair: [
      'Agree that you will raise a worry once, privately, and then let the friend decide',
      'Ask what the friend wants from you before giving a view',
      'Keep your opinions about a partner separate from how you feel about the friend',
    ],
    conversation: 'When a partner of yours is not a fit for me, how would you like me to tell you, if at all?',
    sourceIds: answeredIds(c, ['fr.boundaries.partners']),
  };
}

// Need for closure. One of you wants an answer quickly and the other is comfortable with a question
// staying open.
function closureRule(c) {
  if (!atLeast(gapN(c, 'fr.think.closure.2'), 3)) return null;
  const restless = (who) => `${who} may want an answer quickly, and feel uneasy while a question stays open.`;
  const patient = (who) => `${who} may be comfortable leaving a question open, and feel rushed when asked to decide.`;
  const a = nA(c, 'fr.think.closure.2');
  return {
    id: 'need-for-answer',
    title: 'Need for an answer now',
    severity: 50,
    trigger: 'A question is still open, such as what to do about a shared plan, and one of you wants to settle it while the other wants more time.',
    pattern: 'A high need for closure makes an open question feel unresolved. A lower need lets the question sit. The clash is about timing, and each person may feel the other is either rushing or dragging their feet.',
    construct: 'Need for closure',
    why: 'You differ on how much an open question bothers you. Agreeing when a question will be settled makes waiting feel safe.',
    earlySigns: [
      'One of you keeps coming back to the same open question',
      'The other says "let us see" and it sounds like a closed door',
      'A decision is made by one person to end the uncertainty',
    ],
    badDay: {
      mine: atLeast(a, 3) ? restless('{me}') : patient('{me}'),
      theirs: atLeast(nB(c, 'fr.think.closure.2'), 3) ? restless('{them}') : patient('{them}'),
    },
    repair: [
      'Give open questions a date, so waiting has an end',
      'Say what you are waiting for, so the other knows it is not avoidance',
      'Agree that the one who needs an answer can decide small things alone',
    ],
    conversation: 'When a question is still open between us, how long can you hold it before it starts to bother you?',
    sourceIds: answeredIds(c, ['fr.think.closure.2']),
  };
}

// Decision-making style, gut versus facts. The two of you lean on different things to decide.
function gutFactsRule(c) {
  if (!atLeast(gapN(c, 'fr.think.evidence.1'), 3)) return null;
  const facts = (who) => `${who} may want the evidence first, and feel the other is deciding on a hunch.`;
  const gut = (who) => `${who} may trust a feeling, and feel the other is over-thinking a simple choice.`;
  const a = nA(c, 'fr.think.evidence.1');
  return {
    id: 'gut-or-facts',
    title: 'Gut versus facts',
    severity: 45,
    trigger: 'You need to choose something together, and one of you wants the facts laid out while the other goes with a feeling.',
    pattern: 'Decision-making style decides what counts as a good reason. Each can read the other\'s way as careless or as stuck.',
    construct: 'Decision-making style',
    why: 'You decide in different ways. Naming the style lets you bring the right kind of reason to the right kind of choice.',
    earlySigns: [
      'A choice is pushed through on a feeling, and the other goes quiet',
      'Someone asks "where did you read that?" in a light conversation',
      'Choices get delayed by more research than the choice needs',
    ],
    badDay: {
      mine: atLeast(a, 3) ? facts('{me}') : gut('{me}'),
      theirs: atLeast(nB(c, 'fr.think.evidence.1'), 3) ? facts('{them}') : gut('{them}'),
    },
    repair: [
      'Agree which choices need evidence and which can go with a feeling',
      'Say your reason in both forms: what you know, and what you feel',
      'Set a limit for research on small choices',
    ],
    conversation: 'For a choice that matters, what would you need to see or feel before you were comfortable with it?',
    sourceIds: answeredIds(c, ['fr.think.evidence.1']),
  };
}

// Need for closure, applied to changing a view. One of you changes their mind easily after a good
// argument and the other rarely does.
function changeMindRule(c) {
  if (!atLeast(gapN(c, 'fr.think.openness.2'), 3)) return null;
  const open = (who) => `${who} may change their view after a good argument, and feel the other has not really listened.`;
  const firm = (who) => `${who} may hold their view under pressure, and feel pushed when asked to shift.`;
  const a = nA(c, 'fr.think.openness.2');
  return {
    id: 'changing-mind',
    title: 'Changing your mind',
    severity: 40,
    trigger: 'A good argument comes up, and one of you can shift while the other holds their view and digs in.',
    pattern: 'Openness to revising a view is a learned habit. When one friend moves easily and the other does not, the debate can feel one-sided.',
    construct: 'Need for closure (openness to revising a view)',
    why: 'You differ on how readily you change your mind. Knowing that in advance means a disagreement is not read as a verdict on how smart either of you is.',
    earlySigns: [
      'A debate ends with "well, we will just agree to differ" from one side only',
      'One of you says "I have heard you" and nothing changes',
      'Old arguments get replayed rather than moved on from',
    ],
    badDay: {
      mine: atLeast(a, 3) ? open('{me}') : firm('{me}'),
      theirs: atLeast(nB(c, 'fr.think.openness.2'), 3) ? open('{them}') : firm('{them}'),
    },
    repair: [
      'Say what would change your mind, so the other person knows what to bring',
      'Agree that a debate can end with "I want to think about that"',
      'Keep disagreement about ideas, not about who is right',
    ],
    conversation: 'What would it take for you to change your mind about something you care about, and what usually gets in the way?',
    sourceIds: answeredIds(c, ['fr.think.openness.2']),
  };
}

// Planning versus spontaneity. One friend likes plans set well in advance and the other likes to
// decide on the day.
function plannedRule(c) {
  if (!atLeast(gapN(c, 'fr.think.flexibility.1'), 3)) return null;
  const planned = (who) => `${who} may want a plan set well ahead, and feel uneasy when a day has no shape.`;
  const spont = (who) => `${who} may decide on the day, and feel boxed in by a plan made too early.`;
  const a = nA(c, 'fr.think.flexibility.1');
  return {
    id: 'planned-or-spontaneous',
    title: 'Planned or spontaneous',
    severity: 45,
    trigger: 'You try to make a plan together, and one of you wants it locked in ahead while the other wants to see how the day goes.',
    pattern: 'Planning and spontaneity change how an outing feels. The planner feels safe with a schedule; the spontaneous friend can feel trapped by one.',
    construct: 'Planning versus spontaneity',
    why: 'You differ on how far ahead to plan. A rule about when to lock in plans lets both styles fit.',
    earlySigns: [
      'Plans get changed on the morning of the day',
      'One of you asks "what is the plan?" in a tense way',
      'Plans made in advance feel like a commitment the other is not ready to keep',
    ],
    badDay: {
      mine: atLeast(a, 3) ? planned('{me}') : spont('{me}'),
      theirs: atLeast(nB(c, 'fr.think.flexibility.1'), 3) ? planned('{them}') : spont('{them}'),
    },
    repair: [
      'Agree a deadline for locking in a plan, such as two days before',
      'Keep one plan and one open slot in each outing',
      'Let the more spontaneous friend suggest one open thing each time',
    ],
    conversation: 'When we make plans, how far ahead do you like them, and how much room do you want to keep?',
    sourceIds: answeredIds(c, ['fr.think.flexibility.1']),
  };
}

// Conflict over differing values and beliefs (moral foundations). Two or more of the five moral
// foundation items (care, fairness, loyalty, authority, purity) differ by 3 or more. One difference
// is normal; two suggests a different moral compass.
function moralCompassRule(c) {
  const ids = ['fr.values.care', 'fr.values.fairness', 'fr.values.loyalty', 'fr.values.authority', 'fr.values.purity'];
  const count = ids.filter((id) => atLeast(gapN(c, id), 3)).length;
  if (count < 2) return null;
  const strict = (who) => `${who} may see a moral line clearly, and feel the other is letting something slide.`;
  const loose = (who) => `${who} may see more shades of grey, and feel judged for not having a firm line.`;
  return {
    id: 'moral-compass',
    title: 'Different moral compass',
    severity: 50,
    trigger: 'A friend\'s choice, a story in the news or a question about what is fair brings up a moral line you see differently.',
    pattern: 'Moral foundations research suggests people weigh care, fairness, loyalty, authority and purity differently. The same act can look like kindness to one friend and a lapse to the other.',
    construct: 'Conflict over differing values and beliefs (moral foundations)',
    why: `Your answers differ on ${count} of the five moral foundations. That is a difference of values rather than of manners, so it helps to talk about why each of you sees things as you do.`,
    earlySigns: [
      'A story about someone else turns into a debate about right and wrong',
      'One of you says "I cannot believe you think that"',
      'The subject gets dropped quickly and stays unspoken',
    ],
    badDay: {
      mine: '{me} may see a clear line and feel the other is letting something slide.',
      theirs: loose('{them}'),
    },
    repair: [
      'Ask what the other person is protecting when they take a stance',
      'Agree which values you share, and which you respect as different',
      'Keep a judgement about one act separate from a judgement about the person',
    ],
    conversation: 'What matters most to you when you decide whether someone has done the right thing?',
    sourceIds: answeredIds(c, ids),
  };
}

// Conflict over differing values, applied to what a good friend does.
function goodFriendRule(c) {
  if (!differs(c, 'fr.values.good')) return null;
  return {
    id: 'what-a-good-friend-does',
    title: 'What a good friend does',
    severity: 40,
    trigger: 'A friend lets you down, and you each picture a different thing as the mark of a good friend.',
    pattern: 'Each person has a picture of what makes a friend good: keeping their word, being kind, standing up for what is right, or admitting being wrong. When those pictures differ, a lapse looks different to each of you.',
    construct: 'Conflict over differing values and beliefs (moral foundations)',
    why: 'You each name a different core value for a good friend. Knowing the other person\'s picture makes it easier to meet it.',
    earlySigns: [
      'A lapse gets described in terms of a value the other did not share',
      'One of you says "that is not what a friend does"',
      'Apologies that do not address the value that was hurt',
    ],
    badDay: {
      mine: '{me} may judge a friend by one core value, and feel let down when it is missing.',
      theirs: '{them} may judge by a different value, and not see why the first one feels let down.',
    },
    repair: [
      'Name the value you most look for in a friend, in one sentence',
      'When a lapse happens, name which value was hurt before deciding what it means',
      'Ask the other what a good apology would include for them',
    ],
    conversation: 'What is the one thing a friend has to do for you to feel they are a good one?',
    sourceIds: answeredIds(c, ['fr.values.good']),
  };
}

// Gottman's bids for connection, read through support. The two of you differ in how you show up
// when a friend is struggling, or in what helps you most when you are struggling.
function supportRule(c) {
  const crisisDiffers = differs(c, 'fr.support.crisis');
  const styleApart = atLeast(gapN(c, 'fr.support.style'), 3);
  if (!(crisisDiffers || styleApart)) return null;
  const doer = (who) => `${who} may offer a practical fix, and feel puzzled when the friend only wants to talk.`;
  const listener = (who) => `${who} may listen and wait, and feel the friend is not being helped when they want a plan.`;
  const aStyle = nA(c, 'fr.support.style');
  return {
    id: 'different-support',
    title: 'Different ideas of support',
    severity: 55,
    trigger: 'A friend has a hard week, and you each reach for a different kind of help.',
    pattern: 'Gottman described bids as attempts to connect, and support is one of the most common ones. When one friend offers practical help and the other wants someone to listen, the support is real but can land as a miss.',
    construct: "Gottman's bids for connection (support offered in a different currency)",
    why: 'You differ on what support looks like, either in what you offer or in what helps you most. Naming both lets the next hard week go better.',
    earlySigns: [
      'Help is offered and turned down with "I just wanted to talk"',
      'A friend starts a fix-it list when the other wanted a listening ear',
      'Support goes unrecognised, and the one offering it feels thanked less than they hoped',
    ],
    badDay: {
      mine: atLeast(aStyle, 3) ? listener('{me}') : doer('{me}'),
      theirs: atLeast(nB(c, 'fr.support.style'), 3) ? listener('{them}') : doer('{them}'),
    },
    repair: [
      'Ask first: "Do you want help fixing this, or do you want me to listen?"',
      'Say what helps you most when you are struggling, in one sentence',
      'When unsure, offer a choice rather than a fix',
    ],
    conversation: 'When you are going through something hard, what would you like me to do first: help, listen, or give you space?',
    sourceIds: answeredIds(c, ['fr.support.crisis', 'fr.support.style']),
  };
}

// Attachment theory: closeness versus autonomy, for how long to stay close through a hard stretch.
function stayCloseRule(c) {
  if (!atLeast(gapN(c, 'fr.support.stay'), 3)) return null;
  const long = (who) => `${who} may want to stay close for as long as it takes, and feel hurt when the other steps back.`;
  const space = (who) => `${who} may give space and check in now and then, and feel the friend is being too much when they press.`;
  const a = nA(c, 'fr.support.stay');
  return {
    id: 'stay-close-hard-times',
    title: 'Staying close through hard times',
    severity: 50,
    trigger: 'A friend goes through a long, hard stretch, and one of you wants to stay close all the way through while the other gives space.',
    pattern: 'Staying close through a long hard stretch takes different kinds of effort. The closer friend can feel the other has gone missing; the one giving space can feel smothered.',
    construct: 'Attachment theory: closeness versus autonomy',
    why: 'You differ on how close to stay when a friend is struggling for months. Agreeing a way to check in keeps both of you present.',
    earlySigns: [
      'Check-ins become less frequent without a reason',
      'The closer friend starts to say "I am always here" in a tense way',
      'The friend who is struggling says "I do not want to be a burden"',
    ],
    badDay: {
      mine: atLeast(a, 3) ? long('{me}') : space('{me}'),
      theirs: atLeast(nB(c, 'fr.support.stay'), 3) ? long('{them}') : space('{them}'),
    },
    repair: [
      'Agree a regular check-in, such as a message once a week, even when it is short',
      'Say how much support you can give, so it does not turn into a promise you cannot keep',
      'Ask the friend what kind of check-in helps them most',
    ],
    conversation: 'When someone we care about is struggling for a long time, how do you want me to stay close, and how often?',
    sourceIds: answeredIds(c, ['fr.support.stay']),
  };
}

// Fun and play. The two of you enjoy different kinds of activity together.
function funRule(c) {
  const activities = differs(c, 'fr.fun.activities');
  const adventure = atLeast(gapN(c, 'fr.fun.adventure'), 3);
  if (!(activities || adventure)) return null;
  const adventurous = (who) => `${who} may want to try something new each time, and feel bored by a familiar plan.`;
  const familiar = (who) => `${who} may want the comfort of what they know, and feel pushed when the plan changes.`;
  const a = nA(c, 'fr.fun.adventure');
  return {
    id: 'different-fun',
    title: 'Different ideas of fun',
    severity: 45,
    trigger: 'You pick something to do together, and one of you is excited by the plan while the other is waiting for it to end.',
    pattern: 'Fun is partly about shared activity and partly about how much novelty you want. A mismatch can make one friend feel the other is dragging them along, and the other feel their idea of fun is being overlooked.',
    construct: 'Planning versus spontaneity (adventure and routine)',
    why: 'You enjoy different kinds of time together. Taking turns choosing keeps both of your ideas of fun in the mix.',
    earlySigns: [
      'Plans get suggested and then quietly dropped',
      'One of you says "I am happy with whatever" in a flat voice',
      'The same two things get repeated, and one of you starts to look bored',
    ],
    badDay: {
      mine: atLeast(a, 3) ? adventurous('{me}') : familiar('{me}'),
      theirs: atLeast(nB(c, 'fr.fun.adventure'), 3) ? adventurous('{them}') : familiar('{them}'),
    },
    repair: [
      'Take turns choosing what you do, and say why you picked it',
      'Keep one familiar thing and try one new thing in each outing',
      'Ask what the other person enjoys most about time together, and plan around that',
    ],
    conversation: 'What do you most enjoy doing with a friend, and is there something you have been wanting to try?',
    sourceIds: answeredIds(c, ['fr.fun.activities', 'fr.fun.adventure']),
  };
}

// Gottman's bids, with humour as a bid. The two of you enjoy different kinds of humour.
function humourRule(c) {
  if (!differs(c, 'fr.fun.humour')) return null;
  return {
    id: 'sense-of-humour',
    title: 'Different sense of humour',
    severity: 40,
    trigger: 'A joke lands with one of you and passes the other by, or the other finds it a little sharp.',
    pattern: 'Humour is a bid for connection. Gottman\'s work suggests bids can be missed when they are offered in the wrong style, so the same joke can feel warm to one friend and cold to another.',
    construct: "Gottman's bids for connection (humour as a bid)",
    why: 'You enjoy different kinds of humour. Knowing the style the other person likes makes a bid more likely to land.',
    earlySigns: [
      'A joke gets a polite smile and nothing more',
      'One of you says "that was a bit much" after a laugh',
      'Humour gets used to end a serious talk',
    ],
    badDay: {
      mine: '{me} may use their favourite style of humour to lighten a hard moment, and not see it land.',
      theirs: '{them} may find that style hard to join in with, and go quiet.',
    },
    repair: [
      'Name the kind of humour you enjoy most, with one example',
      'Ask whether a joke is welcome before making it in a hard moment',
      'Keep the humour that works for both of you, and let the rest go',
    ],
    conversation: 'What kind of humour makes you laugh with a friend, and when does it feel like too much?',
    sourceIds: answeredIds(c, ['fr.fun.humour']),
  };
}

// Conflict over teasing. A gap of 3 or more on how much teasing each enjoys. Teasing can tip into
// mockery, which is contempt in a playful coat.
function teasingRule(c) {
  if (!atLeast(gapN(c, 'fr.fun.teasing'), 3)) return null;
  const dishes = (who) => `${who} may enjoy teasing and dish it out, and not notice when it tips into mockery.`;
  const hates = (who) => `${who} may find teasing hard to take, and feel small after a joke that was meant kindly.`;
  const a = nA(c, 'fr.fun.teasing');
  return {
    id: 'teasing',
    title: 'How much teasing',
    severity: 45,
    trigger: 'A bit of teasing lands well for one of you and stings the other, and the line between them is hard to see.',
    pattern: 'Teasing is a friendship ritual for many people, but mockery in a light tone is the same contempt the Four Horsemen describe, in a playful coat. The line is set by how the other person takes it.',
    construct: "Gottman's Four Horsemen: contempt (teasing that tips into mockery)",
    why: 'You enjoy teasing by different amounts. Agreeing where the line sits protects the fun and keeps it from turning sharp.',
    earlySigns: [
      'A joke about one friend\'s habit gets an uneasy laugh',
      'The teasing gets more pointed each time',
      'One of you says "that one was not funny" after the fact',
    ],
    badDay: {
      mine: atLeast(a, 3) ? dishes('{me}') : hates('{me}'),
      theirs: atLeast(nB(c, 'fr.fun.teasing'), 3) ? dishes('{them}') : hates('{them}'),
    },
    repair: [
      'Name one topic that is off limits for teasing',
      'Use a quick check: "Is that one okay?" before a pointed joke',
      'If a joke stings, say so in the moment and move on',
    ],
    conversation: 'How much teasing do you enjoy between friends, and is there a line that you would like me to keep?',
    sourceIds: answeredIds(c, ['fr.fun.teasing']),
  };
}

// Communication: how deep to go. A gap of 3 or more on how deep the two of you like conversations
// to go.
function depthRule(c) {
  if (!atLeast(gapN(c, 'fr.comm.depth'), 3)) return null;
  const deep = (who) => `${who} may want real, personal talk, and feel the friendship is thin when it stays light.`;
  const light = (who) => `${who} may prefer everyday talk, and feel exposed or pressed when it goes deep.`;
  const a = nA(c, 'fr.comm.depth');
  return {
    id: 'depth-of-talk',
    title: 'How deep to talk',
    severity: 50,
    trigger: 'A catch-up stays on the surface for one of you and goes personal for the other.',
    pattern: 'Depth of conversation is a bid for closeness. A friend who wants depth can feel the friendship is thin, and a friend who prefers light talk can feel exposed.',
    construct: 'Attachment theory: closeness versus autonomy',
    why: 'You like different depths of conversation. Agreeing a mix lets both of you feel known without being pushed.',
    earlySigns: [
      'Personal questions get a quick, polite change of subject',
      'One of you says "we never really talk" after a light evening',
      'Deep talks happen once and then nothing follows',
    ],
    badDay: {
      mine: atLeast(a, 3) ? deep('{me}') : light('{me}'),
      theirs: atLeast(nB(c, 'fr.comm.depth'), 3) ? deep('{them}') : light('{them}'),
    },
    repair: [
      'Say the depth you want in a sentence, such as "I would love to hear how you are really doing"',
      'Let the other person pick the depth of a catch-up, and go along with it',
      'Save the deep talks for a time when neither of you is rushing',
    ],
    conversation: 'When we catch up, how personal would you like the talk to get, and what makes you open up?',
    sourceIds: answeredIds(c, ['fr.comm.depth']),
  };
}

// Communication: how often to be in touch between visits.
function contactRule(c) {
  if (!atLeast(gapN(c, 'fr.comm.contact'), 3)) return null;
  const often = (who) => `${who} may want to be in touch most days, and feel distant when messages slow down.`;
  const rare = (who) => `${who} may be happy with occasional contact, and feel crowded by frequent messages.`;
  const a = nA(c, 'fr.comm.contact');
  return {
    id: 'how-often-in-touch',
    title: 'How often to be in touch',
    severity: 50,
    trigger: 'Between visits, one of you wants to hear from the other most days while the other is happy with a message now and then.',
    pattern: 'Contact between visits is how a friendship stays warm when you are apart. A gap in how often you like to be in touch can feel like closeness to one and pressure to the other.',
    construct: 'Attachment theory: closeness versus autonomy',
    why: 'You want very different amounts of contact between visits. A simple rhythm lets both of you stay connected without counting messages.',
    earlySigns: [
      'One of you counts how long it has been since the last message',
      'A short reply gets read as a signal',
      'Frequent messages start to get a slower reply',
    ],
    badDay: {
      mine: atLeast(a, 3) ? often('{me}') : rare('{me}'),
      theirs: atLeast(nB(c, 'fr.comm.contact'), 3) ? often('{them}') : rare('{them}'),
    },
    repair: [
      'Agree a rough rhythm, such as a weekly message, with room for more',
      'Say when a message needs an answer, and when it does not',
      'Let the quieter one set the default, and the other add to it',
    ],
    conversation: 'Between visits, how often would you like to hear from me, and what would feel like too much?',
    sourceIds: answeredIds(c, ['fr.comm.contact']),
  };
}

// Communication: directness of feedback. A gap of 3 or more on how blunt feedback should be.
function directnessRule(c) {
  if (!atLeast(gapN(c, 'fr.comm.direct'), 3)) return null;
  const blunt = (who) => `${who} may say a hard thing straight, and be surprised when it stings.`;
  const gentle = (who) => `${who} may soften a point until it is hard to hear, and feel frustrated later.`;
  const a = nA(c, 'fr.comm.direct');
  return {
    id: 'blunt-or-gentle',
    title: 'Blunt or gentle feedback',
    severity: 45,
    trigger: 'A friend asks what you think, and one of you says it straight while the other softens it until the point is lost.',
    pattern: 'Gottman\'s work points to criticism as one of the four habits that most erode a relationship. How feedback is delivered decides whether it sounds like a concern or an attack.',
    construct: "Gottman's Four Horsemen: criticism (how feedback is delivered)",
    why: 'You like feedback at different levels of directness. Agreeing a style lets the content be heard.',
    earlySigns: [
      'A piece of feedback gets a reply about how it was said',
      'One of you says "you could have put that nicer"',
      'A hard point gets raised again later because it was not heard',
    ],
    badDay: {
      mine: atLeast(a, 3) ? blunt('{me}') : gentle('{me}'),
      theirs: atLeast(nB(c, 'fr.comm.direct'), 3) ? blunt('{them}') : gentle('{them}'),
    },
    repair: [
      'Say how you like feedback, in one sentence',
      'Start with what you appreciate before a hard point',
      'Ask "Do you want my honest view on this?" before giving it',
    ],
    conversation: 'When you have a concern about me, how would you like me to hear it?',
    sourceIds: answeredIds(c, ['fr.comm.direct']),
  };
}

// Communication: saying how you feel. The two of you differ on whether to say a strong feeling out
// loud or to hint at it, show it or write it down.
function feelingsRule(c) {
  if (!differs(c, 'fr.comm.feelings')) return null;
  return {
    id: 'saying-feelings',
    title: 'Saying how you feel',
    severity: 40,
    trigger: 'One of you feels strongly about the other and says so, while the other shows it through actions or hopes it is noticed.',
    pattern: 'Gottman described bids as attempts to connect, and some people send them in words while others send them through action. The message can be real and still be missed.',
    construct: "Gottman's bids for connection",
    why: 'You express strong feelings differently. Saying which way you do it makes the feeling easier to receive.',
    earlySigns: [
      'A feeling gets shown through a gesture, and the other does not notice',
      'One of you says "I wish you would just say it"',
      'Affection is hinted at, and then nothing follows',
    ],
    badDay: {
      mine: '{me} may show a strong feeling in action, and wait for the other to notice.',
      theirs: '{them} may want the feeling said out loud, and feel unsure what was meant.',
    },
    repair: [
      'Say how you like to express strong feelings, in one sentence',
      'When you act on a feeling, name it too, so it is not missed',
      'Try saying one feeling out loud each week',
    ],
    conversation: 'When you feel strongly about me, how do you usually let me know, and how would you like me to let you know?',
    sourceIds: answeredIds(c, ['fr.comm.feelings']),
  };
}

// Ambition and direction: what success means. The two of you measure success differently.
function successRule(c) {
  if (!differs(c, 'fr.ambition.success')) return null;
  return {
    id: 'what-success-means',
    title: 'What success means',
    severity: 40,
    trigger: 'You talk about work, money or a big plan, and you each describe success in a different way.',
    pattern: 'Money scripts and personal values shape what counts as enough. A friend who measures success by security can read another\'s pursuit of meaning as risky, and the reverse is also true.',
    construct: 'Money scripts (Klontz), applied to what success is measured by',
    why: 'You each measure success differently. Knowing the measure the other uses helps you cheer for what matters to them.',
    earlySigns: [
      'A friend\'s plan gets a "that sounds risky" response',
      'Career news gets a comparison rather than a congratulation',
      'The phrase "that is not real success" comes up',
    ],
    badDay: {
      mine: '{me} may judge a friend\'s choice against their own measure of success, without meaning to.',
      theirs: '{them} may feel their own measure of success is being dismissed, and keep their plans quiet.',
    },
    repair: [
      'Name what success means to you, in one sentence',
      'Ask what the other person hopes their next step will give them',
      'Cheer for the measure that matters to the friend, even if it is not yours',
    ],
    conversation: 'When you think about success for yourself, what does it look like, and what would make you feel proud of a friend?',
    sourceIds: answeredIds(c, ['fr.ambition.success']),
  };
}

// Decision-making style, applied to risk. A gap of 3 or more on how bold each person is with career
// or money risk.
function riskRule(c) {
  if (!atLeast(gapN(c, 'fr.ambition.risk'), 3)) return null;
  const bold = (who) => `${who} may take a risk and expect the other to back it, and feel unsupported when they do not.`;
  const cautious = (who) => `${who} may want to check the downside first, and feel pressed when a risk is presented as obvious.`;
  const a = nA(c, 'fr.ambition.risk');
  return {
    id: 'risk-appetite',
    title: 'Risk appetite',
    severity: 45,
    trigger: 'A friend mentions a career move or a money risk, and one of you sees a good bet while the other sees a worry.',
    pattern: 'Risk tolerance is part of decision-making style. The bold friend can feel the other is holding them back; the cautious friend can feel the bold one is not counting the cost.',
    construct: 'Decision-making style (risk tolerance)',
    why: 'You differ on how much risk you are comfortable with. Naming it lets you give useful support without trying to change each other.',
    earlySigns: [
      'A plan gets a list of worries rather than a question',
      'One of you says "you always think the worst" or "you never take a chance"',
      'Advice given on a risk is not quite what was asked for',
    ],
    badDay: {
      mine: atLeast(a, 3) ? bold('{me}') : cautious('{me}'),
      theirs: atLeast(nB(c, 'fr.ambition.risk'), 3) ? bold('{them}') : cautious('{them}'),
    },
    repair: [
      'Ask a friend what kind of input they want before giving a view',
      'Say which part of a plan worries you, and which part excites you',
      'Support the choice even when you would have chosen differently',
    ],
    conversation: 'When a big change comes up for you, do you want my honest worries, my support, or both?',
    sourceIds: answeredIds(c, ['fr.ambition.risk']),
  };
}

// Ambition and direction: how much the next few years should change life. A gap of 3 or more.
function directionRule(c) {
  if (!atLeast(gapN(c, 'fr.ambition.direction'), 3)) return null;
  const change = (who) => `${who} may want big changes soon, and feel the friendship is standing still at a slower pace.`;
  const steady = (who) => `${who} may want things to stay much as they are, and feel rushed by talk of change.`;
  const a = nA(c, 'fr.ambition.direction');
  return {
    id: 'pace-of-change',
    title: 'Pace of change',
    severity: 40,
    trigger: 'The next few years come up, and one of you wants big changes while the other wants things to stay steady.',
    pattern: 'The pace a person wants for their life shows up in how much they want to talk about change. A gap can make one friend feel left behind and the other feel pressed.',
    construct: 'Planning versus spontaneity (pace of change)',
    why: 'You want the next few years to change your lives by different amounts. Respecting that difference keeps both of you supported.',
    earlySigns: [
      'Talk of a move, a new job or a big plan gets a quick change of subject',
      'One of you says "you always want to change everything"',
      'Plans for change stall without a clear reason',
    ],
    badDay: {
      mine: atLeast(a, 3) ? change('{me}') : steady('{me}'),
      theirs: atLeast(nB(c, 'fr.ambition.direction'), 3) ? change('{them}') : steady('{them}'),
    },
    repair: [
      'Say what a good next few years looks like for you, in one sentence',
      'Ask what the other person would like to change, and what they want to keep',
      'Support the change they want, even if it is not yours',
    ],
    conversation: 'What would you most like to change in the next few years, and what do you want to stay the same?',
    sourceIds: answeredIds(c, ['fr.ambition.direction']),
  };
}

// Boundaries: saying no. One of you finds it easy to turn down an invitation, the other does not.
function sayingNoRule(c) {
  if (!atLeast(gapN(c, 'fr.boundaries.no'), 3)) return null;
  const easy = (who) => `${who} may turn down an invitation without much thought, and not see why the other finds it hard.`;
  const hard = (who) => `${who} may feel guilty turning an invitation down, and say yes when they would rather not.`;
  const a = nA(c, 'fr.boundaries.no');
  return {
    id: 'saying-no',
    title: 'Saying no',
    severity: 40,
    trigger: 'An invitation arrives at a busy time, and one of you turns it down easily while the other feels guilty about saying no.',
    pattern: 'Being able to say no is a boundary. When one friend can refuse freely and the other cannot, the refusals can feel uneven, and the one who finds it hard can end up resentful.',
    construct: 'Attachment theory: closeness versus autonomy',
    why: 'You differ on how easily you can decline an invitation. Making that explicit means a no is not read as a verdict on the friendship.',
    earlySigns: [
      'An invitation gets accepted and then quietly resented',
      'A refusal arrives with a long explanation attached',
      'One of you says "it is fine, I do not mind" in a tight voice',
    ],
    badDay: {
      mine: atLeast(a, 3) ? easy('{me}') : hard('{me}'),
      theirs: atLeast(nB(c, 'fr.boundaries.no'), 3) ? easy('{them}') : hard('{them}'),
    },
    repair: [
      'Say that a no is always fine, and that you will not ask for the reason',
      'Offer an alternative when you can, rather than a long excuse',
      'Check in if an invitation keeps being accepted with a sigh',
    ],
    conversation: 'When you cannot make an invitation, how would you like me to take it, and what do you want me to know?',
    sourceIds: answeredIds(c, ['fr.boundaries.no']),
  };
}

// Conflict over differing values and beliefs, applied to family talk. The two of you want very
// different amounts of detail about each other's families.
function familyTalkRule(c) {
  if (!differs(c, 'fr.boundaries.family')) return null;
  return {
    id: 'family-talk',
    title: 'How much family talk',
    severity: 35,
    trigger: 'A friend starts to tell you about their family, and one of you wants all the detail while the other would rather keep it short.',
    pattern: 'How much a friend wants to hear about family is a boundary and a bid for closeness at the same time. Too much detail can feel intrusive to one and too little can feel distant to the other.',
    construct: 'Attachment theory: closeness versus autonomy',
    why: 'You want different amounts of detail about each other\'s families. Naming it keeps family news from becoming a source of distance.',
    earlySigns: [
      'A family story is cut short or asked about in too much detail',
      'One of you changes the subject when family comes up',
      'Family news arrives in a flat or polite tone',
    ],
    badDay: {
      mine: '{me} may ask for every family detail to feel close, and push when the answers are short.',
      theirs: '{them} may keep family news brief, and feel quizzed when asked for more.',
    },
    repair: [
      'Say how much family detail you like, in one sentence',
      'Let the other set the depth of family talk, and follow it',
      'Ask "Do you want to talk about it, or just tell me the headlines?"',
    ],
    conversation: 'When it comes to my family, how much detail do you want, and how much would you rather keep to yourself?',
    sourceIds: answeredIds(c, ['fr.boundaries.family']),
  };
}

// Dealbreakers, shared. A non-negotiable is answered yes by one person and no by the other. This is
// a flag for an early talk, not an automatic rejection. The item text names what to talk about.
// Works for couples (deal.*) and friendships (fr.*.dealbreaker.*) through the bank.
function dealbreakerRule(c) {
  const list = DEALBREAKERS[c.friendship ? 'friendship' : 'couple'];
  const mismatched = list.filter((q) => {
    const a = sA(c, q.id);
    const b = sB(c, q.id);
    return (a === 'yes' && b === 'no') || (a === 'no' && b === 'yes');
  });
  if (!mismatched.length) return null;
  const topics = mismatched.map((q) => q.text.replace(/\?$/, '').toLowerCase()).join('; ');
  return {
    id: 'non-negotiable-mismatch',
    title: 'Non-negotiable mismatch',
    severity: 80,
    trigger: 'A question about children, faith, moving, substances, money, confidences or trust comes up, and you find a line the other does not share.',
    pattern: `Mismatched on: ${topics}. Non-negotiables are the lines a person says they cannot cross. A mismatch is information to talk through early, while there is still room to decide with open eyes.`,
    construct: 'Conflict over differing values and beliefs (moral foundations), applied to non-negotiables',
    why: 'Your answers on at least one non-negotiable differ. That is not a verdict on the relationship or friendship, but it is worth naming now rather than later.',
    earlySigns: [
      'A "that would never work for me" comes up in a light conversation',
      'A hypothetical gets a firm no from one of you and a maybe from the other',
      'Decisions get postponed because a line is unclear',
    ],
    badDay: {
      mine: '{me} may treat a firm line as non-negotiable, and feel a difference is a rejection.',
      theirs: '{them} may hold the same line as a preference, and feel pressed to give it up.',
    },
    repair: [
      'Each name the mismatch in your own words, and what it would mean for you',
      'Separate a firm line from a strong preference',
      'If the line stays firm, agree what you will do next and when you will talk again',
    ],
    conversation: 'Which of the points where we answered differently feels most important to talk through first?',
    sourceIds: mismatched.map((q) => q.id),
  };
}

// ---------------------------------------------------------------------------
// Rule lists
// ---------------------------------------------------------------------------

const COUPLE_RULES = [
  pursueWithdrawRule,
  contemptRule,
  criticismLoopRule,
  stonewallRule,
  unrepairedRule,
  coupleCoolDownRule,
  decisionStyleRule,
  finalSayRule,
  saverSpenderRule,
  sharedMoneyRule,
  debtGapRule,
  bodyClockRule,
  tidyRule,
  weekendRule,
  aloneTimeRule,
  socialCalendarRule,
  coupleBidsMissedRule,
  touchGapRule,
  bigTopicRule,
  fiveYearsRule,
  familyRule,
  childrenRule,
  locationRule,
  annoyanceTimingRule,
  dealbreakerRule,
];

const FRIEND_RULES = [
  pursueWithdrawRule,
  contemptRule,
  criticismLoopRule,
  stonewallRule,
  unrepairedRule,
  friendCoolDownRule,
  secretsRule,
  cancelledPlansRule,
  breaksTrustRule,
  lendingRule,
  aloneBetweenRule,
  meetFrequencyRule,
  replySpeedRule,
  partnerOpinionsRule,
  closureRule,
  gutFactsRule,
  changeMindRule,
  plannedRule,
  moralCompassRule,
  goodFriendRule,
  supportRule,
  stayCloseRule,
  funRule,
  humourRule,
  teasingRule,
  depthRule,
  contactRule,
  directnessRule,
  feelingsRule,
  successRule,
  riskRule,
  directionRule,
  sayingNoRule,
  familyTalkRule,
  dealbreakerRule,
];

// ---------------------------------------------------------------------------
// Profile, bids, strengths, deck, summary
// ---------------------------------------------------------------------------

// One axis: mean of the answered items for one person, 0-100, or null when none answered.
function axisValue(src, items) {
  const vals = items.map((item) => {
    let raw = null;
    if (item.map) {
      const key = str(src[item.id]);
      raw = hasKey(item.map, key) ? item.map[key] : null;
    } else {
      raw = num(src[item.id]);
    }
    if (raw === null) return null;
    return item.rev ? 6 - raw : raw;
  });
  return to100(mean(vals));
}

function buildProfile(c, axes) {
  return {
    axes: axes.map((axis) => ({
      key: axis.key,
      label: axis.label,
      mine: axisValue(c.A, axis.items),
      theirs: axisValue(c.B, axis.items),
    })),
  };
}

// Bids: Gottman's bids for connection. Couples read aff.feel_cared (the "what makes you feel most
// cared for" question, whose values are words|acts|time|touch|gifts). Friendships read fr.support.style
// (practical plan versus someone listening): 1-2 is practical, 4-5 is listening, 3 is unknown.
function buildBids(c) {
  if (!c.friendship) {
    const a = sA(c, 'aff.feel_cared');
    const b = sB(c, 'aff.feel_cared');
    const known = (v) => (hasKey(CARE_LABELS, v) ? v : null);
    const pa = known(a);
    const pb = known(b);
    const match = pa && pb ? (pa === pb ? 'same' : 'different') : 'unknown';
    const la = pa ? CARE_LABELS[pa] : 'not sure yet';
    const lb = pb ? CARE_LABELS[pb] : 'not sure yet';
    let text;
    if (match === 'same') {
      text = `For {me} and {them}, care lands most through ${la.toLowerCase()}. That shared currency makes it easier to notice each other's bids.`;
    } else if (match === 'different') {
      text = `For {me}, care lands most through ${la.toLowerCase()}, and for {them} through ${lb.toLowerCase()}. Gottman's bids for connection are small everyday attempts to reach each other, and a bid can be missed when it arrives in the other person's currency. Chapman's five languages are best read as expressions of care rather than fixed types, so treat this as a prompt to ask, not a verdict.`;
    } else {
      text = 'There are not enough answers yet to read how each of you most feels cared for.';
    }
    return {
      mine: { primary: pa, label: la },
      theirs: { primary: pb, label: lb },
      match,
      text,
    };
  }

  const supportPrimary = (n) => {
    if (n === null) return null;
    if (n <= 2) return 'practical';
    if (n >= 4) return 'listen';
    return null;
  };
  const pa = supportPrimary(nA(c, 'fr.support.style'));
  const pb = supportPrimary(nB(c, 'fr.support.style'));
  const match = pa && pb ? (pa === pb ? 'same' : 'different') : 'unknown';
  const la = pa ? SUPPORT_LABELS[pa] : 'Not sure yet';
  const lb = pb ? SUPPORT_LABELS[pb] : 'Not sure yet';
  let text;
  if (match === 'same') {
    text = `For {me} and {them}, support mostly looks like ${la.toLowerCase()}. That makes it easier to show up for each other in a hard week.`;
  } else if (match === 'different') {
    text = `For {me}, support mostly looks like ${la.toLowerCase()}, and for {them} it looks more like ${lb.toLowerCase()}. A friend can offer the right kind of help and still miss, so ask before you fix or listen.`;
  } else {
    text = 'There is not a clear read yet on what helps each of you most when struggling.';
  }
  return {
    mine: { primary: pa, label: la },
    theirs: { primary: pb, label: lb },
    match,
    text,
  };
}

// Strengths: both people low on conflict, close agreement on core items, and both repair readily.
function buildStrengths(c, R) {
  const out = [];
  const ids = c.ids;
  const noun = c.friendship ? 'friendship' : 'relationship';

  const repairA = nA(c, ids.repair);
  const repairB = nB(c, ids.repair);
  if (atLeast(repairA, 4) && atLeast(repairB, 4)) {
    out.push({
      title: 'You both reach back out',
      text: `After a disagreement, {me} and {them} both tend to reach back out with a gesture or an apology. Gottman's research on repair attempts suggests these small moves do much of the work of stopping a fight from hardening, and you already make them.`,
      sourceIds: [ids.repair],
    });
  }

  const hardIds = [ids.criticism, ids.contempt, ids.defensive, ids.stonewall];
  const hardA = mean(hardIds.map((id) => nA(c, id)));
  const hardB = mean(hardIds.map((id) => nB(c, id)));
  if (atMost(hardA, 2) && atMost(hardB, 2)) {
    out.push({
      title: 'Low on the four hard habits',
      text: `Neither {me} nor {them} scores high on criticism, contempt, defensiveness or stonewalling. Those four are the habits Gottman's research linked most closely with trouble, so this is a real foundation for the ${noun}.`,
      sourceIds: hardIds,
    });
  }

  const areas = Array.isArray(R.areas) ? R.areas : [];
  const close = areas
    .filter((a) => a && a.rule === 'similarity' && typeof a.score === 'number' && a.score >= 75)
    .sort((x, y) => y.score - x.score)
    .slice(0, 2);
  for (const area of close) {
    const title = String(area.title || '').toLowerCase();
    out.push({
      title: `Close on ${title}`,
      text: `On ${title}, your answers sit very close together. That is a common ground you can take into harder conversations.`,
      sourceIds: Array.isArray(area.items) ? area.items.map((i) => i.id).filter(Boolean) : [],
    });
  }

  if (Array.isArray(R.strengths)) {
    for (const s of R.strengths) {
      if (out.length >= 4) break;
      if (typeof s === 'string' && s) out.push({ title: 'Something to build on', text: s, sourceIds: [] });
    }
  }

  return out.slice(0, 4);
}

function buildDeck(fights, R) {
  const cards = [];
  const seen = new Set();
  const add = (question, why) => {
    if (cards.length >= 8 || !question || seen.has(question)) return;
    seen.add(question);
    cards.push({ question, why });
  };

  for (const f of fights) add(f.conversation, f.trigger);

  const areas = Array.isArray(R.areas) ? R.areas : [];
  for (const area of areas) {
    if (!area || !Array.isArray(area.prompts)) continue;
    for (const p of area.prompts) {
      add(p, `This came up in ${String(area.title || 'one of the areas').toLowerCase()}, where your answers sit apart.`);
    }
  }

  for (const t of TEMPLATE_CARDS) add(t.question, t.why);

  return cards.slice(0, 8);
}

function buildSummary(c, fights, strengths) {
  if (fights.length) {
    return fill(`The most useful thing to know first is that ${fights[0].title.toLowerCase()} is the pattern most likely to come up between {me} and {them}, and naming it early makes it much easier to handle together.`, c.names);
  }
  if (strengths.length) {
    return fill('Your answers mostly line up, which is a good base; start with the reflection questions when you are both relaxed.', c.names);
  }
  return 'Your answers are not complete yet, so the most useful first step is to finish the rest and compare again.';
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

// Run one rule without letting it throw. A rule that fails simply does not fire.
function runRule(rule, c) {
  try {
    return rule(c);
  } catch {
    return null;
  }
}

export function buildInsights(mine, theirs, report, opts) {
  const c = makeCtx(mine, theirs, opts);
  const R = obj(report);
  const rules = c.friendship ? FRIEND_RULES : COUPLE_RULES;
  const axes = c.friendship ? FRIEND_AXES : COUPLE_AXES;

  const specs = rules.map((rule) => runRule(rule, c)).filter(Boolean);
  const fights = specs
    .map((spec) => finalize(spec, c))
    .sort((x, y) => y.severity - x.severity)
    .slice(0, 8);

  const strengths = buildStrengths(c, R).map((s) => ({ ...s, text: fill(s.text, c.names) }));
  const bids = buildBids(c);

  return {
    summary: buildSummary(c, fights, strengths),
    profile: buildProfile(c, axes),
    fightForecast: fights,
    strengths,
    bids: { ...bids, text: fill(bids.text, c.names) },
    conversationDeck: buildDeck(fights, R),
    cautionNote: c.friendship
      ? 'These are tendencies and conversation starters to try together, not diagnoses, and they do not predict how this friendship will go.'
      : 'These are tendencies and conversation starters to try together, not diagnoses, and they do not predict how your relationship will go.',
  };
}
