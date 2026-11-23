// Pure scoring for the friendship compatibility report. No DOM, no fetch, no side effects.
//
// computeFriendshipReport(mine, theirs, opts) takes two answer objects keyed by question id
// and returns the same top-level shape as computeReport in psychology.js:
//   overall, areas, attachment, conflict, dealbreakers, strengths, topics, reflections
// plus a `deep` block: thinking, comfort, values, narrative.
//
// opts (all optional): { myName, partnerName }. Without them the narrative says "you" and "your friend".
//
// Missing or invalid answers are skipped, never thrown on.
//
// ---------------------------------------------------------------------------
// CALCULATION RULES (for psychologist review)
// ---------------------------------------------------------------------------
// Answer normalisation
//   likert, scale   integer 1-5 (numeric strings accepted). Anything else is skipped.
//   choice          must equal one of the option values.
//   dealbreaker     'yes' or 'no'. 'maybe' is read as 'no', as in psychology.js.
//   text            string, saved but not scored.
//
// Item status, by dimension rule (same vocabulary as psychology.js)
//   similarity      numeric closeness c = 1 - |a - b| / 4 (1 = identical, 0 = opposite ends).
//                   choice closeness: same = 1, different = 0.
//                   status: c >= 0.75 'match', c >= 0.5 'close', else 'gap'.
//                   Area score = mean closeness x 100 over the area's scored items.
//   complementary   numeric difference d = |a - b|: d <= 1 'match', d >= 3 'different', else 'close'.
//                   choice: same 'match', else 'different'. No area score: differences are not penalised.
//   conflict        numeric: both <= 2 'both-low', both >= 4 'both-high', else 'note'.
//                   choice: same 'match', else 'note'. No area score.
//   dealbreaker     either rule. Both yes 'shared', both no 'match', otherwise 'talk'.
//
// Thinking facets (deep.thinking)
//   Items are fr.think.<facet>.<n>. A facet mean is the mean of that person's 1-5 answers
//   on the facet. Facet alignment c = 1 - |mA - mB| / 4 (both present).
//   alignment.score = mean facet c x 100. A facet counts as a tendency difference when |mA - mB| >= 2.
//   Lean wording: mean > 3 reads as a lean toward 'high', mean < 3 toward 'low', 3 says nothing.
//   These are tendencies, not types.
//
// Attachment block (friendship items on closeness and reassurance)
//   anxious  = mean of fr.trust.att_reassure, fr.trust.att_worry
//   avoidant = mean of fr.trust.att_space, fr.trust.att_depend
//   Style: secure if both < 3.25; anxious if anxious >= 3.25 and >= avoidant + 0.5;
//   avoidant if avoidant >= 3.25 and >= anxious + 0.5; otherwise mixed. unknown if neither is answered.
//   Pairing text is attached to the trust area. Same labels as psychology.js; the words are friendship words.
//
// Conflict block (Gottman-style sharp moments and repair)
//   horsemen = mean of fr.conflict.criticism, sarcasm, defensive, withdraw (sharp moments)
//   repair   = mean of fr.conflict.repair, apology, gentle (repair)
//   Both horsemen >= 3.5: caution. Sarcasm >= 4 for either: caution (contempt is the pattern most
//   linked to strain). Repair <= 2.5 for either: talk. Both repair >= 3.5: strength.
//
// Comfort (deep.comfort): "is this friend comfortable for me", both directions
//   Components, each 0-100 or null:
//     trust        = trust area score (similarity closeness, attachment items included)
//     boundaries   = fit of boundaries items. Per item: match 1, close 0.6, different 0.3. Mean x 100.
//     repair       = mean of both people's repair answers, each normalised (x - 1) / 4. x 100.
//     support      = mean of (a) support-style fit: match 1, close 0.6, different 0.3 on
//                    fr.support.crisis, style, stay; and (b) responsiveness: mean of both
//                    people's fr.support.notice, respond, ask, each normalised (x - 1) / 4. x 100.
//     communication = fit of communication items, same mapping as boundaries.
//   score = mean of the components present. Null unless trust and support are both present.
//   Signals: trust >= 75 strength, < 45 talk; boundaries >= 70 strength, < 45 talk;
//   support responsiveness >= 70 strength, < 45 talk; communication fit >= 70 strength, < 45 talk;
//   conflict flags from the conflict block (caution, talk, strength) are copied in.
//
// Values (deep.values)
//   alignment.score = mean closeness over the values items and the trust items that are not
//   attachment items, excluding dealbreakers. sharedCore: items with status 'match'.
//   differences: items with status 'gap'.
//
// Overall score
//   Weighted mean of similarity-area scores: thinking 1.4, values 1.3, trust 1.4, fun 0.8, ambition 0.8.
//   0-100, null if no similarity answers. Bands: >= 80 strong, >= 60 good, >= 40 mixed, else far.
// ---------------------------------------------------------------------------

import { FRIEND_QUESTIONS, FRIEND_DIMENSIONS } from './friend-questions.js';

const SIMILARITY_WEIGHTS = { thinking: 1.4, values: 1.3, trust: 1.4, fun: 0.8, ambition: 0.8 };
const HORSEMEN = ['fr.conflict.criticism', 'fr.conflict.sarcasm', 'fr.conflict.defensive', 'fr.conflict.withdraw'];
const REPAIR = ['fr.conflict.repair', 'fr.conflict.apology', 'fr.conflict.gentle'];
const RESPONSIVE = ['fr.support.notice', 'fr.support.respond', 'fr.support.ask'];
const SUPPORT_STYLE = ['fr.support.crisis', 'fr.support.style', 'fr.support.stay'];
const ATTACH_ANXIOUS = ['fr.trust.att_reassure', 'fr.trust.att_worry'];
const ATTACH_AVOIDANT = ['fr.trust.att_space', 'fr.trust.att_depend'];
const ATTACH_IDS = new Set([...ATTACH_ANXIOUS, ...ATTACH_AVOIDANT]);
const THINK_FACETS = ['closure', 'evidence', 'openness', 'flexibility'];
const ALIGNED = new Set(['match', 'both-low', 'shared']);
const FIT = { match: 1, close: 0.6, different: 0.3 };

const BANDS = {
  strong: {
    label: 'Strongly aligned',
    blurb: 'You line up on most of the everyday basics. Enjoy what you share, and keep talking about the rest.',
  },
  good: {
    label: 'Good alignment, a few things to talk through',
    blurb: 'You agree on most basics, and a few places are worth a conversation. That is normal, and a good thing to do together.',
  },
  mixed: {
    label: 'Mixed, with a lot to talk through',
    blurb: 'You differ on several basics. Go slowly and pick one or two topics to explore first.',
  },
  far: {
    label: 'Very different on the basics, so go slowly',
    blurb: 'Your answers differ a lot on the basics. Treat that as something to talk about, not a verdict, and take your time.',
  },
  unknown: {
    label: 'Not enough answers yet',
    blurb: 'Answer a few more of the everyday questions to see an overall picture.',
  },
};

const PROMPTS = {
  thinking: [
    'When a decision matters, do you want to decide quickly or talk it through for a while?',
    'How do you each like to hear that someone has changed their mind?',
  ],
  values: [
    'Which of your values did you learn from your family, and which did you choose yourself?',
    'What does a good person do, in your view, that you would most like a friend to do too?',
  ],
  trust: [
    'What would you need to see from a friend to feel that a secret is safe with them?',
    'How do you each like to be reassured that a friend still values you?',
  ],
  boundaries: [
    'How often would you each like to see each other, and what does that look like in a normal month?',
    'What would you want a friend to know before lending them money?',
  ],
  conflict: [
    'What helps each of you calm down before you talk about something hard?',
    'When you fell out before, what made it easier to come back together?',
  ],
  support: [
    'When you are struggling, what does the most helpful kind of support look like?',
    'How would you like a friend to check in on you during a hard month?',
  ],
  fun: [
    'What is the best day out you have had with a friend?',
    'What kind of humour do you hope your friendship has more of?',
  ],
  communication: [
    'How do you like to be told that something is bothering you?',
    'What helps you feel heard in a long conversation with a friend?',
  ],
  ambition: [
    'What does a good year look like for you, and how much of it do you want to share with friends?',
    'How do you feel about a friend taking a big risk you would not take yourself?',
  ],
};

const NOTES = {
  close: 'Close, with a little room.',
  gap: 'Different answers, worth a conversation.',
  different: 'Different answers, worth a conversation.',
  'both-low': 'You both keep this low.',
  'both-high': 'You both lean on this.',
  note: 'Your styles differ here.',
  shared: 'You both see this as a non-negotiable.',
  bothNo: 'Neither of you needs this as a dealbreaker.',
  talk: 'One of you says yes and the other no.',
};

const STRENGTH_TEXT = {
  similarity: (t) => `Most of your answers on ${t.toLowerCase()} line up.`,
  complementary: (t) => `Most of your answers on ${t.toLowerCase()} fit well together.`,
  conflict: () => 'You both keep most disagreement habits in a calm range.',
};

const FRICTION_TEXT = 'A common friction pattern in friendships: one of you tends to want closeness and reassurance while the other tends to need space. Name it together, and agree how you will check in.';

const FACET_WORDS = {
  closure: { high: 'settling on an answer quickly', low: 'keeping a question open for longer' },
  evidence: { high: 'checking facts and evidence first', low: 'going with a gut feeling' },
  openness: { high: 'trying out new ideas', low: 'sticking with what is already known' },
  flexibility: { high: 'going with the flow', low: 'planning ahead' },
};

const FACET_TOPIC = {
  closure: 'how quickly you settle on answers',
  evidence: 'how much you rely on evidence or gut feeling',
  openness: 'how open you are to new ideas',
  flexibility: 'how much you plan ahead or go with the flow',
};

// ---------- small helpers ----------

const asObj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const clip = (s, max = 160) => (s.length <= max ? s : `${s.slice(0, max - 3).trimEnd()}...`);
const round2 = (n) => (n == null ? null : Math.round(n * 100) / 100);
const mean = (xs) => {
  const v = xs.filter((x) => typeof x === 'number' && Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};
const capital = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

function joinList(xs) {
  if (xs.length <= 1) return xs.join('');
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
}

function normNumeric(v) {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 1 || n > 5) return null;
  return n;
}

function normChoice(q, v) {
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const opt = (q.options || []).find((o) => String(o.value) === String(v));
  return opt ? opt.value : null;
}

// 'maybe' is not used in V1; it is treated as 'no' if it appears.
function normDealbreaker(v) {
  if (typeof v !== 'string') return null;
  const s = v.trim().toLowerCase();
  if (s === 'yes') return 'yes';
  if (s === 'no' || s === 'maybe') return 'no';
  return null;
}

function normalize(q, raw) {
  switch (q.type) {
    case 'likert':
    case 'scale':
      return normNumeric(raw);
    case 'choice':
      return normChoice(q, raw);
    case 'dealbreaker':
      return normDealbreaker(raw);
    case 'text':
      return typeof raw === 'string' ? raw : '';
    default:
      return null;
  }
}

function label(q, v) {
  switch (q.type) {
    case 'likert': {
      const names = ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'];
      return names[v - 1] || String(v);
    }
    case 'scale':
      return `${v} of 5`;
    case 'choice': {
      const o = (q.options || []).find((x) => x.value === v);
      return o ? o.label : String(v);
    }
    case 'dealbreaker':
      return v === 'yes' ? 'Yes' : 'No';
    default:
      return String(v);
  }
}

// Closeness for an already-normalised pair, used for the values block.
function closenessOf(mine, theirs) {
  if (typeof mine === 'number' && typeof theirs === 'number') return 1 - Math.abs(mine - theirs) / 4;
  return mine === theirs ? 1 : 0;
}

// ---------- names ----------

function namesFor(opts) {
  const o = asObj(opts);
  const my = typeof o.myName === 'string' && o.myName.trim() ? o.myName.trim() : '';
  const pn = typeof o.partnerName === 'string' && o.partnerName.trim() ? o.partnerName.trim() : '';
  return {
    me: { name: my || 'you', you: !my },
    them: { name: pn || 'your friend', you: false },
  };
}

// Subject and verb helpers so "you" takes "tend" and a name takes "tends".
const sub = (p, start = false) => {
  if (p.you) return start ? 'You' : 'you';
  return start ? capital(p.name) : p.name;
};
const tends = (p) => (p.you ? 'tend' : 'tends');
const vb = (p, base, third) => (p.you ? base : third);

// ---------- item classification ----------

function classify(rule, q, a, b) {
  if (q.type === 'dealbreaker') {
    if (a === 'yes' && b === 'yes') return { status: 'shared', note: NOTES.shared };
    if (a === 'no' && b === 'no') return { status: 'match', note: NOTES.bothNo };
    return { status: 'talk', note: NOTES.talk };
  }
  const numeric = q.type === 'likert' || q.type === 'scale';
  const same = a === b;
  switch (rule) {
    case 'similarity': {
      if (numeric) {
        const c = 1 - Math.abs(a - b) / 4;
        const status = c >= 0.75 ? 'match' : c >= 0.5 ? 'close' : 'gap';
        return { status, closeness: c, note: NOTES[status] || '' };
      }
      if (q.type === 'choice') {
        return same
          ? { status: 'match', closeness: 1, note: '' }
          : { status: 'gap', closeness: 0, note: NOTES.gap };
      }
      return null;
    }
    case 'complementary': {
      if (numeric) {
        const d = Math.abs(a - b);
        const status = d <= 1 ? 'match' : d >= 3 ? 'different' : 'close';
        return { status, note: NOTES[status] || '' };
      }
      if (q.type === 'choice') {
        return same ? { status: 'match', note: '' } : { status: 'different', note: NOTES.different };
      }
      return null;
    }
    case 'conflict': {
      if (numeric) {
        let status = 'note';
        if (a <= 2 && b <= 2) status = 'both-low';
        else if (a >= 4 && b >= 4) status = 'both-high';
        return { status, note: NOTES[status] || '' };
      }
      if (q.type === 'choice') {
        return same ? { status: 'match', note: '' } : { status: 'note', note: NOTES.note };
      }
      return null;
    }
    default:
      return null;
  }
}

// ---------- areas ----------

function buildArea(key, A, B) {
  const dim = FRIEND_DIMENSIONS[key];
  const isSim = dim.rule === 'similarity';
  const items = [];
  const closeness = [];

  for (const q of FRIEND_QUESTIONS) {
    if (q.dimension !== key || q.type === 'text') continue;
    const a = normalize(q, A[q.id]);
    const b = normalize(q, B[q.id]);
    if (a === null || b === null) continue;
    const r = classify(dim.rule, q, a, b);
    if (!r) continue;
    items.push({
      id: q.id,
      text: q.text,
      type: q.type,
      mine: a,
      theirs: b,
      mineLabel: label(q, a),
      theirsLabel: label(q, b),
      status: r.status,
      note: r.note,
    });
    if (isSim && typeof r.closeness === 'number') closeness.push(r.closeness);
  }

  const score = isSim && closeness.length ? Math.round(mean(closeness) * 100) : null;

  const flags = [];
  const n = items.length;
  const alignedCount = items.filter((i) => ALIGNED.has(i.status)).length;
  const strengthFn = STRENGTH_TEXT[dim.rule];
  if (n && strengthFn && alignedCount / n > 0.5) {
    flags.push({ level: 'strength', text: strengthFn(dim.title) });
  }
  for (const i of items) {
    if (i.status === 'gap' || i.status === 'different') {
      flags.push({ level: 'talk', text: `You answered differently on: ${i.text}` });
    }
  }

  const prompts = [...(PROMPTS[key] || [])];
  for (const i of items) {
    if (i.status === 'gap' || i.status === 'different') {
      prompts.push(`You answered differently on: ${i.text}. Ask each other what is behind your answer.`);
    }
  }

  return {
    dimension: key,
    title: dim.title,
    rule: dim.rule,
    blurb: dim.blurb,
    score,
    items,
    prompts,
    flags,
  };
}

// ---------- attachment (closeness and reassurance) ----------

function attachmentRaw(A) {
  const anxious = mean(ATTACH_ANXIOUS.map((id) => normNumeric(A[id])));
  const avoidant = mean(ATTACH_AVOIDANT.map((id) => normNumeric(A[id])));
  if (anxious === null && avoidant === null) {
    return { style: 'unknown', anxious: null, avoidant: null };
  }
  const an = anxious ?? 0;
  const av = avoidant ?? 0;
  let style;
  if (an < 3.25 && av < 3.25) style = 'secure';
  else if (an >= 3.25 && an >= av + 0.5) style = 'anxious';
  else if (av >= 3.25 && av >= an + 0.5) style = 'avoidant';
  else style = 'mixed';
  return { style, anxious, avoidant };
}

function pairingFor(m, t) {
  if (m.style === 'unknown' || t.style === 'unknown') {
    return { level: 'talk', text: 'Not enough answers yet to describe closeness in this friendship.' };
  }
  const pair = [m.style, t.style];
  const has = (s) => pair.includes(s);
  if (m.style === 'secure' && t.style === 'secure') {
    return { level: 'strength', text: 'You both feel fairly settled about closeness, a steady base for this friendship.' };
  }
  if (has('secure')) {
    return { level: 'strength', text: 'One of you feels settled about closeness, which can steady the other.' };
  }
  if (has('anxious') && has('avoidant')) {
    return { level: 'talk', text: FRICTION_TEXT };
  }
  if (m.style === 'anxious' && t.style === 'anxious') {
    return { level: 'talk', text: 'You both look for reassurance, so agree a simple way to check in.' };
  }
  if (m.style === 'avoidant' && t.style === 'avoidant') {
    return { level: 'talk', text: 'You both value space, so plan time together on purpose.' };
  }
  return { level: 'talk', text: 'Your closeness styles differ a little, so ask each other what steady contact looks like.' };
}

// ---------- conflict (sharp moments and repair) ----------

function conflictRaw(A) {
  return {
    horsemen: mean(HORSEMEN.map((id) => normNumeric(A[id]))),
    repair: mean(REPAIR.map((id) => normNumeric(A[id]))),
    sarcasm: normNumeric(A['fr.conflict.sarcasm']),
  };
}

function conflictFlags(m, t) {
  const flags = [];
  if (m.horsemen !== null && t.horsemen !== null && m.horsemen >= 3.5 && t.horsemen >= 3.5) {
    flags.push({ level: 'caution', text: 'You both lean on sharp moments in disagreements. Pick one habit to watch together.' });
  }
  if ([m.sarcasm, t.sarcasm].some((c) => c !== null && c >= 4)) {
    flags.push({
      level: 'caution',
      text: 'Sarcasm or a mocking tone is one of the patterns most linked to strain, so talk about how it shows up for each of you.',
    });
  }
  if ([m.repair, t.repair].some((r) => r !== null && r <= 2.5)) {
    flags.push({ level: 'talk', text: 'Making up after a falling-out may be hard for one of you, so plan a small first step together.' });
  }
  if (m.repair !== null && t.repair !== null && m.repair >= 3.5 && t.repair >= 3.5) {
    flags.push({ level: 'strength', text: 'You both know how to make up after a disagreement.' });
  }
  return flags;
}

// ---------- thinking ----------

function facetMeans(A) {
  const out = {};
  for (const f of THINK_FACETS) {
    const prefix = `fr.think.${f}.`;
    const xs = FRIEND_QUESTIONS
      .filter((q) => q.dimension === 'thinking' && q.id.startsWith(prefix))
      .map((q) => normNumeric(A[q.id]));
    out[f] = mean(xs);
  }
  return out;
}

function leanWord(f, v) {
  if (v === null || v === undefined || v === 3) return null;
  if (v > 3) return FACET_WORDS[f].high;
  return FACET_WORDS[f].low;
}

function alignLabel(score) {
  if (score === null) return 'Not enough answers yet';
  if (score >= 80) return 'Similar ways of thinking';
  if (score >= 60) return 'Mostly similar, with a few differences';
  if (score >= 40) return 'Some different ways of deciding';
  return 'Quite different ways of thinking';
}

function thinkingBlock(A, B, names) {
  const fm = facetMeans(A);
  const fb = facetMeans(B);
  const closenessList = [];
  const diffs = [];
  const aligned = [];

  for (const f of THINK_FACETS) {
    if (fm[f] === null || fb[f] === null) continue;
    const gap = Math.abs(fm[f] - fb[f]);
    closenessList.push(1 - gap / 4);
    if (gap >= 2) diffs.push(f);
    else aligned.push(f);
  }

  const score = closenessList.length ? Math.round(mean(closenessList) * 100) : null;

  let text;
  if (score === null) {
    text = 'Not enough thinking answers yet to compare how you decide.';
  } else if (diffs.length === 0) {
    text = 'You think and decide in similar ways, so big choices may feel natural to make together. This describes tendencies, not fixed traits.';
  } else {
    const parts = diffs.map((f) => {
      const a = leanWord(f, fm[f]);
      const b = leanWord(f, fb[f]);
      const left = a ? `${sub(names.me)} ${tends(names.me)} to lean toward ${a}` : `${sub(names.me)} ${vb(names.me, 'sit', 'sits')} in the middle`;
      const right = b ? `${sub(names.them)} ${tends(names.them)} toward ${b}` : `${sub(names.them)} ${vb(names.them, 'sit', 'sits')} in the middle`;
      return `On ${FACET_TOPIC[f]}, ${left}, while ${right}.`;
    });
    text = `${parts.join(' ')} This describes tendencies, not fixed traits, so it is worth asking each other what helps when a decision matters.`;
  }

  const pub = {
    mine: {
      closure: round2(fm.closure), evidence: round2(fm.evidence), openness: round2(fm.openness), flexibility: round2(fm.flexibility),
    },
    theirs: {
      closure: round2(fb.closure), evidence: round2(fb.evidence), openness: round2(fb.openness), flexibility: round2(fb.flexibility),
    },
    alignment: { score, label: alignLabel(score), text },
  };
  // Internal detail for the narrative only. Not part of the public shape.
  const internal = { aligned, diffs, fm, fb, score };
  return { pub, internal };
}

// ---------- comfort ----------

// Mean fit over non-dealbreaker items of a given area, using the complementary status map.
function fitOf(items) {
  const xs = items.filter((i) => i.type !== 'dealbreaker' && FIT[i.status] !== undefined).map((i) => FIT[i.status]);
  return xs.length ? mean(xs) * 100 : null;
}

// Repair for one person: mean of repair answers, normalised to 0-1.
function normalisedMean(A, ids) {
  const m = mean(ids.map((id) => normNumeric(A[id])));
  return m === null ? null : (m - 1) / 4;
}

function comfortBlock(A, B, areas, confFlags) {
  const byDim = Object.fromEntries(areas.map((a) => [a.dimension, a]));

  const trust = byDim.trust.score;

  const boundaries = fitOf(byDim.boundaries.items);

  // Both directions: average the two people's repair levels.
  const repairMine = normalisedMean(A, REPAIR);
  const repairTheirs = normalisedMean(B, REPAIR);
  const repairParts = [repairMine, repairTheirs].filter((x) => x !== null);
  const repair = repairParts.length ? mean(repairParts) * 100 : null;

  // Support: style fit plus responsiveness, both directions.
  const supportFit = fitOf(byDim.support.items.filter((i) => SUPPORT_STYLE.includes(i.id)));
  const respMine = normalisedMean(A, RESPONSIVE);
  const respTheirs = normalisedMean(B, RESPONSIVE);
  const respParts = [respMine, respTheirs].filter((x) => x !== null);
  const responsiveness = respParts.length ? mean(respParts) * 100 : null;
  const supportParts = [supportFit, responsiveness].filter((x) => x !== null);
  const support = supportParts.length ? mean(supportParts) : null;

  const communication = fitOf(byDim.communication.items);

  const components = [trust, boundaries, repair, support, communication].filter((x) => x !== null);
  const score = trust !== null && support !== null && components.length
    ? Math.round(mean(components))
    : null;

  const signals = [];
  if (trust !== null && trust >= 75) signals.push({ level: 'strength', text: 'Your answers on trust and loyalty line up closely.' });
  if (trust !== null && trust < 45) signals.push({ level: 'talk', text: 'Trust and loyalty answers differ quite a bit, so say out loud what loyalty and confidences mean to each of you.' });
  if (boundaries !== null && boundaries >= 70) signals.push({ level: 'strength', text: 'Your boundaries fit together well.' });
  if (boundaries !== null && boundaries < 45) signals.push({ level: 'talk', text: 'You differ on several boundaries, such as how often you meet, lending money or sharing opinions. Agree these out loud.' });
  if (responsiveness !== null && responsiveness >= 70) signals.push({ level: 'strength', text: 'You both tend to notice and reply when a friend is struggling.' });
  if (support !== null && support < 45) signals.push({ level: 'talk', text: 'Showing up for each other in hard moments looks uneven, so agree what a good check-in looks like.' });
  if (communication !== null && communication >= 70) signals.push({ level: 'strength', text: 'Your ways of talking and staying in touch fit together well.' });
  if (communication !== null && communication < 45) signals.push({ level: 'talk', text: 'You differ on how deep you like to talk or how often you want to be in touch. Agree a rhythm that works for both.' });
  for (const f of confFlags) signals.push({ level: f.level, text: f.text });

  let text;
  if (score === null) {
    text = 'Answer a few trust and support questions to see how comfortable this friendship feels.';
  } else if (score >= 75) {
    text = 'On these answers, this friendship feels comfortable for both of you. This describes how you each tend to act, not a fixed verdict.';
  } else if (score >= 60) {
    text = 'On these answers, this friendship is mostly comfortable, with a few places where a conversation would help.';
  } else if (score >= 45) {
    text = 'On these answers, some areas of this friendship need more talking through before they feel comfortable for both of you.';
  } else {
    text = 'On these answers, comfort between you is something to build on purpose. Start with the areas flagged below.';
  }

  const pub = {
    score,
    label: score === null ? 'Not enough answers yet'
      : score >= 75 ? 'Comfortable together'
        : score >= 60 ? 'Mostly comfortable'
          : score >= 45 ? 'Some areas to talk about'
            : 'Worth building on purpose',
    text,
    signals,
  };
  // Component scores for the narrative only. Not part of the public shape.
  const internal = { trust, boundaries, repair, support, communication };
  return { pub, internal };
}

// ---------- values ----------

function valuesBlock(areas) {
  const items = areas
    .filter((a) => a.dimension === 'values' || a.dimension === 'trust')
    .flatMap((a) => a.items)
    .filter((i) => i.type !== 'dealbreaker' && !ATTACH_IDS.has(i.id));

  const closenessList = items.map((i) => closenessOf(i.mine, i.theirs));
  const score = closenessList.length ? Math.round(mean(closenessList) * 100) : null;

  let text;
  if (score === null) text = 'Not enough values answers yet to compare what you each consider right and fair.';
  else if (score >= 80) text = 'You share most of your core values, so disagreements on everyday moral questions may be rare. Keep checking the differences below.';
  else if (score >= 60) text = 'You share many core values, with some differences worth talking about, especially where you each draw the line.';
  else if (score >= 40) text = 'You differ on several core values. That is worth knowing early, and it helps to say what each of you would not compromise on.';
  else text = 'You differ on most of the core values measured here. Go slowly, and talk about what matters most to each of you.';

  const sharedCore = items.filter((i) => i.status === 'match').map((i) => `You both answered the same on: ${i.text}`);
  const differences = items.filter((i) => i.status === 'gap').map((i) => `You answered differently on: ${i.text}`);

  return {
    alignment: {
      score,
      label: score === null ? 'Not enough answers yet'
        : score >= 80 ? 'Shared core values'
          : score >= 60 ? 'Mostly shared values'
            : score >= 40 ? 'Some different values'
              : 'Different on several values',
      text,
    },
    sharedCore,
    differences,
  };
}

// ---------- narrative ----------

// Tendency-only paragraphs, one per theme. Written from the rules above, never from labels.
// th = thinking internal, cf = comfort internal (components), cp = comfort public, trustScore = trust area score.
function narrativeFor(names, th, cp, cf, trustScore, attachment, conflict) {
  const clauseFor = (p) => {
    const facets = p === names.me ? th.internal.fm : th.internal.fb;
    const leans = THINK_FACETS
      .map((f) => leanWord(f, facets[f]))
      .filter(Boolean);
    return leans.length ? `${sub(p, true)} ${tends(p)} to lean toward ${joinList(leans)}.` : null;
  };
  const p1Parts = [clauseFor(names.me), clauseFor(names.them)].filter(Boolean);
  const p1 = p1Parts.length
    ? p1Parts.join(' ')
    : 'Not enough thinking answers yet to describe how each of you decides.';

  const alignedTopics = th.internal.aligned.map((f) => FACET_TOPIC[f]);
  const p2 = alignedTopics.length
    ? `Your thinking lines up most on ${joinList(alignedTopics)}. On those, decisions may feel natural to make together.`
    : th.internal.diffs.length
      ? 'Your thinking does not line up closely on any of the measured tendencies, so decisions may need more explicit agreement.'
      : 'Not enough thinking answers yet to say where your thinking lines up.';

  const diffTopics = th.internal.diffs.map((f) => FACET_TOPIC[f]);
  const p3 = diffTopics.length
    ? `Your thinking pulls apart most on ${joinList(diffTopics)}. That is a difference in tendency, not a fault in either of you, so decisions on those points may need more time and an explicit agreement.`
    : 'No clear differences showed up in how you each reason, so the bigger questions are more likely to be about trust, boundaries and how you handle disagreements.';

  const trustSentence = trustScore === null
    ? 'Not enough trust answers yet to say how you each handle loyalty and confidences.'
    : trustScore >= 75
      ? 'On trust, you line up closely on loyalty, keeping confidences and reliability, which gives you a solid base to build on.'
      : trustScore >= 50
        ? 'On trust, you are mostly close, with a few habits worth checking, such as how you each read a cancelled plan or a private story.'
        : 'On trust, you differ on several habits, so it helps to say out loud what loyalty and confidences mean to each of you.';
  const closenessClause = (p, style) => {
    if (style === 'secure') return `${sub(p)} ${vb(p, 'feel', 'feels')} fairly settled about closeness`;
    if (style === 'anxious') return `${sub(p)} ${tends(p)} to look for more reassurance that the friendship is still solid`;
    if (style === 'avoidant') return `${sub(p)} ${tends(p)} to value space, even with close friends`;
    if (style === 'mixed') return `${sub(p)} ${vb(p, 'sit', 'sits')} somewhere in between`;
    return null;
  };
  const closenessClauses = [
    closenessClause(names.me, attachment.mine.style),
    closenessClause(names.them, attachment.theirs.style),
  ].filter(Boolean);
  const p4 = closenessClauses.length
    ? `${trustSentence} On closeness, ${closenessClauses.join(', and ')}.`
    : trustSentence;

  let p5;
  if (cp.score === null) {
    p5 = 'Not enough trust and support answers yet to say how comfortable this friendship feels.';
  } else {
    const strain = cp.signals.find((s) => s.level === 'talk' || s.level === 'caution');
    p5 = `${cp.text}${strain ? ` One thing to talk about: ${strain.text}` : ''}`;
  }

  const candidates = [];
  if (th.score !== null && th.score < 60) {
    candidates.push('Talk about how you each like to decide something important, such as a shared trip or a loan, and agree who gathers the facts and who goes with their gut.');
  }
  if (conflict.some((f) => f.level === 'talk' || f.level === 'caution')) {
    candidates.push('Agree a small first step after a falling-out, such as who reaches out first and roughly how soon.');
  }
  if (cf.boundaries !== null && cf.boundaries < 70) {
    candidates.push('Talk about how often you want to see each other, and what each of you thinks about lending money, before it comes up.');
  }
  if (cf.support !== null && cf.support < 70) {
    candidates.push('Ask what helps each of you when things are hard: practical help, a listening ear, or some space.');
  }
  candidates.push('Ask each other what loyalty and keeping a confidence look like in practice, and what would break trust for each of you.');
  candidates.push('Share one thing from your reflection answers that you would like the other person to know.');
  const picked = [...new Set(candidates)].slice(0, 3);
  const p6 = `Three conversations to try next. ${picked.join(' ')}`;

  return [p1, p2, p3, p4, p5, p6];
}

// ---------- public ----------

export function computeFriendshipReport(mine, theirs, opts) {
  const A = asObj(mine);
  const B = asObj(theirs);
  const names = namesFor(opts);

  // Attachment first, so its pairing flag can sit on the trust area.
  const attM = attachmentRaw(A);
  const attT = attachmentRaw(B);
  const pairing = pairingFor(attM, attT);

  const areas = Object.keys(FRIEND_DIMENSIONS)
    .filter((k) => k !== 'reflection')
    .map((k) => {
      const area = buildArea(k, A, B);
      if (k === 'trust') area.flags = [...area.flags, { level: pairing.level, text: pairing.text }];
      return area;
    });

  // Overall score: weighted mean of similarity-area scores.
  let num = 0;
  let den = 0;
  for (const area of areas) {
    const w = SIMILARITY_WEIGHTS[area.dimension];
    if (w && area.score !== null) {
      num += w * area.score;
      den += w;
    }
  }
  const overallScore = den ? Math.round(num / den) : null;
  const bandKey = overallScore === null ? 'unknown'
    : overallScore >= 80 ? 'strong'
      : overallScore >= 60 ? 'good'
        : overallScore >= 40 ? 'mixed'
          : 'far';
  const band = { key: bandKey, label: BANDS[bandKey].label, blurb: BANDS[bandKey].blurb };

  const conM = conflictRaw(A);
  const conT = conflictRaw(B);
  const conflictFlagList = conflictFlags(conM, conT);

  const dealbreakers = [];
  for (const q of FRIEND_QUESTIONS) {
    if (q.type !== 'dealbreaker') continue;
    const a = normalize(q, A[q.id]);
    const b = normalize(q, B[q.id]);
    if (a === null || b === null) continue;
    const r = classify(null, q, a, b);
    dealbreakers.push({
      id: q.id,
      text: q.text,
      status: r.status,
      mineLabel: label(q, a),
      theirsLabel: label(q, b),
    });
  }

  const strengths = [];
  const topics = [];
  for (const area of areas) {
    if (area.score !== null && area.score >= 80) {
      strengths.push(clip(`Your answers on ${area.title.toLowerCase()} line up closely.`));
    }
    for (const f of area.flags) {
      if (f.level === 'strength') strengths.push(clip(f.text));
      if (f.level === 'talk' || f.level === 'caution') topics.push(clip(f.text));
    }
  }
  for (const f of conflictFlagList) {
    if (f.level === 'strength') strengths.push(clip(f.text));
    if (f.level === 'talk' || f.level === 'caution') topics.push(clip(f.text));
  }
  for (const d of dealbreakers) {
    if (d.status === 'talk') topics.push(clip(`Talk about: ${d.text}`));
  }

  const reflections = FRIEND_QUESTIONS.filter((q) => q.type === 'text').map((q) => ({
    id: q.id,
    text: q.text,
    mine: normalize(q, A[q.id]),
    theirs: normalize(q, B[q.id]),
  }));

  const styleOut = (r) => ({ style: r.style, anxious: round2(r.anxious), avoidant: round2(r.avoidant) });
  const conflictOut = (c) => ({ horsemen: round2(c.horsemen), repair: round2(c.repair) });

  // Deep block.
  const th = thinkingBlock(A, B, names);
  const cm = comfortBlock(A, B, areas, conflictFlagList);
  const valuesOut = valuesBlock(areas);
  const trustScore = areas.find((a) => a.dimension === 'trust').score;
  const narrative = narrativeFor(
    names,
    { internal: th.internal, score: th.internal.score, alignment: th.pub.alignment },
    cm.pub,
    cm.internal,
    trustScore,
    { mine: styleOut(attM), theirs: styleOut(attT) },
    conflictFlagList,
  );

  return {
    overall: { score: overallScore, band },
    areas,
    attachment: {
      mine: styleOut(attM),
      theirs: styleOut(attT),
      pairing: { level: pairing.level, text: pairing.text },
    },
    conflict: {
      mine: conflictOut(conM),
      theirs: conflictOut(conT),
      flags: conflictFlagList.map((f) => ({ level: f.level, text: f.text })),
    },
    dealbreakers,
    strengths,
    topics,
    reflections,
    deep: {
      thinking: th.pub,
      comfort: cm.pub,
      values: valuesOut,
      narrative,
    },
  };
}
