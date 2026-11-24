// Signed-in screens: home (Rankings, People, Me), answers editor, compare sheet,
// pair detail and the depth page. Styles live in css/design.css (ds- classes).
// Each renderer fills `el`, wires its own listeners and reports back through the
// callbacks in opts. A callback may return a Promise; if it rejects with
// Error(message), the message is shown inline next to the control.

import { QUESTIONS, DIMENSIONS } from './questions.js';
import { FRIEND_QUESTIONS, FRIEND_DIMENSIONS } from './friend-questions.js';

/* ---------- small helpers ---------- */
function esc(value) {
  return String(value ?? '').replace(/[&<>"'`]/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' }[c]
  ));
}
const clean = (v) => (typeof v === 'string' ? v.trim() : (v == null ? '' : String(v).trim()));
const list = (v) => (Array.isArray(v) ? v : (v == null || v === '' ? [] : [v]));
const initial = (name) => { const s = clean(name); return s ? Array.from(s)[0].toUpperCase() : '?'; };
const errorText = (err) => clean(err && err.message) || 'Something went wrong. Please try again.';
const call = (fn, ...args) => { try { return Promise.resolve(typeof fn === 'function' ? fn(...args) : undefined); } catch (e) { return Promise.reject(e); } };
const clampScore = (n) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
const hasScore = (n) => typeof n === 'number' && Number.isFinite(n);
let uidSeq = 0;
const uid = (p) => `ds-${p}-${++uidSeq}`;

function fmtDate(value) {
  const d = value ? new Date(value) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

const svg = (body) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
const ICON = {
  rankings: svg('<rect x="3.5" y="12" width="5" height="8.5" rx="1.5"/><rect x="9.5" y="5" width="5" height="15.5" rx="1.5"/><rect x="15.5" y="9" width="5" height="11.5" rx="1.5"/>'),
  people: svg('<circle cx="9" cy="8.5" r="3.3"/><path d="M2.8 19.5c.7-3.3 3.1-5.1 6.2-5.1s5.5 1.8 6.2 5.1"/><circle cx="17.2" cy="9.3" r="2.6"/><path d="M17.4 14.4c2.2.2 3.6 1.6 4.1 4.1"/>'),
  me: svg('<circle cx="12" cy="8.5" r="3.6"/><path d="M4.8 20c.9-3.6 3.7-5.6 7.2-5.6s6.3 2 7.2 5.6"/>'),
  bell: svg('<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/>'),
  copy: svg('<rect x="8.5" y="8.5" width="11" height="11" rx="2.5"/><path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2"/>'),
  share: svg('<path d="M12 15V4"/><path d="M8 7.5 12 3.5l4 4"/><path d="M5 12v6.5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V12"/>'),
  plus: svg('<path d="M12 5v14"/><path d="M5 12h14"/>'),
  close: svg('<path d="M6 6l12 12"/><path d="M18 6 6 18"/>'),
  back: svg('<path d="M14.5 5.5 8 12l6.5 6.5"/>'),
  down: svg('<path d="M6 9.5l6 6 6-6"/>'),
  info: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5"/><path d="M12 7.8v.2"/>'),
  compare: svg('<path d="M4 7h13"/><path d="M14 4l3 3-3 3"/><path d="M20 17H7"/><path d="M10 14l-3 3 3 3"/>'),
  heart: svg('<path d="M12 20c-5.2-3.6-8-6.6-8-10a4.3 4.3 0 0 1 8-2.3A4.3 4.3 0 0 1 20 10c0 3.4-2.8 6.4-8 10z"/>'),
  friends: svg('<circle cx="8.5" cy="9" r="3.2"/><circle cx="15.5" cy="9" r="3.2"/><path d="M3 19.5c.6-3 2.7-4.7 5.5-4.7 1.4 0 2.6.4 3.5 1.2.9-.8 2.1-1.2 3.5-1.2 2.8 0 4.9 1.7 5.5 4.7"/>'),
  chevron: svg('<path d="m9 6 6 6-6 6"/>'),
  lock: svg('<rect x="5" y="10.5" width="14" height="9.5" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>'),
  signout: svg('<path d="M14 4.5h3A2.5 2.5 0 0 1 19.5 7v10a2.5 2.5 0 0 1-2.5 2.5h-3"/><path d="M4 12h10.5"/><path d="m10.5 8 4 4-4 4"/>'),
  sparkle: svg('<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>'),
  leaf: svg('<path d="M5 19c0-8 5-13 14-14-1 9-6 14-14 14z"/><path d="M5 19c3-4 6-7 10-10"/>'),
  shield: svg('<path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6z"/>'),
  book: svg('<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 18h16"/><path d="M8 7h8"/>'),
  clock: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
};

const GENDER_WORD = { male: 'Man', female: 'Woman' };
const genderWord = (g) => GENDER_WORD[clean(g).toLowerCase()] || '';
const BAND_TONE = { strong: 'sage', good: 'sage', mixed: 'warn', far: 'plum' };
const bandTone = (item) => BAND_TONE[item?.band?.key] || 'accent';
const STATUS_CHIP = {
  done: { text: 'All answered', tone: 'sage' },
  partial: { text: 'Partly answered', tone: 'warn' },
  empty: { text: 'Not started', tone: '' },
};
const BANKS = {
  couple: { title: 'Couple answers', note: 'Used for your couple rank.', questions: QUESTIONS, dimensions: DIMENSIONS },
  friendship: { title: 'Friendship answers', note: 'Used for your friendship rank.', questions: FRIEND_QUESTIONS, dimensions: FRIEND_DIMENSIONS },
};

function ring(score, tone, label, bare = false) {
  const s = clampScore(score);
  const aria = bare ? ' aria-hidden="true"' : ` role="img" aria-label="${esc(label)}"`;
  return `<span class="ds-ring ds-tone-${tone}" style="--p:${s}"${aria}><b aria-hidden="true">${s}</b></span>`;
}

/* ---------- toast ---------- */
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
  // Let the text land before the class so the fade plays.
  requestAnimationFrame(() => node.classList.add('is-on'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('is-on'), 2600);
}

async function copyText(text, done = 'Copied') {
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
    else throw new Error('no clipboard');
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    if (!ok) { toast('Could not copy. Select the text and copy it by hand.'); return false; }
  }
  toast(done);
  return true;
}

// Runs a callback with the button disabled, and shows a rejected Error inline.
async function run(btn, errNode, fn) {
  if (btn?.classList.contains('is-busy')) return { ok: false };
  if (errNode) errNode.textContent = '';
  btn?.classList.add('is-busy');
  btn?.setAttribute('aria-busy', 'true');
  try {
    const value = await fn();
    return { ok: true, value };
  } catch (err) {
    if (errNode) errNode.textContent = errorText(err); else toast(errorText(err));
    return { ok: false };
  } finally {
    btn?.classList.remove('is-busy');
    btn?.removeAttribute('aria-busy');
  }
}

// Keeps sticky bars below the app's own sticky top bar, when there is one.
function setStickyTop() {
  const bar = document.querySelector('.topbar');
  const h = bar && getComputedStyle(bar).position === 'sticky' ? Math.round(bar.getBoundingClientRect().height) : 0;
  document.documentElement.style.setProperty('--ds-top', `${h}px`);
}

/* ---------- sheet (modal dialog with a focus trap) ---------- */
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';
let openSheets = [];

function closeAllSheets() { openSheets.slice().forEach((s) => s.close(true)); }

// mountSheet(host, { title, body, wide, onClose }) fills `host` and returns { body, close }.
function mountSheet(host, { title, body = '', wide = false, onClose } = {}) {
  const titleId = uid('sheet');
  const opener = document.activeElement;
  host.innerHTML = `
    <div class="ds ds-sheet-wrap" data-sheet-wrap>
      <div class="ds-sheet${wide ? ' ds-sheet-wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="${titleId}" tabindex="-1">
        <div class="ds-sheet-head">
          <h2 id="${titleId}">${esc(title)}</h2>
          <button class="ds-btn ds-btn-quiet ds-btn-icon" type="button" data-sheet-close aria-label="Close">${ICON.close}</button>
        </div>
        <div class="ds-sheet-body">${body}</div>
      </div>
    </div>`;
  const wrap = host.querySelector('[data-sheet-wrap]');
  const dialog = wrap.querySelector('[role="dialog"]');
  let closed = false;
  const prevOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';

  const api = {
    body: dialog.querySelector('.ds-sheet-body'),
    dialog,
    close(silent) {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = prevOverflow;
      openSheets = openSheets.filter((s) => s !== api);
      host.innerHTML = '';
      if (host.dataset.dsOwned) host.remove();
      if (opener && opener.isConnected && typeof opener.focus === 'function') opener.focus();
      if (!silent && typeof onClose === 'function') onClose();
    },
  };

  function onKey(e) {
    if (openSheets[openSheets.length - 1] !== api) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); api.close(); return; }
    if (e.key !== 'Tab') return;
    const items = Array.from(dialog.querySelectorAll(FOCUSABLE)).filter((n) => n.offsetParent !== null || n === document.activeElement);
    if (!items.length) { e.preventDefault(); dialog.focus(); return; }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (!dialog.contains(active)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && (active === first || active === dialog)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
  }
  document.addEventListener('keydown', onKey, true);
  wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) api.close(); });
  dialog.querySelector('[data-sheet-close]').addEventListener('click', () => api.close());
  openSheets.push(api);
  dialog.focus();
  return api;
}

// Opens a sheet in its own host on <body>, so it sits above everything.
function openSheet(options) {
  const host = document.createElement('div');
  host.dataset.dsOwned = '1';
  document.body.appendChild(host);
  return mountSheet(host, options);
}

/* =====================================================================
   Home
   ===================================================================== */
const TABS = [
  { key: 'rankings', label: 'Rankings' },
  { key: 'people', label: 'People' },
  { key: 'me', label: 'Me' },
];
const BAND_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'strong', label: 'Strong' },
  { key: 'good', label: 'Good' },
  { key: 'mixed', label: 'Mixed' },
  { key: 'far', label: 'Far' },
];
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
// These survive re-renders, so a reload after a callback keeps the person where they were.
const homeState = { tab: 'rankings', band: 'all', recent: false };

function connExpired(c) {
  if (c.accepted || !c.expiresAt) return false;
  const t = new Date(c.expiresAt).getTime();
  return Number.isFinite(t) && t < Date.now();
}
const connName = (c) => clean(c.nickname) || clean(c.partnerName);

function rankRow(item, nameOf) {
  const tone = bandTone(item);
  const score = clampScore(item.score);
  const name = nameOf(item);
  const first = Number(item.rank) === 1;
  const band = clean(item.band?.label);
  const blurb = clean(item.band?.blurb);
  return `
    <li>
      <button class="ds-rank-row ds-tone-${tone}${first ? ' is-first' : ''}" type="button" data-open="${esc(item.id)}"
        aria-label="${esc(`Rank ${item.rank}. ${name}. Score ${score} out of 100${band ? `. ${band}` : ''}. Open details`)}">
        <span class="ds-rank-badge" aria-hidden="true">${esc(item.rank)}</span>
        ${first ? ring(score, tone, '', true) : `<span class="ds-avatar" aria-hidden="true">${esc(initial(name))}</span>`}
        <span class="ds-rank-main" aria-hidden="true">
          ${first
            ? `<span class="ds-rank-first-line"><span class="ds-chip ds-chip-gold">1st</span><span class="ds-rank-name">${esc(name)}</span></span>`
            : `<span class="ds-rank-name">${esc(name)}</span>`}
          <span class="ds-bar"><i style="width:${score}%"></i></span>
          ${first && band ? `<span class="ds-chip ds-chip-${tone}">${esc(band)}</span>` : ''}
          <span class="ds-rank-band">${esc(first ? blurb : band)}</span>
        </span>
        <span class="ds-rank-score" aria-hidden="true">${score}</span>
        <span class="ds-chev" aria-hidden="true">${ICON.chevron}</span>
      </button>
    </li>`;
}

function rankSection(kind, items, shown, nameOf) {
  const couple = kind === 'couple';
  const title = couple ? 'Couple rank' : 'Friendship rank';
  const note = couple ? 'Only pairs of one man and one woman.' : 'Everyone you are connected with.';
  let bodyHtml;
  if (!items.length) {
    bodyHtml = `<div class="ds-empty">
      <strong>${couple ? 'No couple rank yet' : 'No friendship rank yet'}</strong>
      <p>${couple
        ? 'A couple rank appears when you and a person of the other gender have both filled in the couple answers and both turned on sharing.'
        : 'A friendship rank appears when you and another person have both filled in the friendship answers and both turned on sharing.'}</p>
    </div>`;
  } else if (!shown.length) {
    bodyHtml = `<div class="ds-empty"><strong>Nothing matches these filters</strong><p>Try “All”, or turn off “Changed in the last 30 days”.</p>
      <button class="ds-btn ds-btn-quiet ds-btn-sm" type="button" data-clear-filters>Show everyone</button></div>`;
  } else {
    bodyHtml = `<ol class="ds-rank" aria-label="${title}">${shown.map((it) => rankRow(it, nameOf)).join('')}</ol>`;
  }
  return `<section class="ds-stack ds-tone-${couple ? 'accent' : 'sage'}" aria-labelledby="ds-h-${kind}">
    <div class="ds-section-row">
      <span class="ds-section-ic" aria-hidden="true">${couple ? ICON.heart : ICON.friends}</span>
      <div class="ds-grow"><h2 id="ds-h-${kind}">${title}</h2><p class="ds-section-note">${note}</p></div>
      ${items.length ? `<span class="ds-chip">${items.length}</span>` : ''}
    </div>
    ${bodyHtml}
  </section>`;
}

function welcomeCard(status, conns, hasRank) {
  const answered = status.couple !== 'empty' || status.friendship !== 'empty';
  const invited = conns.length > 0;
  const step = (done, title, text) => `<li${done ? ' class="is-done"' : ''}><div><b>${title}${done ? '<span class="ds-vh"> (done)</span>' : ''}</b><span>${text}</span></div></li>`;
  return `<section class="ds-card ds-welcome" aria-labelledby="ds-h-welcome">
    <h2 id="ds-h-welcome">Welcome. Three steps to your first rank</h2>
    <ol class="ds-steps">
      ${step(answered, 'Answer your profile', 'Fill in your couple answers, your friendship answers, or both. You do this once.')}
      ${step(invited, 'Invite someone with your code', 'Give your code to a partner or a friend. They enter it on their People tab.')}
      ${step(hasRank, 'See your rank once you both share', 'Nothing is compared until you have both turned on sharing.')}
    </ol>
    <div class="ds-bank-actions">
      ${answered
        ? '<button class="ds-btn ds-btn-primary" type="button" data-goto="people">Invite someone</button>'
        : '<button class="ds-btn ds-btn-primary" type="button" data-goto="me">Answer your profile</button>'}
    </div>
  </section>`;
}

function codeCells(code) {
  const chars = Array.from(code || '••••••');
  return `<div class="ds-code${code ? '' : ' is-empty'}${chars.length > 8 ? ' is-long' : ''}" data-code
    role="img" aria-label="${code ? esc(`Your code is ${chars.join(' ')}`) : 'You do not have a code yet'}">${chars.map((ch) => `<span aria-hidden="true">${esc(ch)}</span>`).join('')}</div>`;
}

function connCard(c) {
  const expired = connExpired(c);
  const pending = !c.accepted;
  const name = connName(c);
  const who = name || 'this person';
  const gender = genderWord(c.partnerGender);
  const both = c.accepted && c.myShare && c.partnerShare;
  let chip;
  if (expired) chip = { text: 'Expired', tone: 'plum' };
  else if (pending) chip = { text: 'Invite sent', tone: 'warn' };
  else if (both) chip = { text: 'Both sharing', tone: 'sage' };
  else if (c.partnerShare) chip = { text: 'Your turn', tone: 'accent' };
  else chip = { text: 'Connected', tone: '' };
  const expiry = fmtDate(c.expiresAt);
  const id = esc(c.id);

  if (pending) {
    return `<li class="ds-card ds-conn is-pending" data-conn="${id}">
      <div class="ds-conn-head">
        <span class="ds-avatar is-ghost" aria-hidden="true">?</span>
        <div class="ds-grow">
          <h3 class="ds-conn-name">${expired ? 'This invite has expired' : 'Waiting for them to accept'}</h3>
          <p class="ds-conn-meta">${c.code ? `Code ${esc(c.code)}` : 'Invite'}${expiry ? `, ${expired ? 'expired' : 'expires'} ${esc(expiry)}` : ''}</p>
        </div>
        <span class="ds-chip${chip.tone ? ` ds-chip-${chip.tone}` : ''}">${chip.text}</span>
      </div>
      ${clean(c.message) ? `<p class="ds-quote">Your message: ${esc(c.message)}</p>` : ''}
      <div class="ds-conn-foot">
        <p class="ds-small ds-soft ds-grow">${expired ? 'Remove it and send a new one.' : 'They have not entered your code yet.'}</p>
        <button class="ds-btn ds-btn-quiet ds-btn-sm" type="button" data-cancel="${id}">${expired ? 'Remove invite' : 'Cancel invite'}</button>
      </div>
      <p class="ds-msg ds-msg-error" data-conn-error role="alert"></p>
    </li>`;
  }

  const hint = both ? 'You can see how you match.'
    : c.myShare ? 'You are sharing. Waiting for them to share too.'
      : c.partnerShare ? 'They are sharing. Turn on your sharing to compare.'
        : 'Nothing is shared yet. Turn it on when you are ready.';
  return `<li class="ds-card ds-conn" data-conn="${id}">
    <div class="ds-conn-head">
      <span class="ds-avatar" aria-hidden="true">${esc(initial(name))}</span>
      <div class="ds-grow">
        <h3 class="ds-conn-name" data-conn-name>${esc(name || 'Someone')}</h3>
        <p class="ds-conn-meta" data-conn-meta>${esc([clean(c.nickname) && clean(c.partnerName) ? `Real name ${clean(c.partnerName)}` : '', gender].filter(Boolean).join(', '))}</p>
      </div>
      <span class="ds-chip${chip.tone ? ` ds-chip-${chip.tone}` : ''}" data-conn-chip>${chip.text}</span>
    </div>
    <div class="ds-share" role="group" aria-label="${esc(`Sharing with ${who}`)}">
      <button class="ds-toggle" type="button" role="switch" aria-checked="${c.myShare ? 'true' : 'false'}" data-share="${id}">
        <span class="ds-toggle-text"><b>I share</b><span class="ds-toggle-state" aria-hidden="true">${c.myShare ? 'On' : 'Off'}</span></span>
        <span class="ds-switch" aria-hidden="true"></span>
      </button>
      <div class="ds-share-them">
        <span class="ds-toggle-text"><b>They share</b><span class="ds-toggle-state">${c.partnerShare ? 'On' : 'Off'}<span class="ds-vh">, only they can change this</span></span></span>
        <span class="ds-switch is-readonly${c.partnerShare ? ' is-on' : ''}" aria-hidden="true"></span>
      </div>
    </div>
    <p class="ds-msg ds-msg-error" data-conn-error role="alert"></p>
    <div class="ds-conn-foot">
      <p class="ds-small ds-soft ds-grow" data-conn-hint>${hint}</p>
      <button class="ds-btn ds-btn-plain ds-btn-sm" type="button" data-nick="${id}" aria-expanded="false">${clean(c.nickname) ? 'Change nickname' : 'Add a nickname'}</button>
      <button class="ds-btn ds-btn-primary ds-btn-sm" type="button" data-open="${id}"${both ? '' : ' hidden'}>Open<span class="ds-vh"> ${esc(who)}</span></button>
    </div>
    <form class="ds-nick-form" data-nick-form hidden novalidate>
      <label class="ds-label" for="ds-nick-${id}">Nickname for ${esc(clean(c.partnerName) || 'this person')}</label>
      <div class="ds-field-row">
        <input class="ds-input" id="ds-nick-${id}" type="text" maxlength="40" autocomplete="off" value="${esc(clean(c.nickname))}" placeholder="Only you see this">
        <button class="ds-btn ds-btn-primary ds-btn-sm" type="submit">Save</button>
      </div>
      <p class="ds-msg ds-msg-error" data-nick-error role="alert"></p>
    </form>
  </li>`;
}

export function renderHome(el, opts = {}) {
  closeAllSheets();
  setStickyTop();
  const {
    profile, rankings, onInvite, onAccept, onShare, onOpenPair, onNickname, onCancelInvite,
    onEditProfile, onCompare, onNotifications, onMarkRead, onDeleteData, onSignOut,
    onSnapshot, onDownload, answers, onSelfTest, onWellbeing, onPsychology, onOlder,
  } = opts;
  const name = clean(profile?.display_name);
  const couple = list(rankings?.couple);
  const friendship = list(rankings?.friendship);
  const conns = list(opts.connections).map((c) => ({ ...c }));
  const notes = list(opts.notifications).map((n) => ({ ...n }));
  const status = { couple: opts.profileStatus?.couple || 'empty', friendship: opts.profileStatus?.friendship || 'empty' };
  let myCode = clean(opts.code ?? profile?.code) || clean(conns.find((c) => !c.accepted && !connExpired(c) && c.code)?.code);
  let myLink = clean(opts.link);
  if (!TABS.some((t) => t.key === homeState.tab)) homeState.tab = 'rankings';

  const nickOf = (id) => clean(conns.find((c) => String(c.id) === String(id))?.nickname);
  const nameOf = (item) => nickOf(item.id) || clean(item.partnerName) || 'Someone';
  const allItems = [...couple, ...friendship];
  const firstRun = !allItems.length;
  const unread = () => notes.filter((n) => !n.read).length;

  el.innerHTML = `
    <div class="ds ds-home">
      <header class="ds-header">
        <div class="ds-grow">
          <p class="ds-eyebrow">Your space</p>
          <h1>${name ? `Hi, ${esc(name)}` : 'Hi there'}</h1>
          <p class="ds-header-sub" data-sub></p>
        </div>
        <button class="ds-btn ds-btn-quiet ds-btn-icon" type="button" data-bell>${ICON.bell}<span class="ds-badge-count" data-bell-count aria-hidden="true" hidden></span><span class="ds-vh" data-bell-label>Notifications</span></button>
      </header>

      <div class="ds-tabs-wrap">
        <div class="ds-tabs" role="tablist" aria-label="Home sections">
          ${TABS.map((t) => `<button class="ds-tab" type="button" role="tab" id="ds-tab-${t.key}" data-tab="${t.key}" aria-controls="ds-panel-${t.key}" aria-selected="false" tabindex="-1">${ICON[t.key]}<span>${t.label}</span></button>`).join('')}
        </div>
      </div>

      <div class="ds-panel ds-stack-lg" role="tabpanel" id="ds-panel-rankings" aria-labelledby="ds-tab-rankings" tabindex="0" hidden>
        ${firstRun ? welcomeCard(status, conns, false) : `
        <div class="ds-filters">
          <fieldset>
            <legend class="ds-vh">Show by how close the match is</legend>
            <div class="ds-seg">
              ${BAND_FILTERS.map((b) => `<label><input type="radio" name="ds-band" value="${b.key}"${b.key === homeState.band ? ' checked' : ''}><span>${b.label}</span></label>`).join('')}
            </div>
          </fieldset>
          <button class="ds-toggle" type="button" role="switch" aria-checked="${homeState.recent ? 'true' : 'false'}" data-recent>
            <span class="ds-toggle-text"><span>Changed in the last 30 days</span></span><span class="ds-switch" aria-hidden="true"></span>
          </button>
          <button class="ds-btn ds-btn-quiet ds-btn-block" type="button" data-compare${allItems.length >= 2 ? '' : ' hidden'}>${ICON.compare} Compare two</button>
        </div>`}
        <p class="ds-vh" role="status" aria-live="polite" data-filter-status></p>
        <div class="ds-stack-lg" data-ranks></div>
      </div>

      <div class="ds-panel ds-stack-lg" role="tabpanel" id="ds-panel-people" aria-labelledby="ds-tab-people" tabindex="0" hidden>
        <section class="ds-card ds-codecard" aria-labelledby="ds-h-code">
          <h2 id="ds-h-code">Your code</h2>
          <p class="ds-soft ds-small" data-code-lead></p>
          <div data-code-slot></div>
          <div class="ds-code-actions">
            <button class="ds-btn ds-btn-primary" type="button" data-copy-code>${ICON.copy} Copy code</button>
            <button class="ds-btn ds-btn-quiet" type="button" data-share-code>${ICON.share} Share</button>
          </div>
          <div class="ds-linkline" data-link-line hidden>
            <span>Link</span><code data-link></code>
            <button class="ds-btn ds-btn-plain ds-btn-sm" type="button" data-copy-link>Copy<span class="ds-vh"> link</span></button>
          </div>
        </section>

        <button class="ds-btn ds-btn-primary ds-btn-block" type="button" data-invite>${ICON.plus} Invite someone</button>

        <form class="ds-card" data-accept novalidate>
          <label class="ds-label" for="ds-accept-input">Enter a code or paste a link</label>
          <p class="ds-help" id="ds-accept-help">Got a code from someone? Enter it here to connect with them.</p>
          <div class="ds-field-row">
            <input class="ds-input" id="ds-accept-input" type="text" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" enterkeyhint="go" aria-describedby="ds-accept-help ds-accept-error">
            <button class="ds-btn ds-btn-primary" type="submit">Accept</button>
          </div>
          <p class="ds-msg ds-msg-error" id="ds-accept-error" role="alert"></p>
          <p class="ds-msg ds-msg-ok" role="status" aria-live="polite" data-accept-ok></p>
        </form>

        <section class="ds-stack" aria-labelledby="ds-h-conns">
          <h2 id="ds-h-conns">Your people</h2>
          <div data-conns></div>
        </section>
      </div>

      <div class="ds-panel ds-stack-lg" role="tabpanel" id="ds-panel-me" aria-labelledby="ds-tab-me" tabindex="0" hidden>
        <section class="ds-card ds-hero" aria-label="You">
          <span class="ds-avatar" aria-hidden="true">${esc(initial(name))}</span>
          <div class="ds-grow"><h2>${esc(name || 'You')}</h2>${genderWord(profile?.gender) ? `<p class="ds-soft">${esc(genderWord(profile?.gender))}</p>` : ''}</div>
        </section>

        <section class="ds-stack" aria-labelledby="ds-h-answers">
          <div><h2 id="ds-h-answers">Your answers</h2><p class="ds-section-note">Private until you share with someone.</p></div>
          ${Object.keys(BANKS).map((bank) => {
            const chip = STATUS_CHIP[status[bank]] || STATUS_CHIP.empty;
            const scoredQs = BANKS[bank].questions.filter((q) => q.type !== 'text');
            const doneCount = scoredQs.filter((q) => answers?.[bank]?.[q.id] !== undefined).length;
            const pct = scoredQs.length ? Math.round((doneCount / scoredQs.length) * 100) : 0;
            const verb = status[bank] === 'empty' ? 'Start answering' : status[bank] === 'partial' ? 'Continue answering' : 'Edit answers';
            return `<section class="ds-card ds-bank ds-tone-${bank === 'couple' ? 'accent' : 'sage'}" aria-labelledby="ds-h-bank-${bank}">
              <div class="ds-bank-head">
                <span class="ds-section-ic" aria-hidden="true">${bank === 'couple' ? ICON.heart : ICON.friends}</span>
                <div class="ds-grow"><h2 id="ds-h-bank-${bank}">${BANKS[bank].title}</h2><p class="ds-section-note">${BANKS[bank].questions.length} questions. ${BANKS[bank].note}</p></div>
                <span class="ds-chip${chip.tone ? ` ds-chip-${chip.tone}` : ''}">${status[bank] === 'partial' ? `${doneCount} of ${scoredQs.length}` : chip.text}</span>
              </div>
              ${status[bank] === 'partial' ? `<span class="ds-bar" aria-hidden="true"><i style="width:${pct}%"></i></span>` : ''}
              <div class="ds-bank-actions">
                <button class="ds-btn ${status[bank] === 'done' ? 'ds-btn-quiet' : 'ds-btn-primary'} ds-btn-sm" type="button" data-edit="${bank}">${verb}<span class="ds-vh">, ${BANKS[bank].title}</span></button>
                <button class="ds-btn ds-btn-plain ds-btn-sm" type="button" data-snapshot="${bank}">Save a snapshot<span class="ds-vh">, ${BANKS[bank].title}</span></button>
              </div>
              <p class="ds-msg ds-msg-error" role="alert" data-bank-error></p>
            </section>`;
          }).join('')}
        </section>

        <section class="ds-stack" aria-labelledby="ds-h-you">
          <div><h2 id="ds-h-you">Just for you</h2><p class="ds-section-note">These never appear in anyone's comparison.</p></div>
          <button class="ds-card ds-link-card ds-tone-plum" type="button" data-self>
            <span class="ds-section-ic" aria-hidden="true">${ICON.sparkle}</span>
            <span class="ds-grow"><h3>Self-test</h3><span class="ds-section-note">Your traits, strengths and where you could grow.</span>
              ${Object.keys(answers?.self || {}).length ? '<span class="ds-chip ds-chip-plum" style="margin-top:8px">Started</span>' : ''}</span>
            <span class="ds-chev" aria-hidden="true">${ICON.chevron}</span>
          </button>
          <button class="ds-card ds-link-card is-sage ds-tone-sage" type="button" data-wellbeing>
            <span class="ds-section-ic" aria-hidden="true">${ICON.leaf}</span>
            <span class="ds-grow"><h3>Wellbeing check-in</h3><span class="ds-section-note">How the last two weeks have felt. Stays with you.</span>
              <span class="ds-chip ds-chip-sage" style="margin-top:8px">${ICON.lock} Only you can see this</span></span>
            <span class="ds-chev" aria-hidden="true">${ICON.chevron}</span>
          </button>
          <button class="ds-card ds-link-card" type="button" data-psych>
            <span class="ds-section-ic" aria-hidden="true">${ICON.book}</span>
            <span class="ds-grow"><h3>Psychology guide</h3><span class="ds-section-note">Attachment, patterns and small things to try.</span></span>
            <span class="ds-chev" aria-hidden="true">${ICON.chevron}</span>
          </button>
          ${typeof onOlder === 'function' ? `<button class="ds-card ds-card-flat ds-link-card" type="button" data-older>
            <span class="ds-section-ic" aria-hidden="true" style="background:var(--surface)">${ICON.clock}</span>
            <span class="ds-grow"><h3>Older sessions</h3><span class="ds-section-note">Two-person sessions from before connections.</span></span>
            <span class="ds-chev" aria-hidden="true">${ICON.chevron}</span>
          </button>` : ''}
        </section>

        <section class="ds-card ds-stack" aria-labelledby="ds-h-privacy">
          <div class="ds-privacy-head">${ICON.shield}<h2 id="ds-h-privacy" style="font-size:19px">Privacy</h2></div>
          <p class="ds-soft ds-small">You can stop sharing any connection at any time. When sharing is off, the other person cannot see how you match.</p>
          <div class="ds-row">
            <button class="ds-btn ds-btn-quiet ds-btn-sm ds-grow" type="button" data-download>Download my answers</button>
            <button class="ds-btn ds-btn-danger ds-btn-sm ds-grow" type="button" data-delete>Delete my data</button>
          </div>
          <p class="ds-msg ds-msg-error" role="alert" data-privacy-error></p>
        </section>
        <button class="ds-btn ds-btn-plain ds-signout" type="button" data-signout>${ICON.signout} Sign out</button>
      </div>
    </div>`;

  const root = el.querySelector('.ds-home');
  const $ = (sel) => root.querySelector(sel);
  const $$ = (sel) => Array.from(root.querySelectorAll(sel));

  /* header */
  function paintHeader() {
    const accepted = conns.filter((c) => c.accepted).length;
    const waiting = conns.filter((c) => !c.accepted && !connExpired(c)).length;
    const parts = [];
    if (accepted) parts.push(`${accepted} ${accepted === 1 ? 'person' : 'people'} connected`);
    if (waiting) parts.push(`${waiting} ${waiting === 1 ? 'invite' : 'invites'} waiting`);
    $('[data-sub]').textContent = parts.length ? parts.join(', ') : 'Share your code to see how you match.';
    const n = unread();
    const badge = $('[data-bell-count]');
    badge.hidden = n === 0;
    badge.textContent = n > 9 ? '9+' : String(n);
    $('[data-bell-label]').textContent = n ? `Notifications, ${n} unread` : 'Notifications';
  }

  /* tabs */
  const tabs = $$('[role="tab"]');
  function selectTab(key, focus) {
    homeState.tab = key;
    tabs.forEach((t) => {
      const on = t.dataset.tab === key;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
      root.querySelector(`#ds-panel-${t.dataset.tab}`).hidden = !on;
      if (on && focus) t.focus();
    });
  }
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => selectTab(t.dataset.tab));
    t.addEventListener('keydown', (e) => {
      let next = -1;
      if (e.key === 'ArrowRight') next = (i + 1) % tabs.length;
      else if (e.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = tabs.length - 1;
      if (next < 0) return;
      e.preventDefault();
      selectTab(tabs[next].dataset.tab, true);
    });
  });

  /* rankings */
  function passes(item) {
    if (homeState.band !== 'all' && item.band?.key !== homeState.band) return false;
    if (homeState.recent) {
      const t = new Date(item.updatedAt).getTime();
      if (!Number.isFinite(t) || Date.now() - t > THIRTY_DAYS) return false;
    }
    return true;
  }
  function paintRanks(announce) {
    const c = couple.filter(passes);
    const f = friendship.filter(passes);
    $('[data-ranks]').innerHTML = rankSection('couple', couple, c, nameOf) + rankSection('friendship', friendship, f, nameOf);
    if (announce) $('[data-filter-status]').textContent = `Showing ${c.length} in couple rank and ${f.length} in friendship rank.`;
  }
  $$('input[name="ds-band"]').forEach((r) => r.addEventListener('change', () => { homeState.band = r.value; paintRanks(true); }));
  $('[data-recent]')?.addEventListener('click', (e) => {
    homeState.recent = !homeState.recent;
    e.currentTarget.setAttribute('aria-checked', homeState.recent ? 'true' : 'false');
    paintRanks(true);
  });
  $('[data-compare]')?.addEventListener('click', () => {
    call(onCompare).catch(() => {});
    const host = document.createElement('div');
    host.dataset.dsOwned = '1';
    document.body.appendChild(host);
    renderCompareSheet(host, { items: allItems.map((it) => ({ ...it, partnerName: nameOf(it) })) });
  });

  /* people: code */
  function paintCode() {
    $('[data-code-slot]').innerHTML = codeCells(myCode);
    $('[data-code-lead]').textContent = myCode
      ? 'Give this code to a partner or a friend. They enter it on their People tab.'
      : 'You do not have a code yet. Choose “Invite someone” to create one.';
    $('[data-copy-code]').hidden = !myCode;
    $('[data-share-code]').hidden = !myCode;
    $('[data-link-line]').hidden = !myLink;
    $('[data-link]').textContent = myLink;
  }
  $('[data-copy-code]').addEventListener('click', () => copyText(myCode, 'Code copied'));
  $('[data-copy-link]').addEventListener('click', () => copyText(myLink, 'Link copied'));
  $('[data-share-code]').addEventListener('click', async () => {
    const text = `Connect with me on Compatibility. My code is ${myCode}.${myLink ? ` Or open ${myLink}` : ''}`;
    if (navigator.share) {
      try { await navigator.share({ title: 'My Compatibility code', text }); } catch { /* closed by the person */ }
    } else {
      copyText(text, 'Invite text copied');
    }
  });

  /* people: invite sheet */
  $('[data-invite]').addEventListener('click', () => {
    const sheet = openSheet({
      title: 'Invite someone',
      body: `
        <form class="ds-stack" data-invite-form novalidate>
          <p class="ds-soft">We create a code for you to send. You can add a short note that they see when they accept.</p>
          <div>
            <label class="ds-label" for="ds-invite-msg">Message (optional)</label>
            <textarea class="ds-textarea" id="ds-invite-msg" maxlength="200" rows="3" placeholder="For example: Shall we try this together?" aria-describedby="ds-invite-count"></textarea>
            <p class="ds-count" id="ds-invite-count">0 of 200</p>
          </div>
          <p class="ds-msg ds-msg-error" role="alert" data-invite-error></p>
          <button class="ds-btn ds-btn-primary ds-btn-block" type="submit">Create</button>
        </form>
        <div class="ds-stack" data-invite-done hidden></div>`,
    });
    const form = sheet.body.querySelector('[data-invite-form]');
    const msg = form.querySelector('textarea');
    const count = form.querySelector('.ds-count');
    msg.addEventListener('input', () => { count.textContent = `${msg.value.length} of 200`; });
    msg.focus();
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const res = await run(form.querySelector('[type="submit"]'), form.querySelector('[data-invite-error]'), () => call(onInvite, msg.value.trim().slice(0, 200)));
      if (!res.ok) return;
      const out = res.value || {};
      if (clean(out.code)) myCode = clean(out.code);
      if (clean(out.link)) myLink = clean(out.link);
      paintCode();
      const done = sheet.body.querySelector('[data-invite-done]');
      const expiry = fmtDate(out.expiresAt);
      form.hidden = true;
      done.hidden = false;
      done.innerHTML = `
        <p role="status"><b>Your invite is ready.</b> Send this code to the person you want to connect with.</p>
        ${codeCells(clean(out.code))}
        ${expiry ? `<p class="ds-soft ds-small" style="text-align:center">It works until ${esc(expiry)}.</p>` : ''}
        <div class="ds-code-actions">
          <button class="ds-btn ds-btn-primary" type="button" data-done-copy>${ICON.copy} Copy code</button>
          ${clean(out.link) ? '<button class="ds-btn ds-btn-quiet" type="button" data-done-link>Copy link</button>' : ''}
        </div>
        <button class="ds-btn ds-btn-plain ds-btn-block" type="button" data-done-close>Done</button>`;
      done.querySelector('[data-done-copy]').addEventListener('click', () => copyText(clean(out.code), 'Code copied'));
      done.querySelector('[data-done-link]')?.addEventListener('click', () => copyText(clean(out.link), 'Link copied'));
      done.querySelector('[data-done-close]').addEventListener('click', () => sheet.close());
      done.querySelector('[data-done-copy]').focus();
    });
  });

  /* people: accept */
  const acceptForm = $('[data-accept]');
  acceptForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = acceptForm.querySelector('input');
    const err = acceptForm.querySelector('#ds-accept-error');
    const ok = acceptForm.querySelector('[data-accept-ok]');
    ok.textContent = '';
    const text = input.value.trim();
    if (!text) { err.textContent = 'Enter the code or paste the link first.'; input.focus(); return; }
    const res = await run(acceptForm.querySelector('[type="submit"]'), err, () => call(onAccept, text));
    if (res.ok && acceptForm.isConnected) { input.value = ''; ok.textContent = 'Connected. You will find them under Your people.'; }
  });

  /* people: connection cards */
  function paintConns() {
    const sorted = conns.slice().sort((a, b) => Number(!!b.accepted) - Number(!!a.accepted) || Number(connExpired(a)) - Number(connExpired(b)));
    $('[data-conns]').innerHTML = sorted.length
      ? `<ul class="ds-stack">${sorted.map(connCard).join('')}</ul>`
      : `<div class="ds-empty"><strong>No one here yet</strong><p>Send your code to someone, or enter a code that someone gave you.</p></div>`;
  }
  const findConn = (id) => conns.find((c) => String(c.id) === String(id));
  $('[data-conns]').addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const card = btn.closest('[data-conn]');
    const c = card && findConn(card.dataset.conn);
    if (!c) return;
    const err = card.querySelector('[data-conn-error]');
    if (btn.dataset.share !== undefined) {
      const next = !c.myShare;
      const res = await run(btn, err, () => call(onShare, c.id, next));
      if (!res.ok || !card.isConnected) return;
      c.myShare = next;
      paintConns();
      $(`[data-conn="${CSS.escape(String(c.id))}"] [data-share]`)?.focus();
      toast(next ? 'You are now sharing' : 'You stopped sharing');
    } else if (btn.dataset.cancel !== undefined) {
      const res = await run(btn, err, () => call(onCancelInvite, c.id));
      if (!res.ok) return;
      conns.splice(conns.indexOf(c), 1);
      paintConns(); paintHeader();
      toast('Invite removed');
    } else if (btn.dataset.nick !== undefined) {
      const form = card.querySelector('[data-nick-form]');
      form.hidden = !form.hidden;
      btn.setAttribute('aria-expanded', form.hidden ? 'false' : 'true');
      if (!form.hidden) form.querySelector('input').focus();
    } else if (btn.dataset.open !== undefined) {
      call(onOpenPair, c.id).catch((x) => toast(errorText(x)));
    }
  });
  $('[data-conns]').addEventListener('submit', async (e) => {
    const form = e.target.closest('[data-nick-form]');
    if (!form) return;
    e.preventDefault();
    const card = form.closest('[data-conn]');
    const c = findConn(card.dataset.conn);
    const value = form.querySelector('input').value.trim();
    const res = await run(form.querySelector('[type="submit"]'), form.querySelector('[data-nick-error]'), () => call(onNickname, c.id, value));
    if (!res.ok) return;
    c.nickname = value;
    paintConns(); paintRanks(false);
    toast(value ? 'Nickname saved' : 'Nickname removed');
  });

  /* rank rows and in-panel links */
  root.addEventListener('click', (e) => {
    const row = e.target.closest('.ds-rank-row');
    if (row) { call(onOpenPair, row.dataset.open).catch((x) => toast(errorText(x))); return; }
    const go = e.target.closest('[data-goto]');
    if (go) { selectTab(go.dataset.goto, true); return; }
    if (e.target.closest('[data-clear-filters]')) {
      homeState.band = 'all'; homeState.recent = false;
      $$('input[name="ds-band"]').forEach((r) => { r.checked = r.value === 'all'; });
      $('[data-recent]')?.setAttribute('aria-checked', 'false');
      paintRanks(true);
      $('input[name="ds-band"]')?.focus();
    }
  });

  /* notifications */
  $('[data-bell]').addEventListener('click', () => {
    call(onNotifications).catch(() => {});
    const sheet = openSheet({ title: 'Notifications', body: '' });
    const paint = () => {
      sheet.body.innerHTML = notes.length
        ? `<ul class="ds-notes">${notes.map((n) => `<li class="ds-note${n.read ? ' is-read' : ''}"><i aria-hidden="true"></i><span>${n.read ? '' : '<span class="ds-vh">Unread: </span>'}${esc(n.body)}</span></li>`).join('')}</ul>
           <p class="ds-msg ds-msg-error" role="alert" data-read-error></p>
           <button class="ds-btn ds-btn-quiet ds-btn-block" type="button" data-mark-read${unread() ? '' : ' disabled'}>Mark all read</button>`
        : '<div class="ds-empty"><strong>Nothing new</strong><p>You will see a note here when someone accepts your invite or changes their sharing.</p></div>';
      sheet.body.querySelector('[data-mark-read]')?.addEventListener('click', async (e) => {
        const res = await run(e.currentTarget, sheet.body.querySelector('[data-read-error]'), () => call(onMarkRead));
        if (!res.ok) return;
        notes.forEach((n) => { n.read = true; });
        paintHeader(); paint();
        sheet.dialog.focus();
        toast('All marked as read');
      });
    };
    paint();
  });

  /* me */
  $$('[data-edit]').forEach((b) => b.addEventListener('click', () => call(onEditProfile, b.dataset.edit).catch((x) => toast(errorText(x)))));
  $$('[data-snapshot]').forEach((b) => b.addEventListener('click', async () => {
    const err = b.closest('section').querySelector('[data-bank-error]');
    if (typeof onSnapshot !== 'function') { err.textContent = 'Snapshots are not available yet.'; return; }
    const res = await run(b, err, () => call(onSnapshot, b.dataset.snapshot));
    if (res.ok) toast('Snapshot saved');
  }));
  $('[data-download]').addEventListener('click', async (e) => {
    const err = $('[data-privacy-error]');
    if (typeof onDownload === 'function') { await run(e.currentTarget, err, () => call(onDownload)); return; }
    try {
      const blob = new Blob([JSON.stringify({ profile: profile ?? null, answers: answers ?? {} }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'my-answers.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast('Download started');
    } catch (x) { err.textContent = errorText(x); }
  });
  $('[data-delete]').addEventListener('click', () => {
    const sheet = openSheet({
      title: 'Delete my data',
      body: `
        <form class="ds-stack" novalidate>
          <p>This removes your answers, your connections and your account. It cannot be undone.</p>
          <div>
            <label class="ds-label" for="ds-delete-input">Type DELETE to confirm</label>
            <input class="ds-input" id="ds-delete-input" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false">
          </div>
          <p class="ds-msg ds-msg-error" role="alert" data-delete-error></p>
          <button class="ds-btn ds-btn-danger-solid ds-btn-block" type="submit" disabled>Delete my data</button>
          <button class="ds-btn ds-btn-quiet ds-btn-block" type="button" data-keep>Keep my data</button>
        </form>`,
    });
    const form = sheet.body.querySelector('form');
    const input = form.querySelector('input');
    const submit = form.querySelector('[type="submit"]');
    input.addEventListener('input', () => { submit.disabled = input.value.trim() !== 'DELETE'; });
    form.querySelector('[data-keep]').addEventListener('click', () => sheet.close());
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (input.value.trim() !== 'DELETE') return;
      const res = await run(submit, form.querySelector('[data-delete-error]'), () => call(onDeleteData));
      if (res.ok) { sheet.close(); toast('Your data was deleted'); }
    });
    input.focus();
  });
  $('[data-signout]').addEventListener('click', () => call(onSignOut).catch((x) => toast(errorText(x))));
  $('[data-self]').addEventListener('click', () => call(onSelfTest).catch((x) => toast(errorText(x))));
  $('[data-wellbeing]').addEventListener('click', () => call(onWellbeing).catch((x) => toast(errorText(x))));
  $('[data-psych]').addEventListener('click', () => call(onPsychology).catch((x) => toast(errorText(x))));
  $('[data-older]')?.addEventListener('click', () => call(onOlder).catch((x) => toast(errorText(x))));

  paintHeader(); paintRanks(false); paintCode(); paintConns();
  selectTab(homeState.tab);
}

/* =====================================================================
   Compare sheet
   ===================================================================== */
const kindWord = (k) => (k === 'couple' ? 'Couple' : 'Friendship');
const joinWords = (arr) => (arr.length <= 1 ? arr.join('') : `${arr.slice(0, -1).join(', ')} and ${arr[arr.length - 1]}`);

function compareSummary(a, b) {
  const sa = list(a.strongest).map(clean).filter(Boolean);
  const sb = list(b.strongest).map(clean).filter(Boolean);
  const onlyA = sa.filter((t) => !sb.includes(t));
  const onlyB = sb.filter((t) => !sa.includes(t));
  const shared = sa.filter((t) => sb.includes(t));
  const parts = [];
  if (onlyA.length || onlyB.length) {
    const bits = [];
    if (onlyA.length) bits.push(`with ${a.partnerName} your strongest ground is ${joinWords(onlyA)}`);
    if (onlyB.length) bits.push(`with ${b.partnerName} it is ${joinWords(onlyB)}`);
    parts.push(`Where they differ most: ${bits.join(', while ')}.`);
  } else if (shared.length) {
    parts.push('These two are strongest in the same areas, so they differ little there.');
  } else {
    parts.push('Open each one to see where they differ, area by area.');
  }
  if (shared.length && (onlyA.length || onlyB.length)) parts.push(`Both are strong in ${joinWords(shared)}.`);
  if (a.kind !== b.kind) parts.push('One is a couple score and one is a friendship score. They come from different questions, so read each on its own.');
  else parts.push('Each connection is its own relationship. The numbers describe how alike your answers are, not how much either one matters.');
  return parts.join(' ');
}

export function renderCompareSheet(el, { items, onClose } = {}) {
  const all = list(items).map((it, i) => ({ ...it, _key: `${it.kind || 'x'}:${it.id ?? i}`, partnerName: clean(it.partnerName) || 'Someone' }));
  const picked = [];
  const sheet = mountSheet(el, {
    title: 'Compare two',
    wide: true,
    onClose,
    body: `
      <fieldset>
        <legend class="ds-label">Choose two</legend>
        <div class="ds-pick">
          ${all.map((it) => `<label class="ds-pickchip"><input type="checkbox" value="${esc(it._key)}"><span>${esc(it.partnerName)} <small>${kindWord(it.kind)}</small></span></label>`).join('')}
        </div>
      </fieldset>
      <p class="ds-vh" role="status" aria-live="polite" data-cmp-status></p>
      <div class="ds-stack" data-cmp-out></div>`,
  });
  const out = sheet.body.querySelector('[data-cmp-out]');
  const statusNode = sheet.body.querySelector('[data-cmp-status]');
  const boxes = Array.from(sheet.body.querySelectorAll('input[type="checkbox"]'));

  const side = (it) => {
    const strongest = list(it.strongest).map(clean).filter(Boolean);
    const score = clampScore(it.score);
    return `<div class="ds-side">
      <h3>${esc(it.partnerName)}</h3>
      <span class="ds-chip">${kindWord(it.kind)}</span>
      ${ring(score, bandTone(it), `Score ${score} out of 100`)}
      <p><b>${esc(clean(it.band?.label))}</b></p>
      <p class="ds-side-label">Strongest areas</p>
      ${strongest.length ? `<ul>${strongest.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : '<p class="ds-small ds-soft">Not available yet</p>'}
    </div>`;
  };

  function paint() {
    boxes.forEach((b) => { b.disabled = picked.length >= 2 && !b.checked; });
    if (all.length < 2) {
      out.innerHTML = '<div class="ds-empty"><strong>You need two to compare</strong><p>Once two people share with you, you can put them side by side here.</p></div>';
      return;
    }
    if (picked.length < 2) {
      out.innerHTML = `<p class="ds-soft">${picked.length === 0 ? 'Pick two people above to see them side by side.' : 'Pick one more.'}</p>`;
      statusNode.textContent = '';
      return;
    }
    const [a, b] = picked.map((k) => all.find((it) => it._key === k));
    out.innerHTML = `
      <div class="ds-versus">${side(a)}${side(b)}</div>
      <p class="ds-summary">${esc(compareSummary(a, b))}</p>`;
    statusNode.textContent = `Showing ${a.partnerName} and ${b.partnerName} side by side.`;
  }
  boxes.forEach((b) => b.addEventListener('change', () => {
    if (b.checked) picked.push(b.value); else picked.splice(picked.indexOf(b.value), 1);
    paint();
  }));
  paint();
  (boxes[0] || sheet.dialog).focus();
  return sheet;
}

/* =====================================================================
   Profile editor
   ===================================================================== */
const LIKERT_LABELS = ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'];
const isAnswered = (v) => v !== undefined && v !== null && String(v).trim() !== '';

function questionMarkup(q, n, value) {
  const name = `ds-q-${q.id}`;
  const opt = (v, label, cls = '', aria = '') => `<label class="ds-opt ${cls}"><input type="radio" name="${esc(name)}" value="${esc(v)}"${String(value) === String(v) ? ' checked' : ''}${aria ? ` aria-label="${esc(aria)}"` : ''}><span>${esc(label)}</span></label>`;
  const na = opt('na', 'Not applicable', 'ds-opt-na');
  const legend = `<legend><span class="ds-q-num">${n}.</span> ${esc(q.text)}</legend>`;
  let control = '';
  if (q.type === 'likert') {
    control = `<div class="ds-opts ds-opts-5 ds-opts-likert">${LIKERT_LABELS.map((l, i) => opt(i + 1, l)).join('')}</div>`;
  } else if (q.type === 'scale') {
    control = `<div class="ds-opts ds-opts-5 ds-opts-num">${[1, 2, 3, 4, 5].map((v) => opt(v, v, '', v === 1 ? `1, ${q.low}` : v === 5 ? `5, ${q.high}` : String(v))).join('')}</div>
      <div class="ds-ends" aria-hidden="true"><span>1 = ${esc(q.low)}</span><span>5 = ${esc(q.high)}</span></div>`;
  } else if (q.type === 'choice') {
    control = `<div class="ds-opts">${list(q.options).map((o) => opt(o.value, o.label, 'ds-opt-left')).join('')}</div>`;
  } else if (q.type === 'dealbreaker') {
    control = `<div class="ds-opts ds-opts-2">${opt('yes', 'Yes')}${opt('no', 'No')}</div>`;
  } else {
    const isNa = value === 'na';
    const id = `ds-qt-${q.id}`;
    return `<div class="ds-q" data-q="${esc(q.id)}" data-type="text">
      <label class="ds-label" for="${esc(id)}" style="font-size:17px;line-height:1.4"><span class="ds-q-num">${n}.</span> ${esc(q.text)}</label>
      <textarea class="ds-textarea" id="${esc(id)}" rows="3" maxlength="1000"${isNa ? ' disabled' : ''}>${esc(isNa ? '' : value)}</textarea>
      <label class="ds-opt ds-opt-na"><input type="checkbox" data-na${isNa ? ' checked' : ''}><span>Not applicable</span></label>
    </div>`;
  }
  return `<fieldset class="ds-q" data-q="${esc(q.id)}" data-type="${esc(q.type)}">${legend}${control}${na}</fieldset>`;
}

export function renderProfileEditor(el, { bank, answers, onSave, onBack, onSnapshot } = {}) {
  closeAllSheets();
  setStickyTop();
  const key = BANKS[bank] ? bank : 'couple';
  const def = BANKS[key];
  const state = { ...(answers && typeof answers === 'object' ? answers : {}) };
  const byId = new Map(def.questions.map((q) => [q.id, q]));
  // Sections in bank order: the order areas first appear in the question list.
  const order = [];
  def.questions.forEach((q) => { if (!order.includes(q.dimension)) order.push(q.dimension); });
  const groups = order.map((dim) => ({ dim, meta: def.dimensions[dim] || { title: dim }, qs: def.questions.filter((q) => q.dimension === dim) }));
  const total = def.questions.length;
  const doneIn = (qs) => qs.filter((q) => isAnswered(state[q.id])).length;
  const firstOpen = groups.find((g) => doneIn(g.qs) < g.qs.length) || groups[0];
  let n = 0;

  el.innerHTML = `
    <div class="ds ds-editor">
      <div class="ds-edbar">
        <div class="ds-edbar-row">
          <button class="ds-btn ds-btn-quiet ds-btn-sm ds-back" type="button" data-back>${ICON.back} Back</button>
          <div class="ds-edbar-title">
            <h1>${def.title}</h1>
            <p><span data-total></span><span role="status" aria-live="polite" data-save></span></p>
          </div>
          <span class="ds-ring ds-ring-sm ds-tone-sage" style="--p:0" aria-hidden="true" data-total-ring><b data-total-pct>0%</b></span>
        </div>
        <div class="ds-area-chips" role="group" aria-label="Jump to an area">
          ${groups.map((g) => `<button class="ds-chip ds-chip-outline" type="button" data-jump="${esc(g.dim)}">${esc(g.meta.title)}</button>`).join('')}
        </div>
        <div class="ds-bar ds-bar-thin ds-tone-sage" role="progressbar" aria-label="Questions answered" aria-valuemin="0" aria-valuemax="${total}" data-total-bar><i></i></div>
      </div>
      <p class="ds-soft" style="margin-bottom:var(--ds-4)">Answer for yourself, as you are now. Each answer is saved as you go. Choose “Not applicable” for anything that does not fit you.</p>
      <div class="ds-stack">
        ${groups.map((g) => `
          <details class="ds-area" data-area="${esc(g.dim)}"${g === firstOpen ? ' open' : ''}>
            <summary>
              <span class="ds-area-top"><span class="ds-area-title">${esc(g.meta.title)}</span><span class="ds-area-count"><span data-area-count></span>${ICON.down}</span></span>
              <span class="ds-bar ds-bar-thin ds-tone-sage" aria-hidden="true"><i data-area-bar></i></span>
            </summary>
            <div class="ds-area-body">
              ${g.meta.blurb ? `<p class="ds-area-blurb">${esc(g.meta.blurb)}</p>` : ''}
              ${g.qs.map((q) => questionMarkup(q, ++n, state[q.id])).join('')}
            </div>
          </details>`).join('')}
        <form class="ds-card ds-stack" data-snap novalidate>
          <div><h2>Save a snapshot</h2><p class="ds-section-note">Keeps a copy of your answers as they are today, so you can see how things change over time.</p></div>
          <div>
            <label class="ds-label" for="ds-snap-label">Name for this snapshot</label>
            <input class="ds-input" id="ds-snap-label" type="text" maxlength="60" autocomplete="off" placeholder="For example: Before the move">
          </div>
          <p class="ds-msg ds-msg-error" role="alert" data-snap-error></p>
          <p class="ds-msg ds-msg-ok" role="status" aria-live="polite" data-snap-ok></p>
          <button class="ds-btn ds-btn-quiet ds-btn-block" type="submit">Save a snapshot</button>
        </form>
      </div>
    </div>`;

  const root = el.querySelector('.ds-editor');
  const saveNode = root.querySelector('[data-save]');

  function paintProgress() {
    const done = doneIn(def.questions);
    root.querySelector('[data-total]').textContent = `${done} of ${total} answered`;
    const bar = root.querySelector('[data-total-bar]');
    bar.setAttribute('aria-valuenow', String(done));
    bar.firstElementChild.style.width = `${total ? (done / total) * 100 : 0}%`;
    const pct = total ? Math.round((done / total) * 100) : 0;
    root.querySelector('[data-total-ring]').style.setProperty('--p', String(pct));
    root.querySelector('[data-total-pct]').textContent = `${pct}%`;
    groups.forEach((g) => {
      const node = root.querySelector(`[data-area="${CSS.escape(g.dim)}"]`);
      const d = doneIn(g.qs);
      node.querySelector('[data-area-count]').textContent = `${d} of ${g.qs.length}`;
      node.querySelector('[data-area-bar]').style.width = `${g.qs.length ? (d / g.qs.length) * 100 : 0}%`;
      node.classList.toggle('is-complete', d === g.qs.length);
      const chip = root.querySelector(`[data-jump="${CSS.escape(g.dim)}"]`);
      chip.classList.toggle('ds-chip-sage', d === g.qs.length);
      chip.classList.toggle('ds-chip-outline', d !== g.qs.length);
    });
  }

  let saveSeq = 0;
  function save() {
    paintProgress();
    const seq = ++saveSeq;
    saveNode.className = '';
    saveNode.textContent = 'Saving';
    call(onSave, key, { ...state }).then(
      () => { if (seq === saveSeq) saveNode.textContent = 'Saved'; },
      (err) => { if (seq === saveSeq) { saveNode.className = 'ds-msg-error'; saveNode.textContent = errorText(err); } },
    );
  }

  root.addEventListener('change', (e) => {
    const holder = e.target.closest('[data-q]');
    if (!holder) return;
    const q = byId.get(holder.dataset.q);
    if (!q) return;
    if (holder.dataset.type === 'text') {
      const ta = holder.querySelector('textarea');
      const box = holder.querySelector('[data-na]');
      if (e.target === box) {
        ta.disabled = box.checked;
        if (box.checked) { ta.value = ''; state[q.id] = 'na'; } else delete state[q.id];
      } else if (ta.value.trim()) state[q.id] = ta.value; else delete state[q.id];
      clearTimeout(textTimer);
      save();
      return;
    }
    const raw = e.target.value;
    state[q.id] = raw !== 'na' && (q.type === 'likert' || q.type === 'scale') ? Number(raw) : raw;
    save();
  });
  // Text answers also save shortly after typing stops, not only on leaving the field.
  let textTimer = 0;
  root.addEventListener('input', (e) => {
    if (!(e.target instanceof HTMLTextAreaElement)) return;
    const holder = e.target.closest('[data-q]');
    if (!holder) return;
    const id = holder.dataset.q;
    clearTimeout(textTimer);
    textTimer = setTimeout(() => {
      if (e.target.value.trim()) state[id] = e.target.value; else delete state[id];
      save();
    }, 500);
  });

  root.querySelector('[data-back]').addEventListener('click', () => call(onBack).catch((x) => toast(errorText(x))));
  root.querySelector('.ds-area-chips').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-jump]');
    if (!chip) return;
    const node = root.querySelector(`[data-area="${CSS.escape(chip.dataset.jump)}"]`);
    if (!node) return;
    node.open = true;
    node.scrollIntoView({ block: 'start', behavior: 'smooth' });
  });
  const snap = root.querySelector('[data-snap]');
  snap.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = snap.querySelector('input');
    const ok = snap.querySelector('[data-snap-ok]');
    ok.textContent = '';
    const res = await run(snap.querySelector('[type="submit"]'), snap.querySelector('[data-snap-error]'), () => call(onSnapshot, input.value.trim()));
    if (res.ok) { ok.textContent = 'Snapshot saved.'; input.value = ''; }
  });

  paintProgress();
}

/* =====================================================================
   Pair detail
   ===================================================================== */
function trendPoints(trend) {
  return list(trend?.points ?? trend).map((p) => (typeof p === 'number' ? { score: p } : { score: Number(p?.score ?? p?.value), at: p?.at ?? p?.date ?? p?.createdAt, label: p?.label }))
    .filter((p) => Number.isFinite(p.score));
}

function trendSvg(points) {
  const W = 320, H = 120, L = 14, R = 30, T = 22, B = 24;
  const scores = points.map((p) => p.score);
  let lo = Math.min(...scores), hi = Math.max(...scores);
  if (hi - lo < 10) { const mid = (hi + lo) / 2; lo = mid - 5; hi = mid + 5; }
  const x = (i) => L + (i * (W - L - R)) / (points.length - 1);
  const y = (s) => T + (1 - (s - lo) / (hi - lo)) * (H - T - B);
  const pts = points.map((p, i) => `${x(i).toFixed(1)},${y(p.score).toFixed(1)}`);
  const last = points.length - 1;
  const first = points[0], end = points[last];
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`Score over time, from ${Math.round(first.score)} to ${Math.round(end.score)} across ${points.length} points`)}">
    <line class="ds-trend-grid" x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}"/>
    <polygon class="ds-trend-area" points="${L},${H - B} ${pts.join(' ')} ${x(last).toFixed(1)},${H - B}"/>
    <polyline class="ds-trend-line" points="${pts.join(' ')}"/>
    ${points.map((p, i) => `<circle class="ds-trend-dot${i === last ? ' is-last' : ''}" cx="${x(i).toFixed(1)}" cy="${y(p.score).toFixed(1)}" r="${i === last ? 5 : 3.5}"/>`).join('')}
    <text class="ds-trend-text" x="${L}" y="${(y(first.score) - 10).toFixed(1)}">${Math.round(first.score)}</text>
    <text class="ds-trend-text is-strong" x="${(x(last) + 9).toFixed(1)}" y="${(y(end.score) + 4).toFixed(1)}">${Math.round(end.score)}</text>
    ${fmtDate(first.at) ? `<text class="ds-trend-text" x="${L}" y="${H - 6}">${esc(fmtDate(first.at))}</text>` : ''}
    ${fmtDate(end.at) ? `<text class="ds-trend-text" x="${W - R}" y="${H - 6}" text-anchor="end">${esc(fmtDate(end.at))}</text>` : ''}
  </svg>`;
}

function trendSentence(trend, points) {
  const given = clean(trend?.sentence ?? trend?.text ?? trend?.summary);
  if (given) return given;
  const delta = hasScore(trend?.delta) ? trend.delta : points[points.length - 1].score - points[0].score;
  const d = Math.round(delta);
  if (d === 0) return 'Your score has stayed the same since your first snapshot.';
  return `Your score is ${d > 0 ? 'up' : 'down'} ${Math.abs(d)} ${Math.abs(d) === 1 ? 'point' : 'points'} since your first snapshot.`;
}

const areaItem = (a) => {
  if (a && typeof a === 'object') {
    const title = clean(a.title ?? a.name ?? a.area);
    const score = Number(a.score);
    return title ? `<li><span>${esc(title)}</span>${Number.isFinite(score) ? `<b>${Math.round(score)}</b>` : ''}</li>` : '';
  }
  return clean(a) ? `<li><span>${esc(a)}</span></li>` : '';
};

function shareCardText(card) {
  if (!card) return '';
  if (typeof card === 'string') return card;
  if (clean(card.text)) return clean(card.text);
  return [clean(card.title), ...list(card.lines).map(clean)].filter(Boolean).join('\n');
}

export function renderPairDetail(el, opts = {}) {
  closeAllSheets();
  setStickyTop();
  const { title, kindLabel, nickname, onBack, onOpenResults, onShareCard, trend, talkFirst, strongestWeakest, shareCard, score, band, bandBlurb } = opts;
  const name = clean(nickname) || clean(title) || 'This connection';
  const hasName = !!(clean(nickname) || clean(title));
  const scored = hasScore(score);
  const points = trendPoints(trend);
  const strongest = list(strongestWeakest?.strongest).map(areaItem).filter(Boolean);
  const weakest = list(strongestWeakest?.weakest).map(areaItem).filter(Boolean);
  const talk = list(talkFirst).map((t) => (t && typeof t === 'object'
    ? { title: clean(t.title ?? t.topic ?? t.area), text: clean(t.why ?? t.text ?? t.prompt ?? t.question) }
    : { title: clean(t), text: '' })).filter((t) => t.title || t.text);

  el.innerHTML = `
    <div class="ds ds-pair ds-stack-lg">
      <header class="ds-stack">
        <div class="ds-row-between">
          <button class="ds-btn ds-btn-quiet ds-btn-sm ds-back" type="button" data-back>${ICON.back} Back</button>
          <button class="ds-btn ds-btn-quiet ds-btn-icon" type="button" data-share aria-label="Share a summary card">${ICON.share}</button>
        </div>
        <div>
          <div class="ds-pair-kind">
            ${clean(kindLabel) ? `<span class="ds-chip ds-chip-accent">${esc(kindLabel)}</span>` : ''}
            <span class="ds-chip ds-chip-sage">Both sharing</span>
          </div>
          <h1 style="margin-top:8px">${hasName ? `You and ${esc(name)}` : esc(name)}</h1>
          ${clean(nickname) && clean(title) && clean(nickname) !== clean(title) ? `<p class="ds-soft">${esc(title)}</p>` : ''}
        </div>
      </header>

      ${scored ? `
      <section class="ds-card ds-hero ds-score-hero" aria-label="Score">
        <div class="ds-score-hero-top">
          ${ring(score, 'accent', `Score ${clampScore(score)} out of 100`)}
          <div class="ds-grow ds-stack" style="gap:6px">
            <p class="ds-eyebrow">Out of 100</p>
            ${clean(band) ? `<h2>${esc(band)}</h2>` : ''}
            ${clean(bandBlurb) ? `<p class="ds-soft ds-small">${esc(bandBlurb)}</p>` : ''}
          </div>
        </div>
        <button class="ds-btn ds-btn-light ds-btn-block" type="button" data-results>See full results</button>
      </section>` : '<button class="ds-btn ds-btn-primary ds-btn-block" type="button" data-results>See full results</button>'}

      <section class="ds-card ds-trend" aria-labelledby="ds-h-trend">
        <h2 id="ds-h-trend">Trend</h2>
        ${points.length >= 2
          ? `<p style="margin-top:6px">${esc(trendSentence(trend, points))}</p>${trendSvg(points)}`
          : '<div class="ds-empty" style="margin-top:var(--ds-3)"><strong>No trend yet</strong><p>A trend needs two snapshots. Save a snapshot from the Me tab now and another one later, and the line will appear here.</p></div>'}
      </section>

      <section class="ds-card" aria-labelledby="ds-h-areas">
        <h2 id="ds-h-areas">Strongest and weakest areas</h2>
        ${strongest.length || weakest.length ? `
        <div class="ds-cols" style="margin-top:var(--ds-3)">
          <div class="ds-col ds-tone-sage"><h3>Strongest</h3><ul>${strongest.join('') || '<li><span class="ds-soft">None yet</span></li>'}</ul></div>
          <div class="ds-col ds-tone-plum"><h3>Weakest</h3><ul>${weakest.join('') || '<li><span class="ds-soft">None yet</span></li>'}</ul></div>
        </div>` : '<p class="ds-soft" style="margin-top:6px">These appear once you have both answered and both turned on sharing.</p>'}
      </section>

      <section class="ds-card" aria-labelledby="ds-h-talk">
        <h2 id="ds-h-talk">Talk about these first</h2>
        ${talk.length
          ? `<ol class="ds-talk" style="margin-top:var(--ds-3)">${talk.map((t) => `<li><div>${t.title ? `<b>${esc(t.title)}</b>` : ''}${t.text ? `<span>${esc(t.text)}</span>` : ''}</div></li>`).join('')}</ol>`
          : '<p class="ds-soft" style="margin-top:6px">Nothing stands out to talk about yet.</p>'}
      </section>

      <button class="ds-btn ds-btn-quiet ds-btn-block" type="button" data-share>${ICON.share} Share a summary card</button>
      <p class="ds-msg ds-msg-error" role="alert" data-share-error></p>
      <p class="ds-soft ds-small" style="text-align:center">A conversation tool, not a diagnosis or a prediction.</p>
    </div>`;

  const root = el.querySelector('.ds-pair');
  root.querySelector('[data-back]').addEventListener('click', () => call(onBack).catch((x) => toast(errorText(x))));
  root.querySelector('[data-results]').addEventListener('click', () => call(onOpenResults).catch((x) => toast(errorText(x))));
  root.querySelectorAll('[data-share]').forEach((btn) => btn.addEventListener('click', async (e) => {
    // onShareCard may return fresh card text; otherwise the shareCard option is shown.
    const res = await run(e.currentTarget, root.querySelector('[data-share-error]'), () => call(onShareCard));
    if (!res.ok) return;
    const text = shareCardText(res.value) || shareCardText(shareCard);
    const sheet = openSheet({
      title: 'Summary card',
      body: text
        ? `<p class="ds-soft ds-small">This is the text that will be shared. It has no answers in it, only the summary.</p>
           <p class="ds-sharecard" tabindex="0">${esc(text)}</p>
           <button class="ds-btn ds-btn-primary ds-btn-block" type="button" data-copy>${ICON.copy} Copy</button>`
        : '<div class="ds-empty"><strong>No summary yet</strong><p>A summary card appears once you have both answered and both turned on sharing.</p></div>',
    });
    const copy = sheet.body.querySelector('[data-copy]');
    copy?.addEventListener('click', () => copyText(text, 'Summary copied'));
    copy?.focus();
  }));
}

/* =====================================================================
   Psychology (depth page)
   ===================================================================== */
const facet = (title, value, tone) => {
  const items = list(value).map(clean).filter(Boolean);
  if (!items.length) return '';
  return `<div class="ds-facet ds-tone-${tone}"><h3>${title}</h3>${items.length === 1 ? `<p>${esc(items[0])}</p>` : `<ul>${items.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`}</div>`;
};

export function renderPsychology(el, opts = {}) {
  closeAllSheets();
  setStickyTop();
  const { attachmentGuide: g, onBack } = opts;
  const exercises = list(opts.exercises).filter((x) => x && typeof x === 'object');
  const patterns = list(opts.patterns).map((p) => (p && typeof p === 'object' ? { title: clean(p.title), text: clean(p.text ?? p.plain ?? p.body) } : { title: '', text: clean(p) })).filter((p) => p.title || p.text);
  const glossary = (Array.isArray(opts.glossary) ? opts.glossary
    : opts.glossary && typeof opts.glossary === 'object' ? Object.entries(opts.glossary).map(([term, plain]) => ({ term, plain })) : [])
    .map((x) => ({ term: clean(x?.term ?? x?.title), plain: clean(x?.plain ?? x?.meaning ?? x?.text ?? x?.definition) })).filter((x) => x.term);
  const prompt = clean(typeof opts.reflection === 'string' ? opts.reflection : (opts.reflection?.prompt ?? opts.reflection?.text ?? opts.reflection?.question));
  const time = (x) => { const t = x.time ?? x.timeNeeded ?? x.minutes; return typeof t === 'number' ? `${t} minutes` : clean(t); };

  el.innerHTML = `
    <div class="ds ds-psych ds-stack-lg">
      <header class="ds-stack">
        <div><button class="ds-btn ds-btn-plain ds-btn-sm ds-back" type="button" data-back>${ICON.back} Back</button></div>
        <div><h1>Going deeper</h1><p class="ds-header-sub">What your answers suggest about how you connect, and small things to try.</p></div>
        <p class="ds-notice">${ICON.info}<span>This is not a diagnosis. It is a way to start a conversation, based only on the answers you gave. If something here worries you, a counsellor can help.</span></p>
      </header>

      <section class="ds-card" aria-labelledby="ds-h-attach">
        <h2 id="ds-h-attach">Your attachment style</h2>
        <p class="ds-section-note">How you tend to feel and act when you are close to someone.</p>
        ${g && typeof g === 'object' ? `
          <h3 style="font-family:var(--ds-display);font-size:var(--ds-t-lg);margin-top:var(--ds-4)">${esc(g.title)}</h3>
          ${clean(g.plain ?? g.text) ? `<p style="margin-top:6px">${esc(g.plain ?? g.text)}</p>` : ''}
          <div class="ds-facets">
            ${facet('Feels like', g.feelsLike ?? g.feels_like, 'plum')}
            ${facet('Try this', g.tryThis ?? g.try_this, 'sage')}
            ${facet('Watch for', g.watchFor ?? g.watch_for, 'warn')}
          </div>` : '<div class="ds-empty" style="margin-top:var(--ds-3)"><strong>Not enough answers yet</strong><p>Finish the closeness questions in your couple answers and this will fill in.</p></div>'}
      </section>

      <section class="ds-stack" aria-labelledby="ds-h-ex">
        <h2 id="ds-h-ex">Exercises for your top patterns</h2>
        ${exercises.length ? exercises.map((x) => `
          <article class="ds-card">
            <div class="ds-card-head"><h3 style="font-size:17px">${esc(x.title)}</h3>${time(x) ? `<span class="ds-chip">${esc(time(x))}</span>` : ''}</div>
            ${clean(x.why) ? `<p class="ds-why"><b>Why:</b> ${esc(x.why)}</p>` : ''}
            ${list(x.steps).length ? `<ol class="ds-ol">${list(x.steps).map((s) => `<li>${esc(s)}</li>`).join('')}</ol>` : ''}
          </article>`).join('') : '<div class="ds-empty"><strong>No exercises yet</strong><p>These appear once you have answered enough for a pattern to show.</p></div>'}
      </section>

      ${patterns.length ? `
      <section class="ds-stack" aria-labelledby="ds-h-pat">
        <h2 id="ds-h-pat">Your patterns across connections</h2>
        ${patterns.map((p) => `<article class="ds-card">${p.title ? `<h3 style="font-size:17px;margin-bottom:4px">${esc(p.title)}</h3>` : ''}<p>${esc(p.text)}</p></article>`).join('')}
      </section>` : ''}

      ${prompt ? `
      <section class="ds-card ds-reflect" aria-labelledby="ds-h-reflect">
        <h2 id="ds-h-reflect">A question to sit with</h2>
        <blockquote>${esc(prompt)}</blockquote>
        <label class="ds-label" for="ds-reflect-note">Your note</label>
        <p class="ds-help" id="ds-reflect-help">Only for you, right now. This note is not stored anywhere and is gone when you leave this page.</p>
        <textarea class="ds-textarea" id="ds-reflect-note" rows="3" aria-describedby="ds-reflect-help"></textarea>
        <div class="ds-row" style="margin-top:var(--ds-3)">
          <button class="ds-btn ds-btn-quiet" type="button" data-note>Save note</button>
          <span class="ds-msg ds-msg-ok" role="status" aria-live="polite" data-note-status style="margin:0"></span>
        </div>
      </section>` : ''}

      ${glossary.length ? `
      <details class="ds-card ds-gloss">
        <summary><h2 style="font-size:var(--ds-t-lg)">Words we use</h2>${ICON.down}</summary>
        <dl>${glossary.map((x) => `<div><dt>${esc(x.term)}</dt><dd>${esc(x.plain)}</dd></div>`).join('')}</dl>
      </details>` : ''}
    </div>`;

  const root = el.querySelector('.ds-psych');
  root.querySelector('[data-back]').addEventListener('click', () => call(onBack).catch((x) => toast(errorText(x))));
  // The note is deliberately kept only in the page: nothing is written to storage or sent anywhere.
  root.querySelector('[data-note]')?.addEventListener('click', () => {
    const ta = root.querySelector('#ds-reflect-note');
    root.querySelector('[data-note-status]').textContent = ta.value.trim()
      ? 'Kept on this page until you leave. Nothing was stored.'
      : 'Write a few words first.';
  });
}
