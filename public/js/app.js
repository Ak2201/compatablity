// App shell: create / join / waiting screens (Supabase), then the questionnaire.
import { QUESTIONS, DIMENSIONS, LIKERT, validateQuestions } from './questions.js';
import { CONFIG_READY } from './config.js';
import { ensureAuth, currentUid } from './supabase.js';
import { createSession, previewSession, joinSession, watchSession, cleanCode, linkFor,
  loadMyAnswers, saveMyAnswers, submitAnswers, loadAllAnswers } from './session.js';
import { computeReport } from './psychology.js';
import { renderReveal, renderRevealWaiting } from './reveal.js';

validateQuestions();

const POINTER_KEY = 'compat.session.v1';   // which session this device is in: { code, role }
const draftKey = (code) => `compat.draft.${code}`;
const app = document.getElementById('app');
const saveState = document.getElementById('saveState');

const state = {
  screen: 'loading',   // loading | setup | error | landing | join | waiting | questions | done
  sessionCode: null,
  role: null,          // 'A' (creator) or 'B' (joiner)
  myName: '',
  partnerName: null,
  started: false,      // true once both have joined and the questionnaire has started
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
function loadDraft(code) {
  state.answers = {}; state.index = 0; state.introSeen = {};
  try {
    const raw = localStorage.getItem(draftKey(code));
    if (!raw) return;
    const d = JSON.parse(raw);
    state.answers = d.answers || {};
    state.index = Math.min(d.index || 0, QUESTIONS.length);
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
async function hydrateFromServer(code) {
  try {
    const row = await loadMyAnswers(code, currentUid());
    if (!row) return;
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
const scoredTotal = () => QUESTIONS.filter((q) => q.type !== 'text').length;
const scoredAnswered = () => QUESTIONS.filter((q) => q.type !== 'text' && state.answers[q.id] !== undefined).length;
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
  QUESTIONS.forEach((q, i) => {
    const last = blocks[blocks.length - 1];
    if (last && last.dimension === q.dimension) last.items.push(i);
    else blocks.push({ dimension: q.dimension, items: [i] });
  });
  return blocks;
}
const BLOCKS = areaBlocks();
const blockOf = (i) => BLOCKS.find((b) => b.items.includes(i));

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

// ---------- setup (config not filled in yet) ----------
function renderSetup() {
  setHTML(`
    <section class="card">
      <h1>Connect Supabase first</h1>
      <p class="lead">This app needs a Supabase project before two people can share a link.</p>
      <ol class="steps">
        <li><span class="n">1</span><span>Copy the Project URL and anon key into <code>public/js/config.js</code>.</span></li>
        <li><span class="n">2</span><span>Turn on <b>Authentication → Sign In / Providers → Allow anonymous sign-ins</b>.</span></li>
        <li><span class="n">3</span><span>Run <code>supabase/migrations/0001_couples_init.sql</code> in the SQL editor.</span></li>
      </ol>
      <p class="ref-note">See README.md for the exact commands.</p>
    </section>`);
}

// ---------- landing: the creator enters a name and starts a session ----------
function renderLanding(notice) {
  state.screen = 'landing';
  setHTML(`
    <section class="card hero">
      <div class="heart" aria-hidden="true">♡</div>
      <h1>Answer separately. See where you match.</h1>
      <p class="lead">Start a session, then send the link to your partner. You each answer on your own, and nobody sees the other's answers until you both finish.</p>
      ${notice ? `<p class="ref-note">${esc(notice)}</p>` : ''}
      <ol class="steps">
        <li><span class="n">1</span><span>Enter your first name and create a link.</span></li>
        <li><span class="n">2</span><span>Send the link to your partner. They open it and join.</span></li>
        <li><span class="n">3</span><span>Answer ${QUESTIONS.length} questions on your own, then see your answers together.</span></li>
      </ol>
      <label class="field" for="name">Your first name</label>
      <input id="name" class="text" type="text" maxlength="30" autocomplete="given-name" placeholder="e.g. Maya">
      <div class="btn-row"><button class="btn btn-primary" id="create" disabled>Create link</button></div>
      <p class="ref-note">Answer for yourself, not the couple you would like to be. Honest answers are what make the results useful.</p>
    </section>`);

  const input = document.getElementById('name');
  const create = document.getElementById('create');
  const sync = () => { create.disabled = input.value.trim().length < 1; };
  input.addEventListener('input', sync);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !create.disabled) create.click(); });
  create.addEventListener('click', async () => {
    create.disabled = true;
    create.textContent = 'Creating…';
    try {
      const uid = await ensureAuth();
      const code = await createSession(uid, input.value.trim());
      savePointer(code, 'A');
      attach(code);
    } catch (err) {
      console.error(err);
      create.disabled = false;
      create.textContent = 'Create link';
      showError('We could not create a link. Check your connection and try again.', { action: 'Back', onAction: () => renderLanding() });
    }
  });
  input.focus();
}

// ---------- join: the invited person opens the link ----------
async function renderJoin(code) {
  state.screen = 'join';
  setHTML(`<section class="card done"><div class="big" aria-hidden="true">♡</div><p class="lead">Opening your invitation…</p></section>`);
  let preview;
  try {
    await ensureAuth();
    preview = await previewSession(code);
  } catch (err) {
    console.error(err);
    return showError('We could not open that link. Check your connection and try again.');
  }
  if (!preview) return showError('We could not find that link. Ask your partner to send it again.', { action: 'Start my own', onAction: () => { forgetPointer(); renderLanding(); } });
  if (preview.isMember) return attach(code);
  if (preview.isFull) {
    return showError('This session already has two people. Ask your partner to start a new link.', { action: 'Start my own', onAction: () => { forgetPointer(); renderLanding(); } });
  }
  const host = preview.hostName || 'Your partner';
  setHTML(`
    <section class="card hero">
      <div class="heart" aria-hidden="true">♡</div>
      <h1>${esc(host)} invited you</h1>
      <p class="lead">Join to connect. You will each answer on your own, and see each other's answers only after you both finish.</p>
      <label class="field" for="name">Your first name</label>
      <input id="name" class="text" type="text" maxlength="30" autocomplete="given-name" placeholder="e.g. Sam">
      <div class="btn-row"><button class="btn btn-primary" id="join" disabled>Join</button></div>
    </section>`);

  const input = document.getElementById('name');
  const join = document.getElementById('join');
  const sync = () => { join.disabled = input.value.trim().length < 1; };
  input.addEventListener('input', sync);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !join.disabled) join.click(); });
  join.addEventListener('click', async () => {
    join.disabled = true;
    join.textContent = 'Joining…';
    try {
      const uid = await ensureAuth();
      await joinSession(uid, code, input.value.trim());
      savePointer(code, 'B');
      attach(code);
    } catch (err) {
      console.error(err);
      if (err.code === 'app/full') {
        return showError('Someone else just joined this session. Ask your partner to start a new link.', { action: 'Start my own', onAction: () => { forgetPointer(); renderLanding(); } });
      }
      join.disabled = false;
      join.textContent = 'Join';
      showError('We could not join. Try opening the link again.', { action: 'Try again', onAction: () => renderJoin(code) });
    }
  });
  input.focus();
}

// ---------- waiting: the creator shares the link ----------
function renderWaiting() {
  state.screen = 'waiting';
  const link = linkFor(state.sessionCode);
  const canShare = typeof navigator.share === 'function';
  setHTML(`
    <section class="card hero">
      <div class="people" aria-hidden="true"><span class="avatar on">${esc((state.myName[0] || '?').toUpperCase())}</span><span class="link-dot"></span><span class="avatar">?</span></div>
      <h1>Send this link to your partner</h1>
      <p class="lead">Waiting for them to join. This page updates on its own.</p>
      <div class="linkbox">
        <code id="link">${esc(link)}</code>
      </div>
      <div class="btn-row stack">
        <button class="btn btn-primary" id="copy">Copy link</button>
        ${canShare ? '<button class="btn btn-ghost" id="share">Share…</button>' : ''}
      </div>
      <p class="ref-note">Keep this page open, or come back to this device and it will pick up where you left off.</p>
    </section>`);

  document.getElementById('copy').addEventListener('click', async (e) => {
    try {
      await navigator.clipboard.writeText(link);
      e.currentTarget.textContent = 'Copied ✓';
    } catch {
      e.currentTarget.textContent = 'Select and copy the link above';
    }
    setTimeout(() => { const b = document.getElementById('copy'); if (b) b.textContent = 'Copy link'; }, 2000);
  });
  document.getElementById('share')?.addEventListener('click', () => {
    navigator.share({ title: 'Compatibility', text: 'Join my compatibility session', url: link }).catch(() => {});
  });
}

// ---------- session watching ----------
function attach(code) {
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
    return renderLanding(s ? 'You are not part of that session.' : 'That session no longer exists.');
  }

  state.role = me.role;
  state.myName = me.name;
  const partner = Object.entries(s.members).find(([id]) => id !== uid)?.[1];
  const hadPartner = !!state.partnerName;
  state.partnerName = partner?.name || null;
  state.sessionStatus = s.status;
  savePointer(code, me.role);

  // The creator can answer straight away. The partner's seat is shown as a banner until they join.
  // Later snapshots do not reset progress.
  if (!state.started) {
    state.started = true;
    loadDraft(code);
    state.screen = state.index >= QUESTIONS.length ? 'done' : 'questions';
    render();
    hydrateFromServer(code);
    return;
  }
  // Partner just joined: refresh the screen so the invite banner goes away.
  if (!hadPartner && state.partnerName && state.screen !== 'reveal') render();

  // Partner status changed. Once both have submitted, the session is revealed.
  if (s.status === 'revealed' && state.screen !== 'reveal' && state.locked) return startReveal();
  if (state.screen === 'submitted') renderSubmitted();
}

// ---------- reveal ----------
async function startReveal() {
  state.screen = 'reveal';
  renderRevealWaiting(app, {});
  try {
    const rows = await loadAllAnswers(state.sessionCode);
    const uid = currentUid();
    const mine = rows.find((r) => r.user_id === uid);
    const theirs = rows.find((r) => r.user_id !== uid);
    if (!mine || !theirs) throw new Error('answers not visible yet');
    const report = computeReport(mine.answers || {}, theirs.answers || {}, { myRole: state.role });
    renderReveal(app, report, {
      myName: state.myName,
      partnerName: state.partnerName || 'Your partner',
      onLeave: leaveSession,
    });
  } catch (err) {
    console.error(err);
    state.screen = 'submitted';
    saveState.textContent = 'Could not load the reveal yet. Retrying…';
    setTimeout(() => { if (state.sessionStatus === 'revealed') startReveal(); }, 3000);
  }
}

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
  renderLanding('You left the session on this device. Your partner can still see it on their device.');
}

// ---------- questionnaire ----------
function renderIntro(block) {
  const d = DIMENSIONS[block.dimension];
  const count = block.items.length;
  setHTML(`
    <section class="card area-intro">
      <div class="big" aria-hidden="true">${areaIcon(block.dimension)}</div>
      <div class="area-tag">Area ${BLOCKS.indexOf(block) + 1} of ${BLOCKS.length}</div>
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
  const q = QUESTIONS[state.index];
  const block = blockOf(state.index);
  const d = DIMENSIONS[q.dimension];
  const pct = Math.round((state.index / QUESTIONS.length) * 100);
  const chips = BLOCKS.map((b, bi) => {
    const done = b.items.every((i) => state.answers[QUESTIONS[i].id] !== undefined || QUESTIONS[i].type === 'text');
    const cls = b === block ? 'current' : done ? 'done' : '';
    return `<span class="chip ${cls}">${bi + 1}. ${esc(DIMENSIONS[b.dimension].title)}</span>`;
  }).join('');

  setHTML(`
    <section class="card" aria-live="polite">
      <div class="progress">
        <div class="progress-meta"><span>Question ${state.index + 1} of ${QUESTIONS.length}</span><span>${pct}%</span></div>
        <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><span style="width:${pct}%"></span></div>
      </div>
      <div class="area-chips">${chips}</div>
      <div class="area-tag">${esc(d.area)}</div>
      <h2 class="question" id="qtext">${esc(q.text)}</h2>
      ${renderInput(q)}
      <div class="btn-row">
        <button class="btn btn-ghost" id="back" ${state.index === 0 ? 'disabled' : ''}>Back</button>
        <button class="btn btn-primary" id="next">${state.index === QUESTIONS.length - 1 ? 'Finish' : 'Next'}</button>
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
  setTimeout(() => { if (state.index < QUESTIONS.length - 1 && state.screen === 'questions') goNext(); }, 220);
}

function updateNextEnabled(q) {
  const next = document.getElementById('next');
  if (next) next.disabled = q.type !== 'text' && state.answers[q.id] === undefined;
}

function goNext() {
  const q = QUESTIONS[state.index];
  if (q.type !== 'text' && state.answers[q.id] === undefined) return;
  if (state.index >= QUESTIONS.length - 1) {
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
      <p class="ref-note">Nothing you can change now. Keep this page open, or come back on this device.</p>
      <div class="btn-row"><button class="btn btn-ghost" id="leave">Leave this session on this device</button></div>
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
  const q = QUESTIONS[state.index];
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

// ---------- boot ----------
async function boot() {
  if (!CONFIG_READY) return renderSetup();

  // Sign in first on every path, so the session listener always has an identity.
  try { await ensureAuth(); } catch (err) {
    console.error(err);
    return showError('We could not connect. Check your internet connection, and that anonymous sign-ins are allowed in Supabase.');
  }

  const joinCode = cleanCode(new URLSearchParams(location.search).get('join'));
  const saved = loadPointer();

  if (joinCode) {
    if (saved && saved.code === joinCode) return attach(joinCode);
    return renderJoin(joinCode);
  }
  if (saved?.code) return attach(saved.code);
  renderLanding();
}

boot();
