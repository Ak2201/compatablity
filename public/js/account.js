// Account screens: sign in, check email, profile, dashboard.
// Each render function fills `el`, wires its own listeners, and reports back through callbacks.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const RESEND_COOLDOWN = 30;

const GENDER_LABEL = { male: 'Male', female: 'Female' };

const STATUS = {
  waiting_for_partner: { text: 'Waiting for your partner', tone: 'amber' },
  both_joined: { text: 'Ready to answer', tone: 'sage' },
  locked: { text: 'Waiting for the other person to submit', tone: 'neutral' },
  revealed: { text: 'Ready to see your results', tone: 'accent' },
};

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
  mail: svg('<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7.5 8 6 8-6"/>'),
  sent: svg('<path d="M21 3 10.5 13.5"/><path d="M21 3l-6.5 18-4-7.5L3 9.5 21 3z"/>'),
  person: svg('<circle cx="12" cy="8.5" r="3.6"/><path d="M4.8 20c.9-3.6 3.7-5.6 7.2-5.6s6.3 2 7.2 5.6"/>'),
  male: svg('<circle cx="10" cy="14" r="5.5"/><path d="M14 10l6-6"/><path d="M15 4h5v5"/>'),
  female: svg('<circle cx="12" cy="9" r="5.5"/><path d="M12 14.5V22"/><path d="M8.5 18.5h7"/>'),
  check: svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>', ' stroke-width="2.6"'),
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5"/><path d="M12 7.6v.1"/>'),
  alert: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7.5V13"/><path d="M12 16.4v.1"/>'),
  arrow: svg('<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>', ' stroke-width="2.2"'),
};

function showError(node, err) {
  if (!node) return;
  node.innerHTML = err ? `${ICON.alert}<span>${esc(errorText(err))}</span>` : '';
}

// Runs an async callback while a button shows a busy label. Returns true when it finished without throwing.
async function runBusy(btn, busyLabel, fn, errNode) {
  const idle = btn.innerHTML;
  btn.disabled = true;
  btn.setAttribute('aria-busy', 'true');
  btn.textContent = busyLabel;
  showError(errNode, null);
  let ok = true;
  try {
    await fn();
  } catch (err) {
    ok = false;
    showError(errNode, err);
  }
  if (btn.isConnected) {
    btn.removeAttribute('aria-busy');
    btn.innerHTML = idle;
    btn.disabled = false;
  }
  return ok;
}

/* ---------- Sign in ---------- */
export function renderLogin(el, { onSendLink, notice } = {}) {
  el.innerHTML = `
    <div class="ac">
      <section class="card ac-panel">
        <div class="ac-head">
          <div class="ac-badge">${ICON.mail}</div>
          <h1>Sign in to continue</h1>
          <p class="lead">We will email you a one-time link. No password needed.</p>
        </div>
        ${notice ? `<p class="ac-notice" role="status">${ICON.info}<span>${esc(notice)}</span></p>` : ''}
        <form class="ac-form" novalidate>
          <div class="ac-field">
            <label class="field" for="ac-email">Your email</label>
            <input class="text" id="ac-email" name="email" type="email" autocomplete="email" inputmode="email"
              autocapitalize="none" autocorrect="off" spellcheck="false" enterkeyhint="send"
              placeholder="you@example.com" required aria-describedby="ac-login-error">
          </div>
          <p class="ac-error" id="ac-login-error" role="alert" aria-live="assertive"></p>
          <button class="btn btn-primary" type="submit" disabled>Send me a link</button>
        </form>
      </section>
    </div>`;

  const form = el.querySelector('form');
  const input = el.querySelector('#ac-email');
  const btn = el.querySelector('button[type="submit"]');
  const error = el.querySelector('#ac-login-error');
  let busy = false;

  const valid = () => EMAIL_RE.test(input.value.trim());
  const sync = () => { if (!busy) btn.disabled = !valid(); };

  input.addEventListener('input', () => { showError(error, null); sync(); });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (busy || !valid()) return;
    busy = true;
    const email = input.value.trim();
    await runBusy(btn, 'Sending…', () => onSendLink?.(email), error);
    busy = false;
    if (btn.isConnected) sync();
  });
  sync();
}

/* ---------- Check your email ---------- */
export function renderCheckEmail(el, { email, onBack, onResend } = {}) {
  el.innerHTML = `
    <div class="ac">
      <section class="card ac-panel">
        <div class="ac-head">
          <div class="ac-badge">${ICON.sent}</div>
          <h1>Check your email</h1>
          <p class="lead">We sent a sign-in link to</p>
          <p class="ac-email">${esc(email)}</p>
          <p class="lead">Open the link on this device or any device. It signs you in.</p>
        </div>
        <div class="ac-form">
          <p class="ac-ok" data-ok role="status" aria-live="polite"></p>
          <p class="ac-error" data-error role="alert" aria-live="assertive"></p>
          <div class="btn-row">
            <button class="btn btn-ghost" type="button" data-back>Use a different email</button>
            <button class="btn btn-ghost" type="button" data-resend>Resend the link</button>
          </div>
          <p class="ac-help" style="text-align:center">Nothing yet? It can take a minute. Check your spam folder too.</p>
        </div>
      </section>
    </div>`;

  const resend = el.querySelector('[data-resend]');
  const ok = el.querySelector('[data-ok]');
  const error = el.querySelector('[data-error]');
  let timer = null;

  const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
  const idle = () => { resend.disabled = false; resend.textContent = 'Resend the link'; };
  const startCooldown = () => {
    stop();
    let left = RESEND_COOLDOWN;
    const paint = () => {
      resend.innerHTML = `Resend in <span class="ac-count">${left}s</span>`;
      resend.setAttribute('aria-label', `Resend the link, available in ${left} seconds`);
    };
    resend.disabled = true;
    paint();
    timer = setInterval(() => {
      if (!resend.isConnected) return stop();
      left -= 1;
      if (left <= 0) { stop(); resend.removeAttribute('aria-label'); idle(); } else paint();
    }, 1000);
  };

  el.querySelector('[data-back]').addEventListener('click', () => { stop(); onBack?.(); });
  resend.addEventListener('click', async () => {
    if (resend.disabled) return;
    ok.innerHTML = '';
    const done = await runBusy(resend, 'Sending…', () => onResend?.(), error);
    if (!resend.isConnected) return;
    if (done) {
      ok.innerHTML = `${ICON.check}<span>A new link is on its way.</span>`;
      startCooldown();
    } else {
      idle();
    }
  });

  // A link has just been sent, so the first resend waits out the cooldown too.
  startCooldown();
}

/* ---------- Profile ---------- */
export function renderProfile(el, { initial: start, onSave, onSignOut } = {}) {
  const editing = !!(start && (start.display_name || start.gender));
  const name0 = start?.display_name ?? '';
  const gender0 = start?.gender === 'male' || start?.gender === 'female' ? start.gender : '';

  const choice = (value) => `
    <label class="ac-choice${gender0 === value ? ' is-selected' : ''}">
      <input type="radio" name="gender" value="${value}" required${gender0 === value ? ' checked' : ''}>
      <span class="ac-check" aria-hidden="true">${ICON.check}</span>
      <span class="ac-choice-icon">${ICON[value]}</span>
      <span>${GENDER_LABEL[value]}</span>
    </label>`;

  el.innerHTML = `
    <div class="ac">
      <section class="card ac-panel">
        <div class="ac-head">
          <div class="ac-badge">${ICON.person}</div>
          <h1>Tell us about you</h1>
          <p class="lead">${editing ? 'Change anything you like, then save.' : 'Two quick things before you start.'}</p>
        </div>
        <form class="ac-form" novalidate>
          <div class="ac-field">
            <label class="field" for="ac-name">Your first name</label>
            <input class="text" id="ac-name" name="display_name" type="text" maxlength="30" required
              autocomplete="given-name" autocapitalize="words" enterkeyhint="done"
              placeholder="What should we call you?" value="${esc(name0)}">
          </div>
          <fieldset class="ac-fieldset" aria-describedby="ac-gender-help">
            <legend class="field">I am</legend>
            <div class="ac-choices">${choice('male')}${choice('female')}</div>
            <p class="ac-help" id="ac-gender-help">This helps the reveal show who is who.</p>
          </fieldset>
          <p class="ac-error" data-error role="alert" aria-live="assertive"></p>
          <button class="btn btn-primary" type="submit" disabled>Save</button>
        </form>
        <div class="ac-links">
          <button class="ac-link" type="button" data-signout>Sign out</button>
        </div>
      </section>
    </div>`;

  const form = el.querySelector('form');
  const nameInput = el.querySelector('#ac-name');
  const radios = Array.from(el.querySelectorAll('input[name="gender"]'));
  const btn = el.querySelector('button[type="submit"]');
  const error = el.querySelector('[data-error]');
  let busy = false;

  const gender = () => radios.find((r) => r.checked)?.value ?? '';
  const ready = () => nameInput.value.trim().length > 0 && !!gender();
  const sync = () => {
    radios.forEach((r) => r.closest('.ac-choice').classList.toggle('is-selected', r.checked));
    if (!busy) btn.disabled = !ready();
  };

  nameInput.addEventListener('input', () => { showError(error, null); sync(); });
  radios.forEach((r) => r.addEventListener('change', () => { showError(error, null); sync(); }));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (busy || !ready()) return;
    busy = true;
    const payload = { display_name: nameInput.value.trim().slice(0, 30), gender: gender() };
    await runBusy(btn, 'Saving…', () => onSave?.(payload), error);
    busy = false;
    if (btn.isConnected) sync();
  });
  el.querySelector('[data-signout]').addEventListener('click', () => onSignOut?.());
  sync();
}

/* ---------- Dashboard ---------- */
function sessionCard(s, i, myFallbackName) {
  const status = STATUS[s.status] ?? { text: 'In progress', tone: 'neutral' };
  const partner = s.partnerName ? String(s.partnerName).trim() : '';
  const myName = s.myName || myFallbackName;
  const openLabel = partner ? `Open session with ${partner}` : `Open session ${s.code}`;
  return `
    <li class="card ac-session" style="--i:${Math.min(i + 1, 8)}">
      <div class="ac-session-main">
        <div class="ac-pair" aria-hidden="true">
          <span class="avatar on">${esc(initial(myName))}</span>
          <span class="avatar${partner ? ' ac-them' : ''}">${partner ? esc(initial(partner)) : '?'}</span>
        </div>
        <div class="ac-session-text">
          <h3${partner ? '' : ' class="is-empty"'}>${partner ? esc(partner) : 'Waiting for a partner'}</h3>
          <p class="ac-status ac-tone-${status.tone}">${esc(status.text)}</p>
        </div>
      </div>
      <div class="ac-session-foot">
        <span class="ac-code">Code <code>${esc(s.code)}</code></span>
        <button class="btn btn-ghost btn-sm" type="button" data-open="${esc(s.code)}" aria-label="${esc(openLabel)}">Open ${ICON.arrow}</button>
      </div>
    </li>`;
}

const EMPTY_ART = `
  <svg viewBox="0 0 112 72" fill="none" aria-hidden="true" focusable="false">
    <circle class="ac-art-a" cx="40" cy="36" r="26" stroke-width="2"/>
    <circle class="ac-art-b" cx="72" cy="36" r="26" stroke-width="2" stroke-linecap="round"/>
    <path class="ac-art-h" d="M56 45.5c-5.6-3.9-8.4-7-8.4-10.4 0-2.6 2-4.6 4.5-4.6 1.6 0 3 .8 3.9 2.1.9-1.3 2.3-2.1 3.9-2.1 2.5 0 4.5 2 4.5 4.6 0 3.4-2.8 6.5-8.4 10.4z"/>
  </svg>`;

export function renderDashboard(el, { profile, sessions, onNew, onOpen, onJoinLink, onSignOut, onEditProfile } = {}) {
  const name = profile?.display_name ? String(profile.display_name).trim() : '';
  const genderText = GENDER_LABEL[profile?.gender] ?? '';
  const list = Array.isArray(sessions) ? sessions : [];

  el.innerHTML = `
    <div class="ac">
      <section class="card ac-panel">
        <header class="ac-me">
          <span class="avatar on" aria-hidden="true">${esc(initial(name))}</span>
          <div>
            <h1>${name ? `Hi, ${esc(name)}` : 'Hi there'}</h1>
            ${genderText ? `<p>${genderText}</p>` : ''}
          </div>
        </header>
        <p class="ac-kind-label" id="ac-kind-h">Start a new session</p>
        <div class="ac-kinds" role="group" aria-labelledby="ac-kind-h">
          <button class="btn btn-primary" type="button" data-new="couple">A couple</button>
          <button class="btn btn-ghost" type="button" data-new="friendship">A friendship</button>
        </div>
        <p class="ac-error" data-new-error role="alert" aria-live="assertive" style="margin-top:12px"></p>
        <div class="ac-or" aria-hidden="true">or</div>
        <form class="ac-join" novalidate>
          <label class="field" for="ac-join">Join with a link or code</label>
          <div class="ac-join-row">
            <input class="text" id="ac-join" name="join" type="text" autocomplete="off" autocapitalize="none"
              autocorrect="off" spellcheck="false" enterkeyhint="go" placeholder="Paste it here"
              aria-describedby="ac-join-error">
            <button class="btn btn-ghost" type="submit" disabled>Join</button>
          </div>
          <p class="ac-error" id="ac-join-error" role="alert" aria-live="assertive"></p>
        </form>
      </section>

      <div class="ac-section-head ac-enter" style="--i:1">
        <h2 id="ac-sessions-h">Your sessions</h2>
        ${list.length ? `<span class="ac-count-pill">${list.length} ${list.length === 1 ? 'session' : 'sessions'}</span>` : ''}
      </div>
      ${list.length
        ? `<ul class="ac-sessions" aria-labelledby="ac-sessions-h">${list.map((s, i) => sessionCard(s, i, name)).join('')}</ul>`
        : `<div class="ac-empty ac-enter" style="--i:2">${EMPTY_ART}<p>No sessions yet. Start one, or paste a link from your partner.</p></div>`}

      <nav class="ac-links" aria-label="Account">
        <button class="ac-link" type="button" data-edit>Edit my profile</button>
        <span class="ac-sep" aria-hidden="true"></span>
        <button class="ac-link" type="button" data-signout>Sign out</button>
      </nav>
    </div>`;

  const newError = el.querySelector('[data-new-error]');
  el.querySelectorAll('[data-new]').forEach((newBtn) => {
    newBtn.addEventListener('click', () => {
      if (newBtn.disabled) return;
      runBusy(newBtn, 'Starting…', () => onNew?.(newBtn.dataset.new), newError);
    });
  });

  const joinForm = el.querySelector('.ac-join');
  const joinInput = el.querySelector('#ac-join');
  const joinBtn = joinForm.querySelector('button[type="submit"]');
  const joinError = el.querySelector('#ac-join-error');
  let joining = false;
  const syncJoin = () => { if (!joining) joinBtn.disabled = !joinInput.value.trim(); };
  joinInput.addEventListener('input', () => { showError(joinError, null); syncJoin(); });
  joinForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = joinInput.value.trim();
    if (joining || !text) return;
    joining = true;
    await runBusy(joinBtn, 'Joining…', () => onJoinLink?.(text), joinError);
    joining = false;
    if (joinBtn.isConnected) syncJoin();
  });

  el.querySelectorAll('[data-open]').forEach((b) => {
    b.addEventListener('click', () => onOpen?.(b.dataset.open));
  });
  el.querySelector('[data-edit]').addEventListener('click', () => onEditProfile?.());
  el.querySelector('[data-signout]').addEventListener('click', () => onSignOut?.());
}
