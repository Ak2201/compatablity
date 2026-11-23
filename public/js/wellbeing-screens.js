// Private wellbeing check-in screens: the check-in editor and the summary view.
// Shares the ds- design classes from css/design.css; its own pieces are wb- classes
// in css/wellbeing.css. Each renderer fills `el`, wires its own listeners and reports
// back through the callbacks in opts. A callback may return a Promise; if it rejects
// with Error(message), the message is shown to the person.

import { WELLBEING_QUESTIONS, WELLBEING_DIMENSIONS, SUPPORT_NOTE } from './wellbeing-questions.js';
import { wellbeingSummary, wellbeingPrivacyNote } from './wellbeing-profile.js';

/* ---------- small helpers (same behaviour as the ones in self-screens.js) ---------- */
function esc(value) {
  return String(value ?? '').replace(/[&<>"'`]/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' }[c]
  ));
}
const clean = (v) => (typeof v === 'string' ? v.trim() : (v == null ? '' : String(v).trim()));
const list = (v) => (Array.isArray(v) ? v : (v == null || v === '' ? [] : [v]));
const errorText = (err) => clean(err && err.message) || 'Something went wrong. Please try again.';
const call = (fn, ...args) => { try { return Promise.resolve(typeof fn === 'function' ? fn(...args) : undefined); } catch (e) { return Promise.reject(e); } };

const svg = (body) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
const ICON = {
  back: svg('<path d="M14.5 5.5 8 12l6.5 6.5"/>'),
  down: svg('<path d="M6 9.5l6 6 6-6"/>'),
  lock: svg('<rect x="5.5" y="10.5" width="13" height="9" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>'),
  hand: svg('<path d="M12 20.5s-7.5-4.4-7.5-10A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.500 2.9c0 5.600-7.500 10-7.500 10z"/>'),
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

const privacyNote = () => {
  const text = clean(wellbeingPrivacyNote);
  return text ? `<p class="wb-privacy">${ICON.lock}<span>${esc(text)}</span></p>` : '';
};

/* =====================================================================
   Check-in editor
   ===================================================================== */
const LIKERT_LABELS = ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'];
const INTRO = 'Only you can see this. Answer for the last two weeks. There are no right answers, and you can change anything later.';
const isAnswered = (v) => v !== undefined && v !== null && String(v).trim() !== '';

// Options as { value, label } whatever shape the question gives them in.
const optionsOf = (q) => list(q.options)
  .map((o) => (o && typeof o === 'object' ? { value: o.value ?? o.label, label: o.label ?? o.value } : { value: o, label: o }))
  .filter((o) => isAnswered(o.value));

function questionMarkup(q, n, value) {
  const name = `wb-q-${q.id}`;
  const opt = (v, label, cls = '', aria = '') => `<label class="ds-opt ${cls}"><input type="radio" name="${esc(name)}" value="${esc(v)}"${isAnswered(value) && String(value) === String(v) ? ' checked' : ''}${aria ? ` aria-label="${esc(aria)}"` : ''}><span>${esc(label)}</span></label>`;
  const legend = `<legend><span class="ds-q-num">${n}.</span> ${esc(q.text)}</legend>`;
  const own = optionsOf(q);
  let control = '';
  if (q.type === 'scale') {
    const low = clean(q.low), high = clean(q.high);
    control = `<div class="ds-opts ds-opts-5 ds-opts-num">${[1, 2, 3, 4, 5].map((v) => opt(v, v, '', v === 1 && low ? `1, ${low}` : v === 5 && high ? `5, ${high}` : String(v))).join('')}</div>
      ${low || high ? `<div class="ds-ends" aria-hidden="true"><span>${low ? `1 = ${esc(low)}` : ''}</span><span>${high ? `5 = ${esc(high)}` : ''}</span></div>` : ''}`;
  } else if (q.type === 'choice') {
    control = `<div class="ds-opts">${own.map((o) => opt(o.value, o.label, 'ds-opt-left')).join('')}</div>`;
  } else if (own.length) {
    // A likert question with its own wording (for example "Not at all" to "Nearly every day").
    control = `<div class="ds-opts wb-opts-likert${own.length === 5 ? ' ds-opts-5 ds-opts-likert' : ''}">${own.map((o) => opt(o.value, o.label, own.length === 5 ? '' : 'ds-opt-left')).join('')}</div>`;
  } else {
    control = `<div class="ds-opts ds-opts-5 ds-opts-likert">${LIKERT_LABELS.map((l, i) => opt(i + 1, l)).join('')}</div>`;
  }
  return `<fieldset class="ds-q" data-q="${esc(q.id)}" data-type="${esc(q.type)}">${legend}${control}</fieldset>`;
}

export function renderWellbeingEditor(el, { answers, onSave, onBack } = {}) {
  setStickyTop();
  const questions = list(WELLBEING_QUESTIONS).filter((q) => q && typeof q === 'object' && isAnswered(q.id));
  const dims = WELLBEING_DIMENSIONS && typeof WELLBEING_DIMENSIONS === 'object' ? WELLBEING_DIMENSIONS : {};
  const state = { ...(answers && typeof answers === 'object' ? answers : {}) };
  const byId = new Map(questions.map((q) => [q.id, q]));
  // Sections in WELLBEING_DIMENSIONS order; any area only the questions know about goes last.
  const order = Object.keys(dims);
  questions.forEach((q) => { if (!order.includes(q.dimension)) order.push(q.dimension); });
  const groups = order
    .map((dim) => ({ dim, meta: dims[dim] || { title: dim }, qs: questions.filter((q) => q.dimension === dim) }))
    .filter((g) => g.qs.length);
  const total = questions.length;
  const doneIn = (qs) => qs.filter((q) => isAnswered(state[q.id])).length;
  const firstOpen = groups.find((g) => doneIn(g.qs) < g.qs.length) || groups[0];
  let n = 0;

  el.innerHTML = `
    <div class="ds ds-editor wb wb-editor">
      <div class="ds-edbar">
        <div class="ds-edbar-top">
          <button class="ds-btn ds-btn-plain ds-btn-sm ds-back" type="button" data-back>${ICON.back} Back</button>
          <h1>Wellbeing check-in</h1>
        </div>
        <div class="ds-edbar-meta"><span data-total></span><span role="status" aria-live="polite" data-save></span></div>
        <div class="ds-bar ds-bar-thin ds-tone-sage" role="progressbar" aria-label="Questions answered" aria-valuemin="0" aria-valuemax="${total}" data-total-bar><i></i></div>
      </div>
      <div class="wb-head">
        ${privacyNote()}
        <p class="wb-intro">${esc(INTRO)}</p>
      </div>
      <div class="ds-stack">
        ${groups.map((g) => `
          <details class="ds-area" data-area="${esc(g.dim)}"${g === firstOpen ? ' open' : ''}>
            <summary>
              ${clean(g.meta.area) && clean(g.meta.area) !== clean(g.meta.title) ? `<span class="wb-eyebrow">${esc(g.meta.area)}</span>` : ''}
              <span class="ds-area-top"><h2 class="ds-area-title">${esc(g.meta.title || g.dim)}</h2><span class="ds-area-count"><span data-area-count></span>${ICON.down}</span></span>
              <span class="ds-bar ds-bar-thin ds-tone-sage" aria-hidden="true"><i data-area-bar></i></span>
            </summary>
            <div class="ds-area-body">
              ${clean(g.meta.blurb) ? `<p class="ds-area-blurb">${esc(g.meta.blurb)}</p>` : ''}
              ${g.qs.map((q) => questionMarkup(q, ++n, state[q.id])).join('')}
            </div>
          </details>`).join('')}
        ${groups.length ? '' : '<div class="ds-empty"><strong>Nothing to answer yet</strong><p>The check-in questions are not available right now. Please come back in a little while.</p></div>'}
        <button class="ds-btn ds-btn-primary ds-btn-block" type="button" data-back>Done for now</button>
      </div>
    </div>`;

  const root = el.querySelector('.wb-editor');
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
    // Keep the option's own value (and its type) when the question lists options.
    const own = optionsOf(q).find((o) => String(o.value) === raw);
    state[q.id] = own ? own.value : (q.type === 'choice' ? raw : Number(raw));
    save();
  });

  wire(root, '[data-back]', onBack);
  paintProgress();
}

/* =====================================================================
   Check-in summary
   ===================================================================== */
// Sage, amber, plum. Never red: a hard fortnight is not an error.
const LEVEL = {
  steady: { text: 'Steady', tone: 'sage' },
  stretched: { text: 'Stretched', tone: 'warn' },
  strained: { text: 'Under strain', tone: 'plum' },
};
const levelChip = (level, fallback = '') => {
  const l = LEVEL[level];
  if (l) return `<span class="ds-chip ds-chip-${l.tone} wb-level"><i aria-hidden="true"></i>${l.text}</span>`;
  return fallback ? `<span class="ds-chip wb-level">${esc(fallback)}</span>` : '';
};

const DANGER_LINE = 'If you are in immediate danger, call your local emergency number.';

function safetyCard(safety) {
  if (safety !== 'passing' && safety !== 'frequent') return '';
  return `<section class="wb-safety" role="alert" aria-label="Support for you">
    ${ICON.hand}
    <div>
      <p class="wb-safety-title">You do not have to carry this alone</p>
      <p>${esc(SUPPORT_NOTE)}</p>
      <p class="wb-safety-now">${esc(DANGER_LINE)}</p>
    </div>
  </section>`;
}

export function renderWellbeingView(el, { answers, onBack, onEdit } = {}) {
  setStickyTop();
  let s = null;
  try { s = wellbeingSummary(answers && typeof answers === 'object' ? answers : {}); } catch { s = null; }
  s = s && typeof s === 'object' ? s : {};
  const done = s.completion && typeof s.completion === 'object' ? s.completion : {};
  const total = Math.max(0, Number(done.total) || 0);
  const answered = Math.max(0, Math.min(total || Infinity, Number(done.answered) || 0));
  const complete = done.complete === true;
  const started = answered > 0;
  const areas = list(s.areas).filter((a) => a && typeof a === 'object' && clean(a.title));
  const support = list(s.support).map(clean).filter(Boolean);
  const headline = clean(s.headline) || (started ? 'Your check-in so far' : 'A quiet check-in with yourself');
  const text = clean(s.text) || (started ? '' : 'A few questions about how the last two weeks have felt. It takes a few minutes, and it stays with you.');
  const pct = total ? Math.round((answered / total) * 100) : 0;
  const leftover = total - answered;

  el.innerHTML = `
    <div class="ds wb wb-view ds-stack-lg">
      ${safetyCard(s.flags && s.flags.safety)}
      <header class="ds-stack">
        <div><button class="ds-btn ds-btn-plain ds-btn-sm ds-back" type="button" data-back>${ICON.back} Back</button></div>
        <div class="ds-card ds-welcome wb-hero">
          <p class="wb-eyebrow">Wellbeing check-in · Last two weeks</p>
          <h1>${esc(headline)}</h1>
          ${LEVEL[s.level] ? `<p>${levelChip(s.level)}</p>` : ''}
          ${text ? `<p class="wb-lead">${esc(text)}</p>` : ''}
          ${privacyNote()}
        </div>
      </header>

      ${complete ? '' : `
      <section class="ds-card wb-continue" aria-labelledby="wb-h-continue">
        <h2 id="wb-h-continue">${started ? 'You are part of the way there' : 'Whenever you are ready'}</h2>
        <p>${started
          ? `You have answered ${answered} of ${total} so far. There is no rush. ${leftover === 1 ? 'One more question' : `The ${leftover > 0 ? `${leftover} left` : 'rest'}`} will give you a fuller picture.`
          : `${total ? `There are ${total} short questions. ` : ''}Take them at your own pace, and stop whenever you like.`}</p>
        ${total ? `<div class="ds-bar ds-tone-sage" role="progressbar" aria-label="Check-in answered" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${answered}"><i style="width:${pct}%"></i></div>` : ''}
        <button class="ds-btn ds-btn-primary ds-btn-block" type="button" data-edit>${started ? 'Continue my check-in' : 'Start my check-in'}</button>
      </section>`}

      ${areas.length ? `
      <section class="ds-stack" aria-labelledby="wb-h-areas">
        <div><h2 id="wb-h-areas">Area by area</h2><p class="ds-section-note">How each part of your life has felt lately. These shift from week to week.</p></div>
        <ul class="ds-card wb-areas">
          ${areas.map((a) => `<li class="wb-area"><span class="wb-area-title">${esc(a.title)}</span>${levelChip(a.level, 'Not answered yet')}</li>`).join('')}
        </ul>
      </section>` : ''}

      ${support.length ? `
      <section class="ds-card wb-support" aria-labelledby="wb-h-support">
        <h2 id="wb-h-support">Small things that may help</h2>
        <p class="ds-section-note">Pick one. You do not need to do them all.</p>
        <ol class="ds-ol">${support.map((line) => `<li>${esc(line)}</li>`).join('')}</ol>
      </section>` : ''}

      <div class="wb-actions">
        ${complete ? '<button class="ds-btn ds-btn-primary" type="button" data-edit>Edit my check-in</button>' : (started ? '<button class="ds-btn ds-btn-quiet" type="button" data-edit>Edit my check-in</button>' : '')}
        <button class="ds-btn ds-btn-quiet" type="button" data-back>Back</button>
      </div>
    </div>`;

  const root = el.querySelector('.wb-view');
  wire(root, '[data-back]', onBack);
  wire(root, '[data-edit]', onEdit);
}
