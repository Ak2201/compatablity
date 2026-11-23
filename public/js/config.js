// Firebase web config. Paste the values from:
// Firebase console -> Project settings -> Your apps -> Web app -> SDK setup and configuration.
// These values are public by design. Security comes from firestore.rules, not from hiding them.
export const firebaseConfig = {
  apiKey: 'REPLACE_ME',
  authDomain: 'REPLACE_ME.firebaseapp.com',
  projectId: 'REPLACE_ME',
  storageBucket: 'REPLACE_ME.firebasestorage.app',
  messagingSenderId: 'REPLACE_ME',
  appId: 'REPLACE_ME',
};

// The app shows a setup screen until these are filled in.
export const CONFIG_READY = !Object.values(firebaseConfig).some((v) => String(v).startsWith('REPLACE_ME'));
