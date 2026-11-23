// Session lifecycle: create a link, look one up, join it, watch it.
// Document shape (sessions/{code}):
//   status       'waiting_for_partner' | 'both_joined'  (later: 'answering', 'locked', 'revealed')
//   memberUids   [uidA] or [uidA, uidB]
//   members      { [uid]: { name, role: 'A' | 'B' } }
//   createdAt    server timestamp
import { doc, getDoc, setDoc, runTransaction, onSnapshot, serverTimestamp }
  from 'https://cdn.jsdelivr.net/npm/firebase@10.14.1/firestore/+esm';
import { db } from './firebase.js';

// 32 symbols, no 0/O/1/I/L so codes are easy to read aloud. 32 divides 256 evenly, so no modulo bias.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;

export function newCode() {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

// Accepts whatever came in the URL and returns a safe code or ''.
export function cleanCode(raw) {
  return String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH);
}

export const linkFor = (code) => `${location.origin}${location.pathname}?join=${code}`;

// Creates a session. Retries on the rare code collision: a create on an existing doc is refused by the rules.
export async function createSession(uid, name) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = newCode();
    try {
      await setDoc(doc(db, 'sessions', code), {
        status: 'waiting_for_partner',
        memberUids: [uid],
        members: { [uid]: { name, role: 'A' } },
        createdAt: serverTimestamp(),
      });
      return code;
    } catch (err) {
      if (attempt === 2) throw err;
    }
  }
  throw new Error('could not create a session');
}

// Reads a session by its exact code. The rules allow get by ID only, never list.
export async function getSession(code) {
  const snap = await getDoc(doc(db, 'sessions', code));
  return snap.exists() ? snap.data() : null;
}

// Joins a session in a transaction, so two people joining at once cannot both get the second seat.
export async function joinSession(uid, code, name) {
  const ref = doc(db, 'sessions', code);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw Object.assign(new Error('not_found'), { code: 'app/not-found' });
    const data = snap.data();
    if (data.memberUids.includes(uid)) return 'already';
    if (data.memberUids.length >= 2) throw Object.assign(new Error('full'), { code: 'app/full' });
    tx.update(ref, {
      memberUids: [...data.memberUids, uid],
      [`members.${uid}`]: { name, role: 'B' },
      status: 'both_joined',
    });
    return 'joined';
  });
}

// Live updates for the session doc. Calls back with data, null (missing), or { error }.
export function watchSession(code, callback) {
  return onSnapshot(
    doc(db, 'sessions', code),
    (snap) => callback(snap.exists() ? snap.data() : null),
    (err) => callback({ error: err.code || 'unknown' }),
  );
}
