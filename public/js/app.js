// App shell: sign-in, profile, dashboard, create / join, questionnaire, submit and reveal (Supabase).
import { QUESTIONS as COUPLE_Q, DIMENSIONS as COUPLE_D, LIKERT, validateQuestions } from './questions.js';
import { FRIEND_QUESTIONS, FRIEND_DIMENSIONS, validateFriendQuestions } from './friend-questions.js';
import { computeFriendshipReport } from './friend-psychology.js';
import { CONFIG_READY } from './config.js';
import { ensureAuth, currentUid, sendMagicLink, signOut, anonymousUserId, attachEmail } from './supabase.js';
import { createSession, previewSession, joinSession, watchSession, cleanCode, linkFor,
  loadMyAnswers, saveMyAnswers, submitAnswers, loadAllAnswers,
  getProfile, saveProfile, listMySessions, loadLatestLockedAnswers, listRevealedPairs, hideSession } from './session.js';
import { renderCompare } from './compare.js';
import { computeFriendshipReport as friendReport } from './friend-psychology.js';
import { computeReport } from './psychology.js';

import { renderReveal, renderRevealWaiting } from './reveal.js';
import { buildInsights } from './insights.js';
import { renderDashboard as renderResultsDashboard } from './dashboard.js';
import { startHome } from './home-flow.js';
import { navSet, navRoot, navBack, onNavChange } from './nav.js';
import { renderLogin, renderCheckEmail, renderProfile, renderDashboard } from './account.js';

validateQuestions();
validateFriendQuestions();

// The question bank follows the session type. Everything below reads through these accessors.
let activeKind = 'couple';
const QS = () => (activeKind === 'friendship' ? FRIEND_QUESTIONS : COUPLE_Q);
const DS = () => (activeKind === 'friendship' ? FRIEND_DIMENSIONS : COUPLE_D);
const blockCache = {};
const BL = () => (blockCache[activeKind] ||= areaBlocks());

const POINTER_KEY = 'compat.session.v1';    // the session this device last opened: { code, role }
const PENDING_KEY = 'compat.pendingJoin.v1'; // a join link waiting for sign-in to finish
const draftKey = (code) => `compat.draft.${code}`;
const app = document.getElementById('app');
const saveState = document.getElementById('saveState');

// Header Back button: shown whenever there is a previous screen.
const navBtn = document.getElementById('navBack');
navBtn?.addEventListener('click', navBack);
onNavChange((canGoBack) => { if (navBtn) navBtn.hidden = !canGoBack; });

const state = {
  screen: 'loading',   // loading | setup | login | profile | dashboard | join | questions | done | submitted | reveal
  profile: null,       // { display_name, gender } for the signed-in account
  sessionCode: null,
  role: null,          // 'A' (creator) or 'B' (joiner)
  myName: '',
  partnerName: null,
  started: false,      // true once the questionnaire has started for the open session
  index: 0,
  answers: {},
  introSeen: {},
  unsub: null,
  locked: false,       // true once your answers are submitted (locked on the server)
  sessionStatus: null, // mirrors sessions.status
  saveTimer: null,
};

// ---------- local storage (per device, try/catch wrapped) ----------
function loadPointer() {
  try { return JSON.parse(localStorage.getItem(POINTER_KEY) || 'null'); } catch { return null; }
}
function savePointer(code, role) {
  try { localStorage.setItem(POINTER_KEY, JSON.stringify({ code, role })); } catch { /* storage off */ }
}
function forgetPointer() {
  try { localStorage.removeItem(POINTER_KEY); } catch { /* storage off */ }
}
const pendingJoin = () => { try { return localStorage.getItem(PENDING_KEY) || null; } catch { return null; } };
const storePendingJoin = (code) => { try { localStorage.setItem(PENDING_KEY, code); } catch { /* storage off */ } };
const clearPendingJoin = () => { try { localStorage.removeItem(PENDING_KEY); } catch { /* storage off */ } };

function loadDraft(code) {
  state.answers = {}; state.index = 0; state.introSeen = {};
  try {
    const raw = localStorage.getItem(draftKey(code));
    if (!raw) return;
    const d = JSON.parse(raw);
    state.answers = d.answers || {};
    state.index = Math.min(d.index || 0, QS().length);
    state.introSeen = d.introSeen || {};
  } catch { /* corrupt or blocked: start fresh */ }
}
function saveDraft() {
  if (!state.sessionCode) return;
  try {
    localStorage.setItem(draftKey(state.sessionCode), JSON.stringify({ answers: state.answers, index: state.index, introSeen: state.introSeen }));
    flashSaved();
  } catch {
    saveState.textContent = 'Not saved (storage off)';
  }
  scheduleServerSave();
}

// Drafts also go to the shared session, debounced so each tap does not make a request.
function scheduleServerSave() {
  if (state.locked) return;
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(pushAnswers, 600);
}
async function pushAnswers() {
  if (!state.sessionCode || state.locked) return;
  try {
    await saveMyAnswers(state.sessionCode, currentUid(), state.answers);
    saveState.textContent = 'Saved to the shared session';
  } catch (err) {
    console.error(err);
    saveState.textContent = 'Not synced yet. Retrying…';
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(pushAnswers, 5000);
  }
}

// On start, the server copy is the record. Local edits that have not synced yet still win.
// Answer keys per bank, used to find an earlier set of answers of the same kind.
const COUPLE_PREFIXES = ['comm.', 'life.', 'aff.', 'val.', 'soc.', 'con.', 'att.', 'money.', 'goals.', 'dec.', 'deal.', 'ref.'];
const FRIEND_PREFIXES = ['fr.'];

// Reuse: a new session starts with the answers you already locked for this kind, so you answer once.
async function prefillFromEarlierAnswers() {
  try {
    const prefixes = activeKind === 'friendship' ? FRIEND_PREFIXES : COUPLE_PREFIXES;
    const earlier = await loadLatestLockedAnswers(currentUid(), prefixes);
    if (!earlier) return false;
    state.answers = { ...earlier, ...state.answers };
    state.prefilled = true;
    state.index = QS().length;
    state.screen = 'done';
    return true;
  } catch (err) {
    console.error(err);
    return false;
  }
}

async function hydrateFromServer(code) {
  try {
    const row = await loadMyAnswers(code, currentUid());
    if (!row) {
      if (await prefillFromEarlierAnswers()) render();
      return;
    }
    state.answers = { ...row.answers, ...state.answers };
    if (row.locked) {
      state.locked = true;
      state.screen = 'submitted';
      if (state.sessionStatus === 'revealed') return startReveal();
      render();
    }
  } catch (err) {
    console.error(err);
    saveState.textContent = 'Could not load your saved answers. Working from this device.';
  }
}
let flashTimer;
function flashSaved() {
  saveState.textContent = 'Saved on this device';
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { saveState.textContent = 'Draft saved on this device'; }, 1500);
}

// ---------- helpers ----------
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const scoredTotal = () => QS().filter((q) => q.type !== 'text').length;
const scoredAnswered = () => QS().filter((q) => q.type !== 'text' && state.answers[q.id] !== undefined).length;
// The creator sees an invite banner on the questionnaire screens until the partner joins.
const bannerNeeded = () => state.role === 'A' && !state.partnerName && !!state.sessionCode
  && ['questions', 'done', 'submitted'].includes(state.screen);
const inviteBanner = () => `
  <div class="invite-banner" role="status">
    <span><strong>Waiting for your partner to join.</strong> You can keep answering in the meantime.</span>
    <button class="btn btn-ghost btn-sm" type="button" data-copy="${esc(linkFor(state.sessionCode))}">Copy invite link</button>
  </div>`;
const setHTML = (html) => { app.innerHTML = (bannerNeeded() ? inviteBanner() : '') + html; };

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-copy]');
  if (!btn) return;
  navigator.clipboard?.writeText(btn.dataset.copy).then(
    () => { btn.textContent = 'Copied ✓'; setTimeout(() => { btn.textContent = 'Copy invite link'; }, 2000); },
    () => { btn.textContent = 'Copy failed. Select the link manually.'; },
  );
});

function areaBlocks() {
  const blocks = [];
  QS().forEach((q, i) => {
    const last = blocks[blocks.length - 1];
    if (last && last.dimension === q.dimension) last.items.push(i);
    else blocks.push({ dimension: q.dimension, items: [i] });
  });
  return blocks;
}
const blockOf = (i) => BL().find((b) => b.items.includes(i));

function showError(message, { action = 'Start again', onAction } = {}) {
  setHTML(`
    <section class="card done">
      <div class="big" aria-hidden="true">⚠️</div>
      <h1>Something went wrong</h1>
      <p class="lead">${esc(message)}</p>
      <div class="btn-row"><button class="btn btn-primary" id="retry">${esc(action)}</button></div>
    </section>`);
  document.getElementById('retry').addEventListener('click', () => (onAction ? onAction() : boot()));
}

function loadingCard(text = 'One moment…') {
  setHTML(`<section class="card done"><div class="big" aria-hidden="true">♡</div><p class="lead">${esc(text)}</p></section>`);
}

// ---------- setup (config not filled in yet) ----------
function renderSetup() {
  navRoot('setup', renderSetup);
  state.screen = 'setup';
  setHTML(`
    <section class="card">
      <h1>Connect Supabase first</h1>
      <p class="lead">This app needs a Supabase project before people can sign in.</p>
      <ol class="steps">
        <li><span class="n">1</span><span>Copy the Project URL and anon key into <code>public/js/config.js</code>.</span></li>
        <li><span class="n">2</span><span>Turn on <b>Authentication → Email</b> with magic links.</span></li>
        <li><span class="n">3</span><span>Run the SQL files in <code>supabase/migrations/</code> in order.</span></li>
      </ol>
    </section>`);
}

// ---------- sign-in ----------
function renderLoginScreen(notice) {
  navRoot('login', () => renderLoginScreen());
  state.screen = 'login';
  renderLogin(app, {
    notice,
    onSendLink: async (address) => {
      await sendMagicLink(address);
      renderCheckEmail(app, {
        email: address,
        onBack: () => renderLoginScreen(),
        onResend: () => sendMagicLink(address),
      });
    },
  });
}

async function doSignOut() {
  try { await signOut(); } catch (err) { console.error(err); }
  if (state.unsub) state.unsub();
  state.unsub = null;
  state.sessionCode = null;
  state.profile = null;
  forgetPointer();
  renderLoginScreen();
}

// ---------- compare your partners (private to you) ----------
async function renderCompareScreen() {
  navSet('compare', renderCompareScreen);
  state.screen = 'compare';
  loadingCard('Comparing your partners…');
  try {
    const uid = currentUid();
    const pairs = await listRevealedPairs(uid);
    const items = [];
    for (const pair of pairs) {
      const rows = await loadAllAnswers(pair.code);
      const mine = rows.find((r) => r.user_id === uid);
      const theirs = rows.find((r) => r.user_id !== uid);
      if (!mine || !theirs) continue;
      const opts = { myRole: 'A', myName: state.profile?.display_name, partnerName: pair.partnerName };
      const report = pair.kind === 'friendship'
        ? friendReport(mine.answers || {}, theirs.answers || {}, opts)
        : computeReport(mine.answers || {}, theirs.answers || {}, opts);
      items.push({
        code: pair.code,
        kind: pair.kind,
        partnerName: pair.partnerName,
        partnerGender: pair.partnerGender,
        score: report.overall?.score ?? null,
        band: report.overall?.band || { key: 'unknown', label: 'Not enough answers', blurb: '' },
        strengths: (report.strengths || []).slice(0, 3),
        topics: (report.topics || []).slice(0, 2),
        areas: (report.areas || []).filter((a) => a.score != null).map((a) => ({ title: a.title, score: a.score })),
      });
    }
    renderCompare(app, {
      myName: state.profile?.display_name || '',
      items,
      onBack: renderDashboardScreen,
      onOpen: (code) => attach(code),
    });
  } catch (err) {
    console.error(err);
    showError('We could not load your comparison. Check your connection and try again.', { action: 'Back to my sessions', onAction: renderDashboardScreen });
  }
}

// Runs after sign-in: profile first, then a pending join link, then the dashboard.
async function routeSignedIn() {
  loadingCard();
  try {
    state.profile = await getProfile(currentUid());
  } catch (err) {
    console.error(err);
    return showError('We could not load your profile. Check your connection and try again.');
  }
  if (!state.profile) return renderProfileScreen(true);
  // The new home: rankings, people (your code and connections), and your answers.
  // A join code from the link is accepted first; older session codes fall back to the classic join.
  const pending = pendingJoin();
  if (pending) clearPendingJoin();
  state.screen = 'home';
  return startHome(app, {
    profile: state.profile,
    pendingCode: pending,
    onLegacyJoin: renderJoinConfirm,
    onLegacyDashboard: renderDashboardScreen,
    onSignOut: doSignOut,
  });
}

function renderProfileScreen(first) {
  navSet('profile', () => renderProfileScreen(first));
  state.screen = 'profile';
  renderProfile(app, {
    initial: first ? null : state.profile,
    onSave: async ({ display_name, gender }) => {
      await saveProfile(currentUid(), { display_name, gender });
      state.profile = { display_name, gender };
      return first ? routeSignedIn() : renderDashboardScreen();
    },
    onSignOut: doSignOut,
  });
}

// ---------- dashboard: your sessions, start new, join by link or code ----------
async function renderDashboardScreen() {
  navSet('older-sessions', renderDashboardScreen);
  state.screen = 'dashboard';
  loadingCard('Opening your sessions…');
  let sessions = [];
  try {
    sessions = await listMySessions(currentUid());
  } catch (err) {
    console.error(err);
    return showError('We could not load your sessions. Check your connection and try again.', { action: 'Try again', onAction: renderDashboardScreen });
  }
  renderDashboard(app, {
    profile: state.profile,
    sessions,
    onNew: startNewSession,
    onOpen: (code) => attach(code),
    onJoinLink: (text) => {
      const raw = String(text || '');
      const code = cleanCode(raw.includes('join=') ? raw.split('join=').pop() : raw);
      renderJoinConfirm(code);
    },
    onSignOut: doSignOut,
    onEditProfile: () => renderProfileScreen(false),
    onCompare: renderCompareScreen,
    onRemove: async (code) => {
      try {
        await hideSession(currentUid(), code);
        if (state.sessionCode === code) state.sessionCode = null;
        forgetPointer();
        renderDashboardScreen();
      } catch (err) {
        console.error(err);
        saveState.textContent = 'Could not remove that session. Try again.';
      }
    },
  });
}

async function startNewSession(kind = 'couple') {
  try {
    const code = await createSession(currentUid(), state.profile.display_name, state.profile.gender, kind);
    savePointer(code, 'A');
    attach(code);
  } catch (err) {
    console.error(err);
    showError('We could not create a session. Check your connection and try again.', { action: 'Back to my sessions', onAction: renderDashboardScreen });
  }
}

// ---------- join: confirm who you will be, then join ----------
async function renderJoinConfirm(code) {
  navSet('join', () => renderJoinConfirm(code));
  state.screen = 'join';
  loadingCard('Opening your invitation…');
  let p;
  try {
    p = await previewSession(code);
  } catch (err) {
    console.error(err);
    return showError('We could not open that link. Check your connection and try again.', { action: 'Back to my sessions', onAction: renderDashboardScreen });
  }
  if (!p) return showError('We could not find that session. Check the link or code and try again.', { action: 'Back to my sessions', onAction: renderDashboardScreen });
  if (p.isMember) return attach(code);
  if (p.isFull) return showError('This session already has two people.', { action: 'Back to my sessions', onAction: renderDashboardScreen });

  const me = state.profile;
  const genderWord = me.gender === 'male' ? 'male' : 'female';
  setHTML(`
    <section class="card hero">
      <div class="heart" aria-hidden="true">♡</div>
      <h1>${esc(p.hostName)} invited you</h1>
      <p class="lead">Join as <b>${esc(me.display_name)}</b> (${genderWord}). You will each answer on your own, and see each other's answers only after you both submit.</p>
      <div class="btn-row stack">
        <button class="btn btn-primary" id="join">Join as ${esc(me.display_name)}</button>
        <button class="btn btn-ghost" id="back">Back to my sessions</button>
      </div>
    </section>`);

  document.getElementById('back').addEventListener('click', renderDashboardScreen);
  document.getElementById('join').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = 'Joining…';
    try {
      await joinSession(currentUid(), code, me.display_name, me.gender);
      savePointer(code, 'B');
      attach(code);
    } catch (err) {
      console.error(err);
      if (err.code === 'app/full') {
        return showError('Someone else just joined this session.', { action: 'Back to my sessions', onAction: renderDashboardScreen });
      }
      if (err.code === 'app/same-gender') {
        return showError('Couple sessions are for one male and one female. Ask your partner to start a friendship session instead, or sign in with the right profile.', { action: 'Back to my sessions', onAction: renderDashboardScreen });
      }
      btn.disabled = false;
      btn.textContent = `Join as ${me.display_name}`;
      showError('We could not join. Try the link again.', { action: 'Try again', onAction: () => renderJoinConfirm(code) });
    }
  });
}

// ---------- session watching ----------
function attach(code) {
  navSet('session-' + code, () => attach(code));
  state.sessionCode = code;
  state.started = false;
  if (state.unsub) state.unsub();
  state.unsub = watchSession(code, (s) => onSession(code, s));
}

function onSession(code, s) {
  if (s && s.error) return showError('We lost the connection to this session. It will reconnect when you are back online.', { action: 'Reload', onAction: () => location.reload() });
  const uid = currentUid();
  const me = s?.members?.[uid];
  if (!s || !me) {
    forgetPointer();
    if (state.unsub) state.unsub();
    state.unsub = null;
    return renderDashboardScreen();
  }

  state.role = me.role;
  state.myName = me.name;
  const partner = Object.entries(s.members).find(([id]) => id !== uid)?.[1];
  const hadPartner = !!state.partnerName;
  state.partnerName = partner?.name || null;
  state.sessionStatus = s.status;
  savePointer(code, me.role);

  // The creator can answer straight away. Later snapshots do not reset progress.
  if (!state.started) {
    state.started = true;
    activeKind = s.kind === 'friendship' ? 'friendship' : 'couple';
    loadDraft(code);
    state.screen = state.index >= QS().length ? 'done' : 'questions';
    render();
    hydrateFromServer(code);
    return;
  }

  // Partner just joined: refresh the screen so the invite banner goes away.
  if (!hadPartner && state.partnerName && state.screen !== 'reveal') render();

  // Both have submitted: the session is revealed.
  if (s.status === 'revealed' && state.screen !== 'reveal' && state.locked) return startReveal();
  if (state.screen === 'submitted') renderSubmitted();
}

// ---------- reveal ----------
async function startReveal() {
  navSet('reveal', () => startReveal());
  state.screen = 'reveal';
  renderRevealWaiting(app, {});
  try {
    const rows = await loadAllAnswers(state.sessionCode);
    const uid = currentUid();
    const mine = rows.find((r) => r.user_id === uid);
    const theirs = rows.find((r) => r.user_id !== uid);
    if (!mine || !theirs) throw new Error('answers not visible yet');
    const reportOpts = { myRole: state.role, myName: state.myName, partnerName: state.partnerName || 'your friend' };
    const report = activeKind === 'friendship'
      ? computeFriendshipReport(mine.answers || {}, theirs.answers || {}, reportOpts)
      : computeReport(mine.answers || {}, theirs.answers || {}, reportOpts);
    // The results dashboard: the report plus the insight engine (likely fights, causes, strengths, bids, deck).
    const myAnswers = mine.answers || {};
    const theirAnswers = theirs.answers || {};
    let insights = null;
    try {
      insights = buildInsights(myAnswers, theirAnswers, report, {
        kind: activeKind,
        myName: state.myName,
        partnerName: state.partnerName || (activeKind === 'friendship' ? 'your friend' : 'your partner'),
      });
    } catch (err) {
      console.error('insights failed; showing the classic reveal', err);
    }
    const partnerLabel = state.partnerName || (activeKind === 'friendship' ? 'Your friend' : 'Your partner');
    if (insights) {
      window.scrollTo(0, 0);
      renderResultsDashboard(app, {
        report,
        insights,
        myName: state.myName,
        partnerName: partnerLabel,
        kind: activeKind,
        onLeave: leaveSession,
      });
    } else {
      renderReveal(app, report, { myName: state.myName, partnerName: partnerLabel, onLeave: leaveSession });
    }
  } catch (err) {
    console.error(err);
    state.screen = 'submitted';
    saveState.textContent = 'Could not load the reveal yet. Retrying…';
    setTimeout(() => { if (state.sessionStatus === 'revealed') startReveal(); }, 3000);
  }
}

// Leaves the session on this device only. The session stays in your account, so you can open it from any browser.
function leaveSession() {
  if (state.unsub) state.unsub();
  state.unsub = null;
  const code = state.sessionCode;
  forgetPointer();
  try { localStorage.removeItem(draftKey(code)); } catch { /* storage off */ }
  state.started = false;
  state.locked = false;
  state.answers = {};
  state.index = 0;
  state.sessionCode = null;
  renderDashboardScreen();
}

// ---------- questionnaire ----------
function renderIntro(block) {
  const d = DS()[block.dimension];
  const count = block.items.length;
  setHTML(`
    <section class="card area-intro">
      <div class="big" aria-hidden="true">${areaIcon(block.dimension)}</div>
      <div class="area-tag">Area ${BL().indexOf(block) + 1} of ${BL().length}</div>
      <h2>${esc(d.title)}</h2>
      <p class="lead">${esc(d.blurb)}</p>
      <p class="hint">${count} question${count > 1 ? 's' : ''} in this area.</p>
      <div class="btn-row"><button class="btn btn-primary" id="go">Begin</button></div>
    </section>`);
  document.getElementById('go').addEventListener('click', () => {
    state.introSeen[block.dimension] = true;
    saveDraft();
    render();
  });
  document.getElementById('go').focus();
}

function renderQuestion() {
  const q = QS()[state.index];
  const block = blockOf(state.index);
  const d = DS()[q.dimension];
  const pct = Math.round((state.index / QS().length) * 100);
  const chips = BL().map((b, bi) => {
    const done = b.items.every((i) => state.answers[QS()[i].id] !== undefined || QS()[i].type === 'text');
    const cls = b === block ? 'current' : done ? 'done' : '';
    return `<span class="chip ${cls}">${bi + 1}. ${esc(DS()[b.dimension].title)}</span>`;
  }).join('');

  setHTML(`
    <section class="card" aria-live="polite">
      <div class="progress">
        <div class="progress-meta"><span>Question ${state.index + 1} of ${QS().length}</span><span>${pct}%</span></div>
        <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><span style="width:${pct}%"></span></div>
      </div>
      <div class="area-chips">${chips}</div>
      <div class="area-tag">${esc(d.area)}</div>
      <h2 class="question" id="qtext">${esc(q.text)}</h2>
      ${renderInput(q)}
      <div class="btn-row">
        <button class="btn btn-ghost" id="back" ${state.index === 0 ? 'disabled' : ''}>Back</button>
        <button class="btn btn-primary" id="next">${state.index === QS().length - 1 ? 'Finish' : 'Next'}</button>
      </div>
      <p class="kbd-help">Keyboard: 1–5 or 1–4 to choose, Enter for next, Backspace for back.</p>
    </section>`);

  wireInput(q);
  document.getElementById('back').addEventListener('click', goBack);
  document.getElementById('next').addEventListener('click', goNext);
  updateNextEnabled(q);
}

function renderInput(q) {
  const cur = state.answers[q.id];
  if (q.type === 'likert') {
    return `<div class="choices" role="radiogroup" aria-labelledby="qtext">
      ${LIKERT.map((o, i) => `<button class="choice" role="radio" aria-checked="${cur === o.value}" data-value="${o.value}"><span class="key">${i + 1}</span>${esc(o.label)}</button>`).join('')}
    </div>`;
  }
  if (q.type === 'scale') {
    return `<div class="scale" role="radiogroup" aria-labelledby="qtext">
      <div class="scale-row">
        ${[1, 2, 3, 4, 5].map((n) => `<button class="scale-btn" role="radio" aria-checked="${cur === n}" data-value="${n}">${n}</button>`).join('')}
      </div>
      <div class="scale-ends"><span>${esc(q.low)}</span><span>${esc(q.high)}</span></div>
    </div>`;
  }
  if (q.type === 'choice') {
    return `<div class="choices" role="radiogroup" aria-labelledby="qtext">
      ${q.options.map((o, i) => `<button class="choice" role="radio" aria-checked="${cur === o.value}" data-value="${esc(o.value)}"><span class="key">${i + 1}</span>${esc(o.label)}</button>`).join('')}
    </div>`;
  }
  if (q.type === 'dealbreaker') {
    return `<div class="yesno" role="radiogroup" aria-labelledby="qtext">
      ${q.options.map((o) => `<button class="choice ${o.value}" role="radio" aria-checked="${cur === o.value}" data-value="${o.value}">${esc(o.label)}</button>`).join('')}
    </div>
    <p class="ref-note">Yes here does not end anything. It flags a topic to talk about together.</p>`;
  }
  return `<div class="reflect"><textarea class="text" id="reflectText" maxlength="1000" placeholder="Write as much or as little as you like." aria-labelledby="qtext">${esc(cur || '')}</textarea></div>
    <p class="ref-note">Shared only after both of you finish. Optional.</p>`;
}

function wireInput(q) {
  if (q.type === 'text') {
    const ta = document.getElementById('reflectText');
    ta.addEventListener('input', () => { state.answers[q.id] = ta.value; saveDraft(); });
    ta.focus();
    return;
  }
  document.querySelectorAll('[role="radio"]').forEach((el) => {
    el.addEventListener('click', () => choose(q, el.dataset.value));
  });
}

function choose(q, raw) {
  const value = q.type === 'likert' || q.type === 'scale' ? Number(raw) : raw;
  state.answers[q.id] = value;
  saveDraft();
  document.querySelectorAll('[role="radio"]').forEach((el) => {
    el.setAttribute('aria-checked', String(el.dataset.value === String(raw)));
  });
  updateNextEnabled(q);
  setTimeout(() => { if (state.index < QS().length - 1 && state.screen === 'questions') goNext(); }, 220);
}

function updateNextEnabled(q) {
  const next = document.getElementById('next');
  if (next) next.disabled = q.type !== 'text' && state.answers[q.id] === undefined;
}

function goNext() {
  const q = QS()[state.index];
  if (q.type !== 'text' && state.answers[q.id] === undefined) return;
  if (state.index >= QS().length - 1) {
    state.screen = 'done';
    saveDraft();
    return render();
  }
  state.index += 1;
  saveDraft();
  render();
}

function goBack() {
  if (state.index === 0) return;
  state.index -= 1;
  saveDraft();
  render();
}

// Finish screen: check everything is answered, then submit (which locks your answers).
function renderDone() {
  if (state.locked) return renderSubmitted();
  state.screen = 'done';
  const unanswered = scoredTotal() - scoredAnswered();
  const pct = Math.round((scoredAnswered() / scoredTotal()) * 100);
  setHTML(`
    <section class="card done">
      <div class="big" aria-hidden="true">✓</div>
      <h1>Thanks, ${esc(state.myName)}. Ready to submit?</h1>
      <p class="lead">Once you submit, your answers are locked. Your partner's stay hidden until you both have submitted.</p>
      <div class="stat">${scoredAnswered()} of ${scoredTotal()} scored questions answered (${pct}%)</div>
      ${unanswered > 0 ? `<p class="ref-note">${unanswered} question${unanswered > 1 ? 's are' : ' is'} still unanswered. Go back to answer ${unanswered > 1 ? 'them' : 'it'}.</p>` : ''}
      ${state.prefilled ? '<p class="ref-note">Filled in from the answers you already gave. Check them, then submit.</p>' : ''}
      <p class="ref-note" id="submitNote" hidden></p>
      <div class="btn-row stack">
        <button class="btn btn-primary" id="submit" ${unanswered > 0 ? 'disabled' : ''}>Submit my answers</button>
        <button class="btn btn-ghost" id="review">Review my answers</button>
      </div>
    </section>`);

  document.getElementById('review').addEventListener('click', () => {
    state.index = 0;
    state.screen = 'questions';
    saveDraft();
    render();
  });
  document.getElementById('submit').addEventListener('click', submitNow);
}

async function submitNow() {
  const btn = document.getElementById('submit');
  const note = document.getElementById('submitNote');
  btn.disabled = true;
  btn.textContent = 'Submitting…';
  try {
    clearTimeout(state.saveTimer);
    await saveMyAnswers(state.sessionCode, currentUid(), state.answers);
    await submitAnswers(state.sessionCode, state.answers);
    state.locked = true;
    renderSubmitted();
  } catch (err) {
    console.error(err);
    btn.disabled = false;
    btn.textContent = 'Submit my answers';
    note.hidden = false;
    note.textContent = 'Could not submit. Check your connection and try again. Your answers are still saved on this device.';
  }
}

// Shown once your answers are locked. Partner's answers stay hidden until the reveal.
function renderSubmitted() {
  navSet('submitted', renderSubmitted);
  state.screen = 'submitted';
  const partner = state.partnerName || 'your partner';
  const bothDone = state.sessionStatus === 'locked' || state.sessionStatus === 'revealed';
  setHTML(`
    <section class="card done">
      <div class="big" aria-hidden="true">${bothDone ? '🎉' : '🔒'}</div>
      <h1>${bothDone ? 'You both finished' : 'Your answers are locked'}</h1>
      <p class="lead">${bothDone
        ? 'Both of you have submitted. The reveal of your answers and your match report comes next.'
        : `Waiting for ${esc(partner)} to submit. Their answers stay hidden until you both have finished.`}</p>
      <div class="stat">${scoredAnswered()} of ${scoredTotal()} scored questions submitted</div>
      <p class="ref-note">Nothing you can change now. Keep this page open, or come back from any browser.</p>
      <div class="btn-row"><button class="btn btn-ghost" id="leave">Back to my sessions</button></div>
    </section>`);
  document.getElementById('leave')?.addEventListener('click', leaveSession);
}

function areaIcon(dimension) {
  return { communication: '💬', lifestyle: '🏡', affection: '💞', values: '🌱', social: '🎈', conflict: '🌊', attachment: '🤝', money: '💳', goals: '🧭', decisions: '⚖️', dealbreakers: '🚩', reflection: '📝' }[dimension] || '♡';
}

// ---------- render loop ----------
function render() {
  if (state.screen === 'reveal') return; // the reveal renders itself
  if (state.screen === 'submitted') return renderSubmitted();
  if (state.screen === 'done') return renderDone();
  const block = blockOf(state.index);
  if (block && block.items[0] === state.index && !state.introSeen[block.dimension]) return renderIntro(block);
  renderQuestion();
}

// Keyboard shortcuts on the question screen.
document.addEventListener('keydown', (e) => {
  if (state.screen !== 'questions') return;
  if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
  const q = QS()[state.index];
  if (!q) return;
  if (e.key === 'Enter') { goNext(); return; }
  if (e.key === 'Backspace') { goBack(); return; }
  const n = Number(e.key);
  if (!Number.isInteger(n) || n < 1) return;
  if (q.type === 'likert' || q.type === 'scale') {
    if (n <= 5) choose(q, n);
  } else if (q.type === 'choice' && n <= q.options.length) {
    choose(q, q.options[n - 1].value);
  } else if (q.type === 'dealbreaker' && n <= 2) {
    choose(q, q.options[n - 1].value);
  }
});

// ---------- keep your sessions: attach an email to an anonymous account ----------
function renderKeepSessions() {
  navSet('keep', renderKeepSessions);
  state.screen = 'keep';
  setHTML(`
    <section class="card hero">
      <div class="heart" aria-hidden="true">♡</div>
      <h1>Keep your sessions</h1>
      <p class="lead">Your sessions and answers are saved to this browser's account. Add your email, so you can sign in from any browser later. Your data stays exactly where it is.</p>
      <label class="field" for="keep-email">Your email</label>
      <input id="keep-email" class="text" type="email" autocomplete="email" inputmode="email" placeholder="you@example.com">
      <p class="ref-note" id="keep-note" role="status" aria-live="polite"></p>
      <div class="btn-row stack">
        <button class="btn btn-primary" id="keep-send" disabled>Send confirmation link</button>
      </div>
      <p class="ref-note">Opening the link from your email confirms it. Use the same browser to finish this step.</p>
    </section>`);

  const input = document.getElementById('keep-email');
  const send = document.getElementById('keep-send');
  const note = document.getElementById('keep-note');
  const sync = () => { send.disabled = !/^\S+@\S+\.\S+$/.test(input.value.trim()); };
  input.addEventListener('input', sync);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !send.disabled) send.click(); });
  send.addEventListener('click', async () => {
    send.disabled = true;
    send.textContent = 'Sending…';
    note.textContent = '';
    try {
      await attachEmail(input.value.trim());
      note.textContent = `We sent a link to ${input.value.trim()}. Open it to finish.`;
      send.textContent = 'Link sent';
    } catch (err) {
      console.error(err);
      send.disabled = false;
      send.textContent = 'Send confirmation link';
      note.textContent = /already|registered|exists/i.test(err.message || '')
        ? 'That email is already used by another account. Use a different email.'
        : 'We could not send the link. Check the email and try again.';
    }
  });
  input.focus();
}

// ---------- boot ----------
async function boot() {
  if (!CONFIG_READY) return renderSetup();

  // A join link is kept across the email round trip, because the magic link returns to the bare address.
  const fromUrl = cleanCode(new URLSearchParams(location.search).get('join'));
  if (fromUrl) storePendingJoin(fromUrl);

  let uid;
  try {
    uid = await ensureAuth();
  } catch (err) {
    console.error(err);
    return showError('We could not connect. Check your internet connection and try again.');
  }
  if (!uid) {
    // An account from before email sign-in: add an email so its sessions and answers stay reachable.
    const anon = await anonymousUserId();
    if (anon) return renderKeepSessions();
    return renderLoginScreen(pendingJoin() ? 'Sign in to join your partner\'s session. Your link is kept.' : null);
  }
  return routeSignedIn();
}

boot();
