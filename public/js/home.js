// Signed-in home (Rankings, People, Me) and the answers editor.
// Each render function fills `el`, wires its own listeners, and reports back through callbacks.

import { QUESTIONS, DIMENSIONS } from './questions.js';
import { FRIEND_QUESTIONS, FRIEND_DIMENSIONS } from './friend-questions.js';

const GENDER_LABEL = { male: 'Male', female: 'Female' };

const LIKERT_LABELS = [
  { value: 1, label: 'Strongly disagree' },
  { value: 2, label: 'Disagree' },
  { value: 3, label: 'Neutral' },
  { value: 4, label: 'Agree' },
  { value: 5, label: 'Strongly agree' },
];

const BANKS = {
  couple: { title: 'Couple answers', short: 'couple', questions: QUESTIONS, dimensions: DIMENSIONS },
  friendship: { title: 'Friendship answers', short: 'friendship', questions: FRIEND_QUESTIONS, dimensions: FRIEND_DIMENSIONS },
};

const STATUS_CHIP = {
  done: { text: 'Done', tone: 'sage' },
  partial: { text: 'Partly answered', tone: 'warn' },
  empty: { text: 'Not started', tone: 'neutral' },
};

const TABS = [
  { key: 'rankings', label: 'Rankings' },
  { key: 'people', label: 'People' },
  { key: 'me', label: 'Me' },
];

// The open tab survives re-renders (for example after a share toggle reloads the data).
let activeTab = null;

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function initial(name) {
  const s = String(name ?? '').trim();
  return s ? Array.from(s)[0].toUpperCase() : '?';
}

function errorText(err) {
  const msg = err && typeof err.message === 'string' ? err.message.trim() : '';
  return msg || 'Something went wrong. Please try again.';
}

const svg = (body, extra = '') =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"${extra}>${body}</svg>`;

const ICON = {
  rankings: svg('<rect x="3.5" y="12" width="5" height="8.5" rx="1.5"/><rect x="9.5" y="5" width="5" height="15.5" rx="1.5"/><rect x="15.5" y="9" width="5" height="11.5" rx="1.5"/>'),
  people: svg('<circle cx="9" cy="8.5" r="3.3"/><path d="M2.8 19.5c.7-3.3 3.1-5.1 6.2-5.1s5.5 1.8 6.2 5.1"/><circle cx="17.2" cy="9.3" r="2.6"/><path d="M17.4 14.4c2.2.2 3.6 1.6 4.1 4.1"/>'),
  me: svg('<circle cx="12" cy="8.5" r="3.6"/><path d="M4.8 20c.9-3.6 3.7-5.6 7.2-5.6s6.3 2 7.2 5.6"/>'),
  plus: svg('<path d="M12 5v14"/><path d="M5 12h14"/>', ' stroke-width="2.2"'),
  chevron: svg('<path d="m9 6 6 6-6 6"/>', ' stroke-width="2.2"'),
  down: svg('<path d="m6 9 6 6 6-6"/>', ' stroke-width="2.2"'),
  back: svg('<path d="M19 12H5"/><path d="m11 6-6 6 6 6"/>', ' stroke-width="2.2"'),
  arrow: svg('<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>', ' stroke-width="2.2"'),
  check: svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>', ' stroke-width="2.6"'),
  alert: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7.5V13"/><path d="M12 16.4v.1"/>'),
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5"/><path d="M12 7.6v.1"/>'),
  copy: svg('<rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2.5"/><path d="M15.5 8.5V6.5A2.5 2.5 0 0 0 13 4H6.5A2.5 2.5 0 0 0 4 6.5V13a2.5 2.5 0 0 0 2.5 2.5h2"/>'),
  share: svg('<path d="M12 15V3.5"/><path d="m7.5 8 4.5-4.5L16.500 8"/><path d="M5 12.5v5A2.5 2.5 0 0 0 7.5 20h9a2.5 2.5 0 0 0 2.500-2.500v-5"/>'),
  link: svg('<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.500 4.500 0 0 0-6.400-6.400l-1 1"/><path d="M14 10a4.500 4.500 0 0 0-6.400 0l-3 3a4.500 4.500 0 0 0 6.400 6.400l1-1"/>'),
  heart: svg('<path d="M12 20c-5.200-3.600-8-6.600-8-10a4.300 4.300 0 0 1 8-2.300A4.300 4.300 0 0 1 20 10c0 3.400-2.800 6.400-8 10z"/>'),
  friends: svg('<circle cx="8.500" cy="9" r="3.200"/><circle cx="15.500" cy="9" r="3.200"/><path d="M3 19.500c.600-3 2.700-4.700 5.500-4.700 1.400 0 2.600.400 3.500 1.200.900-.800 2.100-1.200 3.500-1.200 2.800 0 4.900 1.700 5.500 4.700"/>'),
  lock: svg('<rect x="5" y="10.500" width="14" height="9.500" rx="2.500"/><path d="M8.500 10.500V8a3.500 3.500 0 0 1 7 0v2.500"/>'),
  signout: svg('<path d="M14 4.500h3A2.500 2.500 0 0 1 19.500 7v10a2.500 2.500 0 0 1-2.500 2.500h-3"/><path d="M4 12h10.500"/><path d="m10.500 8 4 4-4 4"/>'),
};

function showError(node, err) {
  if (!node) return;
  node.innerHTML = err ? `${ICON.alert}<span>${esc(errorText(err))}</span>` : '';
}

// Runs an async callback while a button shows a busy label. Resolves to { ok, value }.
async function runBusy(btn, busyLabel, fn, errNode) {
  const idle = btn.innerHTML;
  btn.disabled = true;
  btn.setAttribute('aria-busy', 'true');
  btn.textContent = busyLabel;
  showError(errNode, null);
  let ok = true;
  let value;
  try {
    value = await fn();
  } catch (err) {
    ok = false;
    showError(errNode, err);
  }
  if (btn.isConnected) {
    btn.removeAttribute('aria-busy');
    btn.innerHTML = idle;
    btn.disabled = false;
  }
  return { ok, value };
}

// Sticky bars sit under the app's own top bar when it is sticky.
function setStickyTop(root) {
  const bar = document.querySelector('.topbar');
  let h = 0;
  if (bar && root && !bar.contains(root)) {
    const pos = getComputedStyle(bar).position;
    if (pos === 'sticky' || pos === 'fixed') h = bar.offsetHeight;
  }
  root.style.setProperty('--hm-top', `${h}px`);
}

const clampScore = (n) => Math.max(0, Math.min(100, Math.round(Number(n))));
const hasScore = (n) => n !== null && n !== undefined && n !== '' && Number.isFinite(Number(n));
const cleanName = (v) => (v ? String(v).trim() : '');

/* ---------- Rankings ---------- */
const EMPTY_ART = {
  couple: '<div class="hm-art hm-art-couple" aria-hidden="true"><i class="hm-art-glow"></i><i class="hm-art-a"></i><i class="hm-art-b"></i><i class="hm-art-dot"></i><i class="hm-art-line l1"></i><i class="hm-art-line l2"></i><i class="hm-art-line l3"></i></div>',
  friendship: '<div class="hm-art hm-art-friend" aria-hidden="true"><i class="hm-art-glow"></i><i class="hm-art-a"></i><i class="hm-art-b"></i><i class="hm-art-c"></i><i class="hm-art-line l1"></i><i class="hm-art-line l2"></i><i class="hm-art-line l3"></i></div>',
  people: '<div class="hm-art hm-art-people" aria-hidden="true"><i class="hm-art-glow"></i><i class="hm-art-a"></i><i class="hm-art-b"></i><i class="hm-art-plus"></i></div>',
};

function rankRow(r, i) {
  const name = cleanName(r.partnerName) || 'Someone';
  const rank = Number.isFinite(Number(r.rank)) ? Number(r.rank) : i + 1;
  const scored = hasScore(r.score);
  const score = scored ? clampScore(r.score) : 0;
  const band = r.band && r.band.label ? String(r.band.label) : '';
  return `
    <li class="hm-enter" style="--i:${Math.min(i + 1, 8)}">
      <button class="hm-rank${rank === 1 ? ' is-top' : ''}" type="button" data-open="${esc(r.id)}">
        <span class="hm-rank-badge"><span class="hm-vh">Rank </span>${esc(rank)}</span>
        <span class="hm-rank-body">
          <span class="hm-rank-top">
            <span class="hm-rank-name">${esc(name)}</span>
            <span class="hm-rank-score"${rank === 1 && scored ? ` style="--p:${score}"` : ''}>
              <span class="hm-vh">Score </span><b>${scored ? score : '–'}</b><span class="hm-vh"> out of 100</span>
            </span>
          </span>
          <span class="hm-meter" aria-hidden="true"><span style="width:${score}%"></span></span>
          ${band ? `<span class="hm-rank-band">${esc(band)}</span>` : ''}
        </span>
        <span class="hm-chev">${ICON.chevron}</span>
        <span class="hm-vh">. Open details</span>
      </button>
    </li>`;
}

function rankSection(kind, list, status) {
  const couple = kind === 'couple';
  const title = couple ? 'Couple rank' : 'Friendship rank';
  const who = couple ? 'Male and female pairs only' : 'Everyone you connect with';
  const emptyText = couple
    ? 'Couples appear here when you are a male and female pair who have both shared.'
    : 'Friends appear here once you both share your answers.';
  const nudge = status && status !== 'done'
    ? `<div class="hm-nudge">
        <span class="hm-nudge-ic">${ICON.info}</span>
        <p>${status === 'partial'
          ? `Your ${couple ? 'couple' : 'friendship'} answers are partly done. Finish them in Me for a fuller score.`
          : `You have not answered the ${couple ? 'couple' : 'friendship'} questions yet. Answer them in Me to be ranked here.`}</p>
        <button class="hm-btn hm-btn-quiet hm-btn-sm" type="button" data-goto="me">Go to Me<span class="hm-vh"> to answer</span></button>
      </div>`
    : '';
  return `
    <section class="hm-block hm-tone-${couple ? 'accent' : 'sage'}" aria-labelledby="hm-h-${kind}">
      <header class="hm-block-head hm-enter">
        <span class="hm-block-ic" aria-hidden="true">${couple ? ICON.heart : ICON.friends}</span>
        <div class="hm-block-title">
          <h2 id="hm-h-${kind}">${title}</h2>
          <p>${who}</p>
        </div>
        ${list.length ? `<span class="hm-count">${list.length}</span>` : ''}
      </header>
      <p class="hm-explain hm-enter">Scores show tendencies to talk about, not a verdict.</p>
      ${nudge}
      ${list.length
        ? `<ol class="hm-ranks">${list.map(rankRow).join('')}</ol>`
        : `<div class="hm-empty hm-enter" style="--i:1">
            ${EMPTY_ART[kind]}
            <p>${emptyText}</p>
            <button class="hm-btn hm-btn-quiet hm-btn-sm" type="button" data-goto="people">Go to People ${ICON.arrow}</button>
          </div>`}
    </section>`;
}

/* ---------- People ---------- */
function connState(c) {
  if (!c.accepted) return { chip: 'Invite sent', tone: 'warn', hint: c.code ? `They have not accepted yet. Invite code ${c.code}.` : 'They have not accepted yet.' };
  if (c.myShare && c.partnerShare) return { chip: 'Both sharing', tone: 'sage', hint: 'You can open your comparison.' };
  if (c.myShare) return { chip: 'Waiting for them', tone: 'neutral', hint: 'You are sharing. Waiting for them to share too.' };
  if (c.partnerShare) return { chip: 'Your turn', tone: 'accent', hint: 'They are sharing. Turn on your sharing to compare.' };
  return { chip: 'Not shared', tone: 'neutral', hint: 'Nothing is shared yet. Turn on sharing when you are ready.' };
}

function connCard(c, i) {
  const partner = cleanName(c.partnerName);
  const pending = !c.accepted || !partner;
  const name = c.accepted && partner ? partner : (c.accepted ? 'Someone' : 'Waiting for them to accept');
  const gender = GENDER_LABEL[c.partnerGender] ?? '';
  const st = connState(c);
  const both = !!(c.accepted && c.myShare && c.partnerShare);
  const who = partner || 'this person';
  const theirText = !c.accepted ? 'Not joined' : (c.partnerShare ? 'On' : 'Off');
  return `
    <li class="hm-card hm-conn hm-enter${pending ? ' is-pending' : ''}${both ? ' is-both' : ''}" data-conn="${esc(c.id)}" style="--i:${Math.min(i + 1, 8)}">
      <div class="hm-conn-head">
        <span class="hm-avatar${pending ? ' is-ghost' : ''}" aria-hidden="true">${pending ? '?' : esc(initial(partner))}</span>
        <div class="hm-conn-text">
          <h3>${esc(name)}</h3>
          ${gender ? `<p class="hm-conn-meta">${esc(gender)}</p>` : ''}
        </div>
        <span class="hm-chip hm-chip-${st.tone}">${esc(st.chip)}</span>
      </div>
      <div class="hm-share" role="group" aria-label="Sharing with ${esc(who)}">
        <button class="hm-share-part hm-share-me" type="button" role="switch" aria-checked="${c.myShare ? 'true' : 'false'}" data-share="${esc(c.id)}">
          <span class="hm-share-text"><span class="hm-share-label">I share</span><span class="hm-share-state" aria-hidden="true">${c.myShare ? 'On' : 'Off'}</span></span>
          <span class="hm-switch" aria-hidden="true"><span></span></span>
        </button>
        <div class="hm-share-part hm-share-them${c.partnerShare ? ' is-on' : ''}">
          <span class="hm-share-text"><span class="hm-share-label">They share</span><span class="hm-share-state">${theirText}</span></span>
          <span class="hm-dot" aria-hidden="true">${c.partnerShare ? ICON.check : ''}</span>
        </div>
      </div>
      <p class="hm-msg hm-msg-error" data-conn-error role="alert"></p>
      <div class="hm-conn-foot">
        <p class="hm-conn-hint">${esc(st.hint)}</p>
        ${both ? `<button class="hm-btn hm-btn-primary hm-btn-sm" type="button" data-open="${esc(c.id)}">Open<span class="hm-vh"> comparison with ${esc(who)}</span> ${ICON.arrow}</button>` : ''}
      </div>
    </li>`;
}

const CODE_LEAD = 'Share this code with a partner or friend. They enter it here, on their People tab, to connect with you.';
function spellCode(code) { return Array.from(String(code)).join(' '); }

function peoplePanel(conns, code) {
  return `
    <section class="hm-card hm-code hm-enter${code ? '' : ' is-empty'}" aria-labelledby="hm-h-people">
      <p class="hm-eyebrow" id="hm-h-people" role="heading" aria-level="2">Your code</p>
      <p class="hm-code-lead" data-code-lead>${code ? CODE_LEAD : 'Your code appears here. Use Invite someone to get it, then share it with a partner or friend.'}</p>
      <div class="hm-code-box">
        <span class="hm-code-value" data-code aria-label="${code ? esc(`Your code is ${spellCode(code)}`) : 'You do not have a code yet'}">${code ? esc(code) : '&middot;&middot;&middot;&middot;&middot;&middot;'}</span>
      </div>
      <div class="hm-code-actions">
        <button class="hm-btn hm-btn-primary" type="button" data-copy-code${code ? '' : ' hidden'}>${ICON.copy} Copy code</button>
        <button class="hm-btn hm-btn-quiet" type="button" data-share-code hidden>${ICON.share} Share</button>
        <button class="hm-btn ${code ? 'hm-btn-plain hm-code-linkbtn' : 'hm-btn-primary'}" type="button" data-invite>${code ? `${ICON.link} Send a link instead` : `${ICON.plus} Invite someone`}</button>
      </div>
      <p class="hm-msg hm-msg-ok" data-code-status role="status" aria-live="polite"></p>
      <p class="hm-msg hm-msg-error" data-invite-error role="alert"></p>
    </section>

    ${conns.length
      ? `<ul class="hm-conns" aria-label="Your people">${conns.map(connCard).join('')}</ul>`
      : `<div class="hm-empty hm-enter" style="--i:1">
          ${EMPTY_ART.people}
          <p>No one here yet. Share your code, or enter a code someone gave you.</p>
        </div>`}

    <form class="hm-card hm-accept hm-enter" style="--i:3" novalidate>
      <label class="hm-label" for="hm-accept-input">Have a code or link? Paste it</label>
      <p class="hm-help" id="hm-accept-help">Enter the code they gave you.</p>
      <div class="hm-accept-row">
        <input class="hm-input" id="hm-accept-input" name="code" type="text" autocomplete="off" autocapitalize="none"
          autocorrect="off" spellcheck="false" enterkeyhint="go" placeholder="Their code"
          aria-describedby="hm-accept-help hm-accept-error">
        <button class="hm-btn hm-btn-quiet" type="submit" disabled>Accept</button>
      </div>
      <p class="hm-msg hm-msg-error" id="hm-accept-error" role="alert"></p>
      <p class="hm-msg hm-msg-ok" data-accept-ok role="status" aria-live="polite"></p>
    </form>`;
}

/* ---------- Me ---------- */
function bankCard(bank, status, i) {
  const chip = STATUS_CHIP[status] ?? STATUS_CHIP.empty;
  const couple = bank === 'couple';
  const count = BANKS[bank].questions.length;
  return `
    <li class="hm-card hm-bank hm-tone-${couple ? 'accent' : 'sage'} hm-enter" style="--i:${i}">
      <span class="hm-block-ic" aria-hidden="true">${couple ? ICON.heart : ICON.friends}</span>
      <div class="hm-bank-text">
        <h3>${BANKS[bank].title}</h3>
        <p>${count} questions. ${couple ? 'Used for your couple rank.' : 'Used for your friendship rank.'}</p>
        <span class="hm-chip hm-chip-${chip.tone}">${chip.tone === 'sage' ? ICON.check : ''}${chip.text}</span>
      </div>
      <button class="hm-btn hm-btn-quiet hm-btn-sm" type="button" data-edit="${bank}">Edit answers<span class="hm-vh"> for ${BANKS[bank].short}</span></button>
    </li>`;
}

function mePanel(name, genderText, status) {
  return `
    <section class="hm-card hm-profile hm-enter" aria-labelledby="hm-h-me">
      <span class="hm-avatar hm-avatar-lg is-me" aria-hidden="true">${esc(initial(name))}</span>
      <div class="hm-profile-text">
        <h2 id="hm-h-me">${name ? esc(name) : 'Your profile'}</h2>
        ${genderText ? `<p>${esc(genderText)}</p>` : ''}
      </div>
    </section>

    <div class="hm-sub hm-enter" style="--i:1">
      <h2>Your answers</h2>
      <p>${ICON.lock}<span>Private until you share with someone.</span></p>
    </div>
    <ul class="hm-banks">
      ${bankCard('couple', status.couple, 2)}
      ${bankCard('friendship', status.friendship, 3)}
    </ul>

    <div class="hm-out hm-enter" style="--i:4">
      <button class="hm-link" type="button" data-signout>${ICON.signout}<span>Sign out</span></button>
    </div>`;
}

/* ---------- Invite sheet ---------- */
function sheetMarkup() {
  return `
    <dialog class="hm-sheet" aria-labelledby="hm-sheet-h">
      <div class="hm-sheet-body">
        <span class="hm-sheet-grip" aria-hidden="true"></span>
        <div class="hm-sheet-ic" aria-hidden="true">${ICON.link}</div>
        <h2 id="hm-sheet-h" tabindex="-1">Your invite link</h2>
        <p class="hm-sheet-lead">Send this to the person you want to connect with. They appear in People once they accept.</p>
        <label class="hm-vh" for="hm-sheet-link">Invite link</label>
        <input class="hm-input hm-sheet-link" id="hm-sheet-link" type="text" readonly value="">
        <p class="hm-msg hm-msg-ok" data-sheet-status role="status" aria-live="polite"></p>
        <div class="hm-sheet-actions">
          <button class="hm-btn hm-btn-primary" type="button" data-copy>${ICON.copy} Copy link</button>
          <button class="hm-btn hm-btn-quiet" type="button" data-native-share hidden>${ICON.share} Share</button>
        </div>
        <button class="hm-btn hm-btn-plain" type="button" data-close>Done</button>
      </div>
    </dialog>`;
}

async function copyText(text, input) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through to the selection copy */ }
  try {
    input.focus();
    input.select();
    input.setSelectionRange(0, text.length);
    return document.execCommand('copy');
  } catch {
    return false;
  }
}

/* ---------- Home ---------- */
export function renderHome(el, opts = {}) {
  const {
    profile, rankings, connections, profileStatus, code, link,
    onInvite, onAccept, onShare, onOpenPair, onEditProfile, onSignOut,
  } = opts;

  const name = cleanName(profile?.display_name);
  const genderText = GENDER_LABEL[profile?.gender] ?? '';
  const couple = Array.isArray(rankings?.couple) ? rankings.couple : [];
  const friendship = Array.isArray(rankings?.friendship) ? rankings.friendship : [];
  const conns = (Array.isArray(connections) ? connections : []).map((c) => ({ ...c }));
  const status = { couple: profileStatus?.couple ?? 'empty', friendship: profileStatus?.friendship ?? 'empty' };
  let myCode = cleanName(code ?? profile?.code);
  let myLink = cleanName(link);
  // First visit: people with nothing ranked yet land on their code.
  if (!TABS.some((t) => t.key === activeTab)) activeTab = couple.length || friendship.length ? 'rankings' : 'people';

  const accepted = conns.filter((c) => c.accepted).length;
  const waiting = conns.length - accepted;
  const summary = conns.length
    ? [
        accepted ? `${accepted} ${accepted === 1 ? 'person' : 'people'} connected` : '',
        waiting ? `${waiting} ${waiting === 1 ? 'invite' : 'invites'} waiting` : '',
      ].filter(Boolean).join(' · ')
    : 'Share your code to see how you match.';

  el.innerHTML = `
    <div class="hm">
      <header class="hm-hero">
        <div class="hm-hero-text">
          <p class="hm-eyebrow">Your space</p>
          <h1>${name ? `Hi, ${esc(name)}` : 'Hi there'}</h1>
          <p class="hm-hero-sub">${esc(summary)}</p>
        </div>
        <div class="hm-hero-art" aria-hidden="true"><i></i><i></i><span>${esc(initial(name))}</span></div>
      </header>

      <div class="hm-tabs-wrap">
        <div class="hm-tabs" role="tablist" aria-label="Home sections">
          ${TABS.map((t) => `
            <button class="hm-tab" type="button" role="tab" id="hm-tab-${t.key}" data-tab="${t.key}"
              aria-controls="hm-panel-${t.key}" aria-selected="${t.key === activeTab}" tabindex="${t.key === activeTab ? 0 : -1}">
              <span class="hm-tab-ic">${ICON[t.key]}</span>
              <span class="hm-tab-label">${t.label}</span>
              ${t.key === 'people' && waiting ? `<span class="hm-tab-badge" aria-hidden="true"></span><span class="hm-vh">, ${waiting} waiting</span>` : ''}
            </button>`).join('')}
        </div>
      </div>

      <section class="hm-panel" role="tabpanel" id="hm-panel-rankings" aria-labelledby="hm-tab-rankings" tabindex="0"${activeTab === 'rankings' ? '' : ' hidden'}>
        ${rankSection('couple', couple, status.couple)}
        ${rankSection('friendship', friendship, status.friendship)}
      </section>
      <section class="hm-panel" role="tabpanel" id="hm-panel-people" aria-labelledby="hm-tab-people" tabindex="0"${activeTab === 'people' ? '' : ' hidden'}>
        ${peoplePanel(conns, myCode)}
      </section>
      <section class="hm-panel" role="tabpanel" id="hm-panel-me" aria-labelledby="hm-tab-me" tabindex="0"${activeTab === 'me' ? '' : ' hidden'}>
        ${mePanel(name, genderText, status)}
      </section>

      ${sheetMarkup()}
    </div>`;

  const root = el.querySelector('.hm');
  setStickyTop(root);

  /* Tabs */
  const tabs = Array.from(root.querySelectorAll('[role="tab"]'));
  const selectTab = (key, { focus = false, scroll = false } = {}) => {
    activeTab = key;
    tabs.forEach((t) => {
      const on = t.dataset.tab === key;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      root.querySelector(`#hm-panel-${t.dataset.tab}`).hidden = !on;
      if (on && focus) t.focus();
    });
    if (scroll) {
      const hero = root.querySelector('.hm-hero');
      const fixedBar = getComputedStyle(root.querySelector('.hm-tabs-wrap')).position === 'fixed';
      if (fixedBar) window.scrollTo(0, 0);
      else if (hero.getBoundingClientRect().bottom < 0) root.querySelector(`#hm-panel-${key}`).scrollIntoView({ block: 'start' });
    }
  };
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => selectTab(tab.dataset.tab, { scroll: true }));
    tab.addEventListener('keydown', (e) => {
      let next = -1;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % tabs.length;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + tabs.length) % tabs.length;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = tabs.length - 1;
      if (next < 0) return;
      e.preventDefault();
      selectTab(tabs[next].dataset.tab, { focus: true });
    });
  });

  /* Delegated actions shared by all panels */
  root.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t || !root.contains(t)) return;
    if (t.dataset.open !== undefined) onOpenPair?.(t.dataset.open);
    else if (t.dataset.edit) onEditProfile?.(t.dataset.edit);
    else if (t.dataset.goto) selectTab(t.dataset.goto, { focus: true, scroll: true });
    else if (t.dataset.signout !== undefined) onSignOut?.();
    else if (t.dataset.share !== undefined) toggleShare(t);
  });

  /* Share switch: optimistic, rolls back when the caller rejects. */
  const connsList = root.querySelector('.hm-conns');
  const repaintConn = (c, err) => {
    const old = connsList?.querySelector(`[data-conn="${CSS.escape(String(c.id))}"]`);
    if (!old) return;
    const hadFocus = old.contains(document.activeElement);
    const holder = document.createElement('ul');
    holder.innerHTML = connCard(c, 0);
    const fresh = holder.firstElementChild;
    fresh.classList.remove('hm-enter');
    old.replaceWith(fresh);
    if (err) showError(fresh.querySelector('[data-conn-error]'), err);
    if (hadFocus) fresh.querySelector('[data-share]')?.focus();
  };
  async function toggleShare(btn) {
    const c = conns.find((x) => String(x.id) === btn.dataset.share);
    if (!c || c.busy) return;
    const before = !!c.myShare;
    c.busy = true;
    c.myShare = !before;
    repaintConn(c);
    connsList?.querySelector(`[data-conn="${CSS.escape(String(c.id))}"] [data-share]`)?.setAttribute('aria-busy', 'true');
    let failure = null;
    try {
      await onShare?.(c.id, !before);
    } catch (err) {
      failure = err || new Error('');
      c.myShare = before;
    }
    c.busy = false;
    if (root.isConnected) repaintConn(c, failure);
  }

  /* Invite sheet */
  const sheet = root.querySelector('.hm-sheet');
  const linkInput = sheet.querySelector('#hm-sheet-link');
  const sheetStatus = sheet.querySelector('[data-sheet-status]');
  const nativeShare = sheet.querySelector('[data-native-share]');
  const inviteBtn = root.querySelector('[data-invite]');
  const inviteError = root.querySelector('[data-invite-error]');
  let inviteLink = '';

  const closeSheet = () => {
    if (typeof sheet.close === 'function' && sheet.open) sheet.close();
    else sheet.removeAttribute('open');
  };
  const openSheet = (link) => {
    inviteLink = link;
    linkInput.value = link;
    sheetStatus.innerHTML = '';
    nativeShare.hidden = typeof navigator.share !== 'function';
    if (typeof sheet.showModal === 'function') { if (!sheet.open) sheet.showModal(); } else sheet.setAttribute('open', '');
    sheet.querySelector('#hm-sheet-h').focus();
  };
  inviteBtn.addEventListener('click', async () => {
    if (inviteBtn.disabled) return;
    const { ok, value } = await runBusy(inviteBtn, 'Creating your link…', () => onInvite?.(), inviteError);
    if (!ok || !root.isConnected) return;
    const made = typeof value === 'string' ? value : value?.link;
    if (!made) return showError(inviteError, new Error('Could not create a link. Please try again.'));
    myLink = String(made);
    if (!myCode) setCode(cleanName(value?.code) || codeFromLink(myLink));
    openSheet(myLink);
  });

  /* The code card: the main thing to share. */
  const codeCard = root.querySelector('.hm-code');
  const codeValue = codeCard.querySelector('[data-code]');
  const codeStatus = codeCard.querySelector('[data-code-status]');
  const copyCodeBtn = codeCard.querySelector('[data-copy-code]');
  const shareCodeBtn = codeCard.querySelector('[data-share-code]');
  const canShare = typeof navigator.share === 'function';
  function codeFromLink(text) {
    try { return new URL(text, window.location.href).searchParams.get('join') || ''; } catch { return ''; }
  }
  function setCode(next) {
    if (!next) return;
    myCode = next;
    codeValue.textContent = next;
    codeValue.setAttribute('aria-label', `Your code is ${spellCode(next)}`);
    codeCard.classList.remove('is-empty');
    codeCard.querySelector('[data-code-lead]').textContent = CODE_LEAD;
    copyCodeBtn.hidden = false;
    shareCodeBtn.hidden = !canShare;
    inviteBtn.className = 'hm-btn hm-btn-plain hm-code-linkbtn';
    inviteBtn.innerHTML = `${ICON.link} Send a link instead`;
  }
  shareCodeBtn.hidden = !(canShare && myCode);
  copyCodeBtn.addEventListener('click', async () => {
    let done = false;
    try {
      if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(myCode); done = true; }
    } catch { /* fall through */ }
    if (!done) {
      const range = document.createRange();
      range.selectNodeContents(codeValue);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      try { done = document.execCommand('copy'); } catch { done = false; }
    }
    codeStatus.className = `hm-msg ${done ? 'hm-msg-ok' : 'hm-msg-error'}`;
    codeStatus.innerHTML = done
      ? `${ICON.check}<span>Code copied. Send it to them in a message.</span>`
      : `${ICON.alert}<span>Could not copy. The code is selected, so you can copy it by hand.</span>`;
  });
  shareCodeBtn.addEventListener('click', async () => {
    const data = { title: 'Compatibility', text: `${name || 'Someone'} wants to compare answers with you. Enter this code: ${myCode}` };
    if (myLink) data.url = myLink;
    try { await navigator.share(data); } catch { /* the person closed the share sheet */ }
  });
  linkInput.addEventListener('focus', () => linkInput.select());
  sheet.querySelector('[data-copy]').addEventListener('click', async () => {
    const done = await copyText(inviteLink, linkInput);
    sheetStatus.className = `hm-msg ${done ? 'hm-msg-ok' : 'hm-msg-error'}`;
    sheetStatus.innerHTML = done
      ? `${ICON.check}<span>Link copied. Paste it in a message to them.</span>`
      : `${ICON.alert}<span>Could not copy. Select the link and copy it by hand.</span>`;
  });
  nativeShare.addEventListener('click', async () => {
    try {
      await navigator.share({ title: 'Compatibility invite', text: `${name || 'Someone'} invited you to compare answers.`, url: inviteLink });
    } catch { /* the person closed the share sheet */ }
  });
  sheet.querySelector('[data-close]').addEventListener('click', closeSheet);
  sheet.addEventListener('click', (e) => { if (e.target === sheet) closeSheet(); });

  /* Accept a pasted link or code */
  const acceptForm = root.querySelector('.hm-accept');
  const acceptInput = root.querySelector('#hm-accept-input');
  const acceptBtn = acceptForm.querySelector('button[type="submit"]');
  const acceptError = root.querySelector('#hm-accept-error');
  const acceptOk = root.querySelector('[data-accept-ok]');
  let accepting = false;
  const syncAccept = () => { if (!accepting) acceptBtn.disabled = !acceptInput.value.trim(); };
  acceptInput.addEventListener('input', () => { showError(acceptError, null); acceptOk.innerHTML = ''; syncAccept(); });
  acceptForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = acceptInput.value.trim();
    if (accepting || !text) return;
    accepting = true;
    acceptOk.innerHTML = '';
    const { ok } = await runBusy(acceptBtn, 'Accepting…', () => onAccept?.(text), acceptError);
    accepting = false;
    if (!acceptBtn.isConnected) return;
    if (ok) {
      acceptInput.value = '';
      acceptOk.innerHTML = `${ICON.check}<span>Accepted. They are in your people list now.</span>`;
    }
    syncAccept();
  });
}

/* ---------- Answers editor ---------- */
const isAnswered = (q, answers) => {
  const v = answers[q.id];
  if (v === undefined || v === null) return false;
  return q.type === 'text' ? String(v).trim().length > 0 : v !== '';
};

function optionGroup(q, n, options, current, kind) {
  return `
    <div class="hm-opts hm-opts-${kind}">
      ${options.map((o) => `
        <label class="hm-opt">
          <input type="radio" name="hm-q-${n}" value="${esc(o.value)}" data-q="${n}"${String(current) === String(o.value) && current !== undefined ? ' checked' : ''}>
          <span class="hm-opt-face">${o.face !== undefined ? `<b aria-hidden="true">${esc(o.face)}</b><span class="hm-vh">${esc(o.label)}</span>` : `<span>${esc(o.label)}</span>`}</span>
        </label>`).join('')}
    </div>`;
}

function questionMarkup(q, n, answers) {
  const cur = answers[q.id];
  if (q.type === 'text') {
    return `
      <div class="hm-q hm-q-text" data-qwrap="${n}">
        <label class="hm-q-text-label" for="hm-q-${n}">${esc(q.text)}</label>
        <textarea class="hm-input hm-textarea" id="hm-q-${n}" data-q="${n}" rows="3" placeholder="Write as much or as little as you like">${esc(typeof cur === 'string' ? cur : '')}</textarea>
      </div>`;
  }
  let body = '';
  if (q.type === 'likert') {
    body = optionGroup(q, n, LIKERT_LABELS, cur, 'likert');
  } else if (q.type === 'scale') {
    const low = q.low ? String(q.low) : '';
    const high = q.high ? String(q.high) : '';
    const opts = [1, 2, 3, 4, 5].map((v) => ({
      value: v, face: v,
      label: v === 1 && low ? `1, ${low}` : v === 5 && high ? `5, ${high}` : String(v),
    }));
    body = `${optionGroup(q, n, opts, cur, 'scale')}
      <div class="hm-ends" aria-hidden="true"><span>${esc(low)}</span><span>${esc(high)}</span></div>`;
  } else if (q.type === 'dealbreaker') {
    body = optionGroup(q, n, [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }], cur, 'yesno');
  } else {
    body = optionGroup(q, n, Array.isArray(q.options) ? q.options : [], cur, 'choice');
  }
  return `
    <fieldset class="hm-q" data-qwrap="${n}">
      <legend>${esc(q.text)}</legend>
      ${body}
    </fieldset>`;
}

export function renderProfileEditor(el, { bank, answers, onSave, onBack } = {}) {
  const key = bank === 'friendship' ? 'friendship' : 'couple';
  const cfg = BANKS[key];
  const questions = cfg.questions;
  let current = { ...(answers && typeof answers === 'object' ? answers : {}) };

  // One section per dimension, in the order the dimensions first appear in the bank.
  const areas = [];
  const byDim = new Map();
  questions.forEach((q, n) => {
    if (!byDim.has(q.dimension)) {
      const dim = cfg.dimensions[q.dimension] ?? {};
      const area = { dim: q.dimension, title: dim.title ?? q.dimension, blurb: dim.blurb ?? '', items: [] };
      byDim.set(q.dimension, area);
      areas.push(area);
    }
    byDim.get(q.dimension).items.push(n);
  });

  const countArea = (a) => a.items.filter((n) => isAnswered(questions[n], current)).length;
  const countAll = () => questions.filter((q) => isAnswered(q, current)).length;
  const pct = (done, total) => (total ? Math.round((done / total) * 100) : 0);
  const firstOpen = areas.findIndex((a) => countArea(a) < a.items.length);
  const total = questions.length;
  const done0 = countAll();

  el.innerHTML = `
    <div class="hm hm-editor hm-tone-${key === 'couple' ? 'accent' : 'sage'}">
      <div class="hm-edbar">
        <div class="hm-edbar-row">
          <button class="hm-btn hm-btn-quiet hm-btn-sm hm-back" type="button" data-back>${ICON.back}<span>Back</span></button>
          <div class="hm-edbar-title">
            <h1>${cfg.title}</h1>
            <p><span data-total-count>${done0} of ${total}</span> answered</p>
          </div>
          <div class="hm-ring" data-total-ring style="--p:${pct(done0, total)}" aria-hidden="true"><b data-total-pct>${pct(done0, total)}%</b></div>
        </div>
        <div class="hm-meter hm-meter-thin" role="progressbar" aria-label="Total progress" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${done0}" data-total-bar><span style="width:${pct(done0, total)}%"></span></div>
      </div>

      <p class="hm-note hm-enter">${ICON.lock}<span>Your answers are yours. Change them any time. Everyone you connect with sees the newest version when both of you share.</span></p>
      <p class="hm-vh" role="status" aria-live="polite" data-ed-live></p>

      <div class="hm-areas">
        ${areas.map((a, i) => {
          const done = countArea(a);
          const all = a.items.length;
          return `
          <details class="hm-area hm-enter${done === all ? ' is-done' : ''}" data-area="${i}" style="--i:${Math.min(i + 1, 8)}"${i === firstOpen ? ' open' : ''}>
            <summary>
              <span class="hm-area-main">
                <span class="hm-area-top">
                  <span class="hm-area-title" role="heading" aria-level="2">${esc(a.title)}</span>
                  <span class="hm-area-count"><span class="hm-area-check" aria-hidden="true">${ICON.check}</span><span data-area-count>${done} of ${all}</span><span class="hm-vh"> answered</span></span>
                </span>
                <span class="hm-meter hm-meter-thin" aria-hidden="true"><span data-area-bar style="width:${pct(done, all)}%"></span></span>
              </span>
              <span class="hm-area-chev" aria-hidden="true">${ICON.down}</span>
            </summary>
            <div class="hm-area-body">
              ${a.blurb ? `<p class="hm-area-blurb">${esc(a.blurb)}</p>` : ''}
              ${a.items.map((n) => questionMarkup(questions[n], n, current)).join('')}
            </div>
          </details>`;
        }).join('')}
      </div>

      <div class="hm-ed-foot">
        <p>Changes save as you go.</p>
        <button class="hm-btn hm-btn-primary" type="button" data-back>Done</button>
      </div>
    </div>`;

  const root = el.querySelector('.hm');
  setStickyTop(root);
  const live = root.querySelector('[data-ed-live]');
  let liveTimer = null;

  const refresh = (n) => {
    const q = questions[n];
    const areaIndex = areas.indexOf(byDim.get(q.dimension));
    const a = areas[areaIndex];
    const node = root.querySelector(`[data-area="${areaIndex}"]`);
    const done = countArea(a);
    node.querySelector('[data-area-count]').textContent = `${done} of ${a.items.length}`;
    node.querySelector('[data-area-bar]').style.width = `${pct(done, a.items.length)}%`;
    node.classList.toggle('is-done', done === a.items.length);
    const all = countAll();
    root.querySelector('[data-total-count]').textContent = `${all} of ${total}`;
    root.querySelector('[data-total-pct]').textContent = `${pct(all, total)}%`;
    root.querySelector('[data-total-ring]').style.setProperty('--p', pct(all, total));
    const bar = root.querySelector('[data-total-bar]');
    bar.setAttribute('aria-valuenow', String(all));
    bar.firstElementChild.style.width = `${pct(all, total)}%`;
    clearTimeout(liveTimer);
    liveTimer = setTimeout(() => { live.textContent = `Saved. ${all} of ${total} answered.`; }, 900);
  };

  const commit = (n, value) => {
    const q = questions[n];
    const next = { ...current };
    if (value === undefined) delete next[q.id]; else next[q.id] = value;
    current = next;
    refresh(n);
    onSave?.(key, { ...current });
  };

  root.addEventListener('change', (e) => {
    const input = e.target;
    if (!(input instanceof HTMLInputElement) || input.type !== 'radio' || !input.checked) return;
    const n = Number(input.dataset.q);
    const q = questions[n];
    if (!q) return;
    const numeric = q.type === 'likert' || q.type === 'scale';
    let value = numeric ? Number(input.value) : input.value;
    if (q.type === 'choice') {
      // Keep the option's own value type (some banks may use numbers).
      const match = (q.options || []).find((o) => String(o.value) === input.value);
      if (match) value = match.value;
    }
    commit(n, value);
  });
  root.addEventListener('input', (e) => {
    const ta = e.target;
    if (!(ta instanceof HTMLTextAreaElement)) return;
    const n = Number(ta.dataset.q);
    if (!questions[n]) return;
    commit(n, ta.value.trim() ? ta.value : undefined);
  });
  root.querySelectorAll('[data-back]').forEach((b) => b.addEventListener('click', () => onBack?.()));
}
