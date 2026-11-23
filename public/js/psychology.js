// Pure scoring for the couples compatibility report. No DOM, no fetch, no side effects.
//
// computeReport(mine, theirs) takes two answer objects keyed by question id and
// returns the report shape used by the results screen. Missing or invalid answers
// are skipped, never thrown on.

import { QUESTIONS, DIMENSIONS, LIKERT } from './questions.js';

const SIMILARITY_WEIGHTS = { goals: 1.5, values: 1.2, money: 1.0, lifestyle: 0.8 };
const HORSEMEN = ['con.criticism', 'con.contempt', 'con.defensive', 'con.stonewall'];
const REPAIR = ['con.repair', 'con.timeout', 'con.gentle'];
const ALIGNED = new Set(['match', 'both-low', 'shared']);
const ATTACH_ANXIOUS = ['att.worry', 'att.reassure', 'att.jealous'];
const ATTACH_AVOIDANT = ['att.depend', 'att.distance', 'att.indep'];

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
  communication: [
    'When you are both tired, what helps you talk well with each other?',
    'How would you like to be told when something is bothering you?',
  ],
  lifestyle: [
    'What does a great ordinary weekday look like for each of you?',
    'Which everyday habit would you most like to keep, and which one could you flex on?',
  ],
  affection: [
    'How would each of you like to be shown love on a hard day?',
    'What is one small thing your partner does that makes you feel seen?',
  ],
  values: [
    'Which values did you learn from your families, and which have you chosen for yourselves?',
    'What would a home built on these values feel like to each of you?',
  ],
  social: [
    'How much time with friends feels right for each of you in a typical month?',
    'What helps you recharge after a busy social week?',
  ],
  conflict: [
    'What helps each of you calm down before you talk about something hard?',
    'When you disagreed in the past, what made it easier to come back together?',
  ],
  attachment: [
    'When do you each feel most reassured in this relationship?',
    'What does a good amount of alone time look like for each of you?',
  ],
  money: [
    'What does financial security mean to each of you?',
    'How would you like to decide on a purchase above an amount you both agree on?',
  ],
  goals: [
    'Where do you each picture yourselves living in five years?',
    'Which goal would you most want to support in each other?',
  ],
  decisions: [
    'Think of a recent decision you made well together. What made it work?',
    'How do you want to decide when you disagree on something important?',
  ],
  dealbreakers: [
    'Which of your non-negotiables is the hardest to explain to someone else, and why?',
    'What would help you feel safe talking about a non-negotiable the other one does not share?',
  ],
};

const NOTES = {
  close: 'Close, with a little room.',
  gap: 'Different answers, worth a conversation.',
  different: 'Different answers, worth a conversation.',
  'both-low': 'You both keep this low.',
  'both-high': 'You both lean on this.',
  note: 'Your styles differ here.',
  attachment: 'Described in the style summary above.',
  shared: 'You both see this as a non-negotiable.',
  bothNo: 'Neither of you needs this as a dealbreaker.',
  talk: 'One of you says yes and the other no.',
};

const STRENGTH_TEXT = {
  similarity: (t) => `Most of your answers on ${t.toLowerCase()} line up.`,
  complementary: (t) => `Most of your answers on ${t.toLowerCase()} fit well together.`,
  conflict: () => 'You both keep most conflict habits in a calm range.',
  dealbreaker: () => 'Most of your non-negotiables line up.',
};

const FRICTION_TEXT = 'A common friction pattern: one of you tends to want closeness and reassurance while the other tends to need space. Name it together, and agree how you will check in.';

// ---------- small helpers ----------

const asObj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const clip = (s, max = 160) => (s.length <= max ? s : `${s.slice(0, max - 3).trimEnd()}...`);
const round2 = (n) => (n == null ? null : Math.round(n * 100) / 100);
const mean = (xs) => {
  const v = xs.filter((x) => typeof x === 'number' && Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

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
      const o = LIKERT.find((l) => l.value === v);
      return o ? o.label : String(v);
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

// ---------- item classification ----------

function classify(rule, q, a, b) {
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
        return same
          ? { status: 'match', note: '' }
          : { status: 'different', note: NOTES.different };
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
    case 'attachment':
      return { status: 'note', note: NOTES.attachment };
    case 'dealbreaker': {
      if (a === 'yes' && b === 'yes') return { status: 'shared', note: NOTES.shared };
      if (a === 'no' && b === 'no') return { status: 'match', note: NOTES.bothNo };
      return { status: 'talk', note: NOTES.talk };
    }
    default:
      return null;
  }
}

// ---------- areas ----------

function buildArea(key, A, B) {
  const dim = DIMENSIONS[key];
  const isSim = dim.rule === 'similarity';
  const items = [];
  const closeness = [];

  for (const q of QUESTIONS) {
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
    if (dim.rule === 'conflict' && i.status === 'both-high' && HORSEMEN.includes(i.id)) {
      flags.push({ level: 'caution', text: `You both score high on: ${i.text}. Pick one habit to watch together.` });
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

// ---------- attachment ----------

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
    return { level: 'talk', text: 'Not enough answers yet to describe attachment.' };
  }
  const pair = [m.style, t.style];
  const has = (s) => pair.includes(s);
  if (m.style === 'secure' && t.style === 'secure') {
    return { level: 'strength', text: 'You both feel secure, a solid base for closeness.' };
  }
  if (has('secure')) {
    return { level: 'strength', text: 'One of you feels secure, which helps steady the other.' };
  }
  if (has('anxious') && has('avoidant')) {
    return { level: 'talk', text: FRICTION_TEXT };
  }
  if (m.style === 'anxious' && t.style === 'anxious') {
    return { level: 'talk', text: 'You both like reassurance, so agree on a simple way to check in.' };
  }
  if (m.style === 'avoidant' && t.style === 'avoidant') {
    return { level: 'talk', text: 'You both value space, so plan time together on purpose.' };
  }
  return { level: 'talk', text: 'Your closeness styles differ a little, so ask each other what steady closeness looks like.' };
}

// ---------- conflict ----------

function conflictRaw(A) {
  return {
    horsemen: mean(HORSEMEN.map((id) => normNumeric(A[id]))),
    repair: mean(REPAIR.map((id) => normNumeric(A[id]))),
    contempt: normNumeric(A['con.contempt']),
  };
}

function conflictFlags(m, t) {
  const flags = [];
  if (m.horsemen !== null && t.horsemen !== null && m.horsemen >= 3.5 && t.horsemen >= 3.5) {
    flags.push({ level: 'caution', text: 'You both lean on sharp conflict habits. Pick one habit to watch together.' });
  }
  if ([m.contempt, t.contempt].some((c) => c !== null && c >= 4)) {
    flags.push({
      level: 'caution',
      text: 'Contempt is the pattern most linked to breakdown, so talk about how sarcasm or eye-rolling shows up for each of you.',
    });
  }
  if ([m.repair, t.repair].some((r) => r !== null && r <= 2.5)) {
    flags.push({ level: 'talk', text: 'Repairing after a fight is hard for one of you, so plan a small repair step together.' });
  }
  if (m.repair !== null && t.repair !== null && m.repair >= 3.5 && t.repair >= 3.5) {
    flags.push({ level: 'strength', text: 'You both know how to repair after a fight.' });
  }
  return flags;
}

// ---------- public ----------

export function computeReport(mine, theirs) {
  const A = asObj(mine);
  const B = asObj(theirs);

  // Attachment first, so its pairing flag can sit on the attachment area.
  const attM = attachmentRaw(A);
  const attT = attachmentRaw(B);
  const pairing = pairingFor(attM, attT);

  const areas = Object.keys(DIMENSIONS)
    .filter((k) => k !== 'reflection')
    .map((k) => {
      const area = buildArea(k, A, B);
      if (k === 'attachment') area.flags = [...area.flags, { level: pairing.level, text: pairing.text }];
      return area;
    });

  // Overall score: weighted mean of similarity area scores.
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

  const dealbreakers = (areas.find((a) => a.dimension === 'dealbreakers')?.items || []).map((i) => ({
    id: i.id,
    text: i.text,
    status: i.status,
    mineLabel: i.mineLabel,
    theirsLabel: i.theirsLabel,
  }));

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

  const reflections = QUESTIONS.filter((q) => q.type === 'text').map((q) => ({
    id: q.id,
    text: q.text,
    mine: normalize(q, A[q.id]),
    theirs: normalize(q, B[q.id]),
  }));

  const styleOut = (r) => ({ style: r.style, anxious: round2(r.anxious), avoidant: round2(r.avoidant) });
  const conflictOut = (c) => ({ horsemen: round2(c.horsemen), repair: round2(c.repair) });

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
  };
}
