// Results dashboard: hero -> shape (radar) -> clash forecast -> strengths -> bids -> deck -> areas -> words.
// Pure rendering. `report` comes from psychology.js and `insights` from the insights module;
// nothing here scores anything. Every string that reaches innerHTML goes through esc().

// ---------- helpers ----------
const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };
function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"'`]/g, (c) => ESC_MAP[c]);
}

const arr = (v) => (Array.isArray(v) ? v : []);
const obj = (v) => (v && typeof v === 'object' ? v : {});
const str = (v) => (v === null || v === undefined ? '' : String(v).trim());
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const pct = (v) => (isNum(v) ? Math.round(clamp(v, 0, 100)) : null);
const fx = (n) => String(Math.round(n * 10) / 10);
const reducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function initial(name) {
  const s = str(name);
  return s ? Array.from(s)[0].toUpperCase() : '♡';
}

const BAND_TONE = { strong: 'sage', good: 'sage', mixed: 'amber', far: 'plum' };
function scoreTone(score) {
  if (score === null) return 'neutral';
  if (score >= 70) return 'sage';
  if (score >= 45) return 'amber';
  return 'plum';
}

const STATUS = {
  match: { label: 'In sync', tone: 'sage' },
  shared: { label: 'Shared', tone: 'sage' },
  'both-low': { label: 'Both low stress', tone: 'sage' },
  close: { label: 'A little apart', tone: 'neutral' },
  gap: { label: 'Worth a talk', tone: 'amber' },
  talk: { label: 'Worth a talk', tone: 'amber' },
  'both-high': { label: 'Both high stress', tone: 'amber' },
  different: { label: 'A difference', tone: 'plum' },
  note: { label: 'Note', tone: 'neutral' },
};

const LIKELIHOOD = {
  likely: { label: 'Likely to come up', tone: 'plum' },
  possible: { label: 'Might come up', tone: 'amber' },
  low: { label: 'Less likely', tone: 'sage' },
};

const ICON = {
  chevron: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6l4 4 4-4"/></svg>',
  left: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 3L5 8l5 5"/></svg>',
  right: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3l5 5-5 5"/></svg>',
};

function ring(score, toneName, label, caption) {
  const value = pct(score);
  const aria = value === null ? `${label}: no score` : `${label}: ${value} out of 100`;
  const arc = value === null || value === 0
    ? ''
    : `<circle class="rv-ring-val" cx="60" cy="60" r="52" pathLength="100" style="--rv-val:${value}"></circle>`;
  const centre = value === null
    ? '<span class="rv-ring-empty">♡</span>'
    : `<span class="rv-ring-num"><span data-db-count="${value}">${value}</span><small>${esc(caption)}</small></span>`;
  return `<div class="rv-ring rv-ring--lg rv-tone-${toneName}" role="img" aria-label="${esc(aria)}">
    <svg viewBox="0 0 120 120" aria-hidden="true" focusable="false">
      <circle class="rv-ring-track" cx="60" cy="60" r="52"></circle>${arc}
    </svg>${centre}
  </div>`;
}

function answer(who, cls, text, blank) {
  const body = str(text);
  return `<div class="rv-answer ${cls}${body ? '' : ' rv-blank'}">
    <div class="rv-who ${cls === 'rv-mine' ? 'rv-me' : 'rv-them'}">${esc(who)}</div>
    <p>${esc(body || blank)}</p>
  </div>`;
}

function sourceLine(ids) {
  const n = arr(ids).length;
  if (!n) return '';
  return `<p class="db-source">Drawn from ${n} ${n === 1 ? 'answer' : 'answers'} you both gave.</p>`;
}

// Severity is expected as 0-100. Smaller scales (0-1, 1-5, 1-10) and words are mapped gently.
function severityScale(list) {
  const nums = list.map((f) => f.severity).filter(isNum);
  const max = nums.length ? Math.max(...nums) : 0;
  const mult = max <= 1 ? 100 : max <= 5 ? 20 : max <= 10 ? 10 : 1;
  const words = { high: 85, severe: 85, medium: 55, moderate: 55, low: 25, mild: 25 };
  return (v) => {
    if (isNum(v)) return Math.round(clamp(v * mult, 0, 100));
    const w = words[str(v).toLowerCase()];
    return isNum(w) ? w : null;
  };
}
const severityWord = (v) => (v === null ? 'Not rated' : v < 40 ? 'Mild' : v < 70 ? 'Noticeable' : 'Strong');

// ---------- radar geometry ----------
const RADAR = { w: 320, h: 262, top: 24, cx: 160, cy: 150, r: 88 };
const angleOf = (i, n) => (-90 + (360 / n) * i) * (Math.PI / 180);
function point(i, n, radius) {
  const a = angleOf(i, n);
  return [RADAR.cx + Math.cos(a) * radius, RADAR.cy + Math.sin(a) * radius];
}
function wrapLabel(text, max = 12) {
  const words = str(text).split(/\s+/).filter(Boolean);
  const lines = [];
  for (const w of words) {
    const last = lines[lines.length - 1];
    if (last !== undefined && (last + ' ' + w).length <= max) lines[lines.length - 1] = last + ' ' + w;
    else lines.push(w);
  }
  if (lines.length > 2) {
    const second = lines.slice(1).join(' ');
    lines.length = 1;
    lines.push(second.length > max ? second.slice(0, max - 1).trimEnd() + '…' : second);
  }
  return lines.map((l) => (l.length > max + 2 ? l.slice(0, max + 1) + '…' : l));
}

// ---------- dashboard ----------
export function renderDashboard(el, opts = {}) {
  if (!el) return;
  if (typeof el.__rvCleanup === 'function') el.__rvCleanup();

  const o = obj(opts);
  const r = obj(o.report);
  const ins = obj(o.insights);
  const friendship = o.kind === 'friendship' || (r.deep && typeof r.deep === 'object');
  const me = str(o.myName) || 'You';
  const them = str(o.partnerName) || (friendship ? 'Your friend' : 'Your partner');

  const axes = arr(obj(ins.profile).axes).filter((a) => a && str(a.label)).slice(0, 8)
    .map((a) => ({ label: str(a.label), mine: pct(a.mine), theirs: pct(a.theirs) }));
  const fightsRaw = arr(ins.fightForecast).filter((f) => f && str(f.title)).slice(0, 8);
  const sev = severityScale(fightsRaw);
  const fights = fightsRaw.map((f, i) => ({ ...f, key: `f${i}`, sevValue: sev(f.severity) }));
  let strengths = arr(ins.strengths).filter((s) => s && (str(s.title) || str(s.text))).slice(0, 4);
  if (!strengths.length) strengths = arr(r.strengths).map(str).filter(Boolean).slice(0, 4).map((t) => ({ title: '', text: t }));
  const bids = ins.bids && typeof ins.bids === 'object' ? ins.bids : null;
  const deck = arr(ins.conversationDeck).filter((c) => c && str(c.question));
  const areas = arr(r.areas).filter(Boolean);
  const reflections = arr(r.reflections).filter((x) => x && (str(x.mine) || str(x.theirs)));

  const ticks = new Map(); // fight key -> Set of ticked sign indexes. Memory only.
  let seq = 0;
  const nextI = () => (seq += 1);

  // ----- hero -----
  function hero() {
    const overall = obj(r.overall);
    const band = obj(overall.band);
    const value = pct(overall.score);
    const toneName = BAND_TONE[band.key] || scoreTone(value);
    const summary = str(ins.summary) || str(band.blurb);
    const caution = str(ins.cautionNote) || 'A conversation tool, not a diagnosis or a prediction of success.';
    const ringHtml = value === null
      ? '<span class="ds-ring db-ring" style="--p:0" role="img" aria-label="Overall alignment: no score"><b>–</b></span>'
      : `<span class="ds-ring db-ring" style="--p:${value}" role="img" aria-label="${esc(`Overall alignment: ${value} out of 100`)}"><b><span data-db-count="${value}">${value}</span></b></span>`;
    return `<header class="db-top">
      <p class="db-eyebrow">${friendship ? 'Friendship results' : 'Your results'}</p>
      <h1 class="db-title" tabindex="-1">${esc(me)} <span class="db-amp" aria-hidden="true">&amp;</span><span class="rv-vh"> and </span> ${esc(them)}</h1>
    </header>
    <section class="card db-hero rv-tone-${toneName}" style="--i:0" aria-label="Overall alignment">
      <div class="db-hero-top">
        ${ringHtml}
        <div class="db-hero-text">
          <p class="db-hero-kicker">Out of 100</p>
          ${str(band.label) ? `<h2 class="db-hero-band">${esc(band.label)}</h2>` : ''}
          ${summary ? `<p class="db-summary">${esc(summary)}</p>` : ''}
        </div>
      </div>
      <p class="db-caution">${esc(caution)}</p>
    </section>`;
  }

  // ----- jump nav -----
  function jumpNav(sections) {
    if (sections.length < 3) return '';
    return `<nav class="db-jump" aria-label="Sections of your results">
      ${sections.map(([id, label]) => `<button type="button" class="db-jump-btn" data-db-jump="${id}">${esc(label)}</button>`).join('')}
    </nav>`;
  }

  // ----- radar -----
  function radar() {
    const n = axes.length;
    if (n < 3) return '';
    const { w, h, top, cx, cy, r: R } = RADAR;
    const ringPath = (f) => axes.map((_, i) => point(i, n, R * f).map(fx).join(',')).join(' ');
    const grid = [0.25, 0.5, 0.75, 1].map((f) => `<polygon class="db-radar-grid${f === 1 ? ' db-radar-grid--edge' : ''}" points="${ringPath(f)}"></polygon>`).join('');
    const spokes = axes.map((_, i) => {
      const [x, y] = point(i, n, R);
      return `<line class="db-radar-spoke" data-db-axis-el="${i}" x1="${cx}" y1="${cy}" x2="${fx(x)}" y2="${fx(y)}"></line>`;
    }).join('');
    const poly = (key, cls) => {
      if (!axes.some((a) => a[key] !== null)) return '';
      const pts = axes.map((a, i) => point(i, n, R * ((a[key] === null ? 0 : a[key]) / 100)).map(fx).join(',')).join(' ');
      const dots = axes.map((a, i) => {
        if (a[key] === null) return '';
        const [x, y] = point(i, n, R * (a[key] / 100));
        return `<circle class="db-radar-dot" data-db-axis-el="${i}" cx="${fx(x)}" cy="${fx(y)}" r="3.2"></circle>`;
      }).join('');
      return `<g class="db-radar-shape ${cls}"><polygon class="db-radar-poly" points="${pts}"></polygon>${dots}</g>`;
    };
    const labels = axes.map((a, i) => {
      const [x, y] = point(i, n, R + 13);
      const cos = Math.cos(angleOf(i, n));
      const sin = Math.sin(angleOf(i, n));
      const anchor = Math.abs(cos) < 0.3 ? 'middle' : cos > 0 ? 'start' : 'end';
      const lines = wrapLabel(a.label);
      const lh = 13.5;
      const y0 = sin < -0.3 ? y - (lines.length - 1) * lh : sin > 0.3 ? y + 9 : y + 4 - ((lines.length - 1) * lh) / 2;
      return `<text class="db-radar-label" data-db-axis-el="${i}" x="${fx(x)}" y="${fx(y0)}" text-anchor="${anchor}">${lines.map((l, k) => `<tspan x="${fx(x)}" dy="${k ? lh : 0}">${esc(l)}</tspan>`).join('')}</text>`;
    }).join('');
    const half = 180 / n;
    const wedges = axes.map((_, i) => {
      const a0 = angleOf(i, n) - (half * Math.PI) / 180;
      const a1 = angleOf(i, n) + (half * Math.PI) / 180;
      const rr = R + 60;
      return `<path class="db-radar-hit" data-db-axis="${i}" d="M${cx},${cy} L${fx(cx + Math.cos(a0) * rr)},${fx(cy + Math.sin(a0) * rr)} A${rr},${rr} 0 0 1 ${fx(cx + Math.cos(a1) * rr)},${fx(cy + Math.sin(a1) * rr)} Z"></path>`;
    }).join('');
    const say = (v) => (v === null ? 'no answer' : String(v));
    const aria = `Spider chart comparing ${me} and ${them} on ${n} themes. ` +
      axes.map((a) => `${a.label}: ${me} ${say(a.mine)}, ${them} ${say(a.theirs)}`).join('. ') + '.';

    const rows = axes.map((a, i) => {
      const dot = (v, cls) => (v === null ? '' : `<i class="db-dumb-dot ${cls}" style="--x:${v}%"></i>`);
      const link = a.mine !== null && a.theirs !== null
        ? `<i class="db-dumb-link" style="--a:${Math.min(a.mine, a.theirs)}%;--b:${Math.max(a.mine, a.theirs)}%"></i>` : '';
      return `<button type="button" class="db-axis" data-db-axis="${i}" aria-pressed="false" aria-label="${esc(`${a.label}: ${me} ${say(a.mine)}, ${them} ${say(a.theirs)}`)}">
        <span class="db-axis-top"><span class="db-axis-name">${esc(a.label)}</span><span class="db-axis-nums" aria-hidden="true"><b class="db-me">${a.mine === null ? '–' : a.mine}</b><b class="db-them">${a.theirs === null ? '–' : a.theirs}</b></span></span>
        <span class="db-dumb" aria-hidden="true">${link}${dot(a.mine, 'db-me')}${dot(a.theirs, 'db-them')}</span>
      </button>`;
    }).join('');

    return `<section class="card db-section db-shape" id="db-shape" style="--i:${nextI()}" data-db-watch>
      <h2>Your shape</h2>
      <p class="rv-sub">Six themes, two outlines. Where the shapes overlap you already move alike; where one reaches further, there is something to be curious about.</p>
      <div class="db-shape-grid">
        <div class="db-radar-wrap">
          <svg class="db-radar" viewBox="0 ${top} ${w} ${h}" role="img" aria-label="${esc(aria)}" focusable="false">
            ${grid}${spokes}
            ${poly('theirs', 'db-them')}${poly('mine', 'db-me')}
            ${labels}${wedges}
          </svg>
          <div class="db-legend">
            <span class="db-legend-item db-me"><i aria-hidden="true"></i>${esc(me)}</span>
            <span class="db-legend-item db-them"><i aria-hidden="true"></i>${esc(them)}</span>
          </div>
        </div>
        <div class="db-shape-side">
          <div class="db-readout" data-db-readout aria-live="polite"></div>
          <div class="db-axes" role="group" aria-label="Pick a theme to compare">${rows}</div>
        </div>
      </div>
    </section>`;
  }

  function readoutHtml(i) {
    const a = axes[i];
    if (!a) return '';
    const num = (v) => (v === null ? '<span class="db-readout-none">–</span>' : String(v));
    let note;
    if (a.mine === null && a.theirs === null) note = 'Not enough answers from either of you to place this one yet.';
    else if (a.mine === null) note = `Not enough answers to place ${me} here yet.`;
    else if (a.theirs === null) note = `Not enough answers to place ${them} here yet.`;
    else {
      const gap = Math.abs(a.mine - a.theirs);
      note = gap <= 10 ? 'Very close here. This is shared ground.'
        : gap <= 25 ? `A little apart, by ${gap} points. Easy to bridge once it is said out loud.`
          : `${gap} points apart. A real difference, and a good one to talk through.`;
    }
    return `<div class="db-readout-label">${esc(a.label)}</div>
      <div class="db-readout-nums">
        <div class="db-readout-num db-me"><span>${esc(me)}</span><b>${num(a.mine)}</b></div>
        <div class="db-readout-num db-them"><span>${esc(them)}</span><b>${num(a.theirs)}</b></div>
      </div>
      <p>${esc(note)}</p>`;
  }

  // ----- fight forecast -----
  function fightCard(f, n) {
    const like = LIKELIHOOD[f.likelihood] || { label: 'Good to know', tone: 'neutral' };
    const v = f.sevValue;
    const word = severityWord(v);
    const psych = obj(f.psychology);
    const bad = obj(f.badDay);
    const signs = arr(f.earlySigns).map(str).filter(Boolean);
    const repair = arr(f.repair).map(str).filter(Boolean);
    const pid = `db-fight-panel-${n}`;
    const block = (title, body, cls = '') => (body ? `<div class="db-block ${cls}"><h4>${esc(title)}</h4>${body}</div>` : '');
    const gauge = v === null
      ? `<div class="db-gauge db-gauge--empty" role="img" aria-label="How strongly it could land: not rated"><div class="db-gauge-top"><span>Intensity</span><span>Not rated</span></div><div class="db-gauge-track"></div></div>`
      : `<div class="db-gauge" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${v}" aria-valuetext="${esc(`${word}, ${v} out of 100`)}" aria-label="How strongly it could land">
          <div class="db-gauge-top" aria-hidden="true"><span>Intensity</span><span><b>${esc(word)}</b> · ${v}</span></div>
          <div class="db-gauge-track" style="--v:${Math.max(v, 3)}%" aria-hidden="true"><i class="db-gauge-fill"></i><i class="db-gauge-knob"></i></div>
        </div>`;
    return `<li class="db-fight rv-tone-${like.tone}" data-db-fight="${esc(f.key)}">
      <div class="db-fight-head">
        <span class="db-rank" aria-hidden="true">${n + 1}</span>
        <div class="db-fight-main">
          <div class="db-fight-title">
            <h3><button type="button" class="db-fight-toggle" aria-expanded="false" aria-controls="${pid}">${esc(f.title)}</button></h3>
            <span class="rv-status rv-tone-${like.tone} db-like">${esc(like.label)}</span>
          </div>
          ${gauge}
          ${str(f.trigger) ? `<p class="db-trigger"><span>Often starts when</span> ${esc(f.trigger)}</p>` : ''}
        </div>
        <span class="db-chevron" aria-hidden="true">${ICON.chevron}</span>
      </div>
      <div class="db-fight-panel" id="${pid}" hidden>
        <div class="db-panel-inner">
          ${block('What it looks like', str(f.pattern) ? `<p>${esc(f.pattern)}</p>` : '')}
          ${block('Why it happens', str(psych.construct) || str(psych.why)
            ? `${str(psych.construct) ? `<p class="db-construct">${esc(psych.construct)}</p>` : ''}${str(psych.why) ? `<p>${esc(psych.why)}</p>` : ''}` : '')}
          ${block('Early signs to notice', signs.length ? `<ul class="db-signs">${signs.map((s, k) => `<li><label class="db-sign"><input type="checkbox" data-db-sign="${k}"><span class="db-box" aria-hidden="true"></span><span>${esc(s)}</span></label></li>`).join('')}</ul>
            <p class="db-sign-count" data-db-sign-count aria-live="polite">Tick the ones you recognise. Ticks stay on this screen only.</p>` : '')}
          ${block('On a hard day', str(bad.mine) || str(bad.theirs) ? `<div class="rv-answers db-badday">
            ${answer(`${me} might`, 'rv-mine', bad.mine, 'Nothing to add here')}
            ${answer(`${them} might`, 'rv-theirs', bad.theirs, 'Nothing to add here')}
          </div>` : '')}
          ${block('Finding your way back', repair.length ? `<ol class="db-steps">${repair.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>` : '')}
          ${str(f.conversation) ? `<div class="db-block"><h4>A way to start</h4><blockquote class="db-quote"><p>${esc(f.conversation)}</p></blockquote></div>` : ''}
          ${sourceLine(f.sourceIds)}
        </div>
      </div>
    </li>`;
  }

  function forecast() {
    if (!fights.length) return '';
    return `<section class="card db-section db-forecast" id="db-clash" style="--i:${nextI()}" data-db-watch>
      <h2>Where you might clash</h2>
      <p class="rv-sub">Ordered from the one most worth your attention. None of these is a verdict. Open one to see what sits underneath and how to find your way back.</p>
      <ol class="db-fights">${fights.map(fightCard).join('')}</ol>
    </section>`;
  }

  // ----- strengths -----
  function strengthTiles() {
    if (!strengths.length) return '';
    return `<section class="card db-section" id="db-strengths" style="--i:${nextI()}">
      <h2>Lean on these</h2>
      <p class="rv-sub">What already holds you steady. Reach for these when things get hard.</p>
      <ul class="db-tiles">${strengths.map((s, i) => `<li class="db-tile">
        <span class="db-glyph db-glyph-${i % 4}" aria-hidden="true"><i></i><i></i></span>
        ${str(s.title) ? `<h3>${esc(s.title)}</h3>` : ''}
        ${str(s.text) ? `<p>${esc(s.text)}</p>` : ''}
        ${sourceLine(s.sourceIds)}
      </li>`).join('')}</ul>
    </section>`;
  }

  // ----- bids -----
  function humanise(key) {
    const s = str(key).replace(/[_-]+/g, ' ');
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
  }
  function bidsSection() {
    if (!bids) return '';
    const mine = obj(bids.mine);
    const theirs = obj(bids.theirs);
    const match = ['same', 'different'].includes(bids.match) ? bids.match : 'unknown';
    const card = (who, cls, b) => {
      const label = str(b.label) || humanise(b.primary);
      return `<div class="db-bid ${cls}">
        <div class="rv-who ${cls === 'db-me' ? 'rv-me' : 'rv-them'}">${esc(who)} shows care through</div>
        <div class="db-bid-label${label ? '' : ' db-bid-label--none'}">${esc(label || 'Not enough answers yet')}</div>
      </div>`;
    };
    const headline = match === 'same' ? 'You reach for each other in the same way'
      : match === 'different' ? 'You reach for each other in different ways'
        : 'Not enough answers to compare yet';
    const art = match === 'same'
      ? '<path class="db-arc db-arc-me" d="M75 8 C 75 38, 118 46, 150 46"></path><path class="db-arc db-arc-them" d="M225 8 C 225 38, 182 46, 150 46"></path><circle class="db-knot" cx="150" cy="46" r="9"></circle><circle class="db-knot-core" cx="150" cy="46" r="3.5"></circle>'
      : match === 'different'
        ? '<path class="db-arc db-arc-me" d="M75 8 C 75 30, 98 38, 124 34"></path><path class="db-arc db-arc-them" d="M225 8 C 225 36, 204 52, 178 50"></path><circle class="db-tip db-arc-me" cx="124" cy="34" r="4"></circle><circle class="db-tip db-arc-them" cx="178" cy="50" r="4"></circle><path class="db-gap" d="M133 37 L169 47"></path>'
        : '<path class="db-arc db-arc-none" d="M75 8 C 75 44, 225 44, 225 8"></path>';
    const artLabel = match === 'same' ? 'Two lines that meet in the middle'
      : match === 'different' ? 'Two lines that reach toward each other without meeting' : 'A dotted line, not yet drawn in';
    return `<section class="card db-section db-bids" id="db-bids" style="--i:${nextI()}" data-db-watch>
      <h2>How each of you shows care</h2>
      <p class="rv-sub">The small ways you reach for each other, and whether they land.</p>
      <div class="db-bid-pair">${card(me, 'db-me', mine)}${card(them, 'db-them', theirs)}</div>
      <div class="db-match db-match--${match}">
        <svg viewBox="0 0 300 60" role="img" aria-label="${esc(artLabel)}" focusable="false">
          <circle class="db-end db-arc-me" cx="75" cy="8" r="5"></circle><circle class="db-end db-arc-them" cx="225" cy="8" r="5"></circle>${art}
        </svg>
        <p class="db-match-line">${esc(headline)}</p>
        ${str(bids.text) ? `<p class="db-match-text">${esc(bids.text)}</p>` : ''}
      </div>
    </section>`;
  }

  // ----- conversation deck -----
  function deckSection() {
    if (!deck.length) return '';
    const total = deck.length;
    return `<section class="db-section db-deck" id="db-deck" data-db-deck>
      <div class="db-deck-head">
        <h2>Conversation deck</h2>
        <p class="rv-sub">${total} questions picked for the two of you. Take one at a time, and take turns answering.</p>
      </div>
      <ul class="db-cards" data-db-cards tabindex="0" aria-label="Conversation cards. Use the left and right arrow keys to move between them.">
        ${deck.map((c, i) => `<li class="db-card db-card-${i % 4}" data-db-card="${i}" aria-label="Card ${i + 1} of ${total}">
          <span class="db-card-num" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span>
          <p class="db-card-q">${esc(c.question)}</p>
          ${str(c.why) ? `<p class="db-card-why"><span>Why this one</span>${esc(c.why)}</p>` : ''}
        </li>`).join('')}
      </ul>
      <div class="db-deck-ctrl">
        <button type="button" class="db-round" data-db-prev aria-label="Previous card">${ICON.left}</button>
        <span class="db-deck-count" data-db-count-label aria-live="polite">Card 1 of ${total}</span>
        <button type="button" class="btn btn-ghost db-next" data-db-next><span data-db-next-label>Next card</span>${ICON.right}</button>
      </div>
      <p class="kbd-help">Tip: use the left and right arrow keys to move between cards.</p>
    </section>`;
  }

  // ----- area by area -----
  function areasSection() {
    const list = areas.filter((a) => str(a.title) || arr(a.items).length);
    if (!list.length) return '';
    return `<section class="card db-section" id="db-areas" style="--i:${nextI()}">
      <h2>Area by area</h2>
      <p class="rv-sub">Open any area to see both sets of answers side by side.</p>
      <div class="db-areas">${list.map((a) => {
        const score = pct(a.score);
        const items = arr(a.items).filter((it) => it && str(it.text));
        const pip = score === null
          ? '<span class="rv-dot" role="img" aria-label="No score"></span>'
          : `<span class="rv-score-pip rv-tone-${scoreTone(score)}" aria-label="Alignment ${score} out of 100">${score}</span>`;
        return `<details class="db-area">
          <summary><span class="db-area-name">${esc(str(a.title) || 'This area')}</span>${pip}<span class="db-chevron" aria-hidden="true">${ICON.chevron}</span></summary>
          <div class="db-area-body">
            ${str(a.blurb) ? `<p class="db-area-blurb">${esc(a.blurb)}</p>` : ''}
            ${items.length ? items.map((it) => {
              const s = STATUS[it.status] || STATUS.note;
              return `<div class="db-area-item">
                <div class="rv-item-top"><h3>${esc(it.text)}</h3><span class="rv-status rv-tone-${s.tone}">${esc(s.label)}</span></div>
                <div class="rv-answers">${answer(me, 'rv-mine', it.mineLabel, 'No answer')}${answer(them, 'rv-theirs', it.theirsLabel, 'No answer')}</div>
                ${str(it.note) ? `<p class="rv-note">${esc(it.note)}</p>` : ''}
              </div>`;
            }).join('') : '<p class="rv-gentle">Nothing to compare in this area yet.</p>'}
          </div>
        </details>`;
      }).join('')}</div>
    </section>`;
  }

  // ----- your words -----
  function wordsSection() {
    return `<section class="db-section db-words" id="db-words">
      <div class="db-deck-head">
        <h2>Your words</h2>
        <p class="rv-sub">These are shared so you can talk about them, not to be scored. Read them together, slowly.</p>
      </div>
      ${reflections.length
        ? reflections.map((x) => `<article class="card rv-word" style="--i:${nextI()}">
            <h3 class="db-word-q">${esc(x.text)}</h3>
            <div class="rv-answers">
              ${answer(me, 'rv-mine', x.mine, 'Left this one blank')}
              ${answer(them, 'rv-theirs', x.theirs, 'Left this one blank')}
            </div>
          </article>`).join('')
        : `<div class="card"><p class="rv-sub" style="margin:0">Neither of you wrote anything here this time, and that is fine. There is plenty above to talk about.</p></div>`}
    </section>`;
  }

  function footer() {
    return `<section class="rv-end db-end" aria-label="Finish">
      <div class="rv-heart" aria-hidden="true">♡</div>
      <p>Thank you for doing this together. The best part comes next: the conversation.</p>
      <button type="button" class="rv-link rv-leave" data-db-leave>Leave this session on this device</button>
    </section>`;
  }

  // ----- assemble -----
  const blocks = [
    ['db-shape', 'Your shape', radar()],
    ['db-clash', 'Clashes', forecast()],
    ['db-strengths', 'Strengths', strengthTiles()],
    ['db-bids', 'Care', bidsSection()],
    ['db-deck', 'Deck', deckSection()],
    ['db-areas', 'Areas', areasSection()],
    ['db-words', 'Your words', wordsSection()],
  ].filter((b) => b[2]);

  el.innerHTML = `<div class="rv db" data-db-root>
    ${hero()}
    ${jumpNav(blocks.map(([id, label]) => [id, label]))}
    ${blocks.map((b) => b[2]).join('')}
    ${footer()}
  </div>`;

  const root = el.querySelector('[data-db-root]');
  const smooth = () => (reducedMotion() ? 'auto' : 'smooth');
  const timers = [];
  let observer = null;

  // ----- hero count-up -----
  root.querySelectorAll('[data-db-count]').forEach((node) => {
    const target = Number(node.getAttribute('data-db-count'));
    if (!Number.isFinite(target) || reducedMotion() || typeof requestAnimationFrame !== 'function') return;
    const start = performance.now();
    const duration = 1100;
    node.textContent = '0';
    const tick = (now) => {
      if (!node.isConnected) return;
      const t = clamp((now - start - 200) / duration, 0, 1);
      node.textContent = String(Math.round(target * (1 - Math.pow(1 - t, 3))));
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    timers.push(setTimeout(() => { if (node.isConnected) node.textContent = String(target); }, duration + 500));
  });

  // ----- play chart animations when a section scrolls into view -----
  const watched = Array.from(root.querySelectorAll('[data-db-watch]'));
  const markSeen = (node) => node.classList.add('db-seen');
  if (reducedMotion() || typeof IntersectionObserver !== 'function') {
    watched.forEach(markSeen);
  } else {
    observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        markSeen(entry.target);
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12 });
    watched.forEach((node) => observer.observe(node));
    // Never leave a chart undrawn if the observer is throttled (background tab).
    timers.push(setTimeout(() => watched.forEach(markSeen), 2500));
  }

  // ----- jump nav -----
  root.querySelectorAll('[data-db-jump]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = root.querySelector(`#${btn.getAttribute('data-db-jump')}`);
      if (!target) return;
      target.scrollIntoView({ behavior: smooth(), block: 'start' });
      const heading = target.querySelector('h2');
      if (heading) { heading.setAttribute('tabindex', '-1'); heading.focus({ preventScroll: true }); }
    });
  });

  // ----- radar readout -----
  const readout = root.querySelector('[data-db-readout]');
  if (readout && axes.length) {
    let selected = -1;
    const select = (i) => {
      if (i === selected || !axes[i]) return;
      selected = i;
      root.querySelectorAll('.db-axis').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.getAttribute('data-db-axis')) === i)));
      root.querySelectorAll('[data-db-axis-el]').forEach((n) => n.classList.toggle('is-on', Number(n.getAttribute('data-db-axis-el')) === i));
      readout.innerHTML = readoutHtml(i);
    };
    // Start on the theme with the widest gap: the most useful one to look at first.
    let first = 0;
    let widest = -1;
    axes.forEach((a, i) => {
      if (a.mine === null || a.theirs === null) return;
      const gap = Math.abs(a.mine - a.theirs);
      if (gap > widest) { widest = gap; first = i; }
    });
    select(first);
    root.querySelectorAll('[data-db-axis]').forEach((node) => {
      const i = Number(node.getAttribute('data-db-axis'));
      node.addEventListener('click', () => select(i));
      node.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') select(i); });
      if (node.tagName === 'BUTTON') node.addEventListener('focus', () => select(i));
    });
  }

  // ----- fight cards -----
  root.querySelectorAll('[data-db-fight]').forEach((card) => {
    const key = card.getAttribute('data-db-fight');
    const toggle = card.querySelector('.db-fight-toggle');
    const panel = card.querySelector('.db-fight-panel');
    const count = card.querySelector('[data-db-sign-count]');
    toggle.addEventListener('click', () => {
      const open = toggle.getAttribute('aria-expanded') !== 'true';
      toggle.setAttribute('aria-expanded', String(open));
      panel.hidden = !open;
      card.classList.toggle('is-open', open);
    });
    const boxes = Array.from(card.querySelectorAll('[data-db-sign]'));
    boxes.forEach((box) => {
      box.addEventListener('change', () => {
        const set = ticks.get(key) || new Set();
        const k = Number(box.getAttribute('data-db-sign'));
        if (box.checked) set.add(k); else set.delete(k);
        ticks.set(key, set);
        if (count) {
          count.textContent = set.size
            ? `${set.size} of ${boxes.length} recognised. Worth naming out loud next time one shows up.`
            : 'Tick the ones you recognise. Ticks stay on this screen only.';
        }
      });
    });
  });

  // ----- deck -----
  const deckRoot = root.querySelector('[data-db-deck]');
  if (deckRoot) {
    const scroller = deckRoot.querySelector('[data-db-cards]');
    const cards = Array.from(scroller.querySelectorAll('[data-db-card]'));
    const label = deckRoot.querySelector('[data-db-count-label]');
    const nextLabel = deckRoot.querySelector('[data-db-next-label]');
    const prev = deckRoot.querySelector('[data-db-prev]');
    const total = cards.length;
    let current = 0;
    let raf = 0;
    const leftOf = (i) => cards[i].offsetLeft - cards[0].offsetLeft;
    const paint = () => {
      label.textContent = `Card ${current + 1} of ${total}`;
      nextLabel.textContent = current === total - 1 ? 'Start again' : 'Next card';
      prev.disabled = current === 0;
      cards.forEach((c, i) => c.classList.toggle('is-current', i === current));
    };
    const goTo = (i) => {
      current = clamp(i, 0, total - 1);
      scroller.scrollTo({ left: leftOf(current), behavior: smooth() });
      paint();
    };
    scroller.addEventListener('scroll', () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const max = scroller.scrollWidth - scroller.clientWidth;
        let best = 0;
        if (max > 0 && scroller.scrollLeft >= max - 2) best = total - 1;
        else {
          let dist = Infinity;
          cards.forEach((_, i) => {
            const d = Math.abs(leftOf(i) - scroller.scrollLeft);
            if (d < dist) { dist = d; best = i; }
          });
        }
        if (best !== current) { current = best; paint(); }
      });
    }, { passive: true });
    deckRoot.querySelector('[data-db-next]').addEventListener('click', () => goTo(current === total - 1 ? 0 : current + 1));
    prev.addEventListener('click', () => goTo(current - 1));
    deckRoot.addEventListener('keydown', (e) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (e.key === 'ArrowRight') goTo(current + 1);
      else if (e.key === 'ArrowLeft') goTo(current - 1);
      else if (e.key === 'Home') goTo(0);
      else if (e.key === 'End') goTo(total - 1);
      else return;
      e.preventDefault();
    });
    paint();
  }

  // ----- leave -----
  const leave = root.querySelector('[data-db-leave]');
  if (leave) leave.addEventListener('click', () => { if (typeof o.onLeave === 'function') o.onLeave(); });

  function cleanup() {
    if (observer) observer.disconnect();
    timers.forEach(clearTimeout);
    if (el.__rvCleanup === cleanup) delete el.__rvCleanup;
  }
  el.__rvCleanup = cleanup;
}
