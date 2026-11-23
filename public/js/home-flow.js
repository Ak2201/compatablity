// The signed-in home: loads your answers and connections, computes pair scores and rankings,
// and drives every screen in screens.js. Pure logic lives in the modules it imports.
import { QUESTIONS } from './questions.js';
import { FRIEND_QUESTIONS } from './friend-questions.js';
import { currentUid } from './supabase.js';
import { renderHome, renderProfileEditor, renderPairDetail, renderPsychology, renderCompareSheet } from './screens.js';
import { renderDashboard as renderResults } from './dashboard.js';
import { loadMyProfileAnswers, saveMyProfileAnswers, acceptInvite, setSharing, getConnectionAnswers,
  computePair, buildRankings } from './connections.js';
import { codeFromText, createInviteWithMessage, cancelInvite, setNickname, listConnectionsV2,
  saveSnapshot, listSnapshots, listNotifications, markAllNotificationsRead, deleteMyData, downloadMyData } from './features.js';
import { computeReport } from './psychology.js';
import { computeFriendshipReport } from './friend-psychology.js';
import { buildInsights } from './insights.js';
import { strongestAndWeakest, trendFromSnapshots, talkFirst, shareCard } from './results.js';
import { attachmentGuide, patternExercise, reflectionPrompt, personalPatterns, GLOSSARY } from './psych-depth.js';

const BANK_QUESTIONS = { couple: QUESTIONS, friendship: FRIEND_QUESTIONS };

let ctx = null;     // { el, profile, uid, onLegacyJoin, onLegacyDashboard, onSignOut }
let cache = null;   // last loaded data

const scored = (bank) => BANK_QUESTIONS[bank].filter((q) => q.type !== 'text');
function bankStatus(answers, bank) {
  if (!answers) return 'empty';
  const list = scored(bank);
  const n = list.filter((q) => answers[q.id] !== undefined).length;
  if (n === 0) return 'empty';
  return n >= list.length ? 'done' : 'partial';
}

// Loads everything the home needs in one pass.
async function load() {
  const uid = currentUid();
  const mine = await loadMyProfileAnswers(uid);
  const conns = await listConnectionsV2();
  const entries = [];
  const pairs = {};   // connection id -> { couple: {mine, theirs}, friendship: {mine, theirs} }
  for (const c of conns) {
    const ready = c.accepted && c.myShare && c.partnerShare;
    if (!ready) continue;
    const couple = await getConnectionAnswers(c.id, 'couple');
    const friendship = await getConnectionAnswers(c.id, 'friendship');
    pairs[c.id] = { couple, friendship };
    const pair = computePair(
      { couple: mine.couple, friendship: mine.friendship },
      { couple: couple?.theirs ?? null, friendship: friendship?.theirs ?? null },
      { myGender: ctx.profile.gender, partnerGender: c.partnerGender },
    );
    entries.push({ id: c.id, partnerName: c.partnerName, partnerGender: c.partnerGender, myGender: ctx.profile.gender, pair });
  }
  const rankings = buildRankings(entries);
  let notifications = [];
  try { notifications = await listNotifications(); } catch (err) { console.error(err); }
  cache = { uid, mine, conns, pairs, entries, rankings, notifications };
  return cache;
}

function homeOptions(data, extra = {}) {
  return {
    profile: ctx.profile,
    rankings: data.rankings,
    connections: data.conns,
    profileStatus: {
      couple: bankStatus(data.mine.couple, 'couple'),
      friendship: bankStatus(data.mine.friendship, 'friendship'),
    },
    notifications: data.notifications,
    answers: data.mine,
    ...extra,
    onInvite: async (message) => {
      const inv = await createInviteWithMessage(message);
      await showHome({ code: inv.code });
      return { code: inv.code, link: `${location.origin}${location.pathname}?join=${inv.code}` };
    },
    onAccept: async (text) => {
      const code = codeFromText(text);
      if (!code) throw new Error('That does not look like a code. Check it and try again.');
      try {
        await acceptInvite(code);
      } catch (err) {
        if (err.code === 'app/not-found' && ctx.onLegacyJoin) return ctx.onLegacyJoin(code);
        throw new Error(friendlyError(err));
      }
      await showHome();
    },
    onShare: async (id, share) => { await setSharing(id, share); await showHome(); },
    onOpenPair: (id) => showPair(id),
    onNickname: async (id, name) => { await setNickname(id, name); await showHome(); },
    onCancelInvite: async (id) => { await cancelInvite(id); await showHome(); },
    onEditProfile: (bank) => showEditor(bank),
    onCompare: () => showCompare(data),
    onNotifications: () => {},
    onMarkRead: async () => { await markAllNotificationsRead(); await showHome(); },
    onDeleteData: async () => { await deleteMyData(); ctx.onSignOut(); },
    onDownload: () => downloadMyData(data.uid),
    onSignOut: ctx.onSignOut,
  };
}

function friendlyError(err) {
  const m = String(err?.message || '');
  if (m.includes('own_connection')) return 'That is your own code. Share it with someone else instead.';
  if (m.includes('full')) return 'That connection already has two people.';
  if (m.includes('expired')) return 'That invite has expired. Ask for a new one.';
  if (m.includes('cancelled')) return 'That invite was cancelled.';
  return 'We could not accept that code. Check it and try again.';
}

// ---------- screens ----------
// Unanswered scored questions in a bank, for people who already have answers in the new area.
function missingFor(data, bank) {
  const mine = data.mine[bank] || {};
  return scored(bank).filter((q) => mine[q.id] === undefined).length;
}

// An open dialog while any new questions are unanswered. Gone once everything is answered.
// Dismissing it hides it for this browser session only; answers stay editable at any time.
function maybeNewQuestionsDialog(data) {
  const started = ['couple', 'friendship'].some((b) => data.mine[b] && Object.keys(data.mine[b]).length > 0);
  if (!started) return;
  const missing = { couple: missingFor(data, 'couple'), friendship: missingFor(data, 'friendship') };
  if (missing.couple + missing.friendship === 0) return;
  try { if (sessionStorage.getItem('compat.newq.dismissed') === '1') return; } catch { /* storage off */ }
  document.querySelector('[data-newq-dialog]')?.remove();

  const banks = ['couple', 'friendship'].filter((b) => missing[b] > 0);
  const label = { couple: 'couple', friendship: 'friendship' };
  const dlg = document.createElement('div');
  dlg.setAttribute('data-newq-dialog', '');
  dlg.style.cssText = 'position:fixed;inset:0;background:rgba(20,12,16,.55);display:flex;align-items:center;justify-content:center;padding:16px;z-index:50';
  dlg.innerHTML = `
    <div role="dialog" aria-modal="true" aria-labelledby="newq-title" style="background:var(--surface);color:var(--ink);border-radius:18px;max-width:420px;width:100%;padding:24px;box-shadow:var(--shadow)">
      <h2 id="newq-title" style="margin:0 0 8px">There are new questions</h2>
      <p style="margin:0 0 16px;color:var(--ink-soft)">${banks.map((b) => `${missing[b]} new ${label[b]} question${missing[b] > 1 ? 's' : ''}`).join(' and ')} waiting. Answer them now, or later. You can change any answer at any time.</p>
      <div class="btn-row stack">
        ${banks.map((b) => `<button class="btn btn-primary" type="button" data-answer="${b}">Answer ${label[b]} questions</button>`).join('')}
        <button class="btn btn-ghost" type="button" data-later>Later</button>
      </div>
    </div>`;
  document.body.appendChild(dlg);
  const first = dlg.querySelector('[data-answer]');
  first?.focus();
  dlg.querySelectorAll('[data-answer]').forEach((b) => b.addEventListener('click', () => {
    dlg.remove();
    showEditor(b.dataset.answer);
  }));
  dlg.querySelector('[data-later]').addEventListener('click', () => {
    try { sessionStorage.setItem('compat.newq.dismissed', '1'); } catch { /* storage off */ }
    dlg.remove();
  });
  dlg.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') dlg.querySelector('[data-later]').click();
  });
}

export async function showHome(extra = {}) {
  const data = await load();
  renderHome(ctx.el, homeOptions(data, extra));
  maybeNewQuestionsDialog(data);
  // The psychology guide, and older sessions from before the new profile model, stay reachable.
  ctx.el.insertAdjacentHTML('beforeend',
    '<p style="text-align:center;margin:16px 0;display:flex;gap:10px;justify-content:center;flex-wrap:wrap">'
    + '<button class="btn btn-ghost btn-sm" type="button" data-psych>Psychology guide</button>'
    + (ctx.onLegacyDashboard ? '<button class="btn btn-ghost btn-sm" type="button" data-older>Older sessions</button>' : '')
    + '</p>');
  ctx.el.querySelector('[data-psych]')?.addEventListener('click', showPsychology);
  ctx.el.querySelector('[data-older]')?.addEventListener('click', ctx.onLegacyDashboard);
}

function showEditor(bank) {
  const answers = cache?.mine?.[bank] || {};
  renderProfileEditor(ctx.el, {
    bank,
    answers,
    onSave: (b, next) => {
      if (cache) cache.mine[b] = next;
      return saveMyProfileAnswers(currentUid(), b, next).catch((err) => console.error(err));
    },
    onBack: () => showHome(),
    onSnapshot: (label) => saveSnapshot(bank, label),
  });
}

async function showPair(id) {
  const data = cache || await load();
  const conn = data.conns.find((c) => c.id === id);
  const bankAnswers = data.pairs[id];
  if (!conn || !bankAnswers) return showHome();

  const coupleOk = bankAnswers.couple && data.mine.couple && bankAnswers.couple.theirs
    && conn.partnerGender && ctx.profile.gender && conn.partnerGender !== ctx.profile.gender;
  const bank = coupleOk ? 'couple' : 'friendship';
  const mineBank = data.mine[bank] || {};
  const theirsBank = (bankAnswers[bank]?.theirs) || {};
  const report = bank === 'couple'
    ? computeReport(mineBank, theirsBank, { myRole: 'A', myName: ctx.profile.display_name, partnerName: conn.partnerName })
    : computeFriendshipReport(mineBank, theirsBank, { myRole: 'A', myName: ctx.profile.display_name, partnerName: conn.partnerName });
  const insights = buildInsights(mineBank, theirsBank, report, {
    kind: bank === 'couple' ? 'couple' : 'friendship',
    myName: ctx.profile.display_name,
    partnerName: conn.partnerName,
  });

  // Trend: how this match would have looked with each snapshot of your answers, against their current answers.
  let trend = null;
  try {
    const snaps = await listSnapshots(data.uid, bank);
    const points = snaps.map((s) => {
      const r = bank === 'couple'
        ? computeReport(s.answers || {}, theirsBank, {})
        : computeFriendshipReport(s.answers || {}, theirsBank, {});
      return { createdAt: s.created_at, overallScore: r.overall?.score ?? null, label: s.label || '' };
    });
    trend = trendFromSnapshots(points);
  } catch (err) { console.error(err); }

  const title = conn.nickname || conn.partnerName || 'This connection';
  const card = shareCard({ partnerName: conn.partnerName, score: report.overall?.score ?? null, band: report.overall?.band?.label, report });
  renderPairDetail(ctx.el, {
    title,
    nickname: conn.nickname,
    kindLabel: bank === 'couple' ? 'Couple' : 'Friendship',
    onBack: () => showHome(),
    onOpenResults: () => { window.scrollTo(0, 0); renderResults(ctx.el, { report, insights, myName: ctx.profile.display_name, partnerName: conn.partnerName, kind: bank, onLeave: () => showHome() }); },
    onShareCard: () => card,
    trend,
    talkFirst: talkFirst(report, insights),
    strongestWeakest: strongestAndWeakest(report),
    shareCard: card,
  });
}

async function showPsychology() {
  const data = cache || await load();
  const history = [];
  let firstReport = null;
  let topFight = null;
  let strongest = null;
  for (const e of data.entries) {
    const p = data.pairs[e.id];
    const kind = e.pair?.couple?.applicable && p?.couple ? 'couple' : 'friendship';
    const bank = kind;
    if (!p?.[bank]) continue;
    const r = bank === 'couple'
      ? computeReport(data.mine.couple || {}, p.couple.theirs || {}, {})
      : computeFriendshipReport(data.mine.friendship || {}, p.friendship.theirs || {}, {});
    const ins = buildInsights(data.mine[bank] || {}, p[bank].theirs || {}, r, { kind, myName: ctx.profile.display_name, partnerName: e.partnerName });
    const fights = (ins.fightForecast || []).map((f) => f.psychology?.construct).filter(Boolean);
    const areas = (strongestAndWeakest(r, 1).strongest || []).map((a) => a.title);
    history.push({ partnerName: e.partnerName, kind, fights, strongestAreas: areas });
    if (!firstReport) { firstReport = { r, ins }; topFight = ins.fightForecast?.[0]?.psychology?.construct || null; strongest = areas[0] || null; }
  }
  const style = firstReport?.r?.attachment?.mine?.style || 'unknown';
  const exercises = topFight ? [patternExercise(topFight)] : [];
  renderPsychology(ctx.el, {
    attachmentGuide: attachmentGuide(style),
    exercises,
    reflection: reflectionPrompt({ kind: 'couple', topFight, strongestArea: strongest }),
    patterns: personalPatterns(history),
    glossary: Object.entries(GLOSSARY).map(([term, plain]) => ({ term, plain })),
    onBack: () => showHome(),
  });
}

function showCompare(data) {
  const items = [...data.rankings.couple, ...data.rankings.friendship];
  const overlay = document.createElement('div');
  overlay.className = 'ds-sheet-host';
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  renderCompareSheet(overlay, { items, onClose: close });
}

// Entry point from the app, after sign-in and profile are ready.
export async function startHome(el, options) {
  ctx = { el, ...options };
  if (options.pendingCode) {
    try {
      await acceptInvite(options.pendingCode);
    } catch (err) {
      if (err.code === 'app/not-found' && options.onLegacyJoin) return options.onLegacyJoin(options.pendingCode);
      console.error(err);
    }
  }
  return showHome();
}

export { showPsychology };
