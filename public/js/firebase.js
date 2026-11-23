// Firebase setup: one app, anonymous auth, Firestore.
// SDK pinned to firebase@10.14.1 (loaded from jsdelivr, an allowed CDN).
import { initializeApp } from 'https://cdn.jsdelivr.net/npm/firebase@10.14.1/app/+esm';
import { getAuth, signInAnonymously } from 'https://cdn.jsdelivr.net/npm/firebase@10.14.1/auth/+esm';
import { getFirestore } from 'https://cdn.jsdelivr.net/npm/firebase@10.14.1/firestore/+esm';
import { firebaseConfig, CONFIG_READY } from './config.js';

let app = null;
export let auth = null;
export let db = null;

if (CONFIG_READY) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
}

// Each device gets an anonymous uid. Signing in again on the same browser reuses it.
export async function ensureAuth() {
  if (!auth.currentUser) await signInAnonymously(auth);
  return auth.currentUser.uid;
}

export const currentUid = () => auth?.currentUser?.uid ?? null;
