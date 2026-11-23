// Personal self-test screens: the answers editor and the personal report.
// Shares the ds- design classes from css/design.css; the report's own pieces are
// sf- classes in css/self.css. Each renderer fills `el`, wires its own listeners
// and reports back through the callbacks in opts. A callback may return a
// Promise; if it rejects with Error(message), the message is shown to the person.

import { SELF_QUESTIONS, SELF_DIMENSIONS } from './self-questions.js';

/* ---------- small helpers (same behaviour as the ones in screens.js) ---------- */
function esc(value) {
  return String(value ?? '').replace(/[&<>"'`]/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' }[c]
  ));
}
const clean = (v) => (typeof v === 'string' ? v.trim() : (v == null ? '' : String(v).trim()));
const list = (v) => (Array.isArray(v) ? v : (v == null || v === '' ? [] : [v]));
const errorText = (err) => clean(err && err.message) || 'Something went wrong. Please try again.';
const call = (fn, ...args) => { try { return Promise.resolve(typeof fn === 'function' ? fn(...args) : undefined); } catch (e) { return Promise.reject(e); } };
const clampScore = (n) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
const hasScore = (n) => typeof n === 'number' && Number.isFinite(n);

const svg = (body) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
const ICON = {
  back: svg('<path d="M14.5 5.5 8 12l6.5 6.5"/>'),
  down: svg('<path d="M6 9.5l6 6 6-6"/>'),
  info: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5"/><path d="M12 7.8v.2"/>'),
};

let toastTimer = 0;
function toast(message) {
  let node = document.querySelector('.ds-toast');
  if (!node) {
    node = document.createElement('div');
    node.className = 'ds-toast';
    node.setAttribute('role', 'status');
    node.setAttribute('aria-live', 'polite');
    document.body.appendChild(node);
  }
  node.textContent = message;
  requestAnimationFrame(() => node.classList.add('is-on'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('is-on'), 2600);
}

// Keeps sticky bars below the app's own sticky top bar, when there is one.
function setStickyTop() {
  const bar = document.querySelector('.topbar');
  const h = bar && getComputedStyle(bar).position === 'sticky' ? Math.round(bar.getBoundingClientRect().height) : 0;
  document.documentElement.style.setProperty('--ds-top', `${h}px`);
}

const wire = (root, selector, fn) => root.querySelectorAll(selector).forEach((b) => {
  b.addEventListener('click', () => call(fn).catch((x) => toast(errorText(x))));
});

/* =====================================================================
   Self-test editor
   ===================================================================== */
const LIKERT_LABELS = ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'];
const isAnswered = (v) => v !== undefined && v !== null && String(v).trim() !== '';

function questionMarkup(q, n, value) {
  const name = `sf-q-${q.id}`;
  const opt = (v, label, cls = '', aria = '') => `<label class="ds-opt ${cls}"><input type="radio" name="${esc(name)}" value="${esc(v)}"${String(value) === String(v) ? ' checked' : ''}${aria ? ` aria-label="${esc(aria)}"` : ''}><span>${esc(label)}</span></label>`;
  // "Not applicable" is offered unless the question opts out or already has its own such option.
  const ownNa = list(q.options).some((o) => String(o?.value) === 'na');
  const na = q.allowNa === false || ownNa ? '' : opt('na', 'Not applicable', 'ds-opt-na');
  const legend = `<legend><span class="ds-q-num">${n}.</span> ${esc(q.text)}</legend>`;
  let control = '';
  if (q.type === 'scale') {
    const low = clean(q.low), high = clean(q.high);
    control = `<div class="ds-opts ds-opts-5 ds-opts-num">${[1, 2, 3, 4, 5].map((v) => opt(v, v, '', v === 1 && low ? `1, ${low}` : v === 5 && high ? `5, ${high}` : String(v))).join('')}</div>
      ${low || high ? `<div class="ds-ends" aria-hidden="true"><span>${low ? `1 = ${esc(low)}` : ''}</span><span>${high ? `5 = ${esc(high)}` : ''}</span></div>` : ''}`;
  } else if (q.type === 'choice') {
    control = `<div class="ds-opts">${list(q.options).map((o) => opt(o.value, o.label, 'ds-opt-left')).join('')}</div>`;
  } else {
    control = `<div class="ds-opts ds-opts-5 ds-opts-likert">${LIKERT_LABELS.map((l, i) => opt(i + 1, l)).join('')}</div>`;
  }
  return `<fieldset class="ds-q" data-q="${esc(q.id)}" data-type="${esc(q.type)}">${legend}${control}${na}</fieldset>`;
}

export function renderSelfEditor(el, { answers, onSave, onBack, onSnapshot } = {}) {
  setStickyTop();
  const questions = list(SELF_QUESTIONS);
  const dims = SELF_DIMENSIONS && typeof SELF_DIMENSIONS === 'object' ? SELF_DIMENSIONS : {};
  const state = { ...(answers && typeof answers === 'object' ? answers : {}) };
  const byId = new Map(questions.map((q) => [q.id, q]));
  // Sections in SELF_DIMENSIONS order; any area only the questions know about goes last.
  const order = Object.keys(dims);
  questions.forEach((q) => { if (!order.includes(q.dimension)) order.push(q.dimension); });
  const groups = order
    .map((dim) => ({ dim, meta: dims[dim] || { title: dim }, qs: questions.filter((q) => q.dimension === dim) }))
    .filter((g) => g.qs.length);
  const total = questions.length;
  const doneIn = (qs) => qs.filter((q) => isAnswered(state[q.id])).length;
  const firstOpen = groups.find((g) => doneIn(g.qs) < g.qs.length) || groups[0];
  const canSnap = typeof onSnapshot === 'function';
  let n = 0;

  el.innerHTML = `
    <div class="ds ds-editor sf-editor">
      <div class="ds-edbar">
        <div class="ds-edbar-top">
          <button class="ds-btn ds-btn-plain ds-btn-sm ds-back" type="button" data-back>${ICON.back} Back</button>
          <h1>About you</h1>
        </div>
        <div class="ds-edbar-meta"><span data-total></span><span role="status" aria-live="polite" data-save></span></div>
        <div class="ds-bar ds-bar-thin ds-tone-sage" role="progressbar" aria-label="Questions answered" aria-valuemin="0" aria-valuemax="${total}" data-total-bar><i></i></div>
      </div>
      <p class="sf-intro">This is about you, not a partner. Answer honestly. Change any answer later.</p>
      <div class="ds-stack">
        ${groups.map((g) => `
          <details class="ds-area" data-area="${esc(g.dim)}"${g === firstOpen ? ' open' : ''}>
            <summary>
              ${clean(g.meta.area) && clean(g.meta.area) !== clean(g.meta.title) ? `<span class="sf-eyebrow">${esc(g.meta.area)}</span>` : ''}
              <span class="ds-area-top"><span class="ds-area-title">${esc(g.meta.title || g.dim)}</span><span class="ds-area-count"><span data-area-count></span>${ICON.down}</span></span>
              <span class="ds-bar ds-bar-thin ds-tone-sage" aria-hidden="true"><i data-area-bar></i></span>
            </summary>
            <div class="ds-area-body">
              ${clean(g.meta.blurb) ? `<p class="ds-area-blurb">${esc(g.meta.blurb)}</p>` : ''}
              ${g.qs.map((q) => questionMarkup(q, ++n, state[q.id])).join('')}
            </div>
          </details>`).join('')}
        ${canSnap ? `
        <form class="ds-card ds-stack" data-snap novalidate>
          <div><h2>Save a snapshot</h2><p class="ds-section-note">Keeps a copy of your answers as they are today, so you can see how you change over time.</p></div>
          <div>
            <label class="ds-label" for="sf-snap-label">Name for this snapshot</label>
            <input class="ds-input" id="sf-snap-label" type="text" maxlength="60" autocomplete="off" placeholder="For example: Start of the year">
          </div>
          <p class="ds-msg ds-msg-error" role="alert" data-snap-error></p>
          <p class="ds-msg ds-msg-ok" role="status" aria-live="polite" data-snap-ok></p>
          <button class="ds-btn ds-btn-quiet ds-btn-block" type="submit">Save a snapshot</button>
        </form>` : ''}
        <button class="ds-btn ds-btn-primary ds-btn-block" type="button" data-back>Done for now</button>
      </div>
    </div>`;

  const root = el.querySelector('.sf-editor');
  const saveNode = root.querySelector('[data-save]');

  function paintProgress() {
    const done = doneIn(questions);
    root.querySelector('[data-total]').textContent = `${done} of ${total} answered`;
    const bar = root.querySelector('[data-total-bar]');
    bar.setAttribute('aria-valuenow', String(done));
    bar.firstElementChild.style.width = `${total ? (done / total) * 100 : 0}%`;
    groups.forEach((g) => {
      const node = root.querySelector(`[data-area="${CSS.escape(g.dim)}"]`);
      const d = doneIn(g.qs);
      node.querySelector('[data-area-count]').textContent = `${d} of ${g.qs.length}`;
      node.querySelector('[data-area-bar]').style.width = `${g.qs.length ? (d / g.qs.length) * 100 : 0}%`;
      node.classList.toggle('is-complete', d === g.qs.length);
    });
  }

  // Every change is saved at once; only the latest save reports its result.
  let saveSeq = 0;
  function save() {
    paintProgress();
    const seq = ++saveSeq;
    saveNode.className = '';
    saveNode.textContent = 'Saving';
    call(onSave, { ...state }).then(
      () => { if (seq === saveSeq) saveNode.textContent = 'Saved'; },
      (err) => { if (seq === saveSeq) { saveNode.className = 'ds-msg-error'; saveNode.textContent = errorText(err); } },
    );
  }

  root.addEventListener('change', (e) => {
    const holder = e.target.closest('[data-q]');
    if (!holder) return;
    const q = byId.get(holder.dataset.q);
    if (!q) return;
    const raw = e.target.value;
    state[q.id] = raw !== 'na' && q.type !== 'choice' ? Number(raw) : raw;
    save();
  });

  wire(root, '[data-back]', onBack);
  const snap = root.querySelector('[data-snap]');
  snap?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = snap.querySelector('[type="submit"]');
    if (btn.classList.contains('is-busy')) return;
    const input = snap.querySelector('input');
    const ok = snap.querySelector('[data-snap-ok]');
    const bad = snap.querySelector('[data-snap-error]');
    ok.textContent = ''; bad.textContent = '';
    btn.classList.add('is-busy'); btn.setAttribute('aria-busy', 'true');
    try {
      await call(onSnapshot, input.value.trim());
      ok.textContent = 'Snapshot saved.'; input.value = '';
    } catch (err) {
      bad.textContent = errorText(err);
    } finally {
      btn.classList.remove('is-busy'); btn.removeAttribute('aria-busy');
    }
  });

  paintProgress();
}

/* =====================================================================
   Self report
   ===================================================================== */
const READ = {
  close: { text: 'Close', tone: 'sage' },
  different: { text: 'Different', tone: 'warn' },
  far: { text: 'Far', tone: 'plum' },
};
const REASON_TEXT = {
  they_have_not_done_it: (name) => (name ? `${name} has not done the self-test yet.` : 'They have not done the self-test yet.'),
  you_have_not_done_it: () => 'Finish your own self-test to see how you compare.',
};

// A 0-100 bar with a marker. `tone` picks the colour, `thin` the facet size.
function meter(score, label, { tone = 'accent', size = '' } = {}) {
  const known = hasScore(score);
  const s = known ? clampScore(score) : 0;
  return `<span class="sf-meter ds-tone-${tone}${size ? ` sf-meter-${size}` : ''}${known ? '' : ' is-empty'}" role="img" aria-label="${esc(label)}">
    <span class="sf-meter-track"><i style="width:${s}%"></i></span>${known && !size ? `<b class="sf-meter-dot" style="left:${s}%"></b>` : ''}</span>`;
}

const evidenceCount = (ev) => (Array.isArray(ev) ? ev.length : hasScore(Number(ev)) && ev !== null && ev !== '' ? Math.round(Number(ev)) : null);
const basedOn = (ev) => {
  const c = evidenceCount(ev);
  return c == null || c < 1 ? '' : `<p class="sf-evidence">Based on ${c} ${c === 1 ? 'answer' : 'answers'}</p>`;
};

function traitCard(t) {
  const known = hasScore(t.score);
  const s = clampScore(t.score);
  const label = clean(t.label);
  return `<article class="ds-card sf-trait">
    <div class="sf-trait-head">
      <h3>${esc(t.title)}</h3>
      ${known ? `<span class="sf-score" aria-hidden="true">${s}<small>/100</small></span>` : ''}
    </div>
    ${meter(t.score, known ? `${clean(t.title)}: ${s} out of 100${label ? `, ${label}` : ''}` : `${clean(t.title)}: not enough answers yet`)}
    <div class="sf-scale" aria-hidden="true"><span>0</span><span>50</span><span>100</span></div>
    ${label || !known ? `<p><span class="ds-chip ds-chip-accent">${esc(known ? label : 'Not enough answers yet')}</span></p>` : ''}
    ${clean(t.blurb) ? `<p class="sf-blurb">${esc(t.blurb)}</p>` : ''}
  </article>`;
}

function facetGroups(traits, facets) {
  if (!facets.length) return '';
  const row = (f) => {
    const known = hasScore(f.score);
    const s = clampScore(f.score);
    return `<li class="sf-facet"><span class="sf-facet-name">${esc(f.title)}</span><span class="sf-facet-val" aria-hidden="true">${known ? s : '–'}</span>
      ${meter(f.score, known ? `${clean(f.title)}: ${s} out of 100` : `${clean(f.title)}: not enough answers yet`, { tone: 'sage', size: 'sm' })}</li>`;
  };
  const used = new Set();
  const groups = traits.map((t) => {
    const mine = facets.filter((f) => clean(f.trait) === clean(t.key) || clean(f.trait) === clean(t.title));
    mine.forEach((f) => used.add(f));
    return { title: t.title, items: mine };
  }).filter((g) => g.items.length);
  const rest = facets.filter((f) => !used.has(f));
  if (rest.length) groups.push({ title: groups.length ? 'Other' : '', items: rest });
  return `<div class="ds-card sf-facets">
    <h3>A closer look</h3>
    <p class="ds-section-note">The smaller parts that make up each trait.</p>
    <div class="sf-facet-grid">
      ${groups.map((g) => `<div class="sf-facet-group">${g.title ? `<h4>${esc(g.title)}</h4>` : ''}<ul>${g.items.map(row).join('')}</ul></div>`).join('')}
    </div>
  </div>`;
}

function compareCard(c) {
  const name = clean(c?.name) || clean(c?.compare?.partnerName) || 'This person';
  const kind = clean(c?.kindLabel ?? c?.kind ?? c?.label);
  const cmp = c?.compare;
  const reason = typeof cmp === 'string' ? cmp : (cmp && cmp.available ? null : clean(cmp?.reason) || 'unknown');
  const traits = reason ? [] : list(cmp.traits);
  const head = `<div class="sf-cmp-head"><h3>${esc(name)}</h3>${kind ? `<span class="ds-chip">${esc(kind)}</span>` : ''}</div>`;
  if (reason || !traits.length) {
    const line = (REASON_TEXT[reason] || (() => 'There is nothing to compare yet.'))(clean(c?.name));
    return `<article class="ds-card sf-cmp is-waiting">${head}<p class="sf-cmp-wait">${esc(line)}</p></article>`;
  }
  const val = (n) => (hasScore(n) ? clampScore(n) : null);
  return `<article class="ds-card sf-cmp">
    ${head}
    ${clean(cmp.summary) ? `<p class="sf-cmp-summary">${esc(cmp.summary)}</p>` : ''}
    <p class="sf-legend" aria-hidden="true"><span class="sf-key sf-key-you">You</span><span class="sf-key sf-key-them">${esc(name)}</span></p>
    <ul class="sf-cmp-list">
      ${traits.map((t) => {
        const r = READ[t.read];
        const a = val(t.mine), b = val(t.theirs);
        return `<li class="sf-cmp-row">
          <div class="sf-cmp-top"><span class="sf-cmp-title">${esc(t.title)}</span>${r ? `<span class="ds-chip ds-chip-${r.tone}">${r.text}</span>` : ''}</div>
          <div class="sf-pair">
            <span class="sf-pair-who" aria-hidden="true">You</span>${meter(t.mine, `You, ${clean(t.title)}: ${a == null ? 'no score' : `${a} out of 100`}`, { tone: 'accent', size: 'sm' })}<span class="sf-pair-val" aria-hidden="true">${a ?? '–'}</span>
            <span class="sf-pair-who" aria-hidden="true">Them</span>${meter(t.theirs, `${name}, ${clean(t.title)}: ${b == null ? 'no score' : `${b} out of 100`}`, { tone: 'them', size: 'sm' })}<span class="sf-pair-val" aria-hidden="true">${b ?? '–'}</span>
          </div>
        </li>`;
      }).join('')}
    </ul>
  </article>`;
}

const DISCLAIMER = 'These describe tendencies you can work with, not fixed labels, and they are not a clinical assessment. If you are going through something difficult, talk to someone you trust or a qualified professional.';
const disclaimer = () => `<aside class="sf-disclaimer" role="note">${ICON.info}<div><strong>A reflection, not a diagnosis.</strong><p>${DISCLAIMER}</p></div></aside>`;

export function renderSelfReport(el, { profile, name, onBack, onEdit, connections } = {}) {
  setStickyTop();
  const p = profile && typeof profile === 'object' ? profile : {};
  const who = clean(name);
  const eyebrow = who ? `${who} · Self-test` : 'Your self-test';
  const backBtn = `<div><button class="ds-btn ds-btn-plain ds-btn-sm ds-back" type="button" data-back>${ICON.back} Back</button></div>`;

  /* ----- not finished yet: a welcome card instead of a report ----- */
  if (!p.complete) {
    const total = Math.max(0, Number(p.totalCount) || 0);
    const done = Math.max(0, Math.min(total || Infinity, Number(p.answeredCount) || 0));
    const pct = total ? Math.round((done / total) * 100) : 0;
    const started = done > 0;
    el.innerHTML = `
      <div class="ds sf-report ds-stack-lg">
        ${backBtn}
        <section class="ds-card ds-welcome sf-start">
          <p class="sf-eyebrow">${esc(eyebrow)}</p>
          <h1>${started ? 'You are part of the way there' : 'Get to know yourself first'}</h1>
          <p class="sf-lead">${started
            ? 'Finish the remaining questions and your personal report will appear here.'
            : 'A short set of questions about you, not a partner. When you finish, you get a personal report: your traits, your strengths and where you could grow.'}</p>
          <div class="sf-start-progress">
            <div class="sf-start-nums"><b>${pct}%</b><span>${total ? `${done} of ${total} answered` : 'Not started'}</span></div>
            <div class="ds-bar" role="progressbar" aria-label="Self-test answered" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></div>
          </div>
          <button class="ds-btn ds-btn-primary ds-btn-block" type="button" data-edit>${started ? 'Continue the self-test' : 'Start the self-test'}</button>
        </section>
        ${disclaimer()}
      </div>`;
    const root = el.querySelector('.sf-report');
    wire(root, '[data-back]', onBack);
    wire(root, '[data-edit]', onEdit);
    return;
  }

  const traits = list(p.traits).filter((t) => t && typeof t === 'object');
  const facets = list(p.facets).filter((f) => f && typeof f === 'object');
  const strengths = list(p.strengths).filter((s) => s && typeof s === 'object');
  const growth = list(p.growthAreas).filter((g) => g && typeof g === 'object');
  const conns = list(connections).filter((c) => c && typeof c === 'object');
  const stress = p.stress && typeof p.stress === 'object' ? p.stress : null;
  const headline = clean(p.style?.label) || 'Your personal report';

  el.innerHTML = `
    <div class="ds sf-report ds-stack-lg">
      <header class="ds-stack">
        ${backBtn}
        <div class="ds-card ds-welcome sf-hero">
          <p class="sf-eyebrow">${esc(eyebrow)}</p>
          <h1>${esc(headline)}</h1>
          ${clean(p.style?.text) ? `<p class="sf-lead">${esc(p.style.text)}</p>` : ''}
        </div>
      </header>

      ${traits.length ? `
      <section class="ds-stack" aria-labelledby="sf-h-traits">
        <div><h2 id="sf-h-traits">Your traits</h2><p class="ds-section-note">Where you sit on each one, from 0 to 100. Neither end is better.</p></div>
        ${traits.map(traitCard).join('')}
        ${facetGroups(traits, facets)}
      </section>` : ''}

      ${strengths.length ? `
      <section class="ds-stack" aria-labelledby="sf-h-strengths">
        <h2 id="sf-h-strengths">Your strengths</h2>
        <div class="sf-grid">
          ${strengths.map((s) => `<article class="ds-card sf-strength"><h3>${esc(s.title)}</h3>${clean(s.text) ? `<p>${esc(s.text)}</p>` : ''}${basedOn(s.evidence)}</article>`).join('')}
        </div>
      </section>` : ''}

      ${growth.length ? `
      <section class="ds-stack" aria-labelledby="sf-h-grow">
        <div><h2 id="sf-h-grow">Where you could grow</h2><p class="ds-section-note">Habits, not flaws. Each one comes with something small to try.</p></div>
        ${growth.map((g) => `
          <article class="ds-card sf-grow">
            <h3>${esc(g.title)}</h3>
            ${clean(g.construct) ? `<p class="sf-construct">Construct: ${esc(g.construct)}</p>` : ''}
            ${clean(g.text) ? `<p>${esc(g.text)}</p>` : ''}
            ${list(g.tryThis).length ? `<div class="sf-try"><h4>Try this</h4><ol class="ds-ol">${list(g.tryThis).map((s) => `<li>${esc(s)}</li>`).join('')}</ol></div>` : ''}
            ${basedOn(g.evidence)}
          </article>`).join('')}
      </section>` : ''}

      ${stress && (clean(stress.habit) || clean(stress.text)) ? `
      <section class="ds-card sf-stress" aria-labelledby="sf-h-stress">
        <h2 id="sf-h-stress">Under pressure</h2>
        <p class="ds-section-note">What you tend to reach for when things get hard.</p>
        ${clean(stress.habit) ? `<p class="sf-habit">${esc(stress.habit)}</p>` : ''}
        ${clean(stress.text) ? `<p>${esc(stress.text)}</p>` : ''}
      </section>` : ''}

      <section class="ds-stack" aria-labelledby="sf-h-compare">
        <div><h2 id="sf-h-compare">How you compare</h2><p class="ds-section-note">Your traits next to the people you are connected with. Different is not worse; it is just something to know.</p></div>
        ${conns.length ? conns.map(compareCard).join('')
          : '<div class="ds-empty"><strong>No one to compare with yet</strong><p>When someone you are connected with does their own self-test, you will see the two of you side by side here.</p></div>'}
      </section>

      ${disclaimer()}

      <div class="sf-actions">
        <button class="ds-btn ds-btn-primary" type="button" data-edit>Edit my answers</button>
        <button class="ds-btn ds-btn-quiet" type="button" data-back>Back</button>
      </div>
    </div>`;

  const root = el.querySelector('.sf-report');
  wire(root, '[data-back]', onBack);
  wire(root, '[data-edit]', onEdit);
}
