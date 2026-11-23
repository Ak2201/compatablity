// Private "Compare your partners" screen.
// Pure rendering: nothing here scores, sorts or ranks pairs. Cards appear in the order the caller gives.
// Every string that reaches innerHTML goes through esc().

const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };
function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"'`]/g, (c) => ESC_MAP[c]);
}

const arr = (v) => (Array.isArray(v) ? v : []);
const obj = (v) => (v && typeof v === 'object' ? v : {});
const str = (v) => (v === null || v === undefined ? '' : String(v).trim());
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const pct = (v) => (isNum(v) ? Math.round(Math.min(100, Math.max(0, v))) : null);
const DASH = '—';
const WHO_COUNT = 4; // identity colours cycle; they mark who is who, never how well a pair is doing

function initial(name) {
  const s = str(name);
  return s ? Array.from(s)[0].toUpperCase() : '♡';
}

const ICON = {
  lock: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="3" y="7" width="10" height="7" rx="2"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/></svg>',
  right: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M6 3l5 5-5 5"/></svg>',
  left: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M10 3L5 8l5 5"/></svg>',
};

function ring(score, name) {
  const value = pct(score);
  const aria = value === null ? `You and ${name}: no score yet` : `You and ${name}: ${value} out of 100`;
  const arc = value === null || value === 0
    ? ''
    : `<circle class="cp-ring-val" cx="60" cy="60" r="52" pathLength="100" style="--cp-val:${value}"></circle>`;
  return `<div class="cp-ring" role="img" aria-label="${esc(aria)}">
    <svg viewBox="0 0 120 120" aria-hidden="true" focusable="false">
      <circle class="cp-ring-track" cx="60" cy="60" r="52"></circle>${arc}
    </svg>
    <span class="cp-ring-num${value === null ? ' is-empty' : ''}" aria-hidden="true">${value === null ? DASH : value}</span>
  </div>`;
}

function bar(value, label) {
  const aria = value === null ? `${label}: no score yet` : `${label}: ${value} out of 100`;
  return `<span class="cp-bar" role="img" aria-label="${esc(aria)}">${value === null ? '' : `<i style="--cp-w:${value}%"></i>`}</span>`;
}

function normalise(items) {
  return arr(items).filter((it) => it && typeof it === 'object').map((it, i) => {
    const band = obj(it.band);
    return {
      index: i,
      who: i % WHO_COUNT,
      code: it.code,
      name: str(it.partnerName) || 'Your partner',
      kind: it.kind === 'friendship' ? 'Friendship' : it.kind === 'couple' ? 'Couple' : '',
      score: pct(it.score),
      bandLabel: str(band.label),
      bandBlurb: str(band.blurb),
      topics: arr(it.topics).map(str).filter(Boolean),
      areas: arr(it.areas).filter((a) => a && str(a.title)).map((a) => ({ title: str(a.title), score: pct(a.score) })),
    };
  });
}

function partnerCard(p, n) {
  // Top three areas within this one pair. This orders a pair's own areas, not the pairs themselves.
  const top = p.areas.filter((a) => a.score !== null)
    .map((a, i) => ({ ...a, i })).sort((a, b) => b.score - a.score || a.i - b.i).slice(0, 3);
  const topics = p.topics.slice(0, 2);
  const hid = `cp-name-${n}`;
  return `<li class="card cp-card cp-who-${p.who}" style="--i:${n + 1}">
    <article aria-labelledby="${hid}">
      <header class="cp-card-head">
        <span class="cp-avatar" aria-hidden="true">${esc(initial(p.name))}</span>
        <h3 id="${hid}">${esc(p.name)}</h3>
        ${p.kind ? `<span class="chip cp-kind">${esc(p.kind)}</span>` : ''}
      </header>
      <div class="cp-score">
        ${ring(p.score, p.name)}
        <div class="cp-band">
          <p class="cp-band-label">${esc(p.bandLabel || (p.score === null ? 'Not enough answers yet' : 'Your results'))}</p>
          ${p.bandBlurb ? `<p class="cp-band-blurb">${esc(p.bandBlurb)}</p>` : ''}
        </div>
      </div>
      <div class="cp-block">
        <h4>Where you line up</h4>
        ${top.length ? `<ul class="cp-lines">${top.map((a) => `<li>
          <span class="cp-line-top"><span class="cp-line-name">${esc(a.title)}</span><b aria-hidden="true">${a.score}</b></span>
          ${bar(a.score, a.title)}
        </li>`).join('')}</ul>` : '<p class="cp-quiet">Nothing to show here yet.</p>'}
      </div>
      <div class="cp-block">
        <h4>Talk about</h4>
        ${topics.length ? `<ul class="cp-topics">${topics.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`
          : '<p class="cp-quiet">No suggested topics yet.</p>'}
      </div>
      <button type="button" class="btn btn-ghost btn-sm cp-open" data-cp-open="${p.index}" aria-label="${esc(`Open this pair: you and ${p.name}`)}">Open this pair${ICON.right}</button>
    </article>
  </li>`;
}

function sideBySide(people) {
  if (people.length < 2) return '';
  // Area titles in first-seen order, kept when at least two pairs have them.
  const rows = [];
  const seen = new Map();
  people.forEach((p) => {
    const mine = new Set();
    p.areas.forEach((a) => {
      const key = a.title.toLowerCase();
      if (mine.has(key)) return;
      mine.add(key);
      if (!seen.has(key)) { seen.set(key, { title: a.title, cells: [] }); rows.push(seen.get(key)); }
      seen.get(key).cells.push({ p, score: a.score });
    });
  });
  const shared = rows.filter((r) => r.cells.length >= 2);
  const body = shared.length
    ? `<ul class="cp-rows">${shared.map((r) => `<li class="cp-row">
        <h3>${esc(r.title)}</h3>
        <ul class="cp-pairs">${r.cells.map(({ p, score }) => `<li class="cp-pair cp-who-${p.who}">
          <span class="cp-pair-name">${esc(p.name)}</span>
          ${bar(score, `${r.title}, you and ${p.name}`)}
          <b class="cp-pair-num${score === null ? ' is-empty' : ''}" aria-hidden="true">${score === null ? DASH : score}</b>
        </li>`).join('')}</ul>
      </li>`).join('')}</ul>`
    : '<p class="cp-quiet">These pairs do not share any areas yet, so there is nothing to line up here.</p>';
  return `<section class="card cp-side" style="--i:${people.length + 1}" aria-labelledby="cp-side-h">
    <h2 id="cp-side-h">Side by side</h2>
    <p class="cp-sub">The same areas, one line for each partner. Different numbers are simply different conversations to have.</p>
    ${body}
  </section>`;
}

export function renderCompare(el, opts = {}) {
  if (!el) return;
  if (typeof el.__rvCleanup === 'function') el.__rvCleanup();

  const o = obj(opts);
  const me = str(o.myName);
  const people = normalise(o.items);

  const content = people.length
    ? `<section class="cp-people" aria-labelledby="cp-people-h">
        <h2 id="cp-people-h" class="cp-label">Each pair, on its own</h2>
        <ul class="cp-cards" data-count="${Math.min(people.length, 3)}">${people.map(partnerCard).join('')}</ul>
      </section>
      ${sideBySide(people)}`
    : `<div class="ac-empty cp-empty">
        <svg viewBox="0 0 112 72" fill="none" stroke-width="2" aria-hidden="true" focusable="false">
          <circle class="ac-art-a" cx="42" cy="36" r="24"/><circle class="ac-art-b" cx="70" cy="36" r="24"/>
        </svg>
        <p>No revealed pairs yet. Once you and a partner have both submitted, you will see your comparison here.</p>
      </div>`;

  el.innerHTML = `<div class="ac cp" data-cp-root>
    <header class="cp-head">
      <h1 tabindex="-1">Compare your partners</h1>
      ${people.length ? `<p class="lead">${me ? `${esc(me)}, here` : 'Here'} is each of your pairs, next to the others. Take your time with it.</p>` : ''}
      <p class="cp-private">${ICON.lock}<span>Only you can see this.</span></p>
    </header>
    ${content}
    <footer class="cp-foot">
      <p>A conversation tool, not a verdict. Each pair's results are separate, and your partners cannot see each other.</p>
      <button type="button" class="btn btn-ghost btn-sm" data-cp-back>${ICON.left}Back to my sessions</button>
    </footer>
  </div>`;

  const root = el.querySelector('[data-cp-root]');
  const onClick = (e) => {
    const target = e.target instanceof Element ? e.target : null;
    if (!target) return;
    const open = target.closest('[data-cp-open]');
    if (open && root.contains(open)) {
      const p = people[Number(open.getAttribute('data-cp-open'))];
      if (p && typeof o.onOpen === 'function') o.onOpen(p.code);
      return;
    }
    const back = target.closest('[data-cp-back]');
    if (back && root.contains(back) && typeof o.onBack === 'function') o.onBack();
  };
  root.addEventListener('click', onClick);

  function cleanup() {
    root.removeEventListener('click', onClick);
    if (el.__rvCleanup === cleanup) delete el.__rvCleanup;
  }
  el.__rvCleanup = cleanup;
}
