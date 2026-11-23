// Pure results helpers: strongest and weakest areas, trend over snapshots, rank filters,
// two-person comparison, talk-first list and a privacy-safe share card.
// No DOM, no fetch, no side effects. Missing or bad input never throws.

const DAY_MS = 24 * 60 * 60 * 1000;
const CLOSING_LINE = 'A conversation tool, not a verdict.';

const asObj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const isNum = (n) => typeof n === 'number' && Number.isFinite(n);
const areasOf = (report) => (Array.isArray(asObj(report).areas) ? asObj(report).areas : []);
const scoredAreas = (report) => areasOf(report).filter((a) => a && isNum(a.score));

// Milliseconds for a Date-like value (ISO string, Date, or number). NaN when unreadable.
function toMs(v) {
  if (isNum(v)) return v;
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'string') return Date.parse(v);
  return NaN;
}

// ---------- 1. strongest and weakest areas ----------

export function strongestAndWeakest(report, n = 3) {
  const count = isNum(n) ? Math.max(0, Math.floor(n)) : 3;
  const ordered = scoredAreas(report)
    .map((a) => ({ title: a.title, score: a.score }))
    .sort((x, y) => y.score - x.score);

  const strongest = ordered.slice(0, count);
  const rest = ordered.slice(count);
  // Weakest are the lowest scores, listed lowest first, and never repeat a strongest area.
  const weakest = rest.slice(Math.max(0, rest.length - count)).reverse();
  return { strongest, weakest };
}

// ---------- 2. trend over snapshots ----------

export function trendFromSnapshots(snapshots) {
  const list = Array.isArray(snapshots) ? snapshots.filter((s) => s && typeof s === 'object') : [];
  const sorted = [...list].sort((x, y) => {
    const tx = toMs(x.createdAt);
    const ty = toMs(y.createdAt);
    const ax = Number.isFinite(tx) ? tx : 0;
    const ay = Number.isFinite(ty) ? ty : 0;
    return ax - ay;
  });

  const points = sorted.map((s) => ({
    at: s.createdAt ?? null,
    score: isNum(s.overallScore) ? s.overallScore : null,
    label: s.label ?? null,
  }));

  const numeric = points.filter((p) => p.score !== null);
  if (numeric.length < 2) {
    const text = numeric.length === 1
      ? 'You have one result so far, so there is no trend yet.'
      : 'No scores yet, so there is no trend to show.';
    return { points, delta: null, direction: null, text };
  }

  const first = numeric[0].score;
  const last = numeric[numeric.length - 1].score;
  const delta = last - first;

  if (Math.abs(delta) < 3) {
    return {
      points,
      delta,
      direction: 'steady',
      text: `Your overall score has stayed about the same, from ${first} to ${last}.`,
    };
  }
  if (delta > 0) {
    return {
      points,
      delta,
      direction: 'up',
      text: `Your overall score went up by ${delta} points, from ${first} to ${last}.`,
    };
  }
  return {
    points,
    delta,
    direction: 'down',
    text: `Your overall score went down by ${Math.abs(delta)} points, from ${first} to ${last}.`,
  };
}

// ---------- 3. rank list filters ----------

const DEFAULT_RECENT_MS = 30 * DAY_MS;

export function filterRankItems(items, opts) {
  if (!Array.isArray(items)) return [];
  const o = asObj(opts);
  const now = isNum(o.now) ? o.now : Date.now();
  const sinceMs = isNum(o.sinceMs) ? o.sinceMs : DEFAULT_RECENT_MS;
  const bandKey = typeof o.band === 'string' && o.band !== '' ? o.band : null;
  const cutoff = now - sinceMs;

  return items.filter((item) => {
    if (!item || typeof item !== 'object') return false;
    if (bandKey !== null) {
      const key = typeof item.band === 'string' ? item.band : item.band?.key;
      if (key !== bandKey) return false;
    }
    if (o.recentOnly === true) {
      const t = toMs(item.updatedAt);
      if (!Number.isFinite(t) || t < cutoff) return false;
    }
    return true;
  });
}

// ---------- 4. compare two people ----------

export function compareTwo(a, b) {
  const A = asObj(a);
  const B = asObj(b);
  const nameA = A.partnerName ?? null;
  const nameB = B.partnerName ?? null;
  const scoreA = isNum(A.overall?.score) ? A.overall.score : null;
  const scoreB = isNum(B.overall?.score) ? B.overall.score : null;

  const byKey = (report) => new Map(
    scoredAreas(report).map((area) => [area.dimension ?? area.title, area]),
  );
  const mapA = byKey(A);
  const mapB = byKey(B);

  const areas = [];
  for (const [key, areaA] of mapA) {
    const areaB = mapB.get(key);
    if (!areaB) continue;
    areas.push({
      title: areaA.title ?? areaB.title ?? String(key),
      scoreA: areaA.score,
      scoreB: areaB.score,
      gap: Math.abs(areaA.score - areaB.score),
    });
  }
  areas.sort((x, y) => y.gap - x.gap || (x.title < y.title ? -1 : x.title > y.title ? 1 : 0));

  let summary;
  if (areas.length === 0) {
    summary = 'There are not enough shared scores yet to say where you differ.';
  } else {
    const top = areas[0];
    const who = (name) => (typeof name === 'string' && name.trim() ? name.trim() : 'one of you');
    if (top.gap === 0) {
      summary = 'Your scores match on every area we can compare, so no area stands out as a difference.';
    } else {
      summary = `You differ most on ${top.title.toLowerCase()}: ${who(nameA)} scores ${top.scoreA} and ${who(nameB)} scores ${top.scoreB}, a gap of ${top.gap} points.`;
    }
  }

  return {
    names: [nameA, nameB],
    scores: [scoreA, scoreB],
    areas,
    summary,
  };
}

// ---------- 5. talk first ----------

const TOPIC_SEVERITY = 50;

export function talkFirst(report, insights, n = 5) {
  const count = isNum(n) ? Math.max(0, Math.floor(n)) : 5;
  const seen = new Set();
  const out = [];

  const push = (entry) => {
    if (out.length >= count) return;
    const key = String(entry.title ?? '').trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(entry);
  };

  // 1. Likely fights, most severe first.
  const fights = Array.isArray(asObj(insights).fightForecast) ? insights.fightForecast : [];
  const sortedFights = fights
    .filter((f) => f && typeof f === 'object' && typeof f.title === 'string')
    .map((f, i) => ({ f, i }))
    .sort((x, y) => (isNum(y.f.severity) ? y.f.severity : 0) - (isNum(x.f.severity) ? x.f.severity : 0) || x.i - y.i);
  for (const { f } of sortedFights) {
    push({
      title: f.title,
      why: f.psychology?.why ?? f.trigger ?? '',
      source: 'fight',
      severity: isNum(f.severity) ? f.severity : 0,
    });
  }

  // 2. Topics from the report.
  const topics = Array.isArray(asObj(report).topics) ? report.topics : [];
  for (const t of topics) {
    if (typeof t !== 'string' || !t.trim()) continue;
    push({ title: t, why: 'Worth agreeing on together.', source: 'topic', severity: TOPIC_SEVERITY });
  }

  // 3. Lowest-scoring areas.
  const lowest = scoredAreas(report).slice().sort((x, y) => x.score - y.score);
  for (const area of lowest) {
    push({
      title: area.title,
      why: `Your answers here are the furthest apart, so it is a good place to start.`,
      source: 'area',
      severity: 100 - area.score,
    });
  }

  return out;
}

// ---------- 6. share card ----------

// Built only from the score, the band label, the partner's display name and the top strength
// title. Never answers, item texts or raw ids.
export function shareCard(item) {
  const it = asObj(item);
  const name = typeof it.partnerName === 'string' && it.partnerName.trim()
    ? it.partnerName.trim().slice(0, 60)
    : 'your connection';
  const score = isNum(it.score) ? Math.round(it.score) : null;
  const band = typeof it.band === 'string' ? it.band : (typeof it.band?.label === 'string' ? it.band.label : '');

  const topStrengthArea = strongestAndWeakest(it.report ?? null, 1).strongest[0];
  const topStrength = topStrengthArea ? topStrengthArea.title : null;

  const lines = [
    `Compatibility with ${name}`,
    score === null ? 'Score: not scored yet' : `Score: ${score} out of 100`,
  ];
  if (band) lines.push(`Band: ${band}`);
  if (topStrength) lines.push(`Top strength: ${topStrength}`);

  return {
    title: `Compatibility with ${name}`,
    lines,
    band,
    score,
    safeText: [...lines, CLOSING_LINE].join('\n'),
  };
}
