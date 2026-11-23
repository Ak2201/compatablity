// Reveal experience: overview -> area walkthrough -> "Your words".
// Pure rendering. The report comes from psychology.js; nothing here scores anything.
// Every string that reaches innerHTML goes through esc().

import { DIMENSIONS } from './questions.js';

// ---------- helpers ----------
const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };
function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"'`]/g, (c) => ESC_MAP[c]);
}

const arr = (v) => (Array.isArray(v) ? v : []);
const str = (v) => (v === null || v === undefined ? '' : String(v).trim());
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const pct = (score) => (isNum(score) ? Math.round(clamp(score, 0, 100)) : null);
const reducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function initial(name) {
  const s = str(name);
  return s ? Array.from(s)[0].toUpperCase() : '♡';
}

// Readings (sharp moments / repair) may arrive as a 1-5 average or as 0-100. Both map to 0-100.
function reading(v) {
  if (!isNum(v)) return null;
  return Math.round(v <= 5 ? clamp(((v - 1) / 4) * 100, 0, 100) : clamp(v, 0, 100));
}

const TONES = ['sage', 'amber', 'plum', 'neutral'];
const tone = (t) => `rv-tone-${TONES.includes(t) ? t : 'neutral'}`;

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
const statusOf = (key) => STATUS[key] || STATUS.note;

const FLAG = {
  strength: { label: 'A strength', tone: 'sage' },
  talk: { label: 'Worth a talk', tone: 'amber' },
  caution: { label: 'Go gently here', tone: 'plum' },
};
const flagOf = (level) => FLAG[level] || { label: 'Good to know', tone: 'neutral' };

const STYLE = {
  secure: { label: 'Feels secure', sub: 'Comfortable with closeness and with time apart.' },
  anxious: { label: 'Seeks reassurance', sub: 'Feels closest when the bond is said out loud.' },
  avoidant: { label: 'Values space', sub: 'Recharges with room to think and breathe.' },
  mixed: { label: 'Mixed', sub: 'A bit of each, depending on the moment.' },
  unknown: { label: 'Not enough answers', sub: 'Too few answers here to say.' },
};
const styleOf = (key) => STYLE[key] || STYLE.unknown;

const ICON = {
  check: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7"/></svg>',
  chat: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 4.5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H7l-3 2.5v-2.5a2 2 0 0 1-1.5-2z"/></svg>',
  left: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 3L5 8l5 5"/></svg>',
  right: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3l5 5-5 5"/></svg>',
};

// ---------- small pieces ----------
function ring(score, { large = false, toneName, label, caption = '' } = {}) {
  const value = pct(score);
  const t = tone(toneName || scoreTone(value));
  const aria = value === null ? `${label}: no score` : `${label}: ${value} out of 100`;
  const arc = value === null || value === 0
    ? ''
    : `<circle class="rv-ring-val" cx="60" cy="60" r="52" pathLength="100" style="--rv-val:${value}"></circle>`;
  const centre = value === null
    ? '<span class="rv-ring-empty">♡</span>'
    : `<span class="rv-ring-num"><span${large ? ` data-rv-count="${value}"` : ''}>${value}</span>${caption ? `<small>${esc(caption)}</small>` : ''}</span>`;
  return `<div class="rv-ring ${large ? 'rv-ring--lg ' : ''}${t}" role="img" aria-label="${esc(aria)}">
    <svg viewBox="0 0 120 120" aria-hidden="true" focusable="false">
      <circle class="rv-ring-track" cx="60" cy="60" r="52"></circle>${arc}
    </svg>${centre}
  </div>`;
}

function statusChip(key) {
  const s = statusOf(key);
  return `<span class="rv-status ${tone(s.tone)}" aria-label="Status: ${esc(s.label)}">${esc(s.label)}</span>`;
}

function flagList(flags) {
  const list = arr(flags).filter((f) => f && str(f.text));
  if (!list.length) return '';
  return `<div class="rv-flags">${list.map((f) => {
    const meta = flagOf(f.level);
    return `<p class="rv-flag ${tone(meta.tone)}" style="margin:0"><b>${esc(meta.label)}</b>${esc(f.text)}</p>`;
  }).join('')}</div>`;
}

function scorePip(score, label) {
  const value = pct(score);
  if (value === null) return `<span class="rv-dot" role="img" aria-label="${esc(label)}: no score"></span>`;
  return `<span class="rv-score-pip ${tone(scoreTone(value))}" aria-label="${esc(label)}: ${value} out of 100">${value}</span>`;
}

function answer(who, cls, text, blank) {
  const body = str(text);
  return `<div class="rv-answer ${cls}${body ? '' : ' rv-blank'}">
    <div class="rv-who ${cls === 'rv-mine' ? 'rv-me' : 'rv-them'}">${esc(who)}</div>
    <p>${esc(body || blank)}</p>
  </div>`;
}

const areaTitle = (area) => str(area && area.title) || (DIMENSIONS[area && area.dimension] || {}).title || 'This area';
const areaBlurb = (area) => str(area && area.blurb) || (DIMENSIONS[area && area.dimension] || {}).blurb || '';

// ---------- waiting ----------
export function renderRevealWaiting(el, opts = {}) {
  if (!el) return;
  if (typeof el.__rvCleanup === 'function') el.__rvCleanup();
  const partner = str(opts && opts.partnerName);
  const line = partner
    ? `Putting your answers next to ${esc(partner)}'s. This only takes a moment.`
    : 'Putting your answers side by side. This only takes a moment.';
  el.innerHTML = `<div class="rv">
    <section class="card rv-wait" role="status" aria-live="polite" aria-busy="true">
      <div class="rv-pulse" aria-hidden="true"><i></i><i></i></div>
      <h1>Bringing your answers together</h1>
      <p>${line}</p>
      <div class="rv-skel" aria-hidden="true"><span style="--i:0"></span><span style="--i:1"></span><span style="--i:2"></span></div>
    </section>
  </div>`;
}

// ---------- reveal ----------
export function renderReveal(el, report, opts = {}) {
  if (!el) return;
  if (typeof el.__rvCleanup === 'function') el.__rvCleanup();

  const r = report || {};
  const o = opts || {};
  const me = str(o.myName) || 'You';
  const them = str(o.partnerName) || 'Your partner';
  const areas = arr(r.areas).filter(Boolean);
  const reflections = arr(r.reflections).filter((x) => x && (str(x.mine) || str(x.theirs)));
  const state = { view: 'overview', index: 0 };

  // ----- overview -----
  function heroCard() {
    const overall = r.overall || {};
    const band = overall.band || {};
    const bandTone = BAND_TONE[band.key] || scoreTone(pct(overall.score));
    return `<section class="card rv-hero" style="--i:0">
      <div class="area-tag">Your reveal</div>
      <div class="people" aria-hidden="true">
        <span class="avatar on">${esc(initial(me))}</span><span class="link-dot"></span><span class="avatar on rv-them">${esc(initial(them))}</span>
      </div>
      <h1 tabindex="-1" data-rv-title>${esc(me)} &amp; ${esc(them)}</h1>
      ${ring(overall.score, { large: true, toneName: bandTone, label: 'Overall alignment', caption: 'aligned' })}
      ${str(band.label) ? `<p class="rv-band ${tone(bandTone)}">${esc(band.label)}</p>` : ''}
      ${str(band.blurb) ? `<p class="rv-band-blurb">${esc(band.blurb)}</p>` : ''}
      <p class="ref-note">A conversation tool, not a diagnosis or a prediction of success.</p>
      ${areas.length ? `<div class="btn-row"><button type="button" class="btn btn-primary" data-rv-go="area" data-rv-index="0">Walk through it together</button></div>` : ''}
    </section>`;
  }

  function bulletCard(i, title, sub, items, toneName, icon) {
    const list = arr(items).map(str).filter(Boolean);
    if (!list.length) return '';
    return `<section class="card" style="--i:${i}">
      <h2>${esc(title)}</h2>
      <p class="rv-sub">${esc(sub)}</p>
      <ul class="rv-list">${list.map((t) => `<li><span class="rv-mark ${tone(toneName)}" aria-hidden="true">${icon}</span><span>${esc(t)}</span></li>`).join('')}</ul>
    </section>`;
  }

  function attachmentCard(i) {
    const a = r.attachment;
    if (!a) return '';
    const person = (who, cls, data) => {
      const s = styleOf(data && data.style);
      return `<div class="rv-person">
        <div class="rv-who ${cls}">${esc(who)}</div>
        <div class="rv-style">${esc(s.label)}</div>
        <div class="rv-style-sub">${esc(s.sub)}</div>
      </div>`;
    };
    const pairing = a.pairing && str(a.pairing.text) ? flagList([a.pairing]) : '';
    return `<section class="card" style="--i:${i}">
      <h2>Closeness and space</h2>
      <p class="rv-sub">How each of you tends to feel about being close, and about time apart.</p>
      <div class="rv-duo">${person(me, 'rv-me', a.mine)}${person(them, 'rv-them', a.theirs)}</div>
      ${pairing}
    </section>`;
  }

  function meter(label, value, words, toneName) {
    const v = reading(value);
    const word = v === null ? 'Not enough answers' : words[v <= 38 ? 0 : v < 62 ? 1 : 2];
    return `<div class="rv-meter ${tone(toneName)}" role="img" aria-label="${esc(label)}: ${esc(word)}">
      <div class="rv-meter-top"><span>${esc(label)}</span><span>${esc(word)}</span></div>
      <div class="bar"><span style="--rv-w:${v === null ? 0 : Math.max(v, 4)}%"></span></div>
    </div>`;
  }

  function conflictCard(i) {
    const c = r.conflict;
    if (!c) return '';
    const person = (who, cls, data) => {
      const d = data || {};
      const sharp = reading(d.horsemen);
      return `<div class="rv-person">
        <div class="rv-who ${cls}">${esc(who)}</div>
        ${meter('Sharp moments', d.horsemen, ['Rare', 'Now and then', 'Fairly often'], sharp !== null && sharp >= 62 ? 'amber' : 'neutral')}
        ${meter('Repair after a fight', d.repair, ['Still learning', 'Getting there', 'Comes easily'], 'sage')}
      </div>`;
    };
    return `<section class="card" style="--i:${i}">
      <h2>When you disagree</h2>
      <p class="rv-sub">Sharp moments are things like criticism or shutting down. Repair is how you find your way back.</p>
      <div class="rv-duo">${person(me, 'rv-me', c.mine)}${person(them, 'rv-them', c.theirs)}</div>
      ${flagList(c.flags)}
    </section>`;
  }

  function dealbreakerCard(i) {
    const list = arr(r.dealbreakers).filter((d) => d && str(d.text));
    if (!list.length) return '';
    return `<section class="card" style="--i:${i}">
      <h2>Non-negotiables</h2>
      <p class="rv-sub">Things either of you may not want to bend on. Nothing here is a verdict.</p>
      <ul class="rv-deals">${list.map((d) => `<li>
        <div class="rv-deal-top"><p>${esc(d.text)}</p>${statusChip(d.status)}</div>
        <div class="rv-deal-ans">${esc(me)}: <b>${esc(str(d.mineLabel) || 'No answer')}</b> &nbsp;·&nbsp; ${esc(them)}: <b>${esc(str(d.theirsLabel) || 'No answer')}</b></div>
      </li>`).join('')}</ul>
    </section>`;
  }

  function indexCard(i) {
    if (!areas.length) return '';
    return `<section class="card" style="--i:${i}">
      <h2>Area by area</h2>
      <p class="rv-sub">Open any area to see both sets of answers side by side.</p>
      <div class="rv-index">${areas.map((a, n) => `<button type="button" class="rv-index-btn" data-rv-go="area" data-rv-index="${n}">
        <span>${esc(areaTitle(a))}</span>${scorePip(a.score, 'Alignment')}
      </button>`).join('')}</div>
    </section>`;
  }

  function overviewView() {
    let i = 1;
    const parts = [
      bulletCard(i, "What's working well", 'Places where you already move together.', r.strengths, 'sage', ICON.check),
      bulletCard(i + 1, 'Worth talking through', 'Not problems. Just good conversations waiting to happen.', r.topics, 'amber', ICON.chat),
    ].filter(Boolean);
    i += parts.length;
    for (const build of [attachmentCard, conflictCard, dealbreakerCard, indexCard]) {
      const html = build(i);
      if (html) { parts.push(html); i += 1; }
    }
    return heroCard() + parts.join('');
  }

  // ----- shared nav -----
  function navBlock() {
    const onWords = state.view === 'words';
    const total = areas.length;
    const step = onWords ? total : state.index + 1;
    const meta = onWords ? 'Your words' : `Area ${step} of ${total}`;
    const width = total ? Math.round((step / total) * 100) : 100;
    return `<nav class="rv-nav" aria-label="Areas">
      <div class="rv-chips" data-rv-chips>
        ${areas.map((a, n) => `<button type="button" class="rv-chip" data-rv-go="area" data-rv-index="${n}"${!onWords && n === state.index ? ' aria-current="true"' : ''}>
          <span>${esc(areaTitle(a))}</span>${scorePip(a.score, 'Alignment')}
        </button>`).join('')}
        <button type="button" class="rv-chip" data-rv-go="words"${onWords ? ' aria-current="true"' : ''}><span>Your words</span></button>
      </div>
      <div class="progress">
        <div class="progress-meta"><span>${esc(meta)}</span><span>${onWords ? 'Last step' : esc(areaTitle(areas[state.index]))}</span></div>
        <div class="bar" role="progressbar" aria-label="Progress through the areas" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${step}" aria-valuetext="${esc(meta)}"><span style="width:${width}%"></span></div>
      </div>
    </nav>`;
  }

  const backLink = (extra = '') =>
    `<button type="button" class="rv-link ${extra}" data-rv-go="overview">${ICON.left}<span>Back to overview</span></button>`;

  // ----- area -----
  function itemCard(item, i) {
    return `<article class="card rv-item" style="--i:${i}">
      <div class="rv-item-top"><h3>${esc(item.text)}</h3>${statusChip(item.status)}</div>
      <div class="rv-answers">
        ${answer(me, 'rv-mine', item.mineLabel, 'No answer')}
        ${answer(them, 'rv-theirs', item.theirsLabel, 'No answer')}
      </div>
      ${str(item.note) ? `<p class="rv-note">${esc(item.note)}</p>` : ''}
    </article>`;
  }

  function areaView() {
    const area = areas[state.index];
    const score = pct(area.score);
    const prompts = arr(area.prompts).map(str).filter(Boolean);
    const items = arr(area.items).filter(Boolean);
    const last = state.index === areas.length - 1;
    const prev = state.index === 0
      ? `<button type="button" class="btn btn-ghost" data-rv-go="overview">${ICON.left}<span>Overview</span></button>`
      : `<button type="button" class="btn btn-ghost" data-rv-go="area" data-rv-index="${state.index - 1}">${ICON.left}<span>Previous</span></button>`;
    const next = last
      ? `<button type="button" class="btn btn-primary" data-rv-go="words"><span>Your words</span>${ICON.right}</button>`
      : `<button type="button" class="btn btn-primary" data-rv-go="area" data-rv-index="${state.index + 1}"><span>Next area</span>${ICON.right}</button>`;
    let i = 1;
    return `${backLink('rv-back-top')}
      ${navBlock()}
      <section class="card" style="--i:0">
        <div class="rv-area-head">
          <div>
            <div class="area-tag">Area ${state.index + 1} of ${areas.length}</div>
            <h1 tabindex="-1" data-rv-title>${esc(areaTitle(area))}</h1>
            ${areaBlurb(area) ? `<p>${esc(areaBlurb(area))}</p>` : ''}
          </div>
          ${score === null ? '' : ring(score, { label: `${areaTitle(area)} alignment` })}
        </div>
        ${score === null ? `<span class="rv-status rv-tone-neutral rv-noscore" aria-label="No score for this area">No score here, just things to notice</span>` : ''}
        ${flagList(area.flags)}
      </section>
      ${prompts.length ? `<section class="rv-prompts" aria-label="Try asking each other">
        <h2 class="rv-section-label">Try asking each other</h2>
        ${prompts.map((p) => `<div class="rv-prompt" style="--i:${i++}"><span>Try asking</span><p>${esc(p)}</p></div>`).join('')}
      </section>` : ''}
      ${items.length ? `<section class="rv-items" aria-label="Your answers">
        <h2 class="rv-section-label">Your answers, side by side</h2>
        ${items.map((it) => itemCard(it, i++)).join('')}
      </section>` : ''}
      <div class="btn-row rv-pager">${prev}${next}</div>
      <p class="kbd-help">Tip: use the left and right arrow keys to move between areas.</p>`;
  }

  // ----- your words -----
  function wordsView() {
    const prev = areas.length
      ? `<button type="button" class="btn btn-ghost" data-rv-go="area" data-rv-index="${areas.length - 1}">${ICON.left}<span>Previous area</span></button>`
      : '';
    return `${backLink('rv-back-top')}
      ${areas.length ? navBlock() : ''}
      <section class="card rv-words-head" style="--i:0">
        <div class="area-tag">In your own words</div>
        <h1 tabindex="-1" data-rv-title>Your words</h1>
        <p>These are shared so you can talk about them, not to be scored. Read them together, slowly.</p>
      </section>
      ${reflections.length
        ? reflections.map((x, n) => `<section class="card rv-word" style="--i:${n + 1}">
            <h2>${esc(x.text)}</h2>
            <div class="rv-answers">
              ${answer(me, 'rv-mine', x.mine, 'Left this one blank')}
              ${answer(them, 'rv-theirs', x.theirs, 'Left this one blank')}
            </div>
          </section>`).join('')
        : `<section class="card" style="--i:1"><p class="rv-sub" style="margin:0">Neither of you wrote anything here this time, and that is fine. The areas above give you plenty to talk about.</p></section>`}
      <section class="rv-end">
        <div class="rv-heart" aria-hidden="true">♡</div>
        <h2>That's everything</h2>
        <p>Thank you for doing this together. The best part comes next: the conversation.</p>
        ${prev ? `<div class="btn-row stack rv-pager" style="width:100%;margin:0 0 6px"><button type="button" class="btn btn-primary" data-rv-go="overview"><span>Back to overview</span></button>${prev}</div>` : backLink()}
        <button type="button" class="rv-link rv-leave" data-rv-leave>Leave this session on this device</button>
      </section>`;
  }

  // ----- render + events -----
  function go(view, index, { focus = true } = {}) {
    if (view === 'area') {
      if (!areas.length) return go('overview', 0, { focus });
      state.view = 'area';
      state.index = clamp(Number.isInteger(index) ? index : 0, 0, areas.length - 1);
    } else {
      state.view = view === 'words' ? 'words' : 'overview';
    }
    render(focus);
  }

  function countUp(node) {
    const target = Number(node.getAttribute('data-rv-count'));
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
    // If frames are throttled (background tab), never leave a half-counted number on screen.
    setTimeout(() => { if (node.isConnected) node.textContent = String(target); }, duration + 500);
  }

  function render(moveFocus) {
    const body = state.view === 'area' ? areaView() : state.view === 'words' ? wordsView() : overviewView();
    el.innerHTML = `<div class="rv" data-rv-root data-rv-view="${state.view}">${body}</div>`;

    el.querySelectorAll('[data-rv-go]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = btn.hasAttribute('data-rv-index') ? Number(btn.getAttribute('data-rv-index')) : 0;
        go(btn.getAttribute('data-rv-go'), idx);
      });
    });
    const leave = el.querySelector('[data-rv-leave]');
    if (leave) leave.addEventListener('click', () => { if (typeof o.onLeave === 'function') o.onLeave(); });

    el.querySelectorAll('[data-rv-count]').forEach(countUp);

    // Keep the current chip in view without scrolling the page.
    const chips = el.querySelector('[data-rv-chips]');
    const current = chips && chips.querySelector('[aria-current="true"]');
    if (chips && current) {
      chips.scrollLeft = Math.max(0, current.offsetLeft - chips.offsetLeft - (chips.clientWidth - current.offsetWidth) / 2);
    }

    if (moveFocus) {
      const top = el.getBoundingClientRect().top + window.scrollY - 76;
      window.scrollTo({ top: Math.max(0, top), behavior: 'auto' });
      const title = el.querySelector('[data-rv-title]');
      if (title) title.focus({ preventScroll: true });
    }
  }

  function onKey(e) {
    if (!el.isConnected || !el.querySelector('[data-rv-root]')) return cleanup();
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const t = e.target;
    if (t && t.closest && t.closest('input, textarea, select, [contenteditable="true"]')) return;
    const forward = e.key === 'ArrowRight';
    if (state.view === 'overview') {
      if (!forward) return;
      go(areas.length ? 'area' : 'words', 0);
    } else if (state.view === 'area') {
      if (forward) go(state.index < areas.length - 1 ? 'area' : 'words', state.index + 1);
      else go(state.index > 0 ? 'area' : 'overview', state.index - 1);
    } else {
      if (forward) return;
      go(areas.length ? 'area' : 'overview', areas.length - 1);
    }
    e.preventDefault();
  }

  function cleanup() {
    document.removeEventListener('keydown', onKey);
    if (el.__rvCleanup === cleanup) delete el.__rvCleanup;
  }

  document.addEventListener('keydown', onKey);
  el.__rvCleanup = cleanup;
  render(false);
}
